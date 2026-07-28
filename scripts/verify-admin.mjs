/**
 * 슬롯 · 관리자 · 테마 편집기 검증 — 실제로 눌러보고 확인한다.
 *
 *   node scripts/verify-admin.mjs <스크린샷 디렉터리>
 *
 * 개발 서버(5174)가 떠 있어야 한다.
 *
 * **씨앗 슬롯(demo·sample-pink)에 기대지 않는다.** 예전엔 그 두 슬롯의 테마·이벤트가
 * 서로 다른 걸 빌려 격리를 봤는데, 슬롯은 지워질 수 있어서(실제로 지워졌다) 없는 채로
 * 돌리면 로그인 폼을 못 찾는 엉뚱한 에러로 죽었다 — 회귀인지 데이터가 없는 건지 구분이
 * 안 됐다. 그래서 `verify-luckydraw-ui.mjs` 처럼 **검증이 자기 슬롯 두 개를 만들었다
 * 끝나면 purge 로 통째로 지운다.** 남의 데이터에 기대는 검증은 언젠가 또 그렇게 된다.
 *
 * 두 슬롯은 일부러 다르게 만든다 — 테마 색과 애정운 스프레드 장수가 서로 달라야
 * "슬롯끼리 격리되나" 를 볼 수 있다. 한쪽엔 주최자 계정도 붙여 질문 CRUD·격리를 본다.
 */

import puppeteer from 'puppeteer-core'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const chrome = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p))
if (!chrome) {
  console.error('Chrome/Edge 를 찾지 못했어요')
  process.exit(1)
}

/**
 * 슬롯을 만들려면 진짜 DB 가 필요하다 — 이 검증은 REST 로 슬롯·계정을 직접 심는다.
 * .env.local 이 없으면(local 어댑터) 심을 곳이 없으니, 회귀가 아니라 설정이 없는 것이라
 * 이유를 말하고 멈춘다 (verify-luckydraw-ui 와 같은 전제).
 */
const env = {}
try {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim())
    if (m) env[m[1]] = m[2]
  }
} catch {
  /* 아래에서 URL/ANON 없음으로 걸러진다 */
}
const URL_ = env.VITE_SUPABASE_URL
const ANON = env.VITE_SUPABASE_ANON_KEY
const OWNER_PASSWORD = env.SEED_PASSWORD ?? 'tarot1234'
if (!URL_ || !ANON) {
  console.log('⚠ 이 검증은 Supabase 가 붙은 빌드를 전제로 해요 (.env.local 의 VITE_SUPABASE_*).')
  console.log('  슬롯을 직접 심었다 지우기 때문입니다. 회귀가 아니라 설정이 없는 겁니다.')
  process.exit(0)
}

/**
 * **테마는 씨앗에서 통째로 가져와 색만 바꾼다.** 빈 테마({colors:{}…})를 넣으면
 * applyTheme 이 primary 가 undefined 라 화면이 하얗게 죽고, 그러면 "격리됐다" 같은
 * 부정 단언이 빈 화면에서 그냥 통과한다 (verify-luckydraw-ui 가 겪은 함정).
 */
const SEED_THEME = JSON.parse(readFileSync('src/data/slots.json', 'utf8'))[0].theme

const BASE = 'http://localhost:5174'
const outDir = process.argv[2] ?? '.'

// 두 슬롯 — 테마 색과 애정운 장수가 다르다 (격리를 이걸로 본다)
const A = { slug: 'admin-verify-a', primary: '#816BFF', hover: '#6E58FF', event: {} }
const B = { slug: 'admin-verify-b', primary: '#22B07D', hover: '#159467', event: { love: { cardCount: 3 } } }
const ORGANIZER = 'admin-verify@example.com'
const ORG_PASSWORD = 'verify-1234'

