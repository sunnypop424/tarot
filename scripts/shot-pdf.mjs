/**
 * 만든 PDF 를 **한 쪽씩 그림으로 뽑는다** — 눈으로 확인하려고.
 *
 *   node scripts/shot-pdf.mjs [입력.pdf] [출력폴더] [쪽수]
 *
 * `make-guide-pdf.mjs` 가 "이미지 몇 장" 까지는 봐 주지만, **쪽이 어디서 잘렸는지·제목만
 * 홀로 남았는지·한글이 깨졌는지는 열어 봐야 안다** (빌드 통과 ≠ 검증).
 * 브라우저 PDF 뷰어로 연다 — 이 레포엔 PDF 를 그림으로 바꾸는 도구가 따로 없다.
 *
 * 해시(`#page=N`)만 바꾸면 뷰어가 안 움직여서 **매번 about:blank 를 거쳐 새로 연다.**
 */
import puppeteer from 'puppeteer-core'
import { existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const PDF = process.argv[2] ?? 'docs/guide/럭키드로우-사용안내.pdf'
const OUT = process.argv[3] ?? 'c:/tmp/pdfcheck'
const N = Number(process.argv[4] ?? 25)
mkdirSync(OUT, { recursive: true })

const exe = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p))

const url = pathToFileURL(resolve(PDF)).href
const browser = await puppeteer.launch({
  executablePath: exe,
  headless: 'new',
  args: ['--no-sandbox', '--hide-scrollbars'],
})
const page = await browser.newPage()
// 사이드바를 접고 한 쪽이 화면에 꽉 차게 — A4 비율(1:1.414)
await page.setViewport({ width: 900, height: 1272, deviceScaleFactor: 1.4 })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

await page.goto(`${url}#toolbar=0&view=FitH&page=1`, { waitUntil: 'networkidle0' })
await wait(4000)

for (let i = 1; i <= N; i++) {
  // 같은 문서에 해시만 바꾸면 뷰어가 안 움직인다 — about:blank 를 거쳐 매번 새로 연다
  await page.goto('about:blank')
  await page.goto(`${url}#toolbar=0&view=FitH&page=${i}`, { waitUntil: 'networkidle0' })
  await wait(2200)
  await page.screenshot({ path: `${OUT}/p${String(i).padStart(2, '0')}.png` })
}
console.log(`${N}쪽 저장 → ${OUT}`)
await browser.close()
