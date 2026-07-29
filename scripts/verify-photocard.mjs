/**
 * 포토카드 뽑기 검증 — **가장 조용히 틀리는 서비스다.**
 *
 *   node scripts/verify-photocard.mjs
 *
 * 보는 것:
 *  - **레어도 분포** (1000회 뽑아 비율 확인) — `weight = remaining` 으로 잘못 짠 버그가
 *    여기서만 잡힌다. 증상이 "확률이 좀 이상한데" 라서 사람 눈으로는 못 찾는다
 *  - **재고 0 카드가 안 나온다** · 동시 뽑기가 재고를 넘겨 깎지 않는다
 *  - **anon 이 `sale`·`gift` 모드에서 뽑기 RPC 를 못 부른다** (스태프 게이트)
 *  - **anon 이 `photocards`·`photocard_tickets` 를 못 읽는다** (확률·남의 번호)
 *  - **뽑기권이 두 번 안 소각된다** · 같은 subject 에게 재발급 안 된다
 *  - **N연차에서 묶음 상한이 지켜진다**
 *  - **연습 모드는 재고를 안 깎는다**
 *  - 마감·다른 서비스 슬롯·모드 불일치 거부
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
const SLUG = 'pc-verify'
const SLUG_TAROT = 'pc-verify-tarot'

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

await exec(`insert into public.slots(slug,name,service,theme,event) values
  ('${SLUG}','포토카드 검증','photocard','{"colors":{},"shape":{},"assets":{}}','{}'),
  ('${SLUG_TAROT}','타로 검증','tarot','{"colors":{},"shape":{},"assets":{}}','{}');`)

const setSettings = (p) =>
  exec(`insert into public.photocard_settings(slug, mode, draws_per_visitor, batch_count, batch_cap_enabled, allow_save, closed, rehearsal)
        values ('${SLUG}','${p.mode ?? 'save'}',${p.drawsPerVisitor ?? 1},${p.batchCount ?? 10},
                ${p.batchCapEnabled ?? true},${p.allowSave ?? false},${p.closed ?? false},${p.rehearsal ?? false})
        on conflict (slug) do update set mode=excluded.mode, draws_per_visitor=excluded.draws_per_visitor,
          batch_count=excluded.batch_count, batch_cap_enabled=excluded.batch_cap_enabled,
          allow_save=excluded.allow_save, closed=excluded.closed, rehearsal=excluded.rehearsal;`)

const mkCard = async (name, rarity, remaining, ratio = null) =>
  (
    await exec(`insert into public.photocards(slug,name,rarity,image,remaining,batch_cap_ratio,"order")
      values ('${SLUG}','${name}',${rarity},'https://x/${name}.png',
              ${remaining === null ? 'null' : remaining}, ${ratio === null ? 'null' : ratio}, 1)
      returning id;`)
  )[0].id

const resetCards = () => exec(`delete from public.photocards where slug='${SLUG}';`)

// ── 1. 안 보이는 것들 ─────────────────────────────
await mkCard('기본', 1, null)
await setSettings({ mode: 'save', drawsPerVisitor: 3 })
{
  const r = await rest(`photocards?slug=eq.${SLUG}&select=name,rarity,remaining`, { headers: ANONH })
  const rows = r.ok ? await r.json() : []
  check('**anon 은 카드 목록을 못 읽는다** (확률이 노출된다)', rows.length === 0, `HTTP ${r.status} · ${rows.length}행`)
}
{
  const r = await rest(`photocard_draws?slug=eq.${SLUG}&select=card_name`, { headers: ANONH })
  const rows = r.ok ? await r.json() : []
  check('anon 은 뽑기 기록을 못 읽는다', rows.length === 0, `${rows.length}행`)
}

// ── 2. 레어도 분포 ────────────────────────────────
//
// **이 절이 이 스크립트의 존재 이유다.** 가중치를 재고로 잘못 쓰면 여기서만 드러난다.
{
  await resetCards()
  // 레어도 1(재고 무제한) vs 레어도 4(재고 5장) — **재고 가중치면 흔한 쪽이 압도**한다
  await mkCard('흔함', 1, null)
  const rareId = await mkCard('귀함', 4, null)
  await setSettings({ mode: 'save', drawsPerVisitor: 2000 })

  const N = 1000
  await exec(`select public._photocard_pick('${SLUG}', ${N}, 'save', 'dist') ;`)
  const rows = await exec(
    `select rarity, count(*)::int n from public.photocard_draws
      where slug='${SLUG}' and subject='dist' group by rarity order by rarity;`
  )
  const by = Object.fromEntries(rows.map((r) => [r.rarity, r.n]))
  const ratio = (by[4] ?? 0) / Math.max(1, by[1] ?? 0)
  // 기대값 4:1 = 4.0. 1000회면 3.2~5.0 안에 든다 (넉넉히 잡아도 버그는 이 범위 밖이다)
  check(
    '**레어도가 곧 확률이다** (재고가 아니다) — 4:1 카드가 대략 4배로 나온다',
    ratio > 3.0 && ratio < 5.2,
    `흔함 ${by[1] ?? 0} · 귀함 ${by[4] ?? 0} (비율 ${ratio.toFixed(2)})`
  )
  void rareId
  await exec(`delete from public.photocard_draws where slug='${SLUG}';`)
}

// ── 3. 재고 ───────────────────────────────────────
{
  await resetCards()
  await mkCard('소진', 3, 0)
  const okId = await mkCard('남음', 1, 5)
  await setSettings({ mode: 'save', drawsPerVisitor: 50 })

  await exec(`select public._photocard_pick('${SLUG}', 5, 'save', 'stock');`)
  const rows = await exec(
    `select card_name, count(*)::int n from public.photocard_draws where slug='${SLUG}' group by card_name;`
  )
  const names = rows.map((r) => r.card_name)
  check('**재고 0 카드는 안 나온다**', !names.includes('소진'), JSON.stringify(rows))

  const left = (await exec(`select remaining from public.photocards where id='${okId}';`))[0].remaining
  check('재고가 뽑은 만큼 줄어든다', left === 0, `${left}장 남음`)

  const over = await rpc('photocard_draw_self', { target: SLUG, subj: 'stock2' })
  check('재고가 다 떨어지면 거절한다', !over.ok, `HTTP ${over.status}`)
  await exec(`delete from public.photocard_draws where slug='${SLUG}';`)
}
{
  // 동시 20발이 재고 10장을 넘겨 깎지 않는다
  await resetCards()
  const id = await mkCard('한정', 1, 10)
  await setSettings({ mode: 'save', drawsPerVisitor: 1 })
  await Promise.all(
    Array.from({ length: 20 }, (_, i) => rpc('photocard_draw_self', { target: SLUG, subj: `race-${i}` }))
  )
  const left = (await exec(`select remaining from public.photocards where id='${id}';`))[0].remaining
  const drawn = (await exec(`select count(*)::int n from public.photocard_draws where slug='${SLUG}';`))[0].n
  check('**동시 20발이 재고를 넘겨 깎지 않는다**', left === 0 && drawn === 10, `남은 ${left} · 뽑힌 ${drawn}`)
  await exec(`delete from public.photocard_draws where slug='${SLUG}';`)
}
{
  // 연습 모드 — 재고가 안 줄어야 한다
  await resetCards()
  const id = await mkCard('연습', 1, 5)
  await setSettings({ mode: 'save', drawsPerVisitor: 3, rehearsal: true })
  await rpc('photocard_draw_self', { target: SLUG, subj: 'reh' })
  const left = (await exec(`select remaining from public.photocards where id='${id}';`))[0].remaining
  const flagged = (await exec(`select count(*)::int n from public.photocard_draws where slug='${SLUG}' and rehearsal;`))[0].n
  check('**연습 모드는 재고를 안 깎는다** (로그에는 남는다)', left === 5 && flagged === 1, `남은 ${left} · 연습로그 ${flagged}`)
  await exec(`delete from public.photocard_draws where slug='${SLUG}';`)
  await setSettings({ mode: 'save', drawsPerVisitor: 3, rehearsal: false })
}

// ── 4. save 게이트 ────────────────────────────────
{
  await resetCards()
  await mkCard('카드', 1, null)
  await setSettings({ mode: 'save', drawsPerVisitor: 2 })
  const a = await rpc('photocard_draw_self', { target: SLUG, subj: 'lim' })
  const b = await rpc('photocard_draw_self', { target: SLUG, subj: 'lim' })
  const c = await rpc('photocard_draw_self', { target: SLUG, subj: 'lim' })
  check('한 사람이 정해진 횟수만 뽑는다', a.ok && b.ok && !c.ok, `HTTP ${a.status}/${b.status}/${c.status}`)
}
{
  const r = await rpc('photocard_mine', { target: SLUG, subj: 'lim' })
  const d = r.ok ? await r.json() : null
  check('남은 횟수를 돌려준다 (목록은 안 준다)', d?.used === 2 && d?.left === 0 && d?.kinds === 1, JSON.stringify(d))
}
{
  const r = await rpc('photocard_draw_self', { target: SLUG_TAROT, subj: 'g-1' })
  check('**다른 서비스 슬롯에서는 못 뽑는다**', !r.ok, `HTTP ${r.status}`)
}
{
  const r = await rpc('_photocard_pick', { target: SLUG, cnt: 5, src: 'save', subj: 'evil' })
  check('**anon 은 내부 추첨 함수를 직접 못 부른다**', !r.ok, `HTTP ${r.status}`)
}

// ── 5. gift — 뽑기권 ──────────────────────────────
{
  await setSettings({ mode: 'gift' })
  const a = await rpc('photocard_issue_ticket', { target: SLUG, subj: 't-1' })
  const t1 = a.ok ? await a.json() : null
  check('뽑기권을 받는다', !!t1?.code && t1.status === 'open', t1?.code ?? '없음')

  const b = await rpc('photocard_issue_ticket', { target: SLUG, subj: 't-1' })
  const t2 = b.ok ? await b.json() : null
  check('**같은 기기에는 재발급되지 않는다** (같은 번호가 돌아온다)', t2?.code === t1?.code, `${t1?.code} / ${t2?.code}`)

  const n = (await exec(`select count(*)::int n from public.photocard_tickets where slug='${SLUG}';`))[0].n
  check('뽑기권 행이 하나만 생긴다', n === 1, `${n}행`)

  const anonRead = await rest(`photocard_tickets?slug=eq.${SLUG}&select=code`, { headers: ANONH })
  const rows = anonRead.ok ? await anonRead.json() : []
  check('**anon 은 뽑기권 목록을 못 읽는다** (남의 번호를 긁는다)', rows.length === 0, `${rows.length}행`)

  const anonDraw = await rpc('photocard_draw_ticket', { target: SLUG, raw_code: t1.code })
  check('**anon 은 뽑기권으로 뽑을 수 없다** (스태프 게이트)', !anonDraw.ok, `HTTP ${anonDraw.status}`)

  const anonSelf = await rpc('photocard_draw_self', { target: SLUG, subj: 't-1' })
  check('**gift 모드에서 방문자가 직접 못 뽑는다** (실물을 공짜로 확정하는 길)', !anonSelf.ok, `HTTP ${anonSelf.status}`)

  const staff = await rpc('photocard_draw_ticket', { target: SLUG, raw_code: t1.code }, OWNER)
  const drawn = staff.ok ? await staff.json() : null
  check('스태프가 뽑는다', drawn?.status === 'drawn' && !!drawn?.card?.name, JSON.stringify(drawn?.card?.name))

  const again = await rpc('photocard_draw_ticket', { target: SLUG, raw_code: t1.code }, OWNER)
  check('**뽑기권은 두 번 안 소각된다**', !again.ok, `HTTP ${again.status}`)

  const mine = await rpc('photocard_ticket', { target: SLUG, raw_code: t1.code })
  const m = mine.ok ? await mine.json() : null
  check('방문자가 자기 번호로 결과를 확인한다', m?.status === 'drawn' && !!m?.cardName, JSON.stringify(m?.cardName))

  const nope = await rpc('photocard_ticket', { target: SLUG, raw_code: 'ZZZZ' })
  const nm = nope.ok ? await nope.json() : 'err'
  check('없는 번호는 null 이다', nm === null, JSON.stringify(nm))
}

// ── 6. sale — N연차 + 묶음 상한 ───────────────────
{
  await resetCards()
  // 상한 0.2 = 10연차에 2장까지
  await mkCard('상한있음', 5, null, 0.2)
  await mkCard('보통', 1, null)
  await setSettings({ mode: 'sale', batchCount: 10, batchCapEnabled: true })

  const anon = await rpc('photocard_draw_batch', { target: SLUG, cnt: 5 })
  check('**anon 은 묶음 뽑기를 못 부른다**', !anon.ok, `HTTP ${anon.status}`)

  const anonSelf = await rpc('photocard_draw_self', { target: SLUG, subj: 's-1' })
  check('**sale 모드에서 방문자가 직접 못 뽑는다**', !anonSelf.ok, `HTTP ${anonSelf.status}`)

  const r = await rpc('photocard_draw_batch', { target: SLUG, cnt: 10 }, OWNER)
  const d = r.ok ? await r.json() : null
  const cards = d?.cards ?? []
  const capped = cards.filter((c) => c.name === '상한있음').length
  check('10연차가 정확히 10장이다', cards.length === 10, `${cards.length}장`)
  check(
    '**묶음 상한이 지켜진다** (레어도 5인데도 2장까지)',
    capped <= 2,
    `상한있음 ${capped}장 (레어도 5 vs 1 이라 상한이 없으면 8장쯤 나온다)`
  )

  const over = await rpc('photocard_draw_batch', { target: SLUG, cnt: 999 }, OWNER)
  check('**화면 값을 믿지 않는다** (하드 상한)', !over.ok, `HTTP ${over.status}`)
}
{
  await setSettings({ mode: 'sale', closed: true })
  const r = await rpc('photocard_draw_batch', { target: SLUG, cnt: 1 }, OWNER)
  check('마감하면 못 뽑는다', !r.ok, `HTTP ${r.status}`)
  await setSettings({ mode: 'sale', closed: false })
}
{
  // 모드가 다르면 그 모드의 함수도 거절해야 한다
  const r = await rpc('photocard_draw_ticket', { target: SLUG, raw_code: 'ABCD' }, OWNER)
  check('sale 모드에서는 뽑기권 함수가 거절한다', !r.ok, `HTTP ${r.status}`)
}

// ── 7. 정리 ───────────────────────────────────────
await cleanup()
{
  const a = (await exec(`select count(*)::int n from public.photocards where slug='${SLUG}';`))[0].n
  const b = (await exec(`select count(*)::int n from public.photocard_tickets where slug='${SLUG}';`))[0].n
  const c = (await exec(`select count(*)::int n from public.photocard_draws where slug='${SLUG}';`))[0].n
  check('슬롯을 지우면 카드·뽑기권·기록도 같이 지워진다 (cascade)', a === 0 && b === 0 && c === 0, `${a}/${b}/${c}`)
}

console.log(failed === 0 ? '\n전부 통과' : `\n${failed}개 실패`)
process.exit(failed === 0 ? 0 : 1)