let failed = 0
const check = (name, ok, detail = '') => {
  if (!ok) failed++
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

// ── 준비: 최고관리자로 인증 → REST 로 슬롯·계정을 심는다 ──────────
const auth = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: ANON, 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'owner@example.com', password: OWNER_PASSWORD }),
})
const { access_token } = await auth.json()
if (!access_token) {
  console.error('최고관리자 로그인 실패 — SEED_PASSWORD 를 확인하세요')
  process.exit(1)
}
const OWNER = { apikey: ANON, authorization: `Bearer ${access_token}`, 'content-type': 'application/json' }

const rest = (p, i = {}) => fetch(`${URL_}/rest/v1/${p}`, i)
const fn = (p, body) =>
  fetch(`${URL_}/functions/v1/admin/${p}`, { method: 'POST', headers: OWNER, body: JSON.stringify(body) })

/** 슬롯·주최자 계정·질문(cascade)까지 통째로 — 수동 삭제와 같은 경로 (admin/purge) */
async function cleanup() {
  for (const s of [A, B]) {
    await fn('purge', { slug: s.slug }).catch(() => {})
    await rest(`slots?slug=eq.${s.slug}`, { method: 'DELETE', headers: OWNER }).catch(() => {})
  }
}

await cleanup()

for (const s of [A, B]) {
  await rest('slots', {
    method: 'POST',
    headers: { ...OWNER, prefer: 'return=minimal' },
    body: JSON.stringify({
      slug: s.slug,
      name: `관리자 검증 ${s.slug.endsWith('a') ? '가' : '나'}`,
      service: 'tarot',
      period: {},
      theme: { ...SEED_THEME, colors: { ...SEED_THEME.colors, primary: s.primary, primaryHover: s.hover } },
      event: s.event,
    }),
  })
}

// A 슬롯에만 주최자 계정을 붙인다 (겸업 경로: 이미 있으면 연결, 없으면 생성 — 0006)
const made = await fn('organizers', { slug: A.slug, email: ORGANIZER, password: ORG_PASSWORD })
check('주최자 계정을 만든다', made.ok, made.ok ? '' : await made.text())

await mkdir(outDir, { recursive: true })
const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
})

const pageErrors = []
function watch(page) {
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && pageErrors.push(m.text()))
  return page
}
async function open(w = 1280, h = 900) {
  const page = watch(await browser.newPage())
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 })
  return page
}

