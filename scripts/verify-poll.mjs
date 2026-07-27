/**
 * 실시간 투표 검증 — **anon 이 직접 쓰는 서비스라 "안 되는 것" 이 계약이다.**
 *
 *   node scripts/verify-poll.mjs
 *
 * 보는 것:
 *  - **동시 100표가 정확히 100** (집계를 컬럼으로 든 이유가 이 원자성이다)
 *  - 같은 사람이 두 번 못 찍는다
 *  - **anon 이 `poll_options.votes` 를 직접 못 고친다** (grant 를 안 줬다)
 *  - **anon 이 `poll_votes` 를 못 읽는다** (누가 뭘 찍었는지 새면 안 된다)
 *  - 준비 중(hidden)·마감(closed) 설문엔 못 찍는다
 *  - **다른 서비스 슬롯에 투표를 꽂을 수 없다** (RPC 첫 줄 검사의 실증)
 *  - 남의 설문 선택지를 섞어 보낼 수 없다
 *  - 레이트리밋이 실제로 걸린다
 */

import { readFileSync } from 'node:fs'
import { exec } from './db.mjs'

const env = {}
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim())
  if (m) env[m[1]] = m[2]
}
const URL_ = env.VITE_SUPABASE_URL
const ANON = env.VITE_SUPABASE_ANON_KEY
const SLUG = 'poll-verify'
const SLUG_TAROT = 'poll-verify-tarot'

