/**
 * 편집기 미리보기의 **화면 고르기** 확인 — 슬롯 하나를 열어 화면 pill 을 차례로 눌러 찍는다.
 *
 *   node scripts/shot-preview.mjs <slug> <출력디렉터리>
 *
 * 미리보기 iframe 만 잘라 찍는다 — 편집기 전체를 찍으면 화면이 작아 색을 못 본다.
 */
import puppeteer from 'puppeteer-core'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)
const SLUG = process.argv[2] ?? 'pctest'
const DIR = process.argv[3] ?? '.'
const PW = env.SEED_PASSWORD ?? 'tarot1234'

const exe = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p))

await mkdir(DIR, { recursive: true })
const browser = await puppeteer.launch({ executablePath: exe, headless: 'new', args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 1400, height: 1100 })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

await page.goto('http://localhost:5174/theme-editor', { waitUntil: 'networkidle0' })
await wait(500)
if (await page.$('#owner-email')) {
  await page.type('#owner-email', 'owner@example.com')
  await page.type('#owner-password', PW)
  await Promise.all([page.click('button[type="submit"]'), wait(2500)])
}
await page.goto(`http://localhost:5174/theme-editor/${SLUG}`, { waitUntil: 'networkidle0' })
await wait(2500)

const screens = await page.$$eval('[data-preview-screen]', (els) =>
  els.map((e) => e.getAttribute('data-preview-screen'))
)
console.log('화면:', screens.join(', ') || '(없음)')

for (const state of screens) {
  await page.click(`[data-preview-screen="${state}"]`)
  await wait(1800)
  const box = await page.$('iframe[title="미리보기"]')
  await box.screenshot({ path: join(DIR, `${SLUG}-${state}.png`) })
}
await browser.close()
console.log('찍음:', screens.length)
