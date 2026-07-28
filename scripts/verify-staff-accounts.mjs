/**
 * 스태프 계정 검증 — **주최자가 자기 슬롯에만 계정을 더할 수 있는가.**
 *
 *   node scripts/verify-staff-accounts.mjs
 *
 * 이 경계가 틀리면 남의 행사에 계정을 심을 수 있다. "안 되는 것" 이 계약이라 실제로 찔러본다:
 *  · 주최자가 자기 슬롯에 계정을 만든다            → 된다
 *  · 주최자가 **남의 슬롯**에 계정을 만든다        → 막힌다
 *  · 주최자가 **남의 슬롯 계정 목록**을 읽는다     → 막힌다
 *  · 주최자가 **자기 자신**을 뺀다                 → 막힌다 (스스로 잠기면 아무도 못 들어온다)
 *  · 주최자가 **슬롯을 통째로 지운다**(purge)      → 막힌다 (최고관리자만)
 *
 * 검증이 남긴 계정·슬롯은 끝에서 지운다.
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
const FN = `${URL_}/functions/v1/admin`
const PW = env.SEED_PASSWORD ?? 'tarot1234'

let failed = 0
const check = (label, ok, note = '') => {
  console.log(`${ok ? '✓' : '✗'} ${label}${note ? ` — ${note}` : ''}`)
  if (!ok) failed++
}

const token = async (email, password) => {
  const r = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const j = await r.json()
  return j.access_token ?? null
}

const call = async (path, jwt, init = {}) =>
  fetch(`${FN}/${path}`, {
    ...init,
    headers: {
      apikey: KEY,
      authorization: `Bearer ${jwt}`,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  })

const rest = async (path, jwt, init = {}) =>
  fetch(`${URL_}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: KEY, authorization: `Bearer ${jwt}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
  })

const A = `staffcheck-a-${Date.now().toString(36)}`
const B = `staffcheck-b-${Date.now().toString(36)}`
const boss = `boss-${Date.now().toString(36)}@example.com`
const extra = `extra-${Date.now().toString(36)}@example.com`

const owner = await token('owner@example.com', PW)
if (!owner) {
  console.error('최고관리자 로그인 실패 — SEED_PASSWORD 를 확인하세요')
  process.exit(1)
}

// ── 준비: 슬롯 둘 + 주최자 하나 ─────────────────────
for (const slug of [A, B]) {
  await rest('slots', owner, {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ slug, name: slug, theme: {}, event: {} }),
  })
}
const made = await call('organizers', owner, {
  method: 'POST',
  body: JSON.stringify({ slug: A, email: boss, password: PW }),
})
check('준비: 최고관리자가 A 슬롯 주최자를 만든다', made.ok, String(made.status))

const organizer = await token(boss, PW)
check('준비: 주최자로 로그인된다', Boolean(organizer))

// ── 본 검사 ────────────────────────────────────────
const own = await call(`organizers?slug=${A}`, organizer)
check('주최자가 자기 슬롯 계정 목록을 읽는다', own.ok, String(own.status))

const others = await call(`organizers?slug=${B}`, organizer)
check('**주최자는 남의 슬롯 목록을 못 읽는다**', others.status === 403, String(others.status))

const addOwn = await call('organizers', organizer, {
  method: 'POST',
  body: JSON.stringify({ slug: A, email: extra, password: PW }),
})
check('주최자가 자기 슬롯에 스태프 계정을 만든다', addOwn.ok, String(addOwn.status))
const addedId = addOwn.ok ? (await addOwn.json()).organizer?.userId : null

const addOther = await call('organizers', organizer, {
  method: 'POST',
  body: JSON.stringify({ slug: B, email: `x-${extra}`, password: PW }),
})
check('**주최자는 남의 슬롯에 계정을 못 만든다**', addOther.status === 403, String(addOther.status))

// 자기 자신 빼기 — 막혀야 한다
const meId = await (async () => {
  const r = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: KEY, authorization: `Bearer ${organizer}` } })
  return (await r.json()).id
})()
const selfOut = await call('revoke', organizer, {
  method: 'POST',
  body: JSON.stringify({ userId: meId, slug: A }),
})
check('**주최자는 자기 계정을 못 뺀다** (스스로 잠기면 아무도 못 들어온다)', selfOut.status === 400, String(selfOut.status))

// 슬롯 통째 삭제는 최고관리자만
const purge = await call('purge', organizer, { method: 'POST', body: JSON.stringify({ slug: A }) })
check('**주최자는 슬롯을 통째로 못 지운다**', purge.status === 403, String(purge.status))

// 만든 스태프는 뺄 수 있다
if (addedId) {
  const out = await call('revoke', organizer, {
    method: 'POST',
    body: JSON.stringify({ userId: addedId, slug: A }),
  })
  check('주최자가 자기 슬롯의 스태프를 뺀다', out.ok, String(out.status))
}

// ── 정리 ───────────────────────────────────────────
for (const slug of [A, B]) {
  await call('purge', owner, { method: 'POST', body: JSON.stringify({ slug }) })
}
const left = await rest(`slots?slug=in.(${A},${B})&select=slug`, owner)
check('검증이 남긴 게 없다', (await left.json()).length === 0)

console.log(failed === 0 ? '\n전부 통과' : `\n${failed}개 실패`)
process.exit(failed === 0 ? 0 : 1)
