/**
 * 스태프 화면 스크린샷 — **로그인 뒤에 있어서** `shot.mjs` 로는 못 찍는다.
 *
 *   node scripts/shot-staff.mjs <slug> <out.png> [--draw <개수>]
 *
 * `--draw` 를 주면 판매 모드에서 실제로 뽑아 **당첨 결과**와 **전체 결과**까지 찍는다
 * (`-result.png`, `-summary.png`). 연습(rehearsal) 이 켜져 있어야 재고가 안 준다.
 */
import puppeteer from 'puppeteer-core'
import { existsSync, readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)

const SLUG = process.argv[2] ?? 'pctest'
const OUT = process.argv[3] ?? 'staff.png'
const drawAt = process.argv.indexOf('--draw')
const draw = drawAt >= 0 ? Number(process.argv[drawAt + 1] ?? 3) : 0
const PW = env.SEED_PASSWORD ?? 'tarot1234'

const exe = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p))

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: 'new',
  args: ['--no-sandbox', '--hide-scrollbars'],
})
const page = await browser.newPage()
await page.setViewport({ width: 390, height: 900, deviceScaleFactor: 2, isMobile: true })
const errs = []
page.on('pageerror', (e) => errs.push(String(e)))
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

await page.goto(`http://localhost:5174/${SLUG}/admin/login`, { waitUntil: 'networkidle0' })
await page.type('#admin-email', 'owner@example.com')
await page.type('#admin-password', PW)
await page.click('button[type="submit"]')
await wait(1800)

await page.goto(`http://localhost:5174/${SLUG}/staff`, { waitUntil: 'networkidle0' })
await wait(1200)
await page.screenshot({ path: OUT })

if (draw) {
  await page.$$eval(
    '[data-count-picker] button',
    (els, n) => {
      const hit = els.find((e) => e.textContent.trim().startsWith(String(n)))
      if (hit) hit.click()
    },
    draw
  )
  await wait(200)
  await page.click('[data-draw]')
  await wait(2500)
  await page.screenshot({ path: OUT.replace(/\.png$/, '-result.png') })
  await page.click('[data-summary-btn]')
  await wait(500)
  await page.screenshot({ path: OUT.replace(/\.png$/, '-summary.png') })
}

console.log(OUT, errs.length ? errs : 'ok')
await browser.close()
