/**
 * Supabase 연결·격리 검증 — **anon 키로** 실제 DB 를 두드린다.
 *
 *   node scripts/verify-supabase.mjs
 *
 * 여기서 보는 건 "연결되나"가 아니라 **"RLS 가 막나"** 다.
 * anon 키는 브라우저에 내려가므로, 이 스크립트가 하는 짓은 아무나 할 수 있는 짓이다.
 * 그래서 이게 통과해야 격리가 진짜다.
 */

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

// .env.local 은 vite 가 읽는다 — 스크립트는 직접 읽는다
const env = {}
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim())
  if (m) env[m[1]] = m[2]
}

const url = env.VITE_SUPABASE_URL
const anon = env.VITE_SUPABASE_ANON_KEY
if (!url || !anon) {
  console.error('.env.local 에 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 가 없어요')
  process.exit(1)
}

const checks = []
const check = (name, ok, detail = '') => {
  checks.push([name, ok])
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const db = createClient(url, anon)

/** 1x1 PNG — 이미지 저장소 권한을 실제 업로드로 확인할 때 쓴다 */
const PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
)

// ── 스키마가 올라갔나 ────────────────────────────────
const tables = ['slots', 'questions', 'owners', 'slot_admins', 'ai_usage', 'reading_cache']
const missing = []
for (const t of tables) {
  // `head: true` 를 쓰면 안 된다 — 테이블이 없어도 204 를 줘서 헛통과한다.
  // RLS 로 막혀 0행이 오는 건 정상이고, "테이블이 없다"만 문제다
  const { error } = await db.from(t).select('*').limit(1)
  if (error && /does not exist|schema cache/i.test(error.message)) missing.push(t)
}
check('테이블 6개가 있다', missing.length === 0, missing.length ? `없음: ${missing.join(', ')}` : '')

if (missing.length) {
  console.log('\n→ supabase/migrations/0001_init.sql 을 SQL Editor 에 붙여넣고 Run 하세요.')
  process.exit(1)
}

// ── 로그인 안 한 사람(=방문자)이 할 수 있는 것 ────────
const { data: slots, error: slotsErr } = await db.from('slots').select('slug, name, plan')
check('방문자가 슬롯을 읽는다 (앱이 뜨려면 필요)', !slotsErr, slotsErr?.message ?? `${slots?.length ?? 0}개`)

const { error: slotWrite } = await db
  .from('slots')
  .insert({ slug: 'rls-probe', name: '침입', theme: {} })
check('방문자는 슬롯을 못 만든다', Boolean(slotWrite), slotWrite?.message?.slice(0, 60) ?? '뚫림!')

const { error: slotUpdate } = await db.from('slots').update({ name: '탈취' }).eq('slug', 'demo')
const { data: afterUpdate } = await db.from('slots').select('name').eq('slug', 'demo').maybeSingle()
check(
  '방문자는 남의 슬롯을 못 고친다',
  Boolean(slotUpdate) || afterUpdate?.name !== '탈취',
  slotUpdate?.message?.slice(0, 60) ?? '조용히 0행 (정상)'
)

// ── 질문: 공개된 것만 ────────────────────────────────
const { data: pub, error: pubErr } = await db.from('questions').select('id, published')
check('방문자가 질문을 읽는다', !pubErr, pubErr?.message ?? `${pub?.length ?? 0}개`)
check(
  '방문자에겐 비공개 질문이 안 보인다',
  (pub ?? []).every((q) => q.published === true),
  `공개 ${(pub ?? []).filter((q) => q.published).length} / 받은 것 ${pub?.length ?? 0}`
)

const { error: qWrite } = await db
  .from('questions')
  .insert({ id: 'rls-probe', slug: 'demo', published: true, data: {} })
check('방문자는 질문을 못 만든다', Boolean(qWrite), qWrite?.message?.slice(0, 60) ?? '뚫림!')

// ── 역할 테이블은 남의 것을 못 본다 ───────────────────
const { data: owners } = await db.from('owners').select('user_id')
check('방문자에겐 최고관리자 목록이 안 보인다', (owners ?? []).length === 0, `${owners?.length ?? 0}행`)

const { data: admins } = await db.from('slot_admins').select('user_id, slug')
check('방문자에겐 주최자 목록이 안 보인다', (admins ?? []).length === 0, `${admins?.length ?? 0}행`)

// ── AI 카운터는 방문자가 못 만진다 (한도가 한도이려면) ──
const { data: usage } = await db.from('ai_usage').select('slug')
check('방문자에겐 사용량이 안 보인다', (usage ?? []).length === 0, `${usage?.length ?? 0}행`)

