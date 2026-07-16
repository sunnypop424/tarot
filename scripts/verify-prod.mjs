/**
 * 배포 검증 — **진짜 주소를 때린다.** 로컬이 통과해도 배포가 깨지는 자리가 따로 있다:
 * SPA 리라이트, 자산 절대경로(base), Edge Function CORS, 배포 빌드의 환경변수.
 *
 *   node scripts/verify-prod.mjs https://tarot-btjp.vercel.app <스크린샷 디렉터리>
 *
 * 리딩을 실제로 뽑으므로 **돈이 든다** (약 5원).
 */
import puppeteer from 'puppeteer-core'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const chrome = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p))

const SITE = (process.argv[2] ?? '').replace(/\/$/, '')
if (!SITE.startsWith('http')) {
  console.error('배포 주소를 주세요:  node scripts/verify-prod.mjs https://…  <스크린샷 디렉터리>')
  process.exit(1)
}
const outDir = process.argv[3] ?? '.'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const checks = []
const check = (name, ok, detail = '') => {
  checks.push([name, ok])
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: 'new',
  args: ['--no-sandbox', '--hide-scrollbars'],
})
const page = await browser.newPage()
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true })

const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

// ── 슬러그로 직접 들어온다 (QR 이 곧 이 주소다) ──
await page.goto(`${SITE}/demo`, { waitUntil: 'networkidle0' })
await wait(2000)
const home = await page.evaluate(() => ({
  title: document.querySelector('h1')?.textContent ?? '',
  canvas: getComputedStyle(document.documentElement).getPropertyValue('--color-canvas').trim(),
  cards: document.querySelectorAll('.tarot-card').length,
}))
check('슬러그로 직접 들어가면 슬롯이 뜬다', home.cards > 0, `제목="${home.title}" canvas=${home.canvas}`)
check('DB 에서 읽은 테마가 입혀짐', home.canvas === '#0F1020', home.canvas)
await page.screenshot({ path: join(outDir, 'prod-home.png') })

// ── 없는 슬롯 ──
await page.goto(`${SITE}/no-such-slot`, { waitUntil: 'networkidle0' })
await wait(1500)
const missing = await page.evaluate(() => document.body.textContent ?? '')
check('없는 슬러그는 404 화면', /찾을 수 없|없어요|not found/i.test(missing), missing.slice(0, 40).trim())

// ── 배포 루트엔 아무것도 없다 ──
await page.goto(SITE, { waitUntil: 'networkidle0' })
await wait(1200)
const root = await page.evaluate(() => ({
  text: document.body.textContent ?? '',
  hasSlotList: /demo|sample-pink/.test(document.body.textContent ?? ''),
}))
check('배포 루트에 슬롯 목록이 없다', !root.hasSlotList, root.text.slice(0, 40).trim())

// ── 3장 뽑고 AI 리딩까지 (sample-pink 애정운) ──
await page.goto(`${SITE}/sample-pink/draw/love`, { waitUntil: 'networkidle0' })
await wait(2000)
const slots = await page.$$eval('[class*="slotEmpty"]', (e) => e.length)
check('애정운 3장 슬롯', slots === 3, `${slots}개`)

for (let i = 0; i < slots; i++) {
  const cards = await page.$$('button[aria-label$="카드 고르기"]:not([disabled])')
  if (!cards.length) break
  await cards[cards.length - 1 - i].click()
  await wait(500)
}
await page.$$eval('button', (bs) => bs.find((b) => b.textContent.includes('결과 보기'))?.click())

// 로더 → 카드 + 종합
await page.waitForSelector('[data-reading-loader]', { timeout: 15000 }).catch(() => {})
await page.screenshot({ path: join(outDir, 'prod-loader.png') })

let synth = null
try {
  await page.waitForSelector('[data-synthesis]', { timeout: 60000 })
  synth = await page.$eval('[data-synthesis]', (e) => e.textContent ?? '')
} catch {
  /* 아래에서 잡는다 */
}
const result = await page.evaluate(() => ({
  cards: document.querySelectorAll('[data-card-name]').length,
  loader: !!document.querySelector('[data-reading-loader]'),
}))
check('배포에서 카드 3장이 나온다', result.cards === 3, `${result.cards}장`)
// 안 나오면 십중팔구 CORS 다 — AI_ALLOWED_ORIGINS 에 이 도메인이 있어야 한다
check('배포에서 AI 종합이 나온다', Boolean(synth && synth.length > 100), synth ? `${synth.length}자` : '없음 — AI_ALLOWED_ORIGINS 에 이 도메인이 있나?')
check('로더에 갇히지 않는다', !result.loader)
await page.evaluate(() => document.querySelector('.app__scroll')?.scrollTo(0, 99999))
await wait(500)
await page.screenshot({ path: join(outDir, 'prod-synthesis.png') })
if (synth) console.log(`\n  ${synth.slice(0, 120)}…\n`)

// ── 최고관리자 편집기가 배포됐나 ──
await page.goto(`${SITE}/theme-editor`, { waitUntil: 'networkidle0' })
await wait(2000)
check('편집기는 로그인 뒤에 있다', page.url().endsWith('/theme-editor/login'), page.url())

await browser.close()
const real = errors.filter((e) => !/favicon|404/i.test(e))
if (real.length) {
  console.error('\n콘솔 에러:')
  for (const e of real.slice(0, 5)) console.error('  ·', e.slice(0, 140))
}
const failed = checks.filter(([, ok]) => !ok).length
console.log(`\n${checks.length - failed} / ${checks.length} 통과`)
process.exit(failed || real.length ? 1 : 0)
