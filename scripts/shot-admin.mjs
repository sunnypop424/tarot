/**
 * 주최자 관리 화면 스크린샷 — 로그인 뒤에 있다.
 *   node scripts/shot-admin.mjs <slug> <out.png> [경로조각]
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
const OUT = process.argv[3] ?? 'admin.png'
const PATH_ = process.argv[4] ?? ''
const PW = env.SEED_PASSWORD ?? 'tarot1234'

const exe = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p))

const browser = await puppeteer.launch({ executablePath: exe, headless: 'new', args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 900 })
const errs = []
page.on('pageerror', (e) => errs.push(String(e)))
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

await page.goto(`http://localhost:5174/${SLUG}/admin/login`, { waitUntil: 'networkidle0' })
if (await page.$('#admin-email')) {
  await page.type('#admin-email', 'owner@example.com')
  await page.type('#admin-password', PW)
  await page.click('button[type="submit"]')
  await wait(2200)
}
await page.goto(`http://localhost:5174/${SLUG}/admin${PATH_ ? `/${PATH_}` : ''}`, { waitUntil: 'networkidle0' })
await wait(1800)
await page.screenshot({ path: OUT, fullPage: true })
console.log(OUT, errs.length ? errs : 'ok')
await browser.close()
