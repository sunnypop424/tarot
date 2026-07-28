/**
 * 체험용 슬롯 검증 — **남에게 보이는 쓰기가 정말 막히는가.**
 *
 *   node scripts/verify-demo.mjs
 *
 * 랜딩에서 링크할 공개 주소라 "안 되는 것" 이 계약이다. 화면이 안 보내는 것과 별개로
 * **서버가 거절하는지**를 anon 키로 직접 찔러본다 (화면을 우회한 호출이 진짜 위험이다).
 *
 *  · 데모 슬롯에 쪽지를 남긴다      → 막힌다 (RLS: 0행)
 *  · 데모 슬롯에 투표한다           → 막힌다 (cast_vote 가 거절)
 *  · **일반 슬롯은 그대로 된다**    → 데모 조건이 다른 슬롯을 막지 않았는지 (회귀)
 */
import { readFileSync } from 'node:fs'

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

const anon = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }
const auth = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: KEY, 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'owner@example.com', password: PW }),
})
const { access_token } = await auth.json()
const owner = { apikey: KEY, Authorization: `Bearer ${access_token}`, 'content-type': 'application/json' }

const DEMO = `demo-verify-${Date.now().toString(36)}`
const REAL = `real-verify-${Date.now().toString(36)}`

for (const [slug, demo] of [
  [DEMO, true],
  [REAL, false],
]) {
  await fetch(`${URL_}/rest/v1/slots`, {
    method: 'POST',
    headers: { ...owner, Prefer: 'return=minimal' },
    body: JSON.stringify({ slug, name: slug, service: 'rolling', demo, theme: {}, event: {} }),
  })
}

/** RLS 로 막힌 쓰기는 **401 이 아니라 0행**으로 온다 (verify-rolling.mjs 의 교훈) */
const post = async (slug) => {
  const r = await fetch(`${URL_}/rest/v1/rolling_messages`, {
    method: 'POST',
    headers: { ...anon, Prefer: 'return=representation' },
    body: JSON.stringify({ slug, nickname: '검증', body: '체험 쓰기', color: '', font: '' }),
  })
  const rows = r.ok ? await r.json() : []
  return { status: r.status, rows: rows.length }
}

const blocked = await post(DEMO)
check('**체험 슬롯엔 쪽지가 안 남는다**', blocked.rows === 0, `HTTP ${blocked.status} · ${blocked.rows}행`)

const allowed = await post(REAL)
check('일반 슬롯은 그대로 남는다 (회귀)', allowed.rows === 1, `HTTP ${allowed.status} · ${allowed.rows}행`)

// 투표 — 데모 슬롯을 poll 로 바꿔 RPC 를 찔러본다
await fetch(`${URL_}/rest/v1/slots?slug=eq.${DEMO}`, {
  method: 'PATCH',
  headers: { ...owner, Prefer: 'return=minimal' },
  body: JSON.stringify({ service: 'poll' }),
})
const made = await fetch(`${URL_}/rest/v1/poll_polls`, {
  method: 'POST',
  headers: { ...owner, Prefer: 'return=representation' },
  body: JSON.stringify({ slug: DEMO, title: '체험 투표', kind: 'single', max_pick: 1, order: 1 }),
})
const poll = (await made.json())[0]
const opt = poll
  ? (
      await (
        await fetch(`${URL_}/rest/v1/poll_options`, {
          method: 'POST',
          headers: { ...owner, Prefer: 'return=representation' },
          body: JSON.stringify({ poll_id: poll.id, order: 1, label: '가', votes: 0 }),
        })
      ).json()
    )[0]
  : null

if (opt) {
  const vote = await fetch(`${URL_}/rest/v1/rpc/cast_vote`, {
    method: 'POST',
    headers: anon,
    body: JSON.stringify({ target: DEMO, poll: poll.id, options: [opt.id], subj: 'verify' }),
  })
  const body = await vote.text()
  check(
    '**체험 슬롯엔 투표가 저장되지 않는다**',
    !vote.ok && body.includes('체험용'),
    `HTTP ${vote.status} · ${body.slice(0, 60)}`
  )
}

// 정리
for (const slug of [DEMO, REAL]) {
  await fetch(`${URL_}/rest/v1/slots?slug=eq.${slug}`, { method: 'DELETE', headers: { ...owner, Prefer: 'return=minimal' } })
}
const left = await fetch(`${URL_}/rest/v1/slots?slug=in.(${DEMO},${REAL})&select=slug`, { headers: owner })
check('검증이 남긴 게 없다', (await left.json()).length === 0)

console.log(failed === 0 ? '\n전부 통과' : `\n${failed}개 실패`)
process.exit(failed === 0 ? 0 : 1)
