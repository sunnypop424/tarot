/**
 * 테마 편집기 검증 — 라이트 모드 · 업로드 · 밝은 배경 대응.
 * 개발 서버가 떠 있어야 한다.
 *
 *   node scripts/verify-owner.mjs <스크린샷 디렉터리>
 */

import puppeteer from 'puppeteer-core'
import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'

const chrome = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p))

const outDir = process.argv[2] ?? '.'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const BASE = 'http://localhost:5174'

// 테스트가 남긴 파일 정리
await rm('public/slots/verify-test', { recursive: true, force: true })

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 })

const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

// ── 라이트 모드 ────────────────────────────────────
await page.goto(`${BASE}/theme-editor`, { waitUntil: 'networkidle0' })
await wait(800)

const bg = await page.$eval('.owner', (el) => getComputedStyle(el).backgroundColor)
const fg = await page.$eval('.owner', (el) => getComputedStyle(el).color)
console.log(`테마 편집기 배경: ${bg} / 글자: ${fg}`)
const rgb = bg.match(/\d+/g).map(Number)
const isLight = (rgb[0] + rgb[1] + rgb[2]) / 3 > 128
console.log(isLight ? '라이트 모드 (정상)' : '문제 — 아직 다크')
await page.screenshot({ path: join(outDir, 'theme-editor-light.png') })

// ── 업로드 (서버가 실제 파일로 저장하는가) ─────────
const upload = await page.evaluate(async () => {
  // 1x1 투명 PNG
  const dataUrl =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
  const res = await fetch('/__slot-upload', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ slug: 'verify-test', name: 'cards/major-0.png', dataUrl }),
  })
  return { ok: res.ok, body: await res.json() }
})
console.log(`업로드 응답: ${JSON.stringify(upload.body)}`)
console.log(
  existsSync('public/slots/verify-test/cards/major-0.png')
    ? '파일이 실제로 저장됨 (정상 — 커밋하면 배포됨)'
    : '문제 — 파일이 안 만들어짐'
)

// 저장된 파일이 서빙되는가
const served = await page.evaluate(async () => (await fetch('/slots/verify-test/cards/major-0.png')).status)
console.log(`저장된 이미지 서빙: ${served} ${served === 200 ? '(정상)' : '(문제)'}`)

// 목록
const listed = await page.evaluate(
  async () => (await (await fetch('/__slot-assets?slug=verify-test')).json()).files
)
console.log(`목록 조회: ${JSON.stringify(listed)}`)

// ── 경로 조작 방어 ─────────────────────────────────
const traversal = await page.evaluate(async () => {
  const res = await fetch('/__slot-upload', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      slug: 'verify-test',
      name: '../../../evil.png',
      dataUrl: 'data:image/png;base64,AAAA',
    }),
  })
  return res.status
})
console.log(`경로 조작 시도: ${traversal} ${traversal === 400 ? '(차단됨 — 정상)' : '(문제)'}`)

// ── 밝은 배경 테마에서 그림자가 옅어지는가 ─────────
const shadowFor = async (canvas) => {
  await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle0' })
  await wait(300)
  return page.evaluate((c) => {
    const draft = JSON.parse(localStorage.getItem('tarot-pocket:slots-draft') ?? 'null')
    return { hasDraft: Boolean(draft), canvas: c }
  }, canvas)
}
await shadowFor('#0F1020')

// 밝은 캔버스를 주입해 그림자 세기를 비교한다
const shadows = await page.evaluate(async () => {
  const { applyTheme } = await import('/src/lib/theme.ts')
  const base = {
    colors: {
      canvas: '#0F1020', surface: '#1A1B2E', surfaceRaised: '#242537', wash: '#241F45',
      primary: '#816BFF', primaryHover: '#6E58FF', primarySoft: '#B7AAFF',
      accent: '#D4AF37', accentSoft: '#E8CF7A',
      fg1: '#F2F0FA', fg2: '#C6C3D8', fg3: '#9A97B0',
      border: '#2E2F45', borderHover: '#3A3B57', onPrimary: '#FFFFFF',
      cardBackFrom: '#1E1F3E', cardBackTo: '#101127',
    },
    shape: { radiusSm: 4, radiusMd: 8, radiusLg: 16 },
    assets: {
      logo: null, logoAlt: '', logoHeight: 28,
      backgroundPattern: null, backgroundPatternOpacity: 0.12,
      backgroundPatternSize: 'cover', backgroundPatternRepeat: 'no-repeat',
      cardFrontBase: null, cardFrontExt: 'webp', cardBack: null,
    },
  }
  const read = () => ({
    shadow: getComputedStyle(document.documentElement).getPropertyValue('--shadow-card').trim(),
    scheme: getComputedStyle(document.documentElement).getPropertyValue('color-scheme').trim(),
  })
  applyTheme(base)
  const dark = read()
  applyTheme({ ...base, colors: { ...base.colors, canvas: '#FFFFFF' } })
  const light = read()
  return { dark, light }
})
console.log(`다크 캔버스: ${shadows.dark.shadow} (${shadows.dark.scheme})`)
console.log(`밝은 캔버스: ${shadows.light.shadow} (${shadows.light.scheme})`)
console.log(
  shadows.dark.shadow !== shadows.light.shadow && shadows.light.scheme === 'light'
    ? '밝은 배경에서 그림자 옅어짐 + color-scheme 전환 (정상)'
    : '문제 — 밝은 배경 대응 안 됨'
)

// ── 색을 바꾸면 미리보기가 따라오는가 ──────────────
await page.goto(`${BASE}/theme-editor`, { waitUntil: 'networkidle0' })
await wait(1200)

const previewCta = async () => {
  const frame = page.frames().find((f) => f.url().includes('/demo'))
  if (!frame) return null
  return frame.$$eval('button', (bs) => {
    const b = bs.find((x) => x.textContent.trim() === '카드 뽑기')
    return b ? getComputedStyle(b).backgroundColor : null
  })
}

const beforeColor = await previewCta()

// 주요 CTA 색 hex 입력을 바꾼다
await page.$eval('#c-primary', (el) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  setter.call(el, '#FF0000')
  el.dispatchEvent(new Event('input', { bubbles: true }))
})
await wait(1200)

const afterColor = await previewCta()
console.log(`미리보기 CTA: ${beforeColor} → ${afterColor}`)
console.log(
  afterColor === 'rgb(255, 0, 0)'
    ? '색 변경이 미리보기에 즉시 반영됨 (정상)'
    : '문제 — 미리보기가 안 따라옴'
)
await page.screenshot({ path: join(outDir, 'theme-editor-preview.png') })

await browser.close()
await rm('public/slots/verify-test', { recursive: true, force: true })

// 경로 조작 차단은 일부러 시킨 테스트라 400 은 정상 — 걸러낸다
const real = errors.filter((e) => !e.includes('400'))
if (real.length) {
  console.error('콘솔 에러:')
  for (const e of real) console.error(`  · ${e}`)
  process.exit(1)
}
console.log('에러 없음')
