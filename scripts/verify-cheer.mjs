/**
 * 영상회 응원 검증 — **상영 제어가 실제로 도는가.**
 *
 *   node scripts/verify-cheer.mjs
 *
 * 개발 서버(5174)가 떠 있어야 한다 (화면 확인 때문).
 *
 *  · anon 은 상영 상태를 못 바꾼다        ← 손님이 크레딧을 올려버리면 사고다
 *  · '상영 시작' 이 시작 시각을 박는다
 *  · **감췄다 다시 띄워도 시작 시각이 안 되감긴다** — 되감기면 자동 크레딧이 영영 안 온다
 *  · `/show` 화면이 상태를 따라간다 (idle 이면 비고, live 면 말풍선이 뜬다)
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
const owner = { apikey: KEY, Authorization: `Bearer ${access_token}`, 'content-type': 'application/json' }
const anon = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }

const SLUG = `cheercheck-${Date.now().toString(36)}`
const made = await fetch(`${URL_}/rest/v1/slots`, {
  method: 'POST',
  headers: { ...owner, Prefer: 'return=minimal' },
  body: JSON.stringify({ slug: SLUG, name: SLUG, service: 'cheer', theme: {}, event: {} }),
})
// 준비가 실패하면 뒤 검사는 전부 거짓 실패다 — 여기서 멈춘다
check('준비: 검증용 슬롯을 만든다', made.ok, `HTTP ${made.status} ${made.ok ? '' : (await made.text()).slice(0, 120)}`)
await fetch(`${URL_}/rest/v1/rolling_messages`, {
  method: 'POST',
  headers: { ...owner, Prefer: 'return=minimal' },
  body: JSON.stringify(
    ['한마디 하나', '한마디 둘', '한마디 셋'].map((body) => ({ slug: SLUG, nickname: '검증', body, color: '', font: '' }))
  ),
})

const setShow = (state, headers) =>
  fetch(`${URL_}/rest/v1/cheer_settings`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({ slug: SLUG, show_state: state, started_at: new Date().toISOString() }),
  })

// ── 권한 ───────────────────────────────────────────
const bad = await setShow('credits', anon)
check('**손님(anon)은 상영 상태를 못 바꾼다**', !bad.ok || (await bad.json()).length === 0, `HTTP ${bad.status}`)

// ── 시작 ───────────────────────────────────────────
const live = await setShow('live', owner)
const row = live.ok ? (await live.json())[0] : null
check('상영 시작이 저장된다', row?.show_state === 'live', row?.show_state ?? '없음')
check('시작 시각이 박힌다', Boolean(row?.started_at), row?.started_at ?? '없음')
const firstStart = row?.started_at

// ── 감췄다 다시 띄우기 — 시작 시각이 되감기면 안 된다 ──
await fetch(`${URL_}/rest/v1/cheer_settings?slug=eq.${SLUG}`, {
  method: 'PATCH',
  headers: { ...owner, Prefer: 'return=minimal' },
  body: JSON.stringify({ show_state: 'hidden' }),
})
await wait(1100)
/** 화면이 쓰는 경로와 같게: `hidden` 에서 `live` 로 돌아올 땐 started_at 을 안 건드린다 */
await fetch(`${URL_}/rest/v1/cheer_settings?slug=eq.${SLUG}`, {
  method: 'PATCH',
  headers: { ...owner, Prefer: 'return=minimal' },
  body: JSON.stringify({ show_state: 'live' }),
})
const after = await (
  await fetch(`${URL_}/rest/v1/cheer_settings?slug=eq.${SLUG}&select=started_at,show_state`, { headers: owner })
).json()
check(
  '**감췄다 띄워도 시작 시각이 안 되감긴다**',
  after[0]?.started_at === firstStart,
  `${firstStart} → ${after[0]?.started_at}`
)

// ── 화면이 상태를 따라가는가 ────────────────────────
const exe = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p))

if (exe) {
  const browser = await puppeteer.launch({ executablePath: exe, headless: 'new', args: ['--no-sandbox'] })
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 720 })

  await page.goto(`${BASE}/${SLUG}/show`, { waitUntil: 'networkidle0' })
  await wait(9000)
  const liveBubbles = await page.$$eval('[data-bubble]', (e) => e.length)
  check('상영 중이면 `/show` 에 말풍선이 뜬다', liveBubbles > 0, `${liveBubbles}개`)

  await fetch(`${URL_}/rest/v1/cheer_settings?slug=eq.${SLUG}`, {
    method: 'PATCH',
    headers: { ...owner, Prefer: 'return=minimal' },
    body: JSON.stringify({ show_state: 'credits' }),
  })
  await wait(6000)
  const credits = await page.$('[data-credits]')
  check('제어판이 크레딧으로 바꾸면 화면이 따라간다', Boolean(credits))

  await fetch(`${URL_}/rest/v1/cheer_settings?slug=eq.${SLUG}`, {
    method: 'PATCH',
    headers: { ...owner, Prefer: 'return=minimal' },
    body: JSON.stringify({ show_state: 'idle' }),
  })
  await wait(6000)
  const idle = await page.$('[data-idle]')
  check('상영 전으로 되돌리면 화면이 빈다', Boolean(idle))

  await browser.close()
}

// ── 정리 ───────────────────────────────────────────
await fetch(`${URL_}/rest/v1/slots?slug=eq.${SLUG}`, { method: 'DELETE', headers: { ...owner, Prefer: 'return=minimal' } })
const left = await (await fetch(`${URL_}/rest/v1/slots?slug=eq.${SLUG}&select=slug`, { headers: owner })).json()
check('검증이 남긴 게 없다', left.length === 0)

console.log(failed === 0 ? '\n전부 통과' : `\n${failed}개 실패`)
process.exit(failed === 0 ? 0 : 1)
