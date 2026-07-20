/**
 * 슬롯 · 관리자 · 테마 편집기 검증 — 실제로 눌러보고 확인한다.
 * 개발 서버가 떠 있어야 한다.
 *
 *   node scripts/verify-admin.mjs <스크린샷 디렉터리>
 */

import puppeteer from 'puppeteer-core'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

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
  /* .env.local 이 없으면 local 어댑터 — 아무 값이나 통과한다 */
}
const ADMIN_EMAIL = 'demo@example.com'
const ADMIN_PASSWORD = env.SEED_PASSWORD ?? 'tarot1234'

const chrome = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p))

const outDir = process.argv[2] ?? '.'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const BASE = 'http://localhost:5174'

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
})

/**
 * **이 검증은 씨앗 슬롯 두 개를 전제로 한다** — `demo` 와 `sample-pink`.
 * 두 슬롯의 테마·이벤트 설정이 서로 다른 걸 이용해 "슬롯끼리 격리되나" 를 보기 때문이다.
 *
 * 그런데 그 슬롯들은 지워질 수 있다(실제로 지워졌다). 없는 채로 돌리면 로그인 폼을 못 찾는
 * 엉뚱한 에러로 죽어서, **회귀인지 데이터가 없는 건지 구분이 안 된다.**
 * 먼저 확인하고 없으면 이유를 말하고 멈춘다.
 *
 * 제대로 고치려면 `verify-luckydraw-ui.mjs` 처럼 **자기 슬롯을 만들었다 지우게** 해야 한다.
 * 남의 데이터에 기대는 검증은 언젠가 또 이렇게 된다.
 */
{
  const need = ['demo', 'sample-pink']
  /**
   * **주소로 확인하면 안 된다** — SPA 라 없는 슬러그도 index.html 을 200 으로 준다.
   * (그렇게 짰다가 검사가 통째로 무의미했다.) 저장소에 직접 묻는다.
   */
  const missing = []
  if (env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY) {
    const res = await fetch(
      `${env.VITE_SUPABASE_URL}/rest/v1/slots?select=slug&slug=in.(${need.join(',')})`,
      { headers: { apikey: env.VITE_SUPABASE_ANON_KEY } }
    )
    const found = res.ok ? (await res.json()).map((r) => r.slug) : []
    missing.push(...need.filter((s) => !found.includes(s)))
  }
  if (missing.length) {
    console.log(`⚠ 이 검증은 씨앗 슬롯 ${need.join(' · ')} 이 필요해요 — 없음: ${missing.join(', ')}`)
    console.log('  회귀가 아니라 데이터가 없는 겁니다. 슬롯을 만들거나, 스크립트를')
    console.log('  verify-luckydraw-ui.mjs 처럼 자기 슬롯을 만들었다 지우게 고쳐주세요.')
    await browser.close()
    process.exit(0)
  }
}

const errors = []
function watch(page) {
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  return page
}

async function open(w = 1280, h = 900) {
  const page = watch(await browser.newPage())
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 })
  return page
}

const page = await open()

// ── 슬롯 라우팅 ────────────────────────────────────
await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle0' })
await wait(500)
const demoLogo = await page.$eval('h1, [class*="logo"], .app', (el) => el.textContent.slice(0, 40))
console.log(`/demo 진입: ${demoLogo.trim() ? '렌더됨' : '문제'}`)

await page.goto(`${BASE}/없는슬롯`, { waitUntil: 'networkidle0' })
await wait(300)
const notFound = await page.$eval('h1', (h) => h.textContent.trim())
console.log(`없는 슬롯: "${notFound}" ${notFound.includes('찾을 수 없') ? '(정상)' : '(문제)'}`)

await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' })
await wait(300)
const rootH1 = await page.$eval('h1', (h) => h.textContent.trim())
console.log(`배포 루트: "${rootH1}" ${rootH1.includes('찾을 수 없') ? '(정상 — 슬롯 목록 비노출)' : '(문제)'}`)

