/**
 * 가이드 HTML → A4 PDF.
 *
 *   node scripts/make-guide-pdf.mjs [입력.html] [출력.pdf]
 *
 * 레포에 이미 있는 `puppeteer-core` 로 뽑는다 (새 의존성 없음).
 * **file:// 로 연다** — 캡처를 상대 경로로 넣어 뒀고, 오프라인에서도 같은 그림이 나와야 한다.
 * 여백·용지는 HTML 의 `@page` 를 그대로 쓴다 (`preferCSSPageSize`) — 두 곳에 적으면 어긋난다.
 */
import puppeteer from 'puppeteer-core'
import { existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const IN = process.argv[2] ?? 'docs/guide/럭키드로우-사용안내.html'
const OUT = process.argv[3] ?? 'docs/guide/럭키드로우-사용안내.pdf'

const exe = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p))
if (!exe) {
  console.error('Chrome/Edge 를 찾지 못했습니다.')
  process.exit(1)
}
if (!existsSync(IN)) {
  console.error(`입력 파일이 없습니다: ${IN}`)
  process.exit(1)
}

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: 'new',
  args: ['--no-sandbox', '--allow-file-access-from-files'],
})
const page = await browser.newPage()
const errs = []
page.on('pageerror', (e) => errs.push(String(e)))
page.on('requestfailed', (r) => errs.push(`못 읽음: ${r.url()}`))

await page.goto(pathToFileURL(resolve(IN)).href, { waitUntil: 'networkidle0' })

// 그림이 하나라도 안 붙었으면 PDF 를 만들지 않는다 — 빈 칸이 있는 PDF 를 넘기면 안 된다
const imgs = await page.evaluate(() =>
  [...document.images].map((i) => ({ src: i.getAttribute('src'), ok: i.naturalWidth > 0 }))
)
const broken = imgs.filter((i) => !i.ok)
if (broken.length) {
  console.error('이미지를 못 읽었습니다:')
  for (const b of broken) console.error(`  · ${b.src}`)
  await browser.close()
  process.exit(1)
}

await page.pdf({
  path: OUT,
  printBackground: true,
  preferCSSPageSize: true,
  displayHeaderFooter: true,
  headerTemplate: '<span></span>',
  footerTemplate:
    '<div style="width:100%;font-size:8px;color:#8b8797;text-align:center;' +
    'font-family:Arial,sans-serif;padding-bottom:6mm">' +
    '<span class="pageNumber"></span> / <span class="totalPages"></span></div>',
})

const pages = await page.evaluate(() => document.querySelectorAll('.page').length)
await browser.close()

const kb = Math.round(statSync(OUT).size / 1024)
console.log(`${OUT} — 이미지 ${imgs.length}장 · 절 ${pages}개 · ${kb}KB`)
if (errs.length) {
  console.error('경고:')
  for (const e of errs) console.error(`  · ${e}`)
}
