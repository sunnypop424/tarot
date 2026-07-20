/**
 * 럭키드로우 검증 — **추첨 RPC 와 격리를 실제 DB 에 대고 돌린다.**
 *
 *   node scripts/verify-luckydraw.mjs
 *
 * 여기서 보는 건 "화면이 뜨나" 가 아니라 **"약속이 지켜지나"** 다:
 *  - 적은 수량만큼 항상 뽑힌다 (그 위에 현장 운영이 서 있다)
 *  - 리허설은 재고를 안 깎는다
 *  - 마감·재고초과는 서버가 막는다 (화면을 믿지 않는다)
 *  - 묶음 제한이 실제로 억제한다
 *  - **배송 정보는 anon 이 못 읽는다** — 뚫리면 당첨자 전원의 이름·연락처·주소가 샌다
 *
 * 이 스크립트는 실제 DB 에 슬롯을 만들었다 지운다. 중간에 죽으면 `luckydraw-verify` 가
 * 남으므로 시작할 때 먼저 지운다 (verify-owner.mjs 와 같은 이유).
 */

import { readFileSync } from 'node:fs'

const env = {}
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim())
  if (m) env[m[1]] = m[2]
}

const URL_ = env.VITE_SUPABASE_URL
const ANON = env.VITE_SUPABASE_ANON_KEY
const OWNER_EMAIL = 'owner@example.com'
const OWNER_PASSWORD = env.SEED_PASSWORD ?? 'tarot1234'
const SLUG = 'luckydraw-verify'

if (!URL_ || !ANON) {
  console.error('.env.local 에 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 가 없어요')
  process.exit(1)
}

let failed = 0
const check = (name, ok, detail = '') => {
  if (!ok) failed++
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

// ── 인증 ──────────────────────────────────────────
const auth = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: ANON, 'content-type': 'application/json' },
  body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASSWORD }),
})
if (!auth.ok) {
  console.error(`최고관리자 로그인 실패 — supabase/seed.sql 의 씨앗 계정과 SEED_PASSWORD 를 확인하세요`)
  process.exit(1)
}
const { access_token } = await auth.json()
const OWNER = { apikey: ANON, authorization: `Bearer ${access_token}`, 'content-type': 'application/json' }
const ANONH = { apikey: ANON, 'content-type': 'application/json' }

