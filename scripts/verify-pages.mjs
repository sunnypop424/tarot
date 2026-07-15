/**
 * 도감 · 질문 타로 검증 — 실제로 눌러보고 확인한다.
 * 개발 서버가 떠 있어야 한다.
 *
 *   node scripts/verify-pages.mjs <스크린샷 디렉터리>
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
const page = await browser.newPage()
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true })

const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

// ── 카드 도감 ──────────────────────────────────────
await page.goto(`${BASE}/demo/cards`, { waitUntil: 'networkidle0' })
await wait(400)

const suits = await page.$$eval('[role="tab"]', (ts) => ts.map((t) => t.textContent.trim()))
console.log(`도감 수트 필터: ${suits.join(' / ')}`)

/** 현재 필터의 카드 수 */
const gridCount = () => page.$$eval('[data-card-item]', (e) => e.length)

const expected = { 메이저: 22, 완드: 14, 컵: 14, 소드: 14, 펜타클: 14 }
let total = 0
for (const [label, want] of Object.entries(expected)) {
  await page.$$eval('[role="tab"]', (ts, l) => ts.find((t) => t.textContent.trim() === l)?.click(), label)
  await wait(300)
  const got = await gridCount()
  total += got
  console.log(`  ${label}: ${got}장 ${got === want ? '' : `— 문제 (${want}장이어야 함)`}`)
}
console.log(`도감 합계: ${total}장 ${total === 78 ? '(정상)' : '— 문제'}`)
await page.screenshot({ path: join(outDir, 'cards-list.png') })

// 상세 진입
await page.$$eval('[role="tab"]', (ts) => ts.find((t) => t.textContent.trim() === '메이저')?.click())
await wait(300)
await page.$eval('[data-card-item]', (b) => b.click())
await wait(500)
const detailName = await page.$eval('h1', (h) => h.textContent.trim())
const sections = await page.$$eval('h2', (hs) => hs.map((h) => h.textContent.trim()))
console.log(`도감 상세: ${detailName} — 섹션 ${sections.join(', ')}`)
console.log(
  sections.includes('상징') && sections.includes('정방향') && sections.includes('역방향')
    ? '  상징·정방향·역방향 모두 있음 (정상)'
    : '  문제 — 섹션 누락'
)
await page.screenshot({ path: join(outDir, 'cards-detail.png'), fullPage: true })

// ── 질문 타로 ──────────────────────────────────────
await page.goto(`${BASE}/demo/fortune`, { waitUntil: 'networkidle0' })
await wait(400)
const questions = await page.$$eval('[class*="list-row"] span', (e) => e.map((x) => x.textContent.trim()))
console.log(`운세 탭 질문 목록: ${questions.length}개`)
await page.screenshot({ path: join(outDir, 'fortune-merged.png'), fullPage: true })

await page.$eval('[class*="list-row"]', (b) => b.click())
await wait(500)
const lead = await page.$eval('.screen__lead', (p) => p.textContent.trim())
console.log(`질문 타로 진입 — 질문: "${lead}"`)

const slots = await page.$$eval('[class*="slotEmpty"]', (e) => e.length)
const deckCards = await page.$$eval('button[aria-label$="카드 고르기"]', (e) => e.length)
console.log(`  슬롯 ${slots}개 / 펼친 카드 ${deckCards}장 (questions.json: deck=major → 22장 기대)`)

for (let i = 0; i < slots; i++) {
  const cards = await page.$$('button[aria-label$="카드 고르기"]:not([disabled])')
  await cards[cards.length - 1 - i].click()
  await wait(500)
}
await page.$$eval('button', (bs) => bs.find((b) => b.textContent.includes('결과 보기'))?.click())
await wait(1000)

const answered = await page.$$eval('[data-card-name]', (e) => e.map((x) => x.textContent.trim()))
console.log(`질문 결과: ${answered.join(', ')}`)
// 답변 본문이 실제로 채워졌는지 (관리자 미입력 → 카드 의미 폴백)
const answer = await page.$$eval('.t-body', (e) => e.map((x) => x.textContent.trim()).join(' '))
const lead2 = await page.$eval('.screen__lead', (p) => p.textContent.trim())
console.log(`  결과 화면 리드(질문): "${lead2}"`)
console.log(
  answer.length > 20
    ? `  답변 노출됨 (폴백 동작, ${answer.length}자)`
    : `  문제 — 답변이 비어 있음`
)
await page.screenshot({ path: join(outDir, 'question-result.png'), fullPage: true })

const overflow = await page.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth
)
if (overflow > 0) console.error(`가로 오버플로 ${overflow}px`)

await browser.close()

if (errors.length) {
  console.error('콘솔 에러:')
  for (const e of errors) console.error(`  · ${e}`)
  process.exit(1)
}
console.log('에러 없음')
