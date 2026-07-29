/**
 * 기본 앱 아이콘 PNG 를 만든다 — `public/app-icon-{192,512}.png`.
 *
 *   node scripts/make-app-icon.mjs
 *
 * **왜 PNG 를 커밋해 두나:** 슬롯이 앱 아이콘을 안 올렸을 때 쓰는 폴백인데,
 * iOS 는 `apple-touch-icon` 에 data: URL 도 SVG 도 안 받는다 — 실제 PNG 파일이어야 한다.
 * 손으로 만든 바이너리를 레포에 두면 나중에 아무도 고칠 수 없으므로, 이 스크립트가 원본이다.
 * 모양을 바꾸려면 아래 MARK 를 고치고 다시 돌린다.
 *
 * 파비콘(`public/favicon.svg`)과 같은 마크를 쓰되 **테두리를 두지 않는다** — 안드로이드가
 * 마스크(원·스쿼클)로 잘라내므로 배경은 가장자리까지 채우고 마크는 가운데 60% 안에 둔다.
 */
import { writeFileSync, existsSync } from 'node:fs'
import puppeteer from 'puppeteer-core'

const BG = '#0F1020'
const FG = '#D4AF37'
/** favicon.svg 와 같은 초승달+반짝임 (24 좌표계) */
const MARK = `
  <path d="M18 5h4"/>
  <path d="M20 3v4"/>
  <path d="M21.53 13.11A8.5 8.5 0 1 1 10.89 2.47a1 1 0 0 1 1.13 1.48 6 6 0 0 0 7.99 7.99 1 1 0 0 1 1.52 1.17z"/>
`

const exe = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
].find((p) => existsSync(p))
if (!exe) {
  console.error('크롬을 못 찾았습니다 — 경로를 이 스크립트에 추가해 주세요.')
  process.exit(1)
}

const page = (size) => {
  // 마크는 가운데 60% 안에 둔다 (마스크가 가장자리를 잘라도 안 잘리는 자리)
  const inset = size * 0.2
  const mark = size * 0.6
  return `<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;padding:0}svg{display:block}</style>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${BG}"/>
  <g transform="translate(${inset} ${inset}) scale(${mark / 24})"
     fill="none" stroke="${FG}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    ${MARK}
  </g>
</svg>`
}

const b = await puppeteer.launch({ executablePath: exe, headless: 'new', args: ['--no-sandbox'] })
for (const size of [192, 512]) {
  const p = await b.newPage()
  await p.setViewport({ width: size, height: size, deviceScaleFactor: 1 })
  await p.setContent(page(size), { waitUntil: 'load' })
  const buf = await p.screenshot({ type: 'png', clip: { x: 0, y: 0, width: size, height: size } })
  const out = `public/app-icon-${size}.png`
  writeFileSync(out, buf)
  console.log(`✓ ${out} (${size}×${size}, ${buf.length.toLocaleString()} bytes)`)
  await p.close()
}
await b.close()