// ── 슬롯별 테마 격리 ───────────────────────────────
const ctaColor = async (slug) => {
  await page.goto(`${BASE}/${slug}`, { waitUntil: 'networkidle0' })
  await wait(500)
  return page.$$eval('button', (bs) => {
    const b = bs.find((x) => x.textContent.trim() === '카드 뽑기')
    return b ? getComputedStyle(b).backgroundColor : null
  })
}
const demoCta = await ctaColor('demo')
const pinkCta = await ctaColor('sample-pink')
console.log(`데모 CTA: ${demoCta} / 핑크 CTA: ${pinkCta}`)
console.log(demoCta !== pinkCta ? '슬롯별 테마 격리됨 (정상)' : '문제 — 두 슬롯 테마가 같다')

// ── 슬롯별 이벤트 설정 (핑크는 애정운 3장) ─────────
await page.goto(`${BASE}/sample-pink/draw/love`, { waitUntil: 'networkidle0' })
await wait(600)
const pinkSlots = await page.$$eval('[class*="slotEmpty"]', (e) => e.length)
await page.goto(`${BASE}/demo/draw/love`, { waitUntil: 'networkidle0' })
await wait(600)
const demoSlots = await page.$$eval('[class*="slotEmpty"]', (e) => e.length)
console.log(
  `애정운 슬롯 — 데모 ${demoSlots}개 / 핑크 ${pinkSlots}개 ${
    demoSlots === 1 && pinkSlots === 3 ? '(정상 — 이벤트 설정 반영)' : '(문제)'
  }`
)

// ── 관리자: 로그인 → 질문 CRUD ─────────────────────
await page.goto(`${BASE}/demo/admin/questions`, { waitUntil: 'networkidle0' })
await wait(500)
console.log(
  page.url().includes('/admin/login') ? '미로그인 → 로그인으로 보냄 (정상)' : '문제 — 가드 없음'
)

// 인증이 진짜라 실제 계정으로 들어간다 (supabase/seed.sql · .env.local 의 SEED_PASSWORD).
// Supabase 를 안 붙인 상태(local 어댑터)면 아무 값이나 통과하므로 이 값이 그대로 먹는다.
await page.type('#admin-email', ADMIN_EMAIL)
await page.type('#admin-password', ADMIN_PASSWORD)
await page.click('button[type="submit"]')
await wait(2500)
console.log(page.url().includes('/admin/questions') ? '로그인 후 질문 목록 진입 (정상)' : `문제 — ${page.url()}`)
await page.screenshot({ path: join(outDir, 'admin-questions-desktop.png') })

const rowCount = () => page.$$eval('.row-item', (e) => e.length)
const before = await rowCount()
await page.$$eval('button', (bs) => bs.find((b) => b.textContent.includes('질문 추가'))?.click())
await wait(800)
console.log(page.url().match(/questions\/q-/) ? '질문 추가 → 편집 화면 진입 (정상)' : '문제')

// 이 질문은 **진짜 DB** 에 들어간다 — 끝나면 반드시 지운다 (localStorage 때는 다음 실행이 덮어썼다)
const createdId = page.url().split('/').pop()

// 질문 작성 + 공개 + 답변 입력
await page.type('#q-text', '테스트 질문이 잘 저장되나요?')
await wait(400)
await page.$$eval('input[type=checkbox]', (cs) => cs[0]?.click()) // 공개
await wait(400)

// 첫 카드(바보) 답변 열어서 입력
await page.$$eval('[aria-expanded]', (bs) => bs[0]?.click())
await wait(300)
await page.type('textarea', '관리자가 직접 쓴 답변입니다.')
await wait(600)
await page.screenshot({ path: join(outDir, 'admin-editor-desktop.png'), fullPage: false })

// 목록으로 돌아가 개수 확인
await page.goto(`${BASE}/demo/admin/questions`, { waitUntil: 'networkidle0' })
await wait(600)
const after = await rowCount()
console.log(`질문 수: ${before} → ${after} ${after === before + 1 ? '(추가됨 — 정상)' : '(문제)'}`)

