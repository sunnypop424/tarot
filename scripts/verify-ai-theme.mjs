/**
 * AI 테마 색 생성 검증 — 실제로 Claude 를 불러 색을 만들고, **읽히는지**까지 본다.
 * 개발 서버 + .env.local 의 ANTHROPIC_API_KEY 가 필요하다.
 *
 *   node scripts/verify-ai-theme.mjs <스크린샷 디렉터리>
 *
 * 이 검증의 핵심은 "AI 가 예쁜 색을 주나"가 아니라 **"AI 가 뭘 주든 읽히나"** 다.
 * 모델은 매번 다른 색을 주므로, 특정 색을 기대하면 안 된다.
 */

import puppeteer from 'puppeteer-core'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const env = {}
try {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim())
    if (m) env[m[1]] = m[2]
  }
} catch {
  /* 없으면 아래에서 걸린다 */
}

const chrome = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p))

const outDir = process.argv[2] ?? '.'
const BASE = 'http://localhost:5174'
/** AI 는 배포된 Edge Function 이 부른다 — 개발도 같은 함수를 쓴다 (docs/BACKEND.md §4) */
const AI_BASE = env.VITE_AI_BASE ?? ''
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const checks = []
const check = (name, ok, detail = '') => {
  checks.push([name, ok])
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const status = await (await fetch(`${AI_BASE}/status`)).json()
if (!status.ready) {
  console.log('ANTHROPIC_API_KEY 가 없어 건너뜁니다.')
  process.exit(0)
}

/** 색 만들기는 **최고관리자만** 부를 수 있다 — 토큰 없이 부르면 형식 검사까지 가지도 못한다 */
const ownerToken = await (async () => {
  const r = await fetch(`${env.VITE_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: env.VITE_SUPABASE_ANON_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'owner@example.com', password: env.SEED_PASSWORD ?? 'tarot1234' }),
  })
  return r.ok ? (await r.json()).access_token : null
})()

/**
 * demo 슬롯의 테마를 스냅샷해뒀다가 끝나면 되돌린다.
 *
 * **이 검증은 실제 슬롯에 저장한다** — 저장까지 해야 "색이 화면 끝까지 가나"를 볼 수 있어서다.
 * 슬롯이 localStorage 에 살 땐 그게 브라우저와 함께 사라졌지만, 이제 저장은 곧 배포다:
 * 안 되돌리면 데모 슬롯이 **검증이 만든 핑크색으로 남는다** (실제로 그렇게 남아서 이게 생겼다).
 */
const { VITE_SUPABASE_URL: sbUrl, VITE_SUPABASE_ANON_KEY: sbKey } = env
let restoreTheme = async () => {}
if (sbUrl && sbKey) {
  const auth = await fetch(`${sbUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: sbKey, 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'owner@example.com', password: env.SEED_PASSWORD ?? 'tarot1234' }),
  })
  const { access_token: token } = await auth.json()
  const headers = { apikey: sbKey, authorization: `Bearer ${token}` }
  const snapshot = (
    await (
      await fetch(`${sbUrl}/rest/v1/slots?slug=eq.demo&select=theme`, { headers })
    ).json()
  )[0].theme
  restoreTheme = async () => {
    await fetch(`${sbUrl}/rest/v1/slots?slug=eq.demo`, {
      method: 'PATCH',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ theme: snapshot }),
    })
    const now = (
      await (await fetch(`${sbUrl}/rest/v1/slots?slug=eq.demo&select=theme`, { headers })).json()
    )[0].theme
    check(
      '뒷정리: 데모 테마를 되돌림',
      now.colors.canvas === snapshot.colors.canvas && now.colors.primary === snapshot.colors.primary,
      `canvas=${now.colors.canvas} primary=${now.colors.primary}`
    )
  }
}

// ── 엔드포인트 방어 ──────────────────────────────────
const post = (body, tok = ownerToken) =>
  fetch(`${AI_BASE}/theme`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}) },
    body: JSON.stringify(body),
  })

check('로그인 없이는 못 부른다', (await post({ baseColor: '#FF6BA8', mode: 'dark' }, null)).status === 403)
check('색 형식이 아니면 거부', (await post({ baseColor: 'pink', mode: 'dark' })).status === 400)
check('모드가 이상하면 거부', (await post({ baseColor: '#FF6BA8', mode: 'sepia' })).status === 400)

// ── 실제 화면 ────────────────────────────────────────
const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: 'new',
  args: ['--no-sandbox', '--hide-scrollbars'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 1000 })

const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

await page.goto(`${BASE}/theme-editor/login`, { waitUntil: 'networkidle0' })
await page.type('#owner-email', 'owner@example.com')
await page.type('#owner-password', env.SEED_PASSWORD ?? 'tarot1234')
await page.click('button[type=submit]')
await wait(2500)

await page.goto(`${BASE}/theme-editor/demo`, { waitUntil: 'networkidle0' })
await wait(900)