try {
  const page = await open()

  // ── 슬롯 라우팅 ────────────────────────────────────
  await page.goto(`${BASE}/${A.slug}`, { waitUntil: 'networkidle0' })
  await wait(500)
  const bodyLen = (await page.evaluate(() => document.body.innerText)).trim().length
  // 긍정 단언 먼저 — 화면이 죽으면 아래 부정 단언들이 빈 화면에서 통과해 버린다
  check('내 슬롯이 그려졌다', bodyLen > 0, `본문 ${bodyLen}자`)
  check('자바스크립트 오류가 없다', pageErrors.length === 0, pageErrors[0]?.slice(0, 120) ?? '')

  await page.goto(`${BASE}/없는슬롯`, { waitUntil: 'networkidle0' })
  await wait(300)
  const notFound = await page.$eval('h1', (h) => h.textContent.trim())
  check('없는 슬롯은 찾을 수 없음', notFound.includes('찾을 수 없'), notFound)

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' })
  await wait(300)
  const rootH1 = await page.$eval('h1', (h) => h.textContent.trim())
  check('배포 루트는 슬롯 목록을 안 보인다', rootH1.includes('찾을 수 없'), rootH1)

  // ── 슬롯별 테마 격리 (CTA 색이 서로 다르다) ─────────
  const ctaColor = async (slug) => {
    await page.goto(`${BASE}/${slug}`, { waitUntil: 'networkidle0' })
    await wait(500)
    return page.$$eval('button', (bs) => {
      const b = bs.find((x) => x.textContent.trim() === '카드 뽑기')
      return b ? getComputedStyle(b).backgroundColor : null
    })
  }
  const ctaA = await ctaColor(A.slug)
  const ctaB = await ctaColor(B.slug)
  check('슬롯별 테마가 격리된다 (CTA 색이 다르다)', !!ctaA && !!ctaB && ctaA !== ctaB, `${ctaA} / ${ctaB}`)

  // ── 슬롯별 이벤트 설정 (B 는 애정운 3장) ─────────────
  const loveSlots = async (slug) => {
    await page.goto(`${BASE}/${slug}/draw/love`, { waitUntil: 'networkidle0' })
    await wait(600)
    return page.$$eval('[class*="slotEmpty"]', (e) => e.length)
  }
  const slotsA = await loveSlots(A.slug)
  const slotsB = await loveSlots(B.slug)
  check('애정운 장수가 이벤트 설정을 따른다 (가 1 · 나 3)', slotsA === 1 && slotsB === 3, `가 ${slotsA} · 나 ${slotsB}`)

  // ── 관리자: 미로그인 가드 → 로그인 → 질문 CRUD ──────
  await page.goto(`${BASE}/${A.slug}/admin/questions`, { waitUntil: 'networkidle0' })
  await wait(500)
  check('미로그인은 로그인으로 보낸다', page.url().includes('/admin/login'), page.url())

  await page.type('#admin-email', ORGANIZER)
  await page.type('#admin-password', ORG_PASSWORD)
  await page.click('button[type="submit"]')
  await wait(2500)
  // 로그인하면 **대시보드**로 든다 (예전엔 서비스 첫 화면이었다 — admin/Dashboard.tsx 주석)
  check('로그인 후 대시보드에 든다', /\/admin\/?$/.test(page.url()), page.url())
  check('대시보드에 숫자 카드가 뜬다', Boolean(await page.$('[data-stats]')))
  await page.screenshot({ path: join(outDir, 'admin-dashboard-desktop.png') })

  await page.goto(`${BASE}/${A.slug}/admin/questions`, { waitUntil: 'networkidle0' })
  await wait(800)
  check('메뉴로 질문 목록에 든다', page.url().includes('/admin/questions'), page.url())
  await page.screenshot({ path: join(outDir, 'admin-questions-desktop.png') })

  const rowCount = () => page.$$eval('.row-item', (e) => e.length)
  const before = await rowCount()
  await page.$$eval('button', (bs) => bs.find((b) => b.textContent.includes('질문 추가'))?.click())
  await wait(800)
  check('질문 추가 → 편집 화면에 든다', !!page.url().match(/questions\/q-/), page.url())

  // 질문 작성 + 공개 + 첫 카드 답변 입력
  await page.type('#q-text', '테스트 질문이 잘 저장되나요?')
  await wait(400)
  await page.$$eval('input[type=checkbox]', (cs) => cs[0]?.click()) // 공개
  await wait(400)
  await page.$$eval('[aria-expanded]', (bs) => bs[0]?.click())
  await wait(300)
  await page.type('textarea', '관리자가 직접 쓴 답변입니다.')
  await wait(600)
  await page.screenshot({ path: join(outDir, 'admin-editor-desktop.png'), fullPage: false })

  await page.goto(`${BASE}/${A.slug}/admin/questions`, { waitUntil: 'networkidle0' })
  await wait(600)
  const after = await rowCount()
  check('질문이 늘었다', after === before + 1, `${before} → ${after}`)

  // ── 사용자 앱(운세 탭)에 반영되는가 ─────────────────
  await page.goto(`${BASE}/${A.slug}/fortune`, { waitUntil: 'networkidle0' })
  await wait(800)
  const listed = await page.$$eval('[class*="list-row"] span', (e) => e.map((x) => x.textContent.trim()))
  check('추가한 질문이 운세 탭에 노출된다', listed.some((t) => t.includes('테스트 질문')), listed.join(', ').slice(0, 80))

  // ── 슬롯 격리: 다른 슬롯엔 안 보여야 한다 ────────────
  await page.goto(`${BASE}/${B.slug}/fortune`, { waitUntil: 'networkidle0' })
  await wait(800)
  const bListed = await page.$$eval('[class*="list-row"] span', (e) => e.map((x) => x.textContent.trim()))
  check('다른 슬롯엔 안 새어 나간다', !bListed.some((t) => t.includes('테스트 질문')))

  // ── 뒷정리: 만든 질문을 지운다 (진짜 DB 다) ──────────
  page.on('dialog', (d) => void d.accept())
  await page.goto(`${BASE}/${A.slug}/admin/questions`, { waitUntil: 'networkidle0' })
  await wait(600)
  await page.$$eval('.row-item', (rows) => {
    rows.find((r) => r.textContent.includes('테스트 질문'))?.querySelector('button[aria-label="삭제"]')?.click()
  })
  await wait(400)
  // 네이티브 confirm 이 아니라 확인 모달이 뜬다 — 모달의 '삭제' 를 눌러야 지워진다
  await page.$$eval('[role="dialog"] button', (bs) =>
    bs.find((b) => b.textContent.trim() === '삭제')?.click()
  )
  await wait(1000)
  const afterDelete = await rowCount()
  check('만든 질문을 지워 원래대로 돌린다', afterDelete === before, `${after} → ${afterDelete}`)

  // ── 관리자 슬롯 격리: A 주최자는 B 관리에 못 든다 ────
  await page.goto(`${BASE}/${B.slug}/admin/questions`, { waitUntil: 'networkidle0' })
  await wait(600)
  check('다른 슬롯 관리 화면엔 못 든다', page.url().includes(`/${B.slug}/admin/login`), page.url())

  // ── 로그아웃하면 바로 나가고 다시 못 든다 ────────────
  await page.goto(`${BASE}/${A.slug}/admin/questions`, { waitUntil: 'networkidle0' })
  await wait(600)
  await page.click('[data-signout]')
  await wait(1200)
  check('로그아웃 → 바로 로그인 화면', page.url().includes(`/${A.slug}/admin/login`), page.url())
  await page.goto(`${BASE}/${A.slug}/admin/questions`, { waitUntil: 'networkidle0' })
  await wait(900)
  check('로그아웃 후엔 다시 못 든다', page.url().includes(`/${A.slug}/admin/login`), page.url())

  // ── 주최자 로그인 상태로 /theme-editor 는 막힌다 ─────
  // (역할 분리 — 편집기는 최고관리자만. 편집기 자체 검증은 verify-owner.mjs)
  await page.goto(`${BASE}/theme-editor`, { waitUntil: 'networkidle0' })
  await wait(600)
  check('주최자에겐 슬롯 편집기가 막힌다', page.url().endsWith('/theme-editor/login'), page.url())
  await page.screenshot({ path: join(outDir, 'owner-login-gate.png') })

  // ── 모바일 반응형 ──────────────────────────────────
  const mobile = await open(390, 844)
  await mobile.goto(`${BASE}/${A.slug}/admin/questions`, { waitUntil: 'networkidle0' })
  await wait(600)
  const overflow = await mobile.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  )
  check('모바일 관리자에 가로 오버플로가 없다', overflow <= 0, `${overflow}px`)
  await mobile.screenshot({ path: join(outDir, 'admin-questions-mobile.png') })
} finally {
  await browser.close()
  await cleanup()
  const left = await Promise.all(
    [A, B].map((s) => rest(`slots?slug=eq.${s.slug}&select=slug`, { headers: OWNER }).then((r) => r.json()))
  )
  check('검증이 남긴 게 없다', left.every((rows) => rows.length === 0))
}

if (pageErrors.length) {
  console.error('콘솔 에러:')
  for (const e of pageErrors) console.error(`  · ${e}`)
  failed++
}
console.log(failed === 0 ? `\n전부 통과 — 스크린샷: ${outDir}` : `\n${failed}개 실패`)
process.exit(failed === 0 ? 0 : 1)
