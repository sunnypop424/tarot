/**
 * 체험 슬롯의 관리 화면 개방(0034)과 매일 초기화(0035)를 **실제로 찔러** 확인한다.
 *
 *   node scripts/verify-demo-admin.mjs
 *
 * 여기서 보는 건 대부분 **"안 되는 것"** 이다. `manages_slot()` 은 47곳이 부르는 판정의
 * 단일 창구라, 여기를 열면서 체험이 아닌 슬롯까지 열리면 **모든 고객 슬롯이 공개된다.**
 * 그래서 "열렸다" 보다 "안 열렸다" 를 더 많이 찌른다.
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

let fail = 0
const check = (label, cond, extra = '') => {
  if (!cond) fail++
  console.log(`  ${cond ? '✓' : '✗'} ${label}${extra ? ` — ${extra}` : ''}`)
}

/** 로그인 안 한 방문자 그대로 (anon 키만) */
const anon = (path, init = {}) =>
  fetch(`${URL_}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: KEY, 'content-type': 'application/json', ...(init.headers ?? {}) },
  })
const rpc = (fn, body) =>
  anon(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(body ?? {}) })

// ── 대상 찾기 ─────────────────────────────────────
const slots = await (await anon('slots?select=slug,demo,group_name&limit=200')).json()
const demo = slots.find((s) => s.demo)
const real = slots.find((s) => !s.demo)
if (!demo) {
  console.error('체험 슬롯이 없습니다 — node scripts/seed-demo.mjs 먼저')
  process.exit(1)
}
console.log(`체험: ${demo.slug} (묶음 ${demo.group_name ?? '없음'}) · 비교용 고객 슬롯: ${real?.slug ?? '없음'}`)

// ── 1. 체험 슬롯은 로그인 없이 관리 데이터가 보인다 ──
console.log('\n[1] 체험 슬롯이 열렸다')
{
  const r = await anon(`prizes?slug=eq.${demo.slug}&select=id&limit=1`)
  check('anon 이 상품 표를 읽는다', r.ok, `HTTP ${r.status}`)
  const q = await rpc('manages_slot', { target: demo.slug })
  check('manages_slot 이 true', (await q.json()) === true)
}

// ── 2. **고객 슬롯은 그대로 막혀 있다** ──────────────
console.log('\n[2] 고객 슬롯은 안 열렸다 (여기가 무너지면 전부 무너진다)')
if (real) {
  const q = await rpc('manages_slot', { target: real.slug })
  check('manages_slot 이 false', (await q.json()) === false, real.slug)
  const s = await rpc('manages_slot_strict', { target: demo.slug })
  check('엄격판은 체험 슬롯에도 false', (await s.json()) === false)
  const w = await anon(`prizes`, {
    method: 'POST',
    body: JSON.stringify({ slug: real.slug, rank: 99, name: '침입', remaining: 1 }),
  })
  check('anon 이 고객 슬롯에 상품을 못 넣는다', !w.ok, `HTTP ${w.status}`)
} else {
  console.log('  (비교할 고객 슬롯이 없어 건너뜀)')
}

// ── 3. 개인정보는 체험에서도 안 열린다 ──────────────
console.log('\n[3] 개인정보는 체험에서도 닫혀 있다')
{
  const e = await anon(`reward_entries?slug=eq.${demo.slug}&select=id&limit=1`)
  const rows = e.ok ? await e.json() : null
  check('응모자 명단이 안 읽힌다', !e.ok || rows.length === 0, `HTTP ${e.status}`)
  const s = await anon(`shipping_entries?slug=eq.${demo.slug}&select=id&limit=1`)
  const srows = s.ok ? await s.json() : null
  check('배송 명단이 안 읽힌다', !s.ok || srows.length === 0, `HTTP ${s.status}`)
}

// ── 4. 기준 뜨기는 최고관리자만 ────────────────────
console.log('\n[4] 기준 뜨기·되돌리기 권한')
{
  const a = await rpc('snapshot_demo', { grp: demo.group_name })
  check('anon 은 기준을 못 뜬다', !a.ok, `HTTP ${a.status}`)
  const b = await rpc('reset_demo', { grp: demo.group_name })
  check('anon 은 되돌리지 못한다', !b.ok, `HTTP ${b.status}`)
}

// ── 5. 뜨고 → 망가뜨리고 → 되돌아오나 ───────────────
console.log('\n[5] 기준 → 훼손 → 되돌리기 (최고관리자로)')
{
  const auth = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'owner@example.com',
      password: env.SEED_PASSWORD ?? 'tarot1234',
    }),
  })
  const { access_token } = await auth.json()
  if (!access_token) {
    console.log('  (최고관리자 로그인 실패 — 건너뜀)')
  } else {
    const H = { apikey: KEY, Authorization: `Bearer ${access_token}`, 'content-type': 'application/json' }
    const owner = (path, init = {}) =>
      fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers ?? {}) } })

    /**
     * **비어 있는 상태를 기준으로 뜨면 안 된다.** 이 검사가 그걸 실제로 겪었다 —
     * 앞선 실행이 쪽지를 지운 채 끝났고, 다음 실행이 그 빈 상태를 기준으로 떠서
     * "되돌려도 0장" 이 됐다. 기준 뜨기는 **되돌릴 수 없는 덮어쓰기**라 여기서 멈춘다.
     */
    const seeded = await (await anon(`rolling_messages?slug=eq.demo-rolling&select=id`)).json()
    if (!seeded.length) {
      console.log('  ✗ 체험 데이터가 비어 있어요 — `node scripts/seed-demo.mjs` 로 채우고 다시 도세요')
      console.log('    (빈 상태로 기준을 뜨면 그게 매시간 돌아올 모습이 됩니다)')
      process.exit(1)
    }

    const snap = await owner('rpc/snapshot_demo', {
      method: 'POST',
      body: JSON.stringify({ grp: demo.group_name }),
    })
    const taken = snap.ok ? await snap.json() : []
    check('기준을 떴다', snap.ok && taken.length > 0, `${taken.length}개 표`)

    // 아무나 할 수 있는 훼손을 흉내 낸다 — anon 으로 쪽지를 지운다
    const before = await (await anon(`rolling_messages?slug=eq.demo-rolling&select=id`)).json()
    await anon(`rolling_messages?slug=eq.demo-rolling`, { method: 'DELETE' })
    const wrecked = await (await anon(`rolling_messages?slug=eq.demo-rolling&select=id`)).json()

    const back = await owner('rpc/reset_demo', {
      method: 'POST',
      body: JSON.stringify({ grp: demo.group_name }),
    })
    check('되돌리기가 돌았다', back.ok, `HTTP ${back.status}`)
    const after = await (await anon(`rolling_messages?slug=eq.demo-rolling&select=id`)).json()
    check(
      '지워진 쪽지가 되살아났다',
      after.length === before.length && before.length > 0,
      `${before.length} → ${wrecked.length} → ${after.length}`
    )

    // 이미지는 건드리지 않는다 — slots 행이 그대로인지
    const s1 = await (await anon(`slots?slug=eq.${demo.slug}&select=theme`)).json()
    check('되돌린 뒤에도 테마·이미지가 그대로다', Boolean(s1[0]?.theme))
  }
}

// ── 6. 스태프 RPC 가 실제로 눌린다 (0038) ──────────
//
// **GRANT 와 함수 안 판정은 다른 겹이다.** 0034 는 판정만 열었고 anon 은 GRANT 에서
// 걸려 판정까지 가지도 못했다 — 화면의 버튼은 멀쩡히 켜져 있어서 눌러보기 전엔 몰랐다.
console.log('\n[6] 스태프 RPC — 체험은 되고 고객 슬롯은 안 된다')
{
  const d = await rpc('draw_prizes', { target: 'demo-luckydraw', draw_count: 1 })
  check('체험 슬롯에서 뽑기가 된다', d.ok, `HTTP ${d.status}`)
  if (real) {
    const x = await rpc('draw_prizes', { target: real.slug, draw_count: 1 })
    check('고객 슬롯에서는 거절된다', !x.ok, `HTTP ${x.status}`)
  }
  const q = await rpc('quiz_regrade', { target: 'demo-quiz' })
  check('체험 재채점이 된다', q.ok, `HTTP ${q.status}`)
}

console.log(fail ? `\n실패 ${fail}건 (위 결과 포함)` : '\n6번까지 전부 통과')
process.exit(fail ? 1 : 0)
