/**
 * 방문 스탬프 검증 — **anon 이 직접 쓰는 서비스라 "안 되는 것" 이 계약이다.**
 *
 *   node scripts/verify-stamp.mjs
 *
 * 보는 것:
 *  - **`stamp_codes` 가 anon 에게 안 읽힌다** — 읽히면 이벤트가 그 자리에서 끝난다
 *  - 틀린 코드 거부 · 같은 칸 두 번 안 찍힘
 *  - **브루트포스가 레이트리밋에 걸린다** (4자리 코드는 무제한 시도로 뚫린다)
 *  - **`day` 경계** — 어제 찍은 행이 `dailyReset` 켬에서는 오늘 판에 안 뜨고, 끔에서는 뜬다
 *  - **끔에서 같은 칸을 이틀 찍어도 `count(distinct)` 라 한 칸으로 잡힌다**
 *    (`count(*)` 로 세면 한 칸을 이틀 찍은 사람이 두 칸으로 잡혀 판이 저절로 완성된다)
 *  - 완성하면 **같은 트랜잭션에서** 보상이 발급되고, 동시 완성 2발에도 코드가 하나만 나온다
 *  - 마감·다른 서비스 슬롯 거부
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
const SLUG = 'stamp-verify'
const SLUG_TAROT = 'stamp-verify-tarot'

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

const cleanup = async () => {
  await exec(`delete from public.slots where slug in ('${SLUG}','${SLUG_TAROT}');`)
  await exec(`delete from public.rate_events where slug in ('${SLUG}','${SLUG_TAROT}');`)
}
await cleanup()

// 칸 3개 — slots.stamp 는 최고관리자가 편집기에서 넣는 값이라 SQL 로 심는다
const CELLS = [
  { id: 'aaa', name: '1번' },
  { id: 'bbb', name: '2번' },
  { id: 'ccc', name: '3번' },
]
await exec(`insert into public.slots(slug,name,service,theme,event,stamp) values
  ('${SLUG}','스탬프 검증','stamp','{"colors":{},"shape":{},"assets":{}}','{}','${JSON.stringify({ stamps: CELLS })}'),
  ('${SLUG_TAROT}','타로 검증','tarot','{"colors":{},"shape":{},"assets":{}}','{}','{}');`)

await exec(`insert into public.stamp_codes(slug,stamp_id,code) values
  ('${SLUG}','aaa','AAAA'), ('${SLUG}','bbb','BBBB'), ('${SLUG}','ccc','CCCC');`)

const setSettings = (patch) =>
  exec(`insert into public.stamp_settings(slug, reward_mode, daily_reset, closed, entry_fields, reward_label)
        values ('${SLUG}', '${patch.rewardMode ?? 'none'}', ${patch.dailyReset ?? false}, ${patch.closed ?? false},
                '${JSON.stringify(patch.entryFields ?? { handle: true, contact: false, address: false })}',
                '${patch.rewardLabel ?? '선물'}')
        on conflict (slug) do update set reward_mode = excluded.reward_mode,
          daily_reset = excluded.daily_reset, closed = excluded.closed,
          entry_fields = excluded.entry_fields, reward_label = excluded.reward_label;`)

await setSettings({})

// ── 1. 코드는 서버에만 있다 ───────────────────────
{
  const r = await rest(`stamp_codes?slug=eq.${SLUG}&select=stamp_id,code`, { headers: ANONH })
  const rows = r.ok ? await r.json() : []
  check('**anon 은 현장 암호를 못 읽는다**', rows.length === 0, `HTTP ${r.status} · ${rows.length}행`)
}
{
  const r = await rest(`stamp_checkins?slug=eq.${SLUG}&select=subject`, { headers: ANONH })
  const rows = r.ok ? await r.json() : []
  check('anon 은 체크인 원장을 못 읽는다', rows.length === 0, `${rows.length}행`)
}

// ── 2. 기본 체크인 ────────────────────────────────
{
  const r = await rpc('stamp_checkin', { target: SLUG, subj: 's-1', raw_code: 'AAAA' })
  const d = r.ok ? await r.json() : null
  check('맞는 암호로 도장이 찍힌다', d?.stampId === 'aaa' && d?.got === 1, JSON.stringify(d))
}
{
  // 소문자·공백·하이픈은 서버가 정규화한다 — 현장에서 손으로 치는 값이라 이게 중요하다
  const r = await rpc('stamp_checkin', { target: SLUG, subj: 's-1', raw_code: ' bb-bb ' })
  const d = r.ok ? await r.json() : null
  check('소문자·하이픈·공백을 알아서 맞춘다', d?.stampId === 'bbb', JSON.stringify(d))
}
{
  // **거부는 예외가 아니라 ok:false 다** (0023) — 예외로 던지면 레이트리밋 카운터가 같이 되감긴다
  const r = await rpc('stamp_checkin', { target: SLUG, subj: 's-1', raw_code: 'AAAA' })
  const d = r.ok ? await r.json() : null
  check('같은 칸은 두 번 안 찍힌다', d?.ok === false, JSON.stringify(d))
}
{
  const r = await rpc('stamp_checkin', { target: SLUG, subj: 's-1', raw_code: 'ZZZZ' })
  const d = r.ok ? await r.json() : null
  check('틀린 암호는 거부한다', d?.ok === false, JSON.stringify(d))
}
{
  const r = await rpc('stamp_mine', { target: SLUG, subj: 's-1' })
  const d = r.ok ? await r.json() : null
  check('내 판을 돌려준다', d?.stampIds?.length === 2, JSON.stringify(d))
}

// ── 3. 브루트포스 ─────────────────────────────────
{
  // 실패 창(10분) 안에서 subject 당 8회 — 9번째부터 막혀야 한다
  let blocked = 0
  for (let i = 0; i < 14 && !blocked; i++) {
    const r = await rpc('stamp_checkin', { target: SLUG, subj: 'brute', raw_code: `X${i}Q7` })
    if (!r.ok && (await r.text()).includes('잠시')) blocked = i + 1
  }
  // 8회 제한이라 9번째에 막혀야 한다 — 훨씬 늦게 막히면 실패가 안 세어지고 있다는 뜻이다
  check('**브루트포스가 레이트리밋에 걸린다**', blocked > 0 && blocked <= 10, `${blocked}번째 시도에서 막힘`)
}

// ── 4. 날짜 경계 ──────────────────────────────────
//
// 어제 찍은 행을 손으로 심는다 (`day` 는 생성 컬럼이라 created_at 만 밀면 따라온다).
{
  await exec(`insert into public.stamp_checkins(slug,subject,stamp_id,created_at)
    values ('${SLUG}','day-1','aaa', now() - interval '1 day'),
           ('${SLUG}','day-1','bbb', now() - interval '1 day');`)

  await setSettings({ dailyReset: true })
  const r1 = await rpc('stamp_mine', { target: SLUG, subj: 'day-1' })
  const d1 = r1.ok ? await r1.json() : null
  check('**리셋 켬 — 어제 도장은 오늘 판에 안 뜬다**', d1?.stampIds?.length === 0, JSON.stringify(d1))

  await setSettings({ dailyReset: false })
  const r2 = await rpc('stamp_mine', { target: SLUG, subj: 'day-1' })
  const d2 = r2.ok ? await r2.json() : null
  check('리셋 끔 — 어제 도장이 그대로 남는다', d2?.stampIds?.length === 2, JSON.stringify(d2))
}
{
  // 같은 칸을 어제·오늘 찍은 사람. `count(*)` 로 세면 2칸으로 잡혀 판이 저절로 완성된다
  await exec(`insert into public.stamp_checkins(slug,subject,stamp_id,created_at)
    values ('${SLUG}','dup-1','aaa', now() - interval '2 day');`)
  const r = await rpc('stamp_checkin', { target: SLUG, subj: 'dup-1', raw_code: 'AAAA' })
  const d = r.ok ? await r.json() : null
  // 어제 찍은 칸을 오늘 또 찍으면 행은 늘지만 **칸 수는 그대로 1** 이어야 한다
  check('**같은 칸을 이틀 찍어도 한 칸으로 잡힌다** (count(distinct))', d?.got === 1, JSON.stringify(d))
}

// ── 5. 완성 → 보상 ────────────────────────────────
{
  await setSettings({ rewardMode: 'guaranteed', rewardLabel: '스페셜 엽서' })
  for (const c of ['AAAA', 'BBBB']) await rpc('stamp_checkin', { target: SLUG, subj: 'win-1', raw_code: c })
  const r = await rpc('stamp_checkin', { target: SLUG, subj: 'win-1', raw_code: 'CCCC' })
  const d = r.ok ? await r.json() : null
  check('다 모으면 완성이 뜬다', d?.complete === true, JSON.stringify(d))
  check('**같은 트랜잭션에서 교환코드가 발급된다**', !!d?.rewardCode, d?.rewardCode ?? '없음')

  const n = (await exec(`select count(*)::int n from public.rewards where slug='${SLUG}' and subject='win-1';`))[0].n
  check('보상은 정확히 하나다', n === 1, `${n}행`)
}
{
  // 마지막 도장을 동시에 두 번 — period_key unique 가 코드 하나만 남긴다
  for (const c of ['AAAA', 'BBBB']) await rpc('stamp_checkin', { target: SLUG, subj: 'race-1', raw_code: c })
  await Promise.all([
    rpc('stamp_checkin', { target: SLUG, subj: 'race-1', raw_code: 'CCCC' }),
    rpc('stamp_checkin', { target: SLUG, subj: 'race-1', raw_code: 'CCCC' }),
  ])
  const n = (await exec(`select count(*)::int n from public.rewards where slug='${SLUG}' and subject='race-1';`))[0].n
  check('**동시 완성 2발에도 코드가 하나만 발급된다**', n === 1, `${n}행`)
}
{
  const r = await rpc('reward_mine', { target: SLUG, src: 'stamp', subj: 'win-1' })
  const rows = r.ok ? await r.json() : []
  check('방문자가 자기 보상을 조회한다', rows.length === 1 && rows[0].label === '스페셜 엽서', JSON.stringify(rows))
}
{
  const code = (await exec(`select code from public.rewards where slug='${SLUG}' and subject='win-1';`))[0].code
  const r = await rpc('reward_redeem', { target: SLUG, raw_code: code })
  check('**anon 은 자기 코드를 스스로 수령처리 못 한다**', !r.ok, `HTTP ${r.status}`)

  const ok = await rpc('reward_redeem', { target: SLUG, raw_code: code }, OWNER)
  const d = ok.ok ? (await ok.json())[0] : null
  check('스태프는 수령처리한다', d?.ok === true && d?.already === false, JSON.stringify(d))

  const again = await rpc('reward_redeem', { target: SLUG, raw_code: code }, OWNER)
  const d2 = again.ok ? (await again.json())[0] : null
  check('**두 번째는 "이미 수령" 으로 막힌다**', d2?.already === true, JSON.stringify(d2))
}

// ── 6. 게이트 ─────────────────────────────────────
{
  const r = await rpc('stamp_checkin', { target: SLUG_TAROT, subj: 'g-1', raw_code: 'AAAA' })
  check('**다른 서비스 슬롯엔 도장을 못 찍는다**', !r.ok, `HTTP ${r.status}`)
}
{
  await setSettings({ rewardMode: 'guaranteed', closed: true })
  const r = await rpc('stamp_checkin', { target: SLUG, subj: 'g-2', raw_code: 'AAAA' })
  check('마감하면 도장을 못 찍는다', !r.ok, `HTTP ${r.status}`)
  await setSettings({ rewardMode: 'guaranteed', closed: false })
}
{
  const r = await rpc('reward_claim', {
    target: SLUG, src: 'stamp', subj: 'evil', pkey: 'once', ref: null,
    label: '1등 상품', kind: 'guaranteed', sc: null,
  })
  check('**anon 은 보상을 직접 만들 수 없다**', !r.ok, `HTTP ${r.status}`)
}

// ── 7. 응모 ───────────────────────────────────────
{
  await setSettings({ rewardMode: 'raffle', rewardLabel: '추첨 선물' })
  for (const c of ['AAAA', 'BBBB', 'CCCC']) await rpc('stamp_checkin', { target: SLUG, subj: 'raf-1', raw_code: c })
  const code = (await exec(`select code from public.rewards where slug='${SLUG}' and subject='raf-1';`))[0]?.code
  check('응모 모드에서도 보상 행이 생긴다', !!code, code ?? '없음')

  const r = await rpc('reward_enter', {
    target: SLUG, raw_code: code, nick: '리안팬', tw: '@rian', ct: null, addr: null,
  })
  check('응모를 낸다', r.ok, `HTTP ${r.status}`)

  const rows = await rest(`reward_entries?slug=eq.${SLUG}&select=nickname`, { headers: ANONH })
  const got = rows.ok ? await rows.json() : []
  check('**anon 은 응모자 명단을 못 읽는다** (연락처·주소)', got.length === 0, `${got.length}행`)

  const p = await rpc('reward_pick', { target: SLUG, src: 'stamp', cnt: 1, method: 'random' }, ANONH)
  check('**anon 은 추첨을 못 돌린다**', !p.ok, `HTTP ${p.status}`)

  const po = await rpc('reward_pick', { target: SLUG, src: 'stamp', cnt: 1, method: 'random' }, OWNER)
  const won = po.ok ? await po.json() : []
  check('주최자가 추첨한다', won.length === 1, `${won.length}명`)

  const again = await rpc('reward_pick', { target: SLUG, src: 'stamp', cnt: 1, method: 'random' }, OWNER)
  const won2 = again.ok ? await again.json() : []
  check('이미 당첨된 사람은 다시 안 뽑힌다', won2.length === 0, `${won2.length}명`)

  const un = await rpc('reward_unpick', { target: SLUG, src: 'stamp', rnd: won[0].picked_round }, OWNER)
  const n = un.ok ? await un.json() : 0
  check('되돌리면 후보로 복귀한다', n === 1, `${n}명`)
}

// ── 8. 정리 ───────────────────────────────────────
await cleanup()
{
  const n = (await exec(`select count(*)::int n from public.stamp_checkins where slug='${SLUG}';`))[0].n
  const m = (await exec(`select count(*)::int n from public.rewards where slug='${SLUG}';`))[0].n
  check('슬롯을 지우면 도장·보상도 같이 지워진다 (cascade)', n === 0 && m === 0, `도장 ${n} · 보상 ${m}`)
}

console.log(failed === 0 ? '\n전부 통과' : `\n${failed}개 실패`)
process.exit(failed === 0 ? 0 : 1)
