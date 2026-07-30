/**
 * 롤링페이퍼 검증 — **공개 벽·후검수·기간 게이트를 실제 DB 에 대고 돌린다.**
 *
 *   node scripts/verify-rolling.mjs
 *   SERVICE=wish node scripts/verify-rolling.mjs    ← 소원나무도 같은 계약을 지키는지
 *
 * **소원나무(`wish`)는 이 테이블과 repo 를 그대로 쓴다** (`src/data/wish.ts`). 그래서 계약도
 * 같아야 하는데, 0013 의 정책들이 `slot_visible(s.period, s.service)` 로 **service 를 넘기기만**
 * 하고 값에 매여 있지 않다는 게 그 전제다. `SERVICE=wish` 로 한 번 더 돌려 그걸 실증한다 —
 * "같은 정책이 두 서비스에 다 걸린다" 는 주장을 코드리뷰가 아니라 DB 가 답하게 한다.
 *
 * 럭키드로우와 반대다: 스태프가 아니라 **anon 이 직접 쓴다.** 그래서 지켜야 할 약속도 반대다 —
 * 여기서 보는 건 "누가 못 뽑나" 가 아니라 **"누가 못 읽고 못 고치나"** 다:
 *  - 방문자는 열린 슬롯에 남기고, 숨김 아닌 메시지를 읽는다 (벽이 서 있는 최소 조건)
 *  - **숨긴 메시지는 방문자에게 절대 안 간다** (후검수의 전부 — 뚫리면 검수가 무의미하다)
 *  - 방문자는 남의 메시지를 못 고치고 못 지운다 (누구나 쓰는 벽이라 여기가 제일 위험하다)
 *  - **마감된 슬롯엔 못 남긴다** (기간이 지나면 쓰기가 닫힌다, 0005)
 *  - **유예 안에서는 읽히고, 유예가 지나면 안 읽힌다** (0009/0039)
 *
 * **유예가 모든 서비스 14일이다** (0039). 예전엔 롤페가 0 이라 마감 즉시 읽기·쓰기가 함께
 * 닫혔는데, 그러면 주최자가 부스를 접는 순간 쪽지 CSV 를 잃는다. 지금은 갈려 있다 —
 * **쓰기는 `slot_open`(행사 중), 읽기는 `slot_visible`(행사 + 14일).** 이 갈림이 이 서비스의
 * 계약이라 §7~9 가 세 상태(열림·유예 중·유예 지남)를 전부 찔러 본다.
 *
 * 이 스크립트는 실제 DB 에 슬롯 둘(열림·마감)을 만들었다 지운다. 중간에 죽으면 두 슬러그가
 * 남으므로 시작할 때 먼저 지운다 (verify-luckydraw.mjs 와 같은 이유 — 상설 시드 슬롯은 없다).
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
/** 'rolling' | 'wish' — 둘이 같은 테이블·같은 정책을 쓴다 (맨 위 주석) */
const SERVICE = process.env.SERVICE ?? 'rolling'
const SLUG = `${SERVICE}-verify`
const SLUG_CLOSED = `${SERVICE}-verify-closed`
/** 어제 끝난 슬롯 — **유예(14일) 안**이라 읽기는 되고 쓰기는 안 돼야 한다 (0039) */
const SLUG_GRACE = `${SERVICE}-verify-grace`

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

async function cleanup() {
  await rest(`slots?slug=in.(${SLUG},${SLUG_CLOSED},${SLUG_GRACE})`, { method: 'DELETE', headers: OWNER })
}

await cleanup()

// ── 준비: 열린 슬롯 + 마감(지난) 슬롯 ─────────────
const mkSlot = (slug, period) =>
  rest('slots', {
    method: 'POST',
    headers: { ...OWNER, prefer: 'return=minimal' },
    body: JSON.stringify({
      slug,
      name: `${SERVICE} 검증`,
      service: SERVICE,
      period,
      theme: { colors: {}, shape: {}, assets: {} },
      event: {},
    }),
  })

/**
 * 기간을 안 정하면 늘 열림 (0005).
 *  · `SLUG_CLOSED` 는 2020 년 — 유예(14일)까지 한참 지난 **완전히 닫힌** 상태다.
 *  · `SLUG_GRACE` 는 **어제** 끝났다 — 유예 안이라 읽기만 열려 있어야 한다.
 * 날짜는 KST 로 만든다. 서버 판정(`today_kst`)이 KST 라 UTC 로 만들면 자정 근처에서 하루가 어긋난다.
 */
