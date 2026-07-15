/**
 * 운세 탭 검증 — 세그먼트(오늘/주간/월간)와 기간 잠금을 확인한다.
 * "기간마다 한 번만 뽑고, 그 기간 내내 같은 결과를 본다"가 이 기능의 약속이라 반드시 확인해야 한다.
 * 개발 서버가 떠 있어야 한다.
 *
 *   node scripts/verify-fortune.mjs <스크린샷 디렉터리>
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

const cardNames = () =>
  page.$$eval('[data-card-name]', (els) => els.map((e) => e.textContent.trim()))

/** 세그먼트 전환 */
async function segment(label) {
  await page.$$eval(
    '[role="tab"]',
    (tabs, l) => tabs.find((t) => t.textContent.trim() === l)?.click(),
    label
  )
  await wait(600)
}

/** 뽑기 화면에서 카드를 골라 결과까지 간다 */
async function drawAll(categoryId) {
  await page.goto(`${BASE}/demo/draw/${categoryId}`, { waitUntil: 'networkidle0' })
  await wait(400)
  const slots = await page.$$eval('[class*="slotEmpty"]', (e) => e.length)
  for (let i = 0; i < slots; i++) {
    const cards = await page.$$('button[aria-label$="카드 고르기"]:not([disabled])')
    await cards[cards.length - 1 - i].click()
    await wait(500)
  }
  await page.$$eval('button', (bs) => bs.find((b) => b.textContent.includes('결과 보기'))?.click())
  await wait(1000)
  return { slots, names: await cardNames() }
}

/** 화면 타이틀(h1)의 세로 위치 — 화면을 오갈 때 어긋나면 안 된다 */
const titleTop = () =>
  page.$eval('h1', (h) => Math.round(h.getBoundingClientRect().top)).catch(() => -1)

// 홈 = 기간 운세 세그먼트
await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle0' })
await wait(400)
const tabBar = await page.$$eval('.tabbar__item span', (e) => e.map((x) => x.textContent.trim()))
console.log(`탭바: ${tabBar.join(' / ')}`)
const tabs = await page.$$eval('[role="tab"]', (ts) => ts.map((t) => t.textContent.trim()))
console.log(`홈 기간 세그먼트: ${tabs.join(' / ')}`)
await page.screenshot({ path: join(outDir, 'home-periods.png') })

// 운세 탭 = 주제별 그리드만
await page.goto(`${BASE}/demo/fortune`, { waitUntil: 'networkidle0' })
await wait(300)
const tiles = await page.$$eval('[class*="tile"] > span:first-of-type', (e) =>
  e.map((x) => x.textContent.trim())
)
console.log(`운세 탭 주제별 그리드: ${tiles.join(', ')}`)
const fortuneTitle = await titleTop()

// 운세 → 뽑기로 넘어갈 때 타이틀이 어긋나면 안 된다
await page.goto(`${BASE}/demo/draw/love`, { waitUntil: 'networkidle0' })
await wait(400)
const drawTitle = await titleTop()
console.log(
  fortuneTitle === drawTitle
    ? `운세 → 뽑기 타이틀 위치 동일 (${drawTitle}px — 정상)`
    : `문제 — 타이틀 어긋남: 운세 ${fortuneTitle}px vs 뽑기 ${drawTitle}px`
)

await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle0' })
await wait(400)

// 세그먼트를 오갈 때 "카드 뽑기" 버튼이 움직이면 안 된다 (기간 라벨 자리 통일)
const ctaTop = () =>
  page.$$eval('button', (bs) => {
    const b = bs.find((x) => x.textContent.trim() === '카드 뽑기')
    return b ? Math.round(b.getBoundingClientRect().top) : -1
  })
const tops = []
for (const label of ['오늘', '주간', '월간']) {
  await segment(label)
  tops.push(await ctaTop())
}
console.log(
  new Set(tops).size === 1
    ? `세그먼트 전환 시 버튼 위치 고정 (${tops[0]}px — 정상)`
    : `문제 — 버튼이 움직임: ${tops.join(' / ')}`
)

// 오늘 / 주간 / 월간 각각 직접 뽑는다
for (const id of ['today', 'weekly', 'monthly']) {
  const { slots, names } = await drawAll(id)
  console.log(`${id}: 슬롯 ${slots}개 → 뽑은 카드 ${names.length}장 (${names.join(', ')})`)

  // 기간 카테고리는 다시 뽑을 수 없어야 한다
  const redraw = await page.$$eval('button', (bs) =>
    bs.some((b) => b.textContent.includes('다시 뽑기'))
  )
  console.log(`  다시 뽑기 버튼 없음: ${!redraw ? '정상 (기간 잠금)' : '문제 — 잠기지 않음'}`)
}

// 홈으로 돌아가면 뽑아둔 결과가 세그먼트마다 그대로 보여야 한다
await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle0' })
await wait(500)
for (const label of ['오늘', '주간', '월간']) {
  await segment(label)
  const names = await cardNames()
  console.log(`${label} 세그먼트 복원: ${names.length ? names.join(', ') : '문제 — 비어 있음'}`)
  await page.screenshot({ path: join(outDir, `home-${label}.png`) })
}

// 다시 열어도 같은 결과여야 한다 (기간 내 고정)
await segment('오늘')
const before = await cardNames()
await page.reload({ waitUntil: 'networkidle0' })
await wait(600)
const after = await cardNames()
console.log(
  JSON.stringify(before) === JSON.stringify(after)
    ? '새로고침 후에도 같은 결과 (정상)'
    : `문제 — 결과가 바뀜: ${before} → ${after}`
)

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