const { error: usageWrite } = await db
  .from('ai_usage')
  .upsert({ slug: 'demo', reading: 0, answer_gen: 0 })
check('방문자는 사용량을 못 되돌린다', Boolean(usageWrite), usageWrite?.message?.slice(0, 60) ?? '뚫림!')

// ── 여기부터가 진짜 시험 — 로그인해서 남의 슬롯을 노린다 ──
/**
 * 씨앗 계정 비밀번호 — `.env.local` 의 `SEED_PASSWORD`, 또는 환경변수.
 * 검증용 계정이라 여기 둔다 (`.env.local` 은 커밋 안 된다). 실제 주최자 계정 비번은 여기 오면 안 된다.
 */
const PW = process.env.SEED_PASSWORD ?? env.SEED_PASSWORD ?? 'tarot1234'
const asUser = async (email) => {
  const c = createClient(url, anon, { auth: { persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email, password: PW })
  return error ? null : c
}

const demoAdmin = await asUser('demo@example.com')
if (!demoAdmin) {
  console.log('\n(계정이 아직 없어 로그인 검증은 건너뜁니다 — supabase/seed.sql 참고)')
  console.log(`(비밀번호가 다르면: SEED_PASSWORD=... node scripts/verify-supabase.mjs)`)
} else {
  console.log('\n── demo 주최자로 로그인 ──')

  const { data: mine } = await demoAdmin.from('slot_admins').select('slug')
  check('자기 슬롯 배정을 읽는다', mine?.[0]?.slug === 'demo', JSON.stringify(mine))

  const { data: mineQ } = await demoAdmin.from('questions').select('id, slug, published').eq('slug', 'demo')
  const hasUnpublished = (mineQ ?? []).some((q) => !q.published)
  check('자기 슬롯 질문을 전부 읽는다 (비공개 포함)', (mineQ ?? []).length > 0, `${mineQ?.length ?? 0}개`)

  // ★ 격리의 핵심 — 남의 슬롯 질문을 읽으려는 시도
  const { data: theirQ } = await demoAdmin.from('questions').select('id, slug').eq('slug', 'sample-pink')
  check('남의 슬롯 질문은 못 읽는다', (theirQ ?? []).length === 0, `${theirQ?.length ?? 0}개 샘`)

  // ★ 남의 슬롯에 질문을 심으려는 시도 (with check 가 막아야 한다)
  const { error: planted } = await demoAdmin
    .from('questions')
    .insert({ id: 'planted', slug: 'sample-pink', published: true, data: { question: '침입' } })
  check('남의 슬롯에 질문을 못 심는다', Boolean(planted), planted?.message?.slice(0, 50) ?? '뚫림!')

  // ★ 자기 질문을 남의 슬롯으로 옮기려는 시도
  const own = (mineQ ?? [])[0]
  if (own) {
    const { error: moved } = await demoAdmin
      .from('questions')
      .update({ slug: 'sample-pink' })
      .eq('id', own.id)
    const { data: check2 } = await demoAdmin.from('questions').select('slug').eq('id', own.id).maybeSingle()
    check(
      '자기 질문을 남의 슬롯으로 못 옮긴다',
      Boolean(moved) || check2?.slug === 'demo',
      moved?.message?.slice(0, 50) ?? `slug=${check2?.slug}`
    )
  }

  // ★ 주최자는 테마를 못 건드린다 (역할 분리)
  const { error: themed } = await demoAdmin.from('slots').update({ name: '주최자가 바꿈' }).eq('slug', 'demo')
  const { data: slotAfter } = await demoAdmin.from('slots').select('name').eq('slug', 'demo').maybeSingle()
  check(
    '주최자는 자기 슬롯 설정도 못 고친다',
    Boolean(themed) || slotAfter?.name !== '주최자가 바꿈',
    themed?.message?.slice(0, 50) ?? '조용히 0행 (정상)'
  )

  check('주최자는 최고관리자가 아니다', await notOwner(demoAdmin))

  await demoAdmin.auth.signOut()

  // ── 최고관리자 ────────────────────────────────────
  const owner = await asUser('owner@example.com')
  if (owner) {
    console.log('\n── 최고관리자로 로그인 ──')
    const { data: o } = await owner.from('owners').select('user_id')
    check('최고관리자 행을 읽는다', (o ?? []).length === 1)

    const { error: slotWrite2 } = await owner
      .from('slots')
      .update({ name: '데모 생일카페' })
      .eq('slug', 'demo')
    check('최고관리자는 슬롯을 고친다', !slotWrite2, slotWrite2?.message?.slice(0, 50) ?? '')

    const { data: allQ } = await owner.from('questions').select('id')
    check('최고관리자는 모든 질문을 본다', (allQ ?? []).length > 0, `${allQ?.length ?? 0}개`)

    /**
     * ── 이미지 저장소 (버킷 `slots`) ──
     *
     * 이미지도 슬롯 자산이다. 읽기는 누구나(방문자가 로그인을 안 한다), **쓰기는 최고관리자만**.
     * 버킷 메타데이터는 RLS 에 걸려 목록이 비어 보이므로 **실제로 올려봐야** 안다
     * (`/storage/v1/bucket` 이 `[]` 를 주길래 버킷이 없는 줄 알았는데, 있었다).
     */
    const PROBE = '__verify/pixel.png'
    const pixel = new Blob([PIXEL_PNG], { type: 'image/png' })

    const { error: ownerUp } = await owner.storage.from('slots').upload(PROBE, pixel, {
      upsert: true,
      contentType: 'image/png',
    })
    check('최고관리자는 이미지를 올린다', !ownerUp, ownerUp?.message?.slice(0, 60) ?? '')

    if (!ownerUp) {
      // 방문자는 로그인 없이 읽어야 한다 — 카페에서 QR 찍고 바로 카드를 본다
      const { publicUrl } = owner.storage.from('slots').getPublicUrl(PROBE).data
      const pub = await fetch(publicUrl).catch(() => null)
      check('방문자가 로그인 없이 이미지를 받는다', Boolean(pub?.ok), `${pub?.status ?? '실패'}`)
    }

    const { error: anonUp } = await db.storage.from('slots').upload('demo/hack.png', pixel, {
      upsert: true,
      contentType: 'image/png',
    })
    check('방문자는 이미지를 못 올린다', Boolean(anonUp), anonUp?.message?.slice(0, 50) ?? '뚫림!')

    // 주최자도 못 올린다 — 이미지는 테마의 일부고, 테마는 최고관리자 몫이다 (역할 분리)
    const admin3 = await asUser('demo@example.com')
    if (admin3) {
      const { error: adminUp } = await admin3.storage.from('slots').upload('demo/hack.png', pixel, {
        upsert: true,
        contentType: 'image/png',
      })
      check('주최자도 이미지를 못 올린다', Boolean(adminUp), adminUp?.message?.slice(0, 50) ?? '뚫림!')
      await admin3.auth.signOut()
    }

    // 뒷정리 — 검증이 버킷에 파일을 쌓아두고 가면 안 된다
    await owner.storage.from('slots').remove([PROBE, 'demo/hack.png'])
    const { data: left } = await owner.storage.from('slots').list('__verify')
    check('뒷정리: 검증이 올린 이미지를 지움', (left ?? []).filter((f) => f.id).length === 0)

    await owner.auth.signOut()
  }

  // ── 비공개는 진짜로 안 보이나 ─────────────────────
  // 씨앗이 전부 공개라 그냥 두면 "안 보인다"가 헛통과한다 — 실제로 하나 감췄다가 되돌린다.
  const victim = (mineQ ?? [])[0]
  if (victim) {
    console.log('\n── 질문 하나를 비공개로 바꿔놓고 ──')
    const admin2 = await asUser('demo@example.com')
    await admin2.from('questions').update({ published: false }).eq('id', victim.id)

    const { data: seen } = await db.from('questions').select('id').eq('id', victim.id)
    check('방문자에겐 비공개 질문이 정말 안 보인다', (seen ?? []).length === 0, `${seen?.length ?? 0}개`)

    const { data: adminSees } = await admin2.from('questions').select('id').eq('id', victim.id)
    check('주최자에겐 자기 비공개 질문이 보인다', (adminSees ?? []).length === 1)

    // 되돌린다 — 검증이 데이터를 망가뜨리면 안 된다
    await admin2.from('questions').update({ published: true }).eq('id', victim.id)
    const { data: restored } = await db.from('questions').select('id').eq('id', victim.id)
    check('검증이 데이터를 되돌려놨다', (restored ?? []).length === 1)
    await admin2.auth.signOut()
  }
  void hasUnpublished
}

async function notOwner(client) {
  const { data } = await client.from('owners').select('user_id')
  return (data ?? []).length === 0
}

const failed = checks.filter(([, ok]) => !ok).length
console.log(`\n${checks.length - failed} / ${checks.length} 통과`)
process.exit(failed ? 1 : 0)
