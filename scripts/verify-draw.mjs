/**
 * 뽑기 플로우 실검증 — 실제로 카드를 눌러보고 슬롯·X·셔플·결과를 확인한다.
 * 개발 서버가 떠 있어야 한다.
 *
 *   node scripts/verify-draw.mjs <categoryId> <스크린샷 디렉터리>
 */

import puppeteer from 'puppeteer-core'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const chrome = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p))

const category = process.argv[2] ?? 'love'
const outDir = process.argv[3] ?? '.'
const vw = Number(process.argv[4] ?? 390)
const vh = Number(process.argv[5] ?? 844)
const shot = (name) => join(outDir, `${category}-${vh}-${name}.png`)

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
})
const page = await browser.newPage()
await page.setViewport({ width: vw, height: vh, deviceScaleFactor: 2, isMobile: true })
console.log(`── 뷰포트 ${vw}x${vh} ──`)

const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const count = (sel) => page.$$eval(sel, (els) => els.length).catch(() => 0)

await page.goto(`http://localhost:5174/demo/draw/${category}`, { waitUntil: 'networkidle0' })
await wait(300)

const deckCards = await page.$$('button[aria-label$="카드 고르기"]')
console.log(`덱 카드: ${deckCards.length}장`)

const slots = await count('[class*="slotEmpty"]')
console.log(`빈 슬롯: ${slots}개`)
console.log(`덱 줄 수: ${await count('[data-deck-row]')}줄`)
await page.screenshot({ path: shot('1-initial') })

// 덱 + 슬롯 + CTA 가 한 화면에 들어오는가 — 스크롤이 생기면 목표 미달
const fit = await page.evaluate(() => {
  const scroller = document.querySelector('.app__scroll')
  return { scrollH: scroller.scrollHeight, clientH: scroller.clientHeight }
})
const over = fit.scrollH - fit.clientH
console.log(
  over <= 0
    ? `한 화면에 들어옴 (여유 ${-over}px)`
    : `한 화면 초과 — ${over}px 넘침 (스크롤 발생)`
)

/** "결과 보기" 버튼의 세로 위치 — 카드를 고르는 동안 움직이면 덜컹거린다는 뜻 */
const ctaTop = () =>
  page.$$eval('button', (bs) => {
    const cta = bs.find((b) => b.textContent.includes('결과 보기'))
    return cta ? Math.round(cta.getBoundingClientRect().top) : -1
  })

/**
 * 아직 고를 수 있는 카드를 뒤에서부터 nth 번째로 집는다.
 * 카드가 겹쳐 있어 앞쪽 카드의 중심은 뒤 카드에 덮인다 — 맨 뒤 카드가 맨 위에 있어 확실히 눌린다.
 */
async function pick(nth = 0) {
  const cards = await page.$$('button[aria-label$="카드 고르기"]:not([disabled])')
  const target = cards[cards.length - 1 - nth]
  if (!target) return false
  await target.click()
  return true
}

const ctaBefore = await ctaTop()

// 슬롯 수만큼 카드를 고른다
for (let i = 0; i < slots; i++) {
  if (!(await pick(i))) break
  await wait(120)
  if (i === 0) await page.screenshot({ path: shot('2-flying') })
  await wait(500)
}

const removeBtns = await count('button[aria-label$="다시 고르기"]')
console.log(`슬롯에 얹힌 카드(X 버튼): ${removeBtns}개`)
await page.screenshot({ path: shot('3-filled') })

// 카드가 얹혀도 아래 버튼이 밀리지 않아야 한다 (라벨 자리를 미리 잡아뒀는지)
const ctaAfter = await ctaTop()
console.log(
  ctaAfter === ctaBefore
    ? '카드 선택 중 CTA 위치 고정 (덜컹임 없음)'
    : `CTA 가 ${Math.abs(ctaAfter - ctaBefore)}px 움직임 — 덜컹거림`
)

// X 로 한 장 물리기
if (removeBtns > 0) {
  const x = await page.$('button[aria-label$="다시 고르기"]')
  await x.click()
  await wait(300)
  const after = await count('button[aria-label$="다시 고르기"]')
  console.log(`X 클릭 후 남은 카드: ${after}개 ${after === removeBtns - 1 ? '(정상)' : '(문제)'}`)
  await pick(1) // 다시 채워넣기
  await wait(600)
}

// 셔플
const shuffleBtn = await page.$('button[aria-label="카드 다시 섞기"]')
await shuffleBtn.click()
await wait(500)
await page.screenshot({ path: shot('4-shuffling') })
await wait(1000)
const afterShuffleSlots = await count('[class*="slotEmpty"]')
console.log(`셔플 후 빈 슬롯: ${afterShuffleSlots}개 ${afterShuffleSlots === slots ? '(선택 초기화됨 — 정상)' : '(문제)'}`)

// 다시 고르고 결과 보기
for (let i = 0; i < slots; i++) {
  if (!(await pick(i))) break
  await wait(500)
}

const resultBtn = await page.$$eval('button', (bs) =>
  bs.some((b) => b.textContent.includes('결과 보기') && !b.disabled)
)
console.log(`결과 보기 활성: ${resultBtn}`)

if (resultBtn) {
  await page.$$eval('button', (bs) => bs.find((b) => b.textContent.includes('결과 보기'))?.click())
  await wait(1200)
  await page.screenshot({ path: shot('5-result'), fullPage: true })
  const heading = await page.$eval('h1', (h) => h.textContent)
  console.log(`결과 화면 진입: ${heading}`)
}

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