const kst = (offsetDays) => {
  const d = new Date(Date.now() + offsetDays * 86400000)
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(d)
}

const open = await mkSlot(SLUG, {})
const closed = await mkSlot(SLUG_CLOSED, { rent: { start: '2020-01-01', end: '2020-01-02' } })
const grace = await mkSlot(SLUG_GRACE, { rent: { start: kst(-7), end: kst(-1) } })
check('열린 슬롯을 만든다', open.ok, open.ok ? '' : await open.text())
check('마감 슬롯을 만든다', closed.ok, closed.ok ? '' : await closed.text())
check('유예 중인 슬롯을 만든다', grace.ok, grace.ok ? '' : await grace.text())
if (!open.ok || !closed.ok || !grace.ok) {
  await cleanup()
  process.exit(1)
}

// ── 1. 방문자가 열린 슬롯에 남긴다 ────────────────
{
  const res = await rest('rolling_messages', {
    method: 'POST',
    headers: { ...ANONH, prefer: 'return=minimal' },
    body: JSON.stringify({
      slug: SLUG,
      nickname: '방문자',
      body: '생일 축하해요',
      color: 'primary',
      sticker: null,
    }),
  })
  check('방문자가 열린 슬롯에 남긴다', res.ok, res.ok ? '' : `HTTP ${res.status} ${await res.text()}`)
}

// ── 2. 방문자가 자기가 남긴 메시지를 읽는다 ───────
let msgId = null
{
  const res = await rest(`rolling_messages?slug=eq.${SLUG}&select=id,body,hidden`, { headers: ANONH })
  const rows = res.ok ? await res.json() : []
  msgId = rows[0]?.id ?? null
  check('방문자가 숨김 아닌 메시지를 읽는다', rows.length === 1 && rows[0].body === '생일 축하해요', `${rows.length}행`)
}

// ── 3. 방문자는 남의 메시지를 못 고친다 (쓰기 후 상태로 확인) ─
//
// **상태코드가 아니라 결과를 본다.** anon 은 Supabase 기본 테이블 권한으로 UPDATE/DELETE 권한을
// 이미 갖고 있어(마이그레이션의 `to authenticated` 와 무관하게 — default privileges), 막는 건 grant 가
// 아니라 RLS 다. 그래서 이 요청은 401 이 아니라 **204(0행 처리)** 로 돌아온다 — 그게 정상이다.
// 계약은 "거부됐나" 가 아니라 "안 바뀌었나" 이므로, 관리자로 되읽어 실제 상태를 본다.
// (여길 !res.ok 로 되돌리지 말 것 — RLS 로 막힌 쓰기는 성공코드로 온다.)
{
  const res = await rest(`rolling_messages?id=eq.${msgId}`, {
    method: 'PATCH',
    headers: ANONH,
    body: JSON.stringify({ hidden: true }),
  })
  const back = await rest(`rolling_messages?id=eq.${msgId}&select=hidden`, { headers: OWNER })
  const still = (await back.json())[0]?.hidden
  check('방문자는 메시지를 못 숨긴다', still === false, `HTTP ${res.status}, hidden=${still}`)
}

// ── 4. 방문자는 남의 메시지를 못 지운다 ───────────
{
  const res = await rest(`rolling_messages?id=eq.${msgId}`, { method: 'DELETE', headers: ANONH })
  const back = await rest(`rolling_messages?id=eq.${msgId}&select=id`, { headers: OWNER })
  const alive = (await back.json()).length === 1
  check('방문자는 메시지를 못 지운다', alive, `HTTP ${res.status}, 살아있나=${alive}`)
}

// ── 5. 관리자가 숨긴다 → 방문자에게서 사라진다 (후검수) ─
{
  const hide = await rest(`rolling_messages?id=eq.${msgId}`, {
    method: 'PATCH',
    headers: OWNER,
    body: JSON.stringify({ hidden: true }),
  })
  check('관리자가 메시지를 숨긴다', hide.ok, hide.ok ? '' : await hide.text())

  const asVisitor = await rest(`rolling_messages?slug=eq.${SLUG}&select=id`, { headers: ANONH })
  const visitorRows = asVisitor.ok ? await asVisitor.json() : []
  check('방문자는 숨긴 메시지를 못 읽는다 (후검수)', visitorRows.length === 0, `${visitorRows.length}행이 샜다`)

  const asOwner = await rest(`rolling_messages?slug=eq.${SLUG}&select=id`, { headers: OWNER })
  check('관리자는 숨긴 것도 읽는다', asOwner.ok && (await asOwner.json()).length === 1)
}

