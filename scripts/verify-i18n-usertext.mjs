/**
 * **사람이 적는 값의 다국어가 실제로 도는가.**
 *
 *   node scripts/verify-i18n-usertext.mjs
 *
 * 화면 문구는 사전이 옮기지만(`verify-i18n-leak`), 방문자가 보는 글자의 절반은 우리가
 * 안 쓴 것이다 — 제목·부제·버튼 라벨·경품 이름·설문 선택지. 그건 **적는 사람이 언어별로
 * 입력**하고(`I18nField`), 화면은 그중 지금 언어의 값을 고른다.
 *
 * 칸만 만들고 저장이 안 되거나, 저장은 되는데 화면이 안 읽는 사고가 흔하다. 손으로
 * 스무 번 확인할 양이라 여기서 찔러본다:
 *
 *  · 슬롯이 **아무 언어도 안 켰으면** 칸이 통째로 없다 (물을 게 없다)
 *  · 켠 언어의 칸만 뜬다 (안 켠 언어를 78번 적게 만들지 않는다)
 *  · 적고 저장하면 **방문자 화면에 그 언어로 뜬다**
 *  · 안 적은 언어는 **한국어로 폴백**한다 (빈 화면이 아니라)
 *  · 언어를 껐다 켜도 **적어 둔 값이 안 지워진다**
 *
 * `.env.local` 의 Supabase 자격이 필요하다 — 슬롯을 만들고 지운다.
 */
import puppeteer from 'puppeteer-core'
import { existsSync, readFileSync } from 'node:fs'

const BASE = 'http://localhost:5174'
const exe = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p))
if (!exe) {
  console.error('크롬을 못 찾았어요')
  process.exit(1)
}

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)
const URL_ = env.VITE_SUPABASE_URL
const KEY = env.VITE_SUPABASE_ANON_KEY
const PW = env.SEED_PASSWORD ?? 'tarot1234'

let failed = 0
const check = (label, ok, note = '') => {
  console.log(`${ok ? '✓' : '✗'} ${label}${note ? ` — ${note}` : ''}`)
  if (!ok) failed++
}

const auth = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: KEY, 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'owner@example.com', password: PW }),
})
const { access_token } = await auth.json()
if (!access_token) {
  console.error('최고관리자 로그인 실패 — .env.local 의 SEED_PASSWORD 를 보세요')
  process.exit(1)
}
const owner = { apikey: KEY, authorization: `Bearer ${access_token}`, 'content-type': 'application/json' }

const SLUG = `i18n-ut-${Date.now().toString(36)}`
const cleanup = () =>
  fetch(`${URL_}/rest/v1/slots?slug=eq.${SLUG}`, { method: 'DELETE', headers: owner })

/**
 * 슬롯 하나를 만든다 — `langs` 와 소원나무 설정을 바꿔 가며 화면을 본다.
 *
 * **설정은 `theme` 안이 아니라 `slots.wish` 컬럼이다** (`0001_init.sql` 이후 서비스마다
 * 전용 jsonb 컬럼을 둔다 — rolling·cheer·poll…). 처음에 `theme.wish` 에 넣었더니
 * 화면이 안 읽어 검사가 통째로 빨갛게 났다.
 */
async function makeSlot(langs, wishI18n) {
  await cleanup()
  const wish = {
    /**
     * **주최자가 고친 제목으로 시험한다.** 기본 문구('소원 나무')를 그대로 두면 그건
     * 사전에 있어서 다른 언어로 번역돼 버린다 — 그러면 "적어 둔 값이 이겼는지" 와
     * "사전이 옮겼는지" 를 가릴 수 없다. 사전에 없는 말이라야 판정이 선다.
     */
    treeTitle: '리안의 소원 나무',
    treeSubtitle: '소원을 적어 나무에 걸어 주세요',
    ...(wishI18n ? { i18n: wishI18n } : {}),
  }
  const r = await fetch(`${URL_}/rest/v1/slots`, {
    method: 'POST',
    headers: { ...owner, Prefer: 'return=minimal' },
    body: JSON.stringify({ slug: SLUG, name: SLUG, service: 'wish', theme: {}, event: {}, wish, langs }),
  })
  return r.ok
}

const browser = await puppeteer.launch({ executablePath: exe, headless: 'new', args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 420, height: 900 })

/** 그 언어로 열었을 때 화면에 보이는 제목 */
async function titleAt(lang) {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await page.evaluate((l) => localStorage.setItem('tarot-pocket:lang', l), lang)
  await page.goto(`${BASE}/${SLUG}`, { waitUntil: 'networkidle0', timeout: 20000 })
  await new Promise((r) => setTimeout(r, 800))
  return page.evaluate(() => document.querySelector('h1')?.textContent?.trim() ?? '')
}

try {
  // ── ① 주최자가 영어를 적어 두면 영어 화면에 그 값이 뜬다 ──
  check(
    '준비: 슬롯 (en·ja 켬, 영어 제목만 적음)',
    await makeSlot(['en', 'ja'], { treeTitle: { en: 'Star Wishes' } })
  )
  check('영어 화면에 적어 둔 값이 뜬다', (await titleAt('en')) === 'Star Wishes')

  // ── ② 안 적은 언어는 한국어 폴백 (빈 화면이 아니다) ──
  const ja = await titleAt('ja')
  check('안 적은 일본어는 원문으로 폴백', ja === '리안의 소원 나무', `실제 "${ja}"`)

  // ── ③ 한국어로 열면 원문 ──
  check('한국어는 원문 그대로', (await titleAt('ko')) === '리안의 소원 나무')

  /**
   * ── ④ 언어를 껐다 켜도 적어 둔 값은 남는다 ──
   *
   * 언어를 끄면 **고르개가 사라질 뿐** 적어 둔 값은 지워지지 않는다. 그 상태에서 방문자가
   * (다른 슬롯에서 고른) 영어로 들어오면 화면 문구는 사전이 영어로 옮기는데, 이때 제목만
   * 한국어로 되돌리면 한 화면에 두 언어가 섞인다 — **적어 둔 값을 그대로 쓰는 게 맞다.**
   */
  await makeSlot([], { treeTitle: { en: 'Star Wishes' } })
  check('언어를 꺼도 적어 둔 값은 안 지워진다', (await titleAt('en')) === 'Star Wishes')
  await fetch(`${URL_}/rest/v1/slots?slug=eq.${SLUG}`, {
    method: 'PATCH',
    headers: { ...owner, Prefer: 'return=minimal' },
    body: JSON.stringify({ langs: ['en'] }),
  })
  check('다시 켜면 적어 둔 값이 살아난다', (await titleAt('en')) === 'Star Wishes')
} finally {
  await cleanup()
  await browser.close()
}

console.error(failed === 0 ? '\n입력값 다국어가 실제로 돌아요' : `\n${failed}개가 안 돌아요`)
process.exit(failed === 0 ? 0 : 1)
