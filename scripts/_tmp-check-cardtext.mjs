// 카드 의미 번역 스모크 — /demo 도감에서 영어로 바꾸고 카드 상세가 영어로 나오는지
import puppeteer from 'puppeteer-core'
import { existsSync } from 'node:fs'

const exe = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p))

const browser = await puppeteer.launch({ executablePath: exe, headless: 'new', args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 390, height: 844 })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

// 영어로 저장해 두고 진입
await page.goto('http://localhost:5174/demo-tarot', { waitUntil: 'networkidle0' })
await page.evaluate(() => localStorage.setItem('tarot-pocket:lang', 'en'))

await page.goto('http://localhost:5174/demo-tarot/cards/major-0', { waitUntil: 'networkidle0' })
await new Promise((r) => setTimeout(r, 1200))
const body = await page.evaluate(() => document.body.innerText)
console.log('--- 화면 앞부분 ---')
console.log(body.slice(0, 300))
console.log('-------------------')

const checks = [
  ['이름이 영어다', body.includes('The Fool')],
  ['키워드가 영어다', body.includes('New beginnings')],
  ['핵심(core)이 영어다', body.includes('pure energy of a beginning')],
  ['종합(general)이 영어다', body.includes('brand-new journey')],
  ['역방향 조언이 영어다', body.includes('minimum safety net')],
  ['상징은 한국어 폴백', body.includes('절벽')],
  ['화면 오류 없음', errors.length === 0],
]
let fail = 0
for (const [name, ok] of checks) {
  console.log(`${ok ? '✓' : '✗'} ${name}`)
  if (!ok) fail++
}

// 한국어로 되돌리면 원문 그대로인지
await page.evaluate(() => localStorage.setItem('tarot-pocket:lang', 'ko'))
await page.reload({ waitUntil: 'networkidle0' })
await new Promise((r) => setTimeout(r, 800))
const koBody = await page.evaluate(() => document.body.innerText)
const koOk = koBody.includes('바보') && koBody.includes('새로운 시작')
console.log(`${koOk ? '✓' : '✗'} 한국어로 되돌리면 원문 그대로`)
if (!koOk) fail++

await browser.close()
console.log(fail === 0 ? '\n전부 통과' : `\n${fail}개 실패`)
process.exit(fail === 0 ? 0 : 1)