// ── 사용자 앱에 반영되는가 ─────────────────────────
await page.goto(`${BASE}/demo/fortune`, { waitUntil: 'networkidle0' })
await wait(800)
const listed = await page.$$eval('[class*="list-row"] span', (e) =>
  e.map((x) => x.textContent.trim())
)
console.log(
  listed.some((t) => t.includes('테스트 질문'))
    ? '추가한 질문이 운세 탭에 노출됨 (정상)'
    : `문제 — 목록: ${listed.join(', ')}`
)

// ── 슬롯 격리: 핑크 슬롯엔 안 보여야 한다 ──────────
await page.goto(`${BASE}/sample-pink/fortune`, { waitUntil: 'networkidle0' })
await wait(800)
const pinkListed = await page.$$eval('[class*="list-row"] span', (e) =>
  e.map((x) => x.textContent.trim())
)
console.log(
  !pinkListed.some((t) => t.includes('테스트 질문'))
    ? '다른 슬롯엔 안 보임 (정상 — 질문 격리됨)'
    : '문제 — 슬롯 간 질문이 새어 나감'
)

// ── 뒷정리: 만든 질문을 지운다 (진짜 DB 다) ─────────
page.on('dialog', (d) => void d.accept())
await page.goto(`${BASE}/demo/admin/questions`, { waitUntil: 'networkidle0' })
await wait(600)
await page.$$eval(
  '.row-item',
  (rows, id) => {
    const row = rows.find((r) => r.textContent.includes('테스트 질문'))
    row?.querySelector('button[aria-label="삭제"]')?.click()
    return id
  },
  createdId
)
await wait(1000)
const afterDelete = await rowCount()
console.log(
  `뒷정리: ${after} → ${afterDelete} ${afterDelete === before ? '(원래대로 — 정상)' : '(문제 — DB 에 쓰레기가 남음)'}`
)

// ── 관리자 슬롯 격리 ───────────────────────────────
await page.goto(`${BASE}/sample-pink/admin/questions`, { waitUntil: 'networkidle0' })
await wait(600)
console.log(
  page.url().includes('/sample-pink/admin/login')
    ? '데모 계정으로 핑크 관리 진입 차단됨 (정상)'
    : '문제 — 다른 슬롯 관리 화면에 들어가짐'
)

// ── 로그아웃하면 바로 나가는가 ─────────────────────
await page.goto(`${BASE}/demo/admin/questions`, { waitUntil: 'networkidle0' })
await wait(600)
await page.click('[data-signout]')
await wait(1200)
console.log(
  page.url().includes('/demo/admin/login')
    ? '로그아웃 → 바로 로그인 화면 (정상)'
    : `문제 — 로그아웃했는데 ${page.url()}`
)
// 정말 나갔나 — 주소를 직접 쳐서 들어가보기
await page.goto(`${BASE}/demo/admin/questions`, { waitUntil: 'networkidle0' })
await wait(900)
console.log(
  page.url().includes('/demo/admin/login')
    ? '로그아웃 후엔 다시 못 들어감 (정상)'
    : '문제 — 세션이 살아 있음'
)

// ── 모바일 반응형 ──────────────────────────────────
const mobile = await open(390, 844)
await mobile.goto(`${BASE}/demo/admin/questions`, { waitUntil: 'networkidle0' })
await wait(600)
const overflow = await mobile.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth
)
console.log(`모바일 관리자 가로 오버플로: ${overflow}px ${overflow <= 0 ? '(정상)' : '(문제)'}`)
await mobile.screenshot({ path: join(outDir, 'admin-questions-mobile.png') })

// ── 슬롯 편집기는 주최자 세션으로 열리지 않는다 ────
// (역할 분리 — 주최자는 자기 질문만 만진다. 편집기 자체 검증은 verify-owner.mjs)
await page.goto(`${BASE}/theme-editor`, { waitUntil: 'networkidle0' })
await wait(600)
const gated = page.url().endsWith('/theme-editor/login')
console.log(`주최자 로그인 상태로 /theme-editor: ${page.url()} ${gated ? '(막힘 — 정상)' : '(문제)'}`)
await page.screenshot({ path: join(outDir, 'owner-login-gate.png') })

await browser.close()

if (errors.length) {
  console.error('콘솔 에러:')
  for (const e of errors) console.error(`  · ${e}`)
  process.exit(1)
}
console.log('에러 없음')