// 대표 색 + 라이트 모드로 만들기
await page.$eval('[data-ai-base]', (el) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  setter.call(el, '#FF6BA8')
  el.dispatchEvent(new Event('input', { bubbles: true }))
})
await page.select('[data-ai-mode]', 'light')
await wait(300)

/**
 * 편집기는 **고정 라이트**라 슬롯 테마가 :root 변수에 안 들어간다 (.owner 가 색을 직접 준다).
 * 그래서 CSS 변수를 읽으면 안 되고, 편집 중인 값 = 색 입력칸을 읽어야 한다.
 */
const draftColors = () =>
  page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll('input[id^="c-"]')].map((el) => [el.id.slice(2), el.value])
    )
  )

const before = await draftColors()

await page.click('[data-ai-theme]')
// 만드는 동안 수정구슬
await wait(700)
const loading = await page.evaluate(() => document.querySelector('[role="status"]')?.textContent ?? '')
check('만드는 동안 로더', /색을 고르고 있어요/.test(loading), loading.trim())

await page.waitForFunction(
  () => !document.querySelector('[role="status"]')?.textContent?.includes('색을 고르고'),
  { timeout: 60000 }
)
await wait(600)

const after = await draftColors()
const panel = await page.evaluate(() => ({
  // 대비 패널이 실제로 통과라고 말하나
  rows: [...document.querySelectorAll('[class*="contrastRow"]')].map((r) =>
    r.textContent.replace(/\s+/g, ' ')
  ),
  fixedNote: [...document.querySelectorAll('p')]
    .map((p) => p.textContent)
    .find((t) => t?.includes('대비를 맞춰 조정했어요')),
  dirty: document.querySelector('[data-save-state]')?.dataset.saveState,
}))

// 밝기 판정 — 라이트로 만들었으면 바탕이 밝아야 한다
const isLight = (hex) => {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(1 + i, 3 + i), 16))
  const lum = [r, g, b]
    .map((x) => {
      const s = x / 255
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    })
    .reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0)
  return lum > 0.5
}

check('색이 실제로 바뀜', after.canvas !== before.canvas, `${before.canvas} → ${after.canvas}`)
check('대표 색이 CTA 에 들어감', after.primary.toUpperCase() === '#FF6BA8', after.primary)
check('라이트로 만들면 밝은 바탕', isLight(after.canvas), after.canvas)
check('저장 전 상태 (자동 저장 안 함)', panel.dirty === 'dirty', String(panel.dirty))

// ★ 이 기능의 통과 조건 — AI 가 뭘 주든 대비 패널이 전부 통과여야 한다
const failing = panel.rows.filter((r) => r.includes('미달'))
check(
  '대비 검사 전 항목 통과',
  failing.length === 0,
  failing.length ? failing.join(' / ') : `${panel.rows.length}개 항목`
)
console.log('\n  대비 패널:')
for (const r of panel.rows) console.log('   ·', r)
if (panel.fixedNote) console.log(`\n  ${panel.fixedNote.trim()}`)

await page.screenshot({ path: join(outDir, 'ai-theme.png') })

/**
 * 미리보기(=실제 앱)가 새 색으로 뜨나. 저장해야 반영된다.
 * "카드 뽑기" CTA(btn--primary btn--glow)가 새 primary 를 쓰는지까지 본다 —
 * 색이 화면 끝까지 가는 걸 확인하는 자리다.
 */
await page.click('[data-save]')
await wait(2000)

const hexToRgb = (h) => {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(1 + i, 3 + i), 16))
  return `rgb(${r}, ${g}, ${b})`
}

const cta = await (async () => {
  const frame = page.frames().find((f) => f !== page.mainFrame() && f.url().includes('/demo'))
  if (!frame) return null
  return frame.$$eval('button', (bs) => {
    const b = bs.find((x) => x.textContent.trim() === '카드 뽑기')
    if (!b) return null
    const cs = getComputedStyle(b)
    return { classes: b.className, bg: cs.backgroundColor, color: cs.color, glow: cs.boxShadow }
  })
})()

check('미리보기에 CTA 가 있다', cta !== null, cta?.classes ?? '못 찾음')
if (cta) {
  check('CTA 배경 = 새 primary', cta.bg === hexToRgb(after.primary), `${cta.bg} (기대 ${after.primary})`)
  check('CTA 글자 = 새 onPrimary', cta.color === hexToRgb(after.onPrimary), `${cta.color} (기대 ${after.onPrimary})`)
  check('CTA 글로우도 새 색', cta.glow.includes(hexToRgb(after.primary).replace('rgb', 'rgba').replace(')', ', 0.25)')), cta.glow)
}
await page.screenshot({ path: join(outDir, 'ai-theme-saved.png') })

await browser.close()
await restoreTheme()

if (errors.length) {
  console.error('\n콘솔 에러:')
  for (const e of errors.slice(0, 4)) console.error('  ·', e.slice(0, 120))
}

const failed = checks.filter(([, ok]) => !ok).length
console.log(`\n${checks.length - failed} / ${checks.length} 통과`)
process.exit(failed ? 1 : 0)