let failed = 0
const check = (name, ok, detail = '') => {
  if (!ok) failed++
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const auth = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: ANON, 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'owner@example.com', password: env.SEED_PASSWORD ?? 'tarot1234' }),
})
if (!auth.ok) {
  console.error('최고관리자 로그인 실패')
  process.exit(1)
}
const { access_token } = await auth.json()
const OWNER = { apikey: ANON, authorization: `Bearer ${access_token}`, 'content-type': 'application/json' }
const ANONH = { apikey: ANON, 'content-type': 'application/json' }
const rest = (p, i = {}) => fetch(`${URL_}/rest/v1/${p}`, i)
const rpc = (fn, body, headers = ANONH) =>
  rest(`rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(body) })

const cleanup = () => exec(`delete from public.slots where slug in ('${SLUG}','${SLUG_TAROT}');`)
await cleanup()

await exec(`insert into public.slots(slug,name,service,theme,event) values
  ('${SLUG}','투표 검증','poll','{"colors":{},"shape":{},"assets":{}}','{}'),
  ('${SLUG_TAROT}','타로 검증','tarot','{"colors":{},"shape":{},"assets":{}}','{}');`)

const mkPoll = async (title, opts, extra = '') => {
  const id = (await exec(
    `insert into public.poll_polls(slug,title,kind,max_pick,hidden,closed,"order") values
     ('${SLUG}','${title}','single',1,${extra.includes('hidden') ? 'true' : 'false'},${extra.includes('closed') ? 'true' : 'false'},1) returning id;`
  ))[0].id
  const ids = []
  for (const [i, label] of opts.entries()) {
    ids.push((await exec(
      `insert into public.poll_options(poll_id,"order",label) values ('${id}',${i + 1},'${label}') returning id;`
    ))[0].id)
  }
  return { id, ids }
}

const open = await mkPoll('열린 설문', ['가', '나', '다'])
const hidden = await mkPoll('준비 중', ['가', '나'], 'hidden')
const closed = await mkPoll('마감', ['가', '나'], 'closed')

// ── 1. 기본 투표 ──────────────────────────────────
{
  const r = await rpc('cast_vote', { target: SLUG, poll: open.id, options: [open.ids[0]], subj: 'v-1' })
  check('방문자가 투표한다', r.ok, r.ok ? '' : `HTTP ${r.status} ${await r.text()}`)
}
{
  const r = await rpc('cast_vote', { target: SLUG, poll: open.id, options: [open.ids[1]], subj: 'v-1' })
  check('같은 사람은 두 번 못 찍는다', !r.ok, `HTTP ${r.status}`)
}

// ── 2. 동시 100표 ─────────────────────────────────
{
  const before = (await exec(`select coalesce(sum(votes),0)::int n from public.poll_options where poll_id='${open.id}';`))[0].n
  await Promise.all(
    Array.from({ length: 100 }, (_, i) =>
      rpc('cast_vote', { target: SLUG, poll: open.id, options: [open.ids[i % 3]], subj: `race-${i}` })
    )
  )
  const after = (await exec(`select coalesce(sum(votes),0)::int n from public.poll_options where poll_id='${open.id}';`))[0].n
  const ledger = (await exec(`select count(*)::int n from public.poll_votes where poll_id='${open.id}';`))[0].n
  check('**동시 100표가 정확히 100** (증분 원자성)', after - before === 100, `집계 ${before}→${after}`)
  check('원장과 집계가 일치한다', ledger === after, `원장 ${ledger} · 집계 ${after}`)
}

// ── 3. anon 권한 ──────────────────────────────────
{
  const r = await rest(`poll_options?id=eq.${open.ids[0]}`, {
    method: 'PATCH',
    headers: ANONH,
    body: JSON.stringify({ votes: 99999 }),
  })
  const now = (await exec(`select votes from public.poll_options where id='${open.ids[0]}';`))[0].votes
  check('**anon 은 집계를 직접 못 고친다**', now !== 99999, `HTTP ${r.status} · votes=${now}`)
}
{
  const r = await rest(`poll_votes?poll_id=eq.${open.id}&select=subject`, { headers: ANONH })
  const rows = r.ok ? await r.json() : []
  check('**anon 은 누가 뭘 찍었는지 못 읽는다**', rows.length === 0, `${rows.length}행`)
}

// ── 4. 게이트 ─────────────────────────────────────
{
  const r = await rpc('cast_vote', { target: SLUG, poll: hidden.id, options: [hidden.ids[0]], subj: 'g-1' })
  check('준비 중 설문엔 못 찍는다', !r.ok, `HTTP ${r.status}`)
}
{
  const r = await rpc('cast_vote', { target: SLUG, poll: closed.id, options: [closed.ids[0]], subj: 'g-2' })
  check('마감된 설문엔 못 찍는다', !r.ok, `HTTP ${r.status}`)
}
{
  const r = await rpc('cast_vote', { target: SLUG_TAROT, poll: open.id, options: [open.ids[0]], subj: 'g-3' })
  check('**다른 서비스 슬롯에 투표를 못 꽂는다**', !r.ok, `HTTP ${r.status}`)
}
{
  const r = await rpc('cast_vote', { target: SLUG, poll: open.id, options: [closed.ids[0]], subj: 'g-4' })
  check('남의 설문 선택지를 섞어 보낼 수 없다', !r.ok, `HTTP ${r.status}`)
}
{
  const r = await rpc('cast_vote', { target: SLUG, poll: open.id, options: [open.ids[0], open.ids[1]], subj: 'g-5' })
  check("'하나만' 설문에 두 개를 못 보낸다", !r.ok, `HTTP ${r.status}`)
}

// ── 5. 방문자가 읽는 것 ───────────────────────────
{
  const r = await rest(`poll_polls?slug=eq.${SLUG}&select=id,title,hidden`, { headers: ANONH })
  const rows = r.ok ? await r.json() : []
  check('방문자는 준비 중 설문을 못 본다', rows.length === 2 && rows.every((x) => !x.hidden), `${rows.length}개`)
}
{
  const r = await rpc('poll_mine', { target: SLUG, subj: 'v-1' })
  const rows = r.ok ? await r.json() : []
  // 여러 개 고르기 설문에서는 한 사람이 여러 행을 갖는 게 정상이라 "몇 행" 이 아니라
  // **다 내 것인가**(= 남의 표가 안 섞였나)를 본다
  const mineOnly = rows.length > 0 && rows.every((x) => x.poll_id === open.id)
  check('내가 찍은 것만 돌려준다 (남의 표가 안 섞인다)', mineOnly, `${rows.length}행`)
}

// ── 6. 레이트리밋 ─────────────────────────────────
{
  // 창(60초) 안에서 subject 당 20회 — 새 subject 로 21번 만들어 부딪혀 본다
  let blocked = false
  for (let i = 0; i < 26 && !blocked; i++) {
    const p = await mkPoll(`부하 ${i}`, ['가'])
    const r = await rpc('cast_vote', { target: SLUG, poll: p.id, options: [p.ids[0]], subj: 'flood' })
    if (!r.ok && (await r.text()).includes('잠시')) blocked = true
  }
  check('레이트리밋이 걸린다 (subject 당 분당 20회)', blocked)
}

// ── 7. 정리 ───────────────────────────────────────
await cleanup()
{
  const n = (await exec(`select count(*)::int n from public.poll_polls where slug='${SLUG}';`))[0].n
  check('슬롯을 지우면 설문도 같이 지워진다 (cascade)', n === 0, `${n}행 남음`)
}

console.log(failed === 0 ? '\n전부 통과' : `\n${failed}개 실패`)
process.exit(failed === 0 ? 0 : 1)