// ── 6. 관리자가 지운다 ────────────────────────────
{
  const res = await rest(`rolling_messages?id=eq.${msgId}`, { method: 'DELETE', headers: OWNER })
  const back = await rest(`rolling_messages?slug=eq.${SLUG}&select=id`, { headers: OWNER })
  check('관리자가 메시지를 지운다', res.ok && (await back.json()).length === 0)
}

// ── 7. 마감 슬롯: 방문자는 못 남긴다 ──────────────
{
  const res = await rest('rolling_messages', {
    method: 'POST',
    headers: ANONH,
    body: JSON.stringify({ slug: SLUG_CLOSED, nickname: '', body: '지난 뒤에 남겨봄', color: '' }),
  })
  check('방문자는 마감 슬롯에 못 남긴다', !res.ok, `HTTP ${res.status}${res.ok ? ' — 남겨졌다' : ''}`)
}

// ── 8. 마감 슬롯: 관리자가 넣은 메시지도 방문자는 못 읽는다 ─
//
// 마감이라 방문자가 직접 못 남기므로, 뒷정리 상황을 흉내내 관리자가 한 줄 넣고 방문자로 읽어 본다.
// 롤페는 grace 0 이라 마감 즉시 벽이 닫힌다 — 지난 이벤트의 메시지가 anon 에게 새면 안 된다.
{
  await rest('rolling_messages', {
    method: 'POST',
    headers: { ...OWNER, prefer: 'return=minimal' },
    body: JSON.stringify({ slug: SLUG_CLOSED, nickname: '관리자', body: '지난 메시지', color: '' }),
  })
  const asVisitor = await rest(`rolling_messages?slug=eq.${SLUG_CLOSED}&select=id`, { headers: ANONH })
  const rows = asVisitor.ok ? await asVisitor.json() : []
  check('방문자는 마감 슬롯 메시지를 못 읽는다', rows.length === 0, `${rows.length}행이 샜다`)
}

// ── 9. 유예 중: 읽기는 열리고 쓰기는 닫힌다 (0039) ─
//
// **이게 0039 가 바꾼 계약이다.** 예전엔 롤페·소원나무의 유예가 0 이라 마감 즉시 둘 다 닫혔고,
// 주최자는 부스를 접는 그 순간 쪽지 CSV 를 잃었다. 지금은 14일 더 읽힌다 — 그동안 방문자가
// 벽을 다시 볼 수는 있지만 **새 글은 못 남긴다** (유예는 뒷정리 시간이지 행사 연장이 아니다).
{
  await rest('rolling_messages', {
    method: 'POST',
    headers: { ...OWNER, prefer: 'return=minimal' },
    body: JSON.stringify({ slug: SLUG_GRACE, nickname: '관리자', body: '어제까지의 벽', color: '' }),
  })

  const read = await rest(`rolling_messages?slug=eq.${SLUG_GRACE}&select=id`, { headers: ANONH })
  const rows = read.ok ? await read.json() : []
  check('유예 중이면 방문자가 벽을 읽는다', rows.length === 1, `${rows.length}행`)

  const write = await rest('rolling_messages', {
    method: 'POST',
    headers: ANONH,
    body: JSON.stringify({ slug: SLUG_GRACE, nickname: '', body: '유예 중에 남겨봄', color: '' }),
  })
  check('유예 중이어도 방문자는 못 남긴다', !write.ok, `HTTP ${write.status}${write.ok ? ' — 남겨졌다' : ''}`)
}

// ── 10. 정리 ──────────────────────────────────────
await cleanup()
{
  const left = await rest(`slots?slug=in.(${SLUG},${SLUG_CLOSED},${SLUG_GRACE})&select=slug`, {
    headers: OWNER,
  })
  const rows = left.ok ? await left.json() : []
  check('검증이 남긴 게 없다', rows.length === 0, `${rows.length}행 남음`)
}

console.log(failed === 0 ? `\n전부 통과 (service=${SERVICE})` : `\n${failed}개 실패 (service=${SERVICE})`)
process.exit(failed === 0 ? 0 : 1)
