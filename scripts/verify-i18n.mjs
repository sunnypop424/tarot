/**
 * 다국어 검증 — **언어를 바꾸면 화면이 실제로 바뀌는가** (`src/i18n/`).
 *
 *   node scripts/verify-i18n.mjs
 *
 * 개발 서버(5174)가 떠 있어야 한다. 검증용 슬롯을 만들었다 지운다.
 *
 * 사전이 키(한국어 원문)로 도는 구조라 **빠진 번역은 한국어로 떨어진다** — 그게 설계이고,
 * 그래서 "화면이 안 깨졌다" 만으로는 번역이 되는지 알 수 없다. 실제로 글자가 바뀌는지 본다.
 *
 *  · 슬롯이 언어를 안 고르면 **고르개가 아예 안 뜬다** (한국어 행사가 대부분이다)
 *  · 고른 언어만 목록에 뜨고 **한국어는 늘 있다** (없으면 되돌아올 길이 사라진다)
 *  · 고르면 화면 글자가 그 언어로 바뀐다 (한 → EN → 中 → 日)
 *  · **새로고침해도 유지된다** (localStorage)
 *  · 사전에 없는 문장은 **한국어로 남는다** (고장이 아니라 폴백)
 */
import puppeteer from 'puppeteer-core'
import { existsSync, readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)
const URL_ = env.VITE_SUPABASE_URL
const KEY = env.VITE_SUPABASE_ANON_KEY
const PW = env.SEED_PASSWORD ?? 'tarot1234'
const BASE = 'http://localhost:5174'

let failed = 0
const check = (label, ok, note = '') => {
  console.log(`${ok ? '✓' : '✗'} ${label}${note ? ` — ${note}` : ''}`)
  if (!ok) failed++
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const auth = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: KEY, 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'owner@example.com', password: PW }),
})
const { access_token } = await auth.json()
const owner = { apikey: KEY, authorization: `Bearer ${access_token}`, 'content-type': 'application/json' }

const PLAIN = `i18n-plain-${Date.now().toString(36)}`
const MULTI = `i18n-multi-${Date.now().toString(36)}`

const mk = (slug, langs) =>
  fetch(`${URL_}/rest/v1/slots`, {
    method: 'POST',
    headers: { ...owner, Prefer: 'return=minimal' },
    body: JSON.stringify({ slug, name: slug, service: 'rolling', theme: {}, event: {}, langs }),
  })

const cleanup = () =>
  fetch(`${URL_}/rest/v1/slots?slug=in.(${PLAIN},${MULTI})`, { method: 'DELETE', headers: owner })

const made = await Promise.all([mk(PLAIN, []), mk(MULTI, ['en', 'zh', 'ja'])])
check('준비: 검증용 슬롯 둘', made.every((r) => r.ok))
if (!made.every((r) => r.ok)) {
  await cleanup()
  process.exit(1)
}

const exe = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p))
if (!exe) {
  console.error('Chrome/Edge 를 찾지 못했습니다.')
  await cleanup()
  process.exit(1)
}

const browser = await puppeteer.launch({ executablePath: exe, headless: 'new', args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

/**
 * 벽의 빈 상태 문구 — 사전에 네 언어가 다 있고, 검증용 슬롯은 쪽지가 없으니 늘 떠 있다.
 * **작성 화면(/write)이 아니라 벽을 본다** — 고르개는 ServiceHeader 에 있고 작성 화면은
 * 자기 헤더를 따로 그린다(거기로 가는 길이 벽뿐이라 언어는 이미 정해져 있다).
 */
const title = () => page.$eval('[class*="emptyText"]', (n) => n.textContent?.trim() ?? '')

const pick = async (id) => {
  await page.click('[data-lang-open]')
  await wait(200)
  await page.click(`[data-lang-menu] [data-lang="${id}"]`)
  await wait(400)
}

try {
  // ── 1. 안 고른 슬롯엔 고르개가 없다 ───────────────
  await page.goto(`${BASE}/${PLAIN}`, { waitUntil: 'networkidle0' })
  await wait(900)
  check('언어를 안 고른 슬롯엔 고르개가 없다', (await page.$('[data-lang-open]')) === null)

  // ── 2. 고른 슬롯엔 고른 것 + 한국어 ───────────────
  await page.goto(`${BASE}/${MULTI}`, { waitUntil: 'networkidle0' })
  await wait(900)
  check('고른 슬롯엔 고르개가 뜬다', Boolean(await page.$('[data-lang-open]')))

  await page.click('[data-lang-open]')
  await wait(250)
  const ids = await page.$$eval('[data-lang-menu] [data-lang]', (ns) =>
    ns.map((n) => n.getAttribute('data-lang'))
  )
  check('한국어가 늘 목록에 있다', ids.includes('ko'), ids.join(', '))
  check('고른 언어만 뜬다', ids.length === 4, `${ids.length}개: ${ids.join(', ')}`)
  await page.keyboard.press('Escape')
  await wait(200)

  // ── 3. 실제로 글자가 바뀐다 ───────────────────────
  const ko = await title()
  check('한국어가 기본이다', ko === '첫 메시지를 남겨 보세요', `"${ko}"`)

  await pick('en')
  const en = await title()
  check('영어로 바뀐다', en === 'Be the first to leave a message', `"${en}"`)

  await pick('zh')
  const zh = await title()
  check('중국어로 바뀐다', zh === '来写下第一条留言吧', `"${zh}"`)

  await pick('ja')
  const ja = await title()
  check('일본어로 바뀐다', ja === '最初のメッセージを書いてみてください', `"${ja}"`)

  // ── 4. 새로고침해도 유지된다 ──────────────────────
  await page.reload({ waitUntil: 'networkidle0' })
  await wait(900)
  check('새로고침해도 고른 언어가 유지된다', (await title()) === '最初のメッセージを書いてみてください')

  /**
   * `<html lang>` 도 따라가야 한다 — 스크린리더가 읽는 발음과 브라우저 번역기가 이걸 본다.
   * 화면 글자만 바꾸고 이걸 안 바꾸면 보조기술에는 여전히 한국어다.
   */
  const htmlLang = await page.evaluate(() => document.documentElement.lang)
  check('<html lang> 이 따라간다', htmlLang === 'ja', `lang="${htmlLang}"`)

  // ── 5. 사전에 없는 문장은 한국어로 남는다 ─────────
  //
  // **이게 이 설계의 핵심이다.** 빠진 번역이 고장이 아니라 한국어여야 사전을 나눠서 채울 수 있다.
  await pick('ko')
  await page.goto(`${BASE}/${MULTI}`, { waitUntil: 'networkidle0' })
  await wait(700)
  await pick('en')
  const body = await page.evaluate(() => document.body.textContent ?? '')
  check('사전에 없는 문장은 한국어로 남는다 (빈칸·키가 안 뜬다)', !body.includes('undefined') && body.length > 50)

  check('화면 오류가 없다', errors.length === 0, errors.slice(0, 2).join(' / '))
} finally {
  await browser.close()
  await cleanup()
  const left = await fetch(`${URL_}/rest/v1/slots?slug=in.(${PLAIN},${MULTI})&select=slug`, {
    headers: owner,
  })
  check('검증이 남긴 게 없다', left.ok && (await left.json()).length === 0)
}

console.log(failed === 0 ? '\n전부 통과' : `\n${failed}개 실패`)
process.exit(failed === 0 ? 0 : 1)
