/**
 * 라이트/다크 테마에서 브랜드 파생 토큰(primary-soft·disabled)이 읽히는지 측정.
 * applyTheme() 이 캔버스 휘도로 파생하므로, :root 에서 실제 주입된 값을 읽어 대비를 잰다.
 * 개발 서버가 떠 있어야 한다.  node scripts/verify-theme.mjs <스크린샷 디렉터리>
 */
import puppeteer from 'puppeteer-core'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const chrome = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p))
const outDir = process.argv[2] ?? '.'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const BASE = 'http://localhost:5174'

/**
 * wash/primary 만 다르게 주는 테마 (나머지는 데모 기본).
 *
 * 예전엔 이걸 슬롯으로 감싸 localStorage 초안에 심어놓고 화면을 열었는데,
 * **슬롯이 DB 로 가면서 그 초안을 아무도 안 읽게 됐다** — 테마가 안 먹은 채로 측정하며
 * "라이트 disabled 밝음" 이 조용히 실패했다. 여기서 볼 건 저장소가 아니라 `applyTheme()` 의
 * 휘도 파생이므로, 저장소를 건너뛰고 테마를 직접 주입한다.
 */
const theme = (over) => ({
  colors: {
      canvas: '#0F1020', surface: '#1A1B2E', surfaceRaised: '#242537', wash: '#241F45',
      primary: '#816BFF', primaryHover: '#6E58FF', primarySoft: '#B7AAFF',
      accent: '#D4AF37', accentSoft: '#E8CF7A', fg1: '#F2F0FA', fg2: '#C6C3D8', fg3: '#9A97B0',
      border: '#2E2F45', borderHover: '#3A3B57', onPrimary: '#FFFFFF',
    cardBackFrom: '#1E1F3E', cardBackTo: '#101127',
    ...over,
  },
  shape: { radiusSm: 4, radiusMd: 8, radiusLg: 16 },
  assets: {
    logo: null, logoAlt: '데모', logoHeight: 28, backgroundPattern: null,
     backgroundPatternSize: 'cover', backgroundPatternRepeat: 'no-repeat',
    cardFrontBase: null, cardFrontExt: 'webp', cardBack: null,
  },
})

const LIGHT = { canvas: '#FAF8FF', surface: '#FFFFFF', surfaceRaised: '#FFFFFF', wash: '#F0EDFF',
  fg1: '#1A1B2E', fg2: '#4A4860', fg3: '#7A7791', border: '#E8E5F2', borderHover: '#D5D0E8' }
const PINK = { canvas: '#1A0F16', wash: '#3D1B2E', primary: '#FF6BA8' }

const browser = await puppeteer.launch({
  executablePath: chrome, headless: 'new', args: ['--no-sandbox', '--disable-gpu'],
})
const page = await browser.newPage()
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true })

// 페이지 안에서 WCAG 대비를 계산한다 (앱과 같은 공식)
const readTokens = () =>
  page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement)
    const v = (n) => cs.getPropertyValue(n).trim()
    const toRgb = (hex) => {
      const m = /^#?([0-9a-f]{6})$/i.exec(hex)
      if (!m) return null
      return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16))
    }
    const lum = (hex) => {
      const rgb = toRgb(hex)
      if (!rgb) return null
      const [r, g, b] = rgb.map((x) => { const s = x / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 })
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    const ratio = (a, b) => {
      const la = lum(a), lb = lum(b)
      if (la == null || lb == null) return null
      const [hi, lo] = la > lb ? [la, lb] : [lb, la]
      return (hi + 0.05) / (lo + 0.05)
    }
    const primarySoft = v('--color-primary-soft'), wash = v('--color-wash')
    const disabledBg = v('--color-disabled-bg'), canvas = v('--color-canvas')
    return {
      scheme: v('color-scheme'), primarySoft, wash, disabledBg, canvas,
      chipRatio: ratio(primarySoft, wash),
      disabledIsLight: (lum(disabledBg) ?? 0) > 0.5,
      canvasIsLight: (lum(canvas) ?? 0) > 0.5,
    }
  })

const run = async (label, over, shot) => {
  // 실제 화면 위에서 잰다 — 토큰이 :root 에 주입되므로 화면이 그 값을 그대로 쓴다
  await page.goto(`${BASE}/demo/cards/major-0`, { waitUntil: 'networkidle0' })
  await wait(700)
  // SlotProvider 가 슬롯 테마를 얹은 뒤에 덮어쓴다 (그쪽 effect 는 슬롯이 바뀔 때만 돈다)
  await page.evaluate(async (t) => {
    const { applyTheme } = await import('/src/lib/theme.ts')
    applyTheme(t)
  }, theme(over))
  await wait(300)
  const t = await readTokens()
  console.log(`[${label}] scheme=${t.scheme} primary-soft=${t.primarySoft} on wash=${t.wash} → ${t.chipRatio?.toFixed(2)}:1 | disabled-bg=${t.disabledBg}(${t.disabledIsLight ? '밝음' : '어두움'})`)
  if (shot) await page.screenshot({ path: join(outDir, shot) })
  return t
}

const dark = await run('다크', {}, 'theme-dark.png')
const light = await run('라이트', LIGHT, 'theme-light.png')
const pink = await run('핑크', PINK, null)

const checks = [
  ['다크 칩 대비 ≥ 4.5', (dark.chipRatio ?? 0) >= 4.5],
  ['다크 disabled 어두움', !dark.disabledIsLight && !dark.canvasIsLight],
  ['라이트 칩 대비 ≥ 4.5', (light.chipRatio ?? 0) >= 4.5],
  ['라이트 disabled 밝음', light.disabledIsLight && light.canvasIsLight],
  ['라이트 color-scheme=light', light.scheme === 'light'],
  ['핑크 칩 대비 ≥ 4.5', (pink.chipRatio ?? 0) >= 4.5],
]
let pass = true
for (const [name, ok] of checks) { console.log(`${ok ? '✓' : '✗'} ${name}`); if (!ok) pass = false }

await browser.close()
console.log(pass ? '\n전부 통과' : '\n실패 있음')
process.exit(pass ? 0 : 1)
