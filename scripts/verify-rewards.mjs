/**
 * 공용 보상·교환·추첨 검증 — **스탬프·모의고사·포토카드가 이 계약 위에 선다.**
 *
 *   node scripts/verify-rewards.mjs
 *
 * 여기서 보는 건 대부분 **"안 되는 것"** 이다. 이 레이어가 새면 세 서비스가 같이 샌다:
 *  - anon 이 `reward_claim` 을 직접 못 부른다 (부르면 아무 보상이나 만든다)
 *  - anon 이 `reward_redeem` 을 못 부른다 (부르면 자기 코드를 스스로 수령완료 처리한다
 *    → 중복 수령을 막는 게 이 게이트 하나뿐이라, 뚫리면 스태프 화면이 무의미해진다)
 *  - anon 이 `reward_entries`(닉네임·연락처·주소)를 못 읽는다
 *  - 같은 조건으로 두 번 발급해도 코드가 하나다 (period_key unique)
 *  - 응모를 안 낸 사람은 추첨 후보에 안 들어간다
 *  - 이미 당첨된 사람은 추가 추첨에 다시 안 뽑힌다 / `unpick` 하면 후보로 돌아온다
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
const SLUG = 'rewards-verify'

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
const rpc = (fn, body, headers) =>
  rest(`rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(body) })

const q = (s) => s.replace(/'/g, "''")
const cleanup = () => exec(`delete from public.slots where slug = '${SLUG}';`)
await cleanup()

await exec(`insert into public.slots(slug, name, service, theme, event)
  values ('${SLUG}', '보상 검증', 'stamp', '{"colors":{},"shape":{},"assets":{}}', '{}');`)

// ── 1. 발급 ───────────────────────────────────────
const claim = async (subj, pkey, kind, score = null) =>
  (await exec(
    `select code, kind from public.reward_claim('${SLUG}','stamp','${q(subj)}','${q(pkey)}',null,'선물 1개','${kind}',${score ?? 'null'});`
  ))[0]

const a1 = await claim('subj-a', 'once', 'guaranteed')
check('확정 보상을 발급한다', !!a1?.code, a1?.code)
const a2 = await claim('subj-a', 'once', 'guaranteed')
check('같은 조건으로 또 불러도 코드가 하나다 (period_key unique)', a1.code === a2.code, `${a1.code} / ${a2.code}`)

check(
  '코드에 혼동 문자(I·L·O·U)가 없다',
  !/[ILOU]/.test(a1.code),
  a1.code
)

// ── 2. anon 권한 ──────────────────────────────────
{
  const r = await rpc('reward_claim', { target: SLUG, src: 'stamp', subj: 'hacker', pkey: 'once', ref_id: null, lbl: 'x', k: 'guaranteed' }, ANONH)
  check('**anon 은 reward_claim 을 못 부른다**', !r.ok, `HTTP ${r.status}${r.ok ? ' — 아무 보상이나 만들 수 있다!' : ''}`)
}
{
  const r = await rpc('reward_redeem', { target: SLUG, raw_code: a1.code }, ANONH)
  check('**anon 은 reward_redeem 을 못 부른다**', !r.ok, `HTTP ${r.status}${r.ok ? ' — 스스로 수령완료 처리 가능!' : ''}`)
}
{
  const r = await rest(`reward_entries?slug=eq.${SLUG}&select=nickname,contact,address`, { headers: ANONH })
  const rows = r.ok ? await r.json() : []
  check('**anon 은 응모 정보를 못 읽는다** (연락처·주소)', rows.length === 0, `${rows.length}행`)
}
{
  const r = await rpc('reward_pick', { target: SLUG, src: 'stamp', cnt: 1, method: 'random' }, ANONH)
  check('anon 은 추첨을 못 돌린다', !r.ok, `HTTP ${r.status}`)
}

// ── 3. 내 보상 조회 (anon 가능, 단 응모 정보는 안 준다) ─
{
  const r = await rpc('reward_mine', { target: SLUG, src: 'stamp', subj: 'subj-a' }, ANONH)
  const rows = r.ok ? await r.json() : []
  check('방문자가 자기 보상을 본다', rows.length === 1 && rows[0].code === a1.code, JSON.stringify(rows[0] ?? {}))
  check(
    '내 보상에 개인정보 필드가 없다',
    rows[0] && !('nickname' in rows[0]) && !('address' in rows[0]),
    Object.keys(rows[0] ?? {}).join(',')
  )
}

// ── 4. 수령 확인 (스태프) ─────────────────────────
{
  const r = await rpc('reward_redeem', { target: SLUG, raw_code: a1.code.toLowerCase().replace('-', ' ') }, OWNER)
  const row = r.ok ? (await r.json())[0] : null
  check('스태프가 수령 처리한다 (소문자·공백도 받는다)', !!row?.ok && row.already === false, JSON.stringify(row))

  const again = await rpc('reward_redeem', { target: SLUG, raw_code: a1.code }, OWNER)
  const row2 = again.ok ? (await again.json())[0] : null
  check('**두 번째는 "이미 수령" 으로 온다** (중복 수령 차단)', !!row2?.already, JSON.stringify(row2))
}

// ── 5. 응모와 추첨 ────────────────────────────────
const entrants = ['e1', 'e2', 'e3', 'e4']
const codes = {}
for (const [i, s] of entrants.entries()) {
  codes[s] = (await claim(s, 'once', 'raffle', 60 + i * 10)).code
}
// e4 만 응모를 안 낸다
for (const s of entrants.slice(0, 3)) {
  const r = await rpc('reward_enter', { target: SLUG, raw_code: codes[s], nick: `닉_${s}`, tw: `@${s}` }, ANONH)
  if (!r.ok) check(`${s} 응모`, false, `HTTP ${r.status} ${await r.text()}`)
}
{
  const n = (await exec(`select count(*)::int as n from public.reward_entries where slug='${SLUG}';`))[0].n
  check('응모가 저장된다', n === 3, `${n}명`)
}
{
  const r = await rpc('reward_pick', { target: SLUG, src: 'stamp', cnt: 2, method: 'random' }, OWNER)
  const rows = r.ok ? await r.json() : []
  check('랜덤 2명을 뽑는다', rows.length === 2, `${rows.length}명`)
  check(
    '**응모 안 낸 사람은 후보가 아니다**',
    !rows.some((x) => x.subject === 'e4'),
    rows.map((x) => x.subject).join(',')
  )
}
{
  const r = await rpc('reward_pick', { target: SLUG, src: 'stamp', cnt: 2, method: 'random' }, OWNER)
  const rows = r.ok ? await r.json() : []
  check('**이미 당첨된 사람은 다시 안 뽑힌다** (남은 1명만)', rows.length === 1, `${rows.length}명`)
}
{
  const r = await rpc('reward_unpick', { target: SLUG, src: 'stamp', rnd: 2 }, OWNER)
  const n = r.ok ? await r.json() : -1
  const back = (await exec(`select count(*)::int as n from public.rewards where slug='${SLUG}' and kind='raffle' and won=false and subject <> 'e4';`))[0].n
  check('되돌리면 후보로 돌아온다', n === 1 && back === 1, `취소 ${n}명 · 후보 ${back}명`)
}
{
  // 점수순 — 동점이 없을 때는 점수 높은 순이어야 한다
  await exec(`update public.rewards set won=false, picked_round=null where slug='${SLUG}' and kind='raffle';`)
  const r = await rpc('reward_pick', { target: SLUG, src: 'stamp', cnt: 1, method: 'score' }, OWNER)
  const rows = r.ok ? await r.json() : []
  check('점수순으로 뽑으면 최고점이 뽑힌다', rows[0]?.score === 80, `score=${rows[0]?.score}`)
}

// ── 6. 정리 ───────────────────────────────────────
await cleanup()
{
  const n = (await exec(`select count(*)::int as n from public.rewards where slug='${SLUG}';`))[0].n
  check('슬롯을 지우면 보상도 같이 지워진다 (cascade)', n === 0, `${n}행 남음`)
}

console.log(failed === 0 ? '\n전부 통과' : `\n${failed}개 실패`)
process.exit(failed === 0 ? 0 : 1)