const rest = (path, init = {}) => fetch(`${URL_}/rest/v1/${path}`, init)
const rpc = (name, body, headers = OWNER) =>
  rest(`rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(body) })

async function cleanup() {
  await rest(`slots?slug=eq.${SLUG}`, { method: 'DELETE', headers: OWNER })
}

await cleanup()

// ── 준비 ──────────────────────────────────────────
const made = await rest('slots', {
  method: 'POST',
  headers: { ...OWNER, prefer: 'return=minimal' },
  body: JSON.stringify({
    slug: SLUG,
    name: '럭키드로우 검증',
    service: 'luckydraw',
    // 기간을 안 정하면 제한 없음 = 늘 열림 (0005)
    period: {},
    theme: { colors: {}, shape: {}, assets: {} },
    event: {},
  }),
})
check('슬롯을 만든다', made.ok, made.ok ? '' : await made.text())
if (!made.ok) process.exit(1)

/** 1등 5개 · 2등 20개 · 3등 100개 — 총 125개 */
const PRIZES = [
  { slug: SLUG, rank: 1, name: '1등 상품', remaining: 5, requires_shipping: true },
  { slug: SLUG, rank: 2, name: '2등 상품', remaining: 20, requires_shipping: false },
  { slug: SLUG, rank: 3, name: '3등 상품', remaining: 100, requires_shipping: false },
]
const seeded = await rest('prizes', {
  method: 'POST',
  headers: { ...OWNER, prefer: 'return=representation' },
  body: JSON.stringify(PRIZES),
})
const prizeRows = seeded.ok ? await seeded.json() : []
check('상품을 넣는다', seeded.ok && prizeRows.length === 3, seeded.ok ? '' : await seeded.text())

const setSettings = (patch) =>
  rest('luckydraw_settings', {
    method: 'POST',
    headers: { ...OWNER, prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ slug: SLUG, ...patch }),
  })

// ── 1. 리허설은 재고를 안 깎는다 ──────────────────
await setSettings({ rehearsal: true, closed: false, batch_cap_enabled: false })
{
  const res = await rpc('draw_prizes', { target: SLUG, draw_count: 10 })
  const body = res.ok ? await res.json() : null
  const total = body?.prizes?.reduce((s, p) => s + p.remaining, 0)
  check('리허설: 10개가 뽑힌다', body?.results?.length === 10, res.ok ? '' : await res.text())
  check('리허설: 재고가 그대로다 (125)', total === 125, `실제 ${total}`)
}

// ── 2. 실운영은 정확히 깎는다 ─────────────────────
await setSettings({ rehearsal: false })
{
  const res = await rpc('draw_prizes', { target: SLUG, draw_count: 7 })
  const body = res.ok ? await res.json() : null
  const total = body?.prizes?.reduce((s, p) => s + p.remaining, 0)
  check('실운영: 7개가 뽑힌다', body?.results?.length === 7)
  check('실운영: 재고가 정확히 7 줄었다 (118)', total === 118, `실제 ${total}`)
}

// ── 3. 재고보다 많이 요청하면 거부 ────────────────
{
  const res = await rpc('draw_prizes', { target: SLUG, draw_count: 999 })
  check('재고 초과 요청을 서버가 막는다', !res.ok, `HTTP ${res.status}`)
}

// ── 4. 마감이면 거부 ──────────────────────────────
await setSettings({ closed: true })
{
  const res = await rpc('draw_prizes', { target: SLUG, draw_count: 1 })
  check('마감이면 서버가 막는다', !res.ok, `HTTP ${res.status}`)
}
await setSettings({ closed: false })

// ── 5. 묶음 제한이 실제로 억제한다 ────────────────
//
// 3등(재고 대부분)에 0.5 를 걸고 10개씩 뽑으면 ceil(10×0.5)=5 개를 넘으면 안 된다.
// 제한이 없으면 재고 비례로 8~9개가 예사로 나온다.
await setSettings({ batch_cap_enabled: true, rehearsal: true })
{
  const third = prizeRows.find((p) => p.rank === 3)
  await rest(`prizes?id=eq.${third.id}`, {
    method: 'PATCH',
    headers: OWNER,
    body: JSON.stringify({ batch_cap_ratio: 0.5 }),
  })

  let worst = 0
  for (let i = 0; i < 12; i++) {
    const res = await rpc('draw_prizes', { target: SLUG, draw_count: 10 })
    const body = await res.json()
    worst = Math.max(worst, body.results.filter((r) => r.rank === 3).length)
  }
  check('묶음 제한 on: 10개 중 3등이 5개 이하', worst <= 5, `실측 최대 ${worst}`)

  // 끄면 예전 그대로여야 한다 (제한이 슬그머니 남으면 안 된다)
  await setSettings({ batch_cap_enabled: false })
  let free = 0
  for (let i = 0; i < 12; i++) {
    const res = await rpc('draw_prizes', { target: SLUG, draw_count: 10 })
    const body = await res.json()
    free = Math.max(free, body.results.filter((r) => r.rank === 3).length)
  }
  check('묶음 제한 off: 제한 없이 나온다', free > 5, `실측 최대 ${free}`)
}

// ── 6. 리포트가 실제 소진을 센다 ──────────────────
{
  const res = await rpc('luckydraw_report', { target: SLUG })
  const rows = res.ok ? await res.json() : []
  const total = rows.reduce((s, r) => s + r.consumedTotal, 0)
  // 실제로 재고를 깎은 건 2번의 7개뿐 — 나머지는 전부 리허설이라 빠져야 한다
  check('리포트: 리허설을 뺀 소진만 센다 (7)', total === 7, `실제 ${total}`)
  const remaining = rows.reduce((s, r) => s + r.remaining, 0)
  check('리포트: 남은 수량이 맞다 (118)', remaining === 118, `실제 ${remaining}`)
}

// ── 7. 격리 ───────────────────────────────────────
{
  const res = await rest(`prizes?slug=eq.${SLUG}&select=name`, { headers: ANONH })
  const rows = res.ok ? await res.json() : []
  check('방문자가 상품을 읽는다 (배지·마감 표시에 필요)', rows.length === 3, `${rows.length}행`)
}
{
  /**
   * **상태코드까지 본다.** 400 이면 "함수는 돌았고 안에서 막혔다" 는 뜻이고,
   * 401/403 이라야 "부르지도 못했다" 는 뜻이다. 처음엔 400 이었고, 그걸 단서로
   * `expired_slots` 가 anon 에게 통째로 열려 있는 걸 찾았다 (0010).
   * 안쪽 검사만 믿으면 다음에 검사 없는 함수가 추가될 때 그대로 샌다.
   */
  const res = await rpc('draw_prizes', { target: SLUG, draw_count: 1 }, ANONH)
  check('방문자는 추첨을 부르지도 못한다', res.status === 401 || res.status === 403, `HTTP ${res.status}`)
}
{
  // 만료 목록엔 함수 안 권한 검사가 없다 — grant 가 뚫리면 남의 이벤트가 그대로 샌다
  const res = await rpc('expired_slots', {}, ANONH)
  check(
    '방문자는 만료 슬롯 목록을 못 본다',
    res.status === 401 || res.status === 403,
    `HTTP ${res.status}${res.ok ? ' — 목록이 샌다' : ''}`
  )
}
{
  // 방문자가 배송 정보를 넣는다 (당첨 직후 자기 손으로)
  const put = await rest('shipping_entries', {
    method: 'POST',
    headers: ANONH,
    body: JSON.stringify({
      slug: SLUG,
      name: '홍길동',
      phone: '010-0000-0000',
      address: '서울시 어딘가',
      prizes: [{ rank: 1, name: '1등 상품', count: 1 }],
    }),
  })
  check('방문자가 배송 정보를 넣는다', put.ok, put.ok ? '' : await put.text())

  // **여기가 이 스크립트에서 제일 중요한 줄이다.**
  const read = await rest(`shipping_entries?slug=eq.${SLUG}&select=name,phone`, { headers: ANONH })
  const leaked = read.ok ? await read.json() : []
  check('방문자는 배송 정보를 못 읽는다 (PII)', leaked.length === 0, `${leaked.length}행이 샜다`)

  const mine = await rest(`shipping_entries?slug=eq.${SLUG}&select=name`, { headers: OWNER })
  check('최고관리자는 배송 정보를 읽는다', mine.ok && (await mine.json()).length === 1)
}

// ── 8. 정리 ───────────────────────────────────────
await cleanup()
{
  const left = await rest(`slots?slug=eq.${SLUG}&select=slug`, { headers: OWNER })
  const rows = left.ok ? await left.json() : []
  check('검증이 남긴 게 없다', rows.length === 0, `${rows.length}행 남음`)
}

console.log(failed === 0 ? '\n전부 통과' : `\n${failed}개 실패`)
process.exit(failed === 0 ? 0 : 1)
