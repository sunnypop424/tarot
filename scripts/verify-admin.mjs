/**
 * 슬롯 · 관리자 · 테마 편집기 검증 — 실제로 눌러보고 확인한다.
 * 개발 서버가 떠 있어야 한다.
 *
 *   node scripts/verify-admin.mjs <스크린샷 디렉터리>
 */

import puppeteer from 'puppeteer-core'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

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

await page.type('#admin-email', 'organizer@demo.kr')
await page.type('#admin-password', 'pw')
await page.click('button[type="submit"]')
await wait(800)
console.log(page.url().includes('/admin/questions') ? '로그인 후 질문 목록 진입 (정상)' : '문제')
await page.screenshot({ path: join(outDir, 'admin-questions-desktop.png') })

const rowCount = () => page.$$eval('.row-item', (e) => e.length)
const before = await rowCount()
await page.$$eval('button', (bs) => bs.find((b) => b.textContent.includes('질문 추가'))?.click())
await wait(800)
console.log(page.url().match(/questions\/q-/) ? '질문 추가 → 편집 화면 진입 (정상)' : '문제')

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

// ── 관리자 슬롯 격리 ───────────────────────────────
await page.goto(`${BASE}/sample-pink/admin/questions`, { waitUntil: 'networkidle0' })
await wait(600)
console.log(
  page.url().includes('/sample-pink/admin/login')
    ? '데모 계정으로 핑크 관리 진입 차단됨 (정상)'
    : '문제 — 다른 슬롯 관리 화면에 들어가짐'
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

// ── 테마 편집기 (개발 모드) ────────────────────────
await page.goto(`${BASE}/theme-editor`, { waitUntil: 'networkidle0' })
await wait(800)
const editorTitle = await page.$eval('h1', (h) => h.textContent.trim())
console.log(`테마 편집기: "${editorTitle}"`)
const contrastRows = await page.$$eval('[class*="contrastRow"]', (e) => e.length)
console.log(`대비 검사 항목: ${contrastRows}개 ${contrastRows > 0 ? '(정상)' : '(문제)'}`)
await page.screenshot({ path: join(outDir, 'theme-editor.png') })

await browser.close()

if (errors.length) {
  console.error('콘솔 에러:')
  for (const e of errors) console.error(`  · ${e}`)
  process.exit(1)
}
console.log('에러 없음')
