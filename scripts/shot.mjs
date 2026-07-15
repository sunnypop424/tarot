/**
 * 모바일 뷰포트 스크린샷 — 개발 서버가 떠 있어야 한다.
 *
 *   node scripts/shot.mjs <경로> <출력파일>
 *   node scripts/shot.mjs / home.png
 *
 * Chrome 헤드리스의 --window-size 는 윈도우 최소 창 폭(~500px)에 걸려
 * 진짜 모바일 폭을 못 만든다. CDP 로 뷰포트를 직접 지정한다.
 */

import puppeteer from 'puppeteer-core'
import { existsSync } from 'node:fs'

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
]

const path = process.argv[2] ?? '/'
const out = process.argv[3] ?? 'shot.png'
const fullPage = process.argv.includes('--full')

const executablePath = CHROME_CANDIDATES.find((p) => existsSync(p))
if (!executablePath) {
  console.error('Chrome/Edge 를 찾지 못했습니다.')
  process.exit(1)
}

const browser = await puppeteer.launch({
  executablePath,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
})

const page = await browser.newPage()
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true })

const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

await page.goto(`http://localhost:5174${path}`, { waitUntil: 'networkidle0' })
await page.screenshot({ path: out, fullPage })

// 가로 오버플로 검사 — 모바일에서 좌우 스크롤은 버그다
const overflow = await page.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth
)

await browser.close()

console.log(`${out} 저장 — 뷰포트 390x844`)
if (overflow > 0) console.error(`가로 오버플로 ${overflow}px`)
if (errors.length) {
  console.error('콘솔 에러:')
  for (const e of errors) console.error(`  · ${e}`)
  process.exit(1)
}
