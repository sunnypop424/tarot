/**
 * 슬롯 편집기 검증 — 로그인 게이트 · 슬롯 생성/삭제 · 업로드 · 이미지가 배경으로 깔리는가 · 라이트 모드.
 * 개발 서버가 떠 있어야 한다.
 *
 *   node scripts/verify-owner.mjs <스크린샷 디렉터리>
 */

import puppeteer from 'puppeteer-core'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const chrome = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p))

/**
 * 인증이 진짜라 실제 계정으로 들어간다 (supabase/seed.sql 의 씨앗 계정).
 * Supabase 를 안 붙였으면 local 어댑터가 아무 값이나 통과시키므로 이 값이 그대로 먹는다.
 */
const env = {}
try {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim())
    if (m) env[m[1]] = m[2]
  }
} catch {
  /* .env.local 이 없으면 local 어댑터 */
}
const OWNER_EMAIL = 'owner@example.com'
const ADMIN_EMAIL = 'demo@example.com'
const OWNER_PASSWORD = env.SEED_PASSWORD ?? 'tarot1234'

const outDir = process.argv[2] ?? '.'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const BASE = 'http://localhost:5174'
const SLUG = 'verify-test'

const checks = []
const check = (name, ok, detail = '') => {
  checks.push([name, ok])
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

/**
 * 이전 실행이 남긴 것 정리.
 *
 * **슬롯이 DB 로 간 뒤로 이게 필수다.** 예전엔 검증이 만든 슬롯이 localStorage 에 살아서
 * 브라우저와 함께 사라졌는데, 이제 진짜 저장소에 들어간다 — 중간에 죽으면 `verify-test` 가
 * 실제 DB 에 남고, 다음 실행은 "중복 슬러그" 로 막혀 생성 검사부터 전부 무너진다.
 * (실제로 그렇게 무너져서 이 정리가 생겼다)
 */
await rm(`public/slots/${SLUG}`, { recursive: true, force: true })

const { VITE_SUPABASE_URL: sbUrl, VITE_SUPABASE_ANON_KEY: sbKey } = env
/** Supabase 를 안 붙였으면 저장소가 브라우저 안이라 밖에서 지울 게 없다 */
const onSupabase = Boolean(sbUrl && sbKey)

/** 최고관리자 토큰 — 슬롯·이미지 삭제는 최고관리자만 된다 (RLS) */
async function ownerHeaders() {
  const auth = await fetch(`${sbUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: sbKey, 'content-type': 'application/json' },
    body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASSWORD }),
  })
  if (!auth.ok) return null
  const { access_token: token } = await auth.json()
  return { apikey: sbKey, authorization: `Bearer ${token}` }
}

/** 이 슬롯이 저장소에 올려둔 이미지 경로들 (`{slug}/logo.png`, `{slug}/cards/major-0.png` …) */
async function slotAssetPaths(headers) {
  const out = []
  for (const prefix of [SLUG, `${SLUG}/cards`]) {
    const listed = await fetch(`${sbUrl}/storage/v1/object/list/slots`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ prefix, limit: 200 }),
    })
    if (!listed.ok) continue
    // 하위 폴더는 id 가 없는 자리표시자로 온다 — 파일만 센다
    for (const f of await listed.json()) if (f.id) out.push(`${prefix}/${f.name}`)
  }
  return out
}

async function leftoverAssets() {
  if (!onSupabase) return 0
  const headers = await ownerHeaders()
  return headers ? (await slotAssetPaths(headers)).length : 0
}

async function purgeSlot() {
  if (!onSupabase) return
  const headers = await ownerHeaders()
  if (!headers) return
  await fetch(`${sbUrl}/rest/v1/slots?slug=eq.${SLUG}`, { method: 'DELETE', headers })

  /**
   * 올린 이미지도 지운다 — 슬롯 행을 지워도 **버킷의 파일은 남는다**
   * (실제 운영에선 그게 맞다: SlotList 의 삭제 확인창이 그 사실을 밝힌다).
   * 검증이 매번 새 파일을 쌓아두고 가면 안 된다.
   */
  const paths = await slotAssetPaths(headers)
  if (!paths.length) return
  await fetch(`${sbUrl}/storage/v1/object/slots`, {
    method: 'DELETE',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ prefixes: paths }),
  })
}
await purgeSlot()

// 업로드할 실제 파일 (1x1 PNG) — file input 은 디스크의 파일이 필요하다
const TMP = join(process.cwd(), 'node_modules', '.cache', 'verify-owner')
await mkdir(TMP, { recursive: true })
const pixel = join(TMP, 'pixel.png')
await writeFile(
  pixel,
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64'
  )
)
/** **다른 그림** — 같은 자리에 덮어썼을 때 캐시를 비껴가는지 보려면 내용이 달라야 한다 (2x2 빨강) */
const pixel2 = join(TMP, 'pixel2.png')
await writeFile(
  pixel2,
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC',
    'base64'
  )
)

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 })

const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
// 삭제·되돌리기 확인창 — 전부 승인한다
page.on('dialog', (d) => void d.accept())

// 이전 실행이 남긴 편집분을 지우고 시작한다
await page.goto(`${BASE}/demo`, { waitUntil: 'domcontentloaded' })
await page.evaluate(() => {
  // local 어댑터로 돌 때만 의미가 있다 — Supabase 면 슬롯은 DB 에 있고 purgeSlot() 이 지웠다
  localStorage.removeItem('tarot-pocket:slots-draft')
  localStorage.removeItem('tarot-pocket:owner:user')
})

// ── 로그인 게이트 ──────────────────────────────────
await page.goto(`${BASE}/theme-editor`, { waitUntil: 'networkidle0' })
await wait(500)
check('로그인 전엔 로그인 화면으로', page.url().endsWith('/theme-editor/login'), page.url())
await page.screenshot({ path: join(outDir, 'owner-login.png') })

// 아무 비번이나 통하면 안 된다 (인증이 붙기 전엔 통했다)
await page.type('#owner-email', OWNER_EMAIL)
await page.type('#owner-password', 'wrong-password-xxx')
await page.click('button[type=submit]')
await wait(2000)
check('틀린 비번은 안 들어간다', page.url().endsWith('/theme-editor/login'), page.url())

// 폼을 새로 띄운다 — 비밀번호 필드는 triple-click 으로 다 안 지워져서 앞 값에 이어붙는다
await page.goto(`${BASE}/theme-editor/login`, { waitUntil: 'networkidle0' })
await page.type('#owner-email', OWNER_EMAIL)
await page.type('#owner-password', OWNER_PASSWORD)
await page.click('button[type=submit]')
await wait(2500)
check('로그인하면 슬롯 목록', page.url().endsWith('/theme-editor'), page.url())

/**
 * 역할 분리 — **주최자 계정으로는 편집기에 못 들어온다.**
 * 인증이 붙기 전엔 최고관리자/주최자가 localStorage 키를 따로 썼는데,
 * 이제 브라우저당 세션이 하나고 **역할은 DB(owners 테이블)가 정한다**.
 * 그래서 "키가 따로인가"가 아니라 "남의 역할로 들어와지나"를 본다.
 *
 * 별도 컨텍스트인 이유: 최고관리자가 아닌 계정으로 편집기 로그인을 시도하면 앱이 세션을
 * 통째로 지운다(OwnerLogin → signOut). 같은 브라우저에서 하면 위에서 로그인해둔 세션까지 날아간다.
 */
const ctx = await browser.createBrowserContext()
const intruder = await ctx.newPage()
await intruder.goto(`${BASE}/theme-editor/login`, { waitUntil: 'networkidle0' })
await intruder.type('#owner-email', ADMIN_EMAIL)
await intruder.type('#owner-password', OWNER_PASSWORD)
await intruder.click('button[type=submit]')
await wait(2500)
check(
  '주최자 계정으로는 편집기에 못 들어온다',
  intruder.url().endsWith('/theme-editor/login'),
  intruder.url()
)
await ctx.close()

// ── 라이트 모드 (편집 중인 색과 섞이면 안 된다) ────
const bg = await page.$eval('.owner', (el) => getComputedStyle(el).backgroundColor)
const rgb = bg.match(/\d+/g).map(Number)
check('편집기는 고정 라이트', (rgb[0] + rgb[1] + rgb[2]) / 3 > 128, bg)
await page.screenshot({ path: join(outDir, 'owner-slot-list.png') })

// ── 슬롯 생성 ──────────────────────────────────────
await page.type('#new-slug', SLUG)
await page.type('#new-name', '검증용 생일카페')
await page.click('button[type=submit]')
await wait(800)
check('슬롯을 만들면 편집기로', page.url().endsWith(`/theme-editor/${SLUG}`), page.url())

// 잘못된 슬러그는 막는가
await page.goto(`${BASE}/theme-editor`, { waitUntil: 'networkidle0' })
await wait(400)
await page.type('#new-slug', SLUG) // 이미 있는 슬러그
await page.type('#new-name', '중복')
await page.click('button[type=submit]')
await wait(300)
const dupError = await page.$eval('.field__error', (el) => el.textContent.trim()).catch(() => null)
check('중복 슬러그 거부', dupError !== null, dupError ?? '에러 없음')
check('중복 슬롯이 안 만들어짐', (await page.$$('[data-slot]')).length === 3, `${(await page.$$('[data-slot]')).length}개 (demo·sample-pink·verify-test)`)

// ── 업로드 ─────────────────────────────────────────
await page.goto(`${BASE}/theme-editor/${SLUG}`, { waitUntil: 'networkidle0' })
await wait(600)

const upload = async (selector, file = pixel) => {
  const input = await page.$(selector)
  if (!input) return false
  await input.uploadFile(file)
  await wait(500)
  return true
}
await upload('[data-image-field="logo"]')
await upload('[data-image-field="card-back"]')
await upload('[data-card-upload="major-0"]')
await wait(800)

/**
 * 올린 이미지가 **정말 받아지나**.
 *
 * 예전엔 `public/slots/{slug}/logo.png` 가 디스크에 있는지 봤는데, 그건 **저장소를 아는 검증**이다
 * — Storage 로 가면 파일이 디스크에 안 떨어져서 통과할 수가 없다. 저장소가 어디든 성립하는
 * 질문은 하나다: 편집기가 그 이미지를 어떤 URL 로 가리키고 있고, **그 URL 이 열리나**.
 */
const assetUrls = () =>
  page.evaluate(async (slug) => {
    const { repo } = await import('/src/lib/repo/index.ts')
    const { cardFrontSrc } = await import('/src/lib/theme.ts')
    const s = await repo.slots.get(slug)
    if (!s) return null
    return {
      logo: s.theme.assets.logo,
      cardBack: s.theme.assets.cardBack,
      cardFront: cardFrontSrc(s.theme, 'major-0'),
    }
  }, SLUG)

/** 편집기가 가리키는 URL 을 그대로 받아본다 (상대경로면 개발 서버 기준으로 푼다) */
const fetches = async (url) => {
  if (!url) return false
  const res = await fetch(new URL(url, BASE)).catch(() => null)
  return Boolean(res?.ok)
}
await page.screenshot({ path: join(outDir, 'owner-slot-editor.png') })

// ── 저장하기를 눌러야 반영된다 ─────────────────────
const previewCta = async () => {
  // 편집기 주소(/theme-editor/verify-test)도 슬러그를 품고 있다 — 메인 프레임을 빼고 찾는다
  const frame = page
    .frames()
    .find((f) => f !== page.mainFrame() && f.url().includes(`/${SLUG}`))
  if (!frame) return null
  return frame.$$eval('button', (bs) => {
    const b = bs.find((x) => x.textContent.trim() === '카드 뽑기')
    return b ? getComputedStyle(b).backgroundColor : null
  })
}
const savedState = () => page.$eval('[data-save-state]', (el) => el.dataset.saveState)

/**
 * **저장소에 실제로 들어간 색.** 화면의 "저장됨" 표시를 믿지 않는다 — 그건 화면 상태일 뿐이고,
 * 저장이 조용히 실패해도 그렇게 뜰 수 있다. 저장소를 직접 되읽어 확인한다.
 *
 * repo 를 통해 읽으므로 어댑터가 뭐든(localStorage / Supabase) 같은 검증이 성립한다 —
 * 저장소 구현을 아는 검증은 저장소가 바뀌는 순간 거짓말을 시작한다.
 */
const savedPrimary = () =>
  page.evaluate(async (slug) => {
    const { repo } = await import('/src/lib/repo/index.ts')
    const s = await repo.slots.get(slug)
    return s?.theme.colors.primary ?? null
  }, SLUG)

// 이미지를 올린 것만으로도 초안이 더러워진다 — 먼저 저장해 기준을 맞춘다
await page.click('[data-save]')
await wait(900)
check('저장하면 "저장됨" 으로', (await savedState()) === 'saved')

// 저장된 뒤라야 슬롯이 그 이미지를 가리킨다 (업로드만으론 초안에만 있다)
const urls = await assetUrls()
check('로고가 실제로 받아짐', await fetches(urls?.logo), urls?.logo ?? '주소 없음')
check('카드 뒷면이 실제로 받아짐', await fetches(urls?.cardBack), urls?.cardBack ?? '주소 없음')
check('카드 앞면이 실제로 받아짐', await fetches(urls?.cardFront), urls?.cardFront ?? '주소 없음')

/**
 * **다시 올리면 URL 이 달라지나** — 캐시 우회의 전부다.
 *
 * 같은 경로에 덮어쓰면 URL 이 그대로라 브라우저가 옛 그림을 계속 쓴다. 그래서 올릴 때마다
 * `?v=` 를 바꿔 **다른 URL** 로 만든다. 이게 안 돌면 "올렸는데 안 바뀐다" 가 되고,
 * 그건 업로드가 실패한 것처럼 보인다. URL 이 그대로면 이 검사가 잡는다.
 */
/*
 * 로고는 **먼저 지워야 다시 올릴 수 있다** — 이미 있으면 ImageField 가 썸네일+X 만 보여주고
 * 업로드 input 을 안 그린다(그게 이 화면의 교체 방식이다). 실제 사람이 하는 순서 그대로 간다.
 */
await page.click('button[aria-label="로고 지우기"]')
await wait(600)
check('로고를 바꾸려면 지우고 다시 올린다', await upload('[data-image-field="logo"]', pixel2))
check('앞면은 덮어쓰기로 바로 올린다', await upload('[data-card-upload="major-0"]', pixel2))
await wait(800)
await page.click('[data-save]')
await wait(1200)
const again = await assetUrls()
check('로고를 다시 올리면 URL 이 바뀐다', Boolean(again?.logo) && again.logo !== urls?.logo, `${urls?.logo?.split('?')[1] ?? '?'} → ${again?.logo?.split('?')[1] ?? '?'}`)
check('앞면을 다시 올리면 URL 이 바뀐다', Boolean(again?.cardFront) && again.cardFront !== urls?.cardFront, `${urls?.cardFront?.split('?')[1] ?? '?'} → ${again?.cardFront?.split('?')[1] ?? '?'}`)
check('바뀐 앞면 URL 도 받아짐', await fetches(again?.cardFront), again?.cardFront ?? '주소 없음')

const before = await previewCta()
await page.$eval('#c-primary', (el) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  setter.call(el, '#FF0000')
  el.dispatchEvent(new Event('input', { bubbles: true }))
})
await wait(1000)
check('고치면 "저장 안 됨" 표시', (await savedState()) === 'dirty')
check('저장 전엔 저장소가 그대로', (await savedPrimary()) !== '#FF0000', String(await savedPrimary()))
check('저장 전엔 미리보기도 그대로', (await previewCta()) === before, String(await previewCta()))

await page.click('[data-save]')
await wait(1200)
check('저장하면 저장소에 반영', (await savedPrimary()) === '#FF0000')
check('저장하면 미리보기가 따라옴', (await previewCta()) === 'rgb(255, 0, 0)', String(await previewCta()))
check('저장 후 "저장됨"', (await savedState()) === 'saved')

// 되돌리기 — 저장 안 한 수정만 버린다
await page.$eval('#c-accent', (el) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  setter.call(el, '#00FF00')
  el.dispatchEvent(new Event('input', { bubbles: true }))
})
await wait(400)
const revert = await page.$$eval('button', (bs) => bs.some((b) => b.textContent.trim() === '되돌리기'))
check('저장 안 하면 되돌리기가 뜸', revert)
await page.$$eval('button', (bs) => bs.find((b) => b.textContent.trim() === '되돌리기').click())
await wait(500)
check('되돌리면 "저장됨" 으로', (await savedState()) === 'saved')
check('되돌려도 저장된 색은 남음', (await savedPrimary()) === '#FF0000')

/**
 * ★ **이 작업(슬롯을 DB 로)의 통과 조건** — `docs/BACKEND.md` 가 못 박아둔 것.
 *
 * 위 검사는 전부 **같은 브라우저 안**이라, 슬롯이 localStorage 에 있어도 똑같이 통과한다.
 * 진짜 질문은 "슬롯이 이 브라우저 밖으로 나갔나" 다 — 그래서 세션도 저장소도 공유하지 않는
 * 별도 컨텍스트를(=처음 온 방문자) 열어 방금 만든 슬롯이 **그 색 그대로** 뜨는지 본다.
 * 여기가 통과해야 "만들면 바로 생긴다" 가 참이 된다.
 */
const visitorCtx = await browser.createBrowserContext()
const visitor = await visitorCtx.newPage()
await visitor.goto(`${BASE}/${SLUG}`, { waitUntil: 'networkidle0' })
await wait(1200)
const seenByVisitor = await visitor.evaluate(() =>
  getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim()
)
check(
  '방금 만든 슬롯이 다른 브라우저에서 열린다',
  seenByVisitor.toUpperCase() === '#FF0000',
  `방문자가 본 primary = ${seenByVisitor || '(못 열림)'}`
)
await visitorCtx.close()

// ── 올린 이미지가 <img> 가 아니라 배경으로 깔리는가 ──
// 모바일에서 길게 눌러 저장되면 안 된다 (src/lib/image.ts)
await page.goto(`${BASE}/${SLUG}`, { waitUntil: 'networkidle0' })
await wait(900)
const home = await page.evaluate(() => {
  const logo = document.querySelector('[role="img"]')
  return {
    imgs: document.querySelectorAll('img').length,
    logoBg: logo ? getComputedStyle(logo).backgroundImage : '',
    backBg: [...document.querySelectorAll('div')]
      .map((d) => getComputedStyle(d).backgroundImage)
      .filter((b) => b.includes('card-back')).length,
  }
})
check('홈에 <img> 없음', home.imgs === 0, `${home.imgs}개`)
check('로고가 배경 이미지', home.logoBg.includes('logo.png'), home.logoBg)
check('카드 뒷면이 배경 이미지', home.backBg > 0)
await page.screenshot({ path: join(outDir, 'owner-slot-home.png') })

await page.goto(`${BASE}/${SLUG}/cards`, { waitUntil: 'networkidle0' })
await wait(900)
const cards = await page.evaluate(() => ({
  imgs: document.querySelectorAll('img').length,
  fronts: [...document.querySelectorAll('[role="img"]')]
    .map((d) => getComputedStyle(d).backgroundImage)
    .filter((b) => b.includes('major-0.png')).length,
}))
check('도감에 <img> 없음', cards.imgs === 0, `${cards.imgs}개`)
check('카드 앞면이 배경 이미지', cards.fronts > 0)
await page.screenshot({ path: join(outDir, 'owner-slot-cards.png') })

// 앞면 이미지가 없는 카드는 텍스트 폴백으로 남는가 (major-0 만 올렸다)
const fallback = await page.evaluate(
  () => [...document.querySelectorAll('[role="img"]')].filter((d) => d.textContent.trim()).length
)
check('안 올린 카드는 텍스트 폴백', fallback > 0, `${fallback}장`)

// ── 경로 조작 방어 ─────────────────────────────────
const traversal = await page.evaluate(async () => {
  const res = await fetch('/__slot-upload', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      slug: 'verify-test',
      name: '../../../evil.png',
      dataUrl: 'data:image/png;base64,AAAA',
    }),
  })
  return res.status
})
check('경로 조작 차단', traversal === 400, `${traversal}`)

// ── 슬롯 삭제 ──────────────────────────────────────
await page.goto(`${BASE}/theme-editor`, { waitUntil: 'networkidle0' })
await wait(500)
await page.click(`[data-slot="${SLUG}"] [data-slot-delete]`)
// 깊은 삭제(이미지·주최자·슬롯)는 네트워크로 도니 목록에서 사라질 때까지 기다린다
await page
  .waitForFunction((slug) => !document.querySelector(`[data-slot="${slug}"]`), { timeout: 8000 }, SLUG)
  .catch(() => {})
check('슬롯이 목록에서 사라짐', (await page.$(`[data-slot="${SLUG}"]`)) === null)

// 지워진 슬롯의 편집 화면은 목록으로 되돌린다
await page.goto(`${BASE}/theme-editor/${SLUG}`, { waitUntil: 'networkidle0' })
await wait(500)
check('없는 슬롯 편집 → 목록으로', page.url().endsWith('/theme-editor'), page.url())

// ── 로그아웃 ───────────────────────────────────────
await page.click('[data-signout]')
await wait(1500)
check('로그아웃하면 바로 로그인 화면', page.url().endsWith('/theme-editor/login'), page.url())
// 정말 나갔나 — 주소를 직접 쳐서 들어가보기
await page.goto(`${BASE}/theme-editor`, { waitUntil: 'networkidle0' })
await wait(900)
check('로그아웃 후엔 다시 못 들어감', page.url().endsWith('/theme-editor/login'), page.url())

// ── 밝은 배경 테마에서 그림자가 옅어지는가 ─────────
await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle0' })
await wait(300)
const shadows = await page.evaluate(async () => {
  const { applyTheme } = await import('/src/lib/theme.ts')
  const base = {
    colors: {
      canvas: '#0F1020', surface: '#1A1B2E', surfaceRaised: '#242537', wash: '#241F45',
      primary: '#816BFF', primaryHover: '#6E58FF', primarySoft: '#B7AAFF',
      accent: '#D4AF37', accentSoft: '#E8CF7A',
      fg1: '#F2F0FA', fg2: '#C6C3D8', fg3: '#9A97B0',
      border: '#2E2F45', borderHover: '#3A3B57', onPrimary: '#FFFFFF',
      cardBackFrom: '#1E1F3E', cardBackTo: '#101127',
    },
    shape: { radiusSm: 4, radiusMd: 8, radiusLg: 16 },
    assets: {
      logo: null, logoAlt: '', logoHeight: 28,
      backgroundPattern: null, 
      backgroundPatternSize: 'cover', backgroundPatternRepeat: 'no-repeat',
      cardFrontBase: null, cardFrontExt: 'webp', cardBack: null,
    },
  }
  const read = () => ({
    shadow: getComputedStyle(document.documentElement).getPropertyValue('--shadow-card').trim(),
    scheme: getComputedStyle(document.documentElement).getPropertyValue('color-scheme').trim(),
  })
  applyTheme(base)
  const dark = read()
  applyTheme({ ...base, colors: { ...base.colors, canvas: '#FFFFFF' } })
  const light = read()
  return { dark, light }
})
check(
  '밝은 배경에서 그림자 옅어짐 + color-scheme 전환',
  shadows.dark.shadow !== shadows.light.shadow && shadows.light.scheme === 'light',
  `${shadows.dark.shadow} → ${shadows.light.shadow}`
)

await browser.close()

/**
 * 뒷정리 — 슬롯을 지워도 **올린 이미지는 저장소에 남는다** (실제 동작이 그렇고,
 * SlotList 의 삭제 확인창이 그 사실을 밝힌다). 그건 운영에선 맞지만 검증이 매번
 * 쌓아두고 가면 안 된다. 시작할 때도 지우지만, 끝에서 치워 버킷을 깨끗이 둔다.
 */
await rm(`public/slots/${SLUG}`, { recursive: true, force: true })
await purgeSlot()
check('뒷정리: 올린 이미지까지 지움', (await leftoverAssets()) === 0, `${await leftoverAssets()}개 남음`)

// 경로 조작 차단은 일부러 시킨 테스트라 400 은 정상 — 걸러낸다
const real = errors.filter((e) => !e.includes('400'))
if (real.length) {
  console.error('\n콘솔 에러:')
  for (const e of real) console.error(`  · ${e}`)
}

const failed = checks.filter(([, ok]) => !ok).length
console.log(`\n${checks.length - failed} / ${checks.length} 통과`)
process.exit(failed || real.length ? 1 : 0)
