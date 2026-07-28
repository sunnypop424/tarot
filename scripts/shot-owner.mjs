/**
 * 슬롯 편집기(최고관리자) 스크린샷 — 로그인 뒤에 있다.
 *   node scripts/shot-owner.mjs <slug> <out.png>
 */
import puppeteer from 'puppeteer-core'
import { existsSync, readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)
const SLUG = process.argv[2] ?? 'pctest'
const OUT = process.argv[3] ?? 'owner.png'
const PW = env.SEED_PASSWORD ?? 'tarot1234'

const exe = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p))

const browser = await puppeteer.launch({ executablePath: exe, headless: 'new', args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 1400, height: 1000 })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const errs = []
page.on('pageerror', (e) => errs.push(String(e)))

await page.goto('http://localhost:5174/theme-editor', { waitUntil: 'networkidle0' })
await wait(500)
if (await page.$('#owner-email')) {
  await page.type('#owner-email', 'owner@example.com')
  await page.type('#owner-password', PW)
  await Promise.all([page.click('button[type="submit"]'), wait(2500)])
}
await page.goto(`http://localhost:5174/theme-editor/${SLUG}`, { waitUntil: 'networkidle0' })
await wait(2500)
await page.screenshot({ path: OUT })
console.log(OUT, errs.length ? errs : 'ok')
await browser.close()
