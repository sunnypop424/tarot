/**
 * 계정 엔드포인트 — **주최자 계정을 만드는 유일한 자리**.
 *
 *   GET  /admin/organizers?slug=  → { organizers }   (그 슬롯 주최자 목록)
 *   POST /admin/organizers        → { organizer }    (계정 생성 + 슬롯 지정, 한 번에)
 *   POST /admin/password          → { ok }           (비밀번호 재설정)
 *   POST /admin/revoke            → { ok }           (계정 삭제)
 *
 * **전부 최고관리자만.** 판정은 DB 의 is_owner() 가 한다 — ai 함수와 같은 정의를 쓴다.
 *
 * **왜 브라우저가 직접 못 하나:** 계정 생성(auth.admin.*)은 service_role 키를 요구하는데,
 * 그 키는 RLS 를 통째로 무시하므로 브라우저에 내려가는 순간 아무나 남의 슬롯을 다 만진다.
 * anon 키로 되는 signUp() 은 대시보드에서 **자동 가입을 켜야** 하고, 그 순간 공개된 anon 키로
 * 누구나 계정을 만들 수 있게 된다 — "슬롯은 파는 것이지 아무나 만드는 게 아니다"
 * (docs/BACKEND.md §1-3)를 정면으로 뒤집는다. 그래서 키는 여기에만 산다.
 *
 * **auth.users 에 직접 INSERT 하지 않는다.** SQL 로도 계정을 만들 수 있지만
 * (auth.users + auth.identities 두 테이블을 손으로 채우는 방식) 그건 Supabase 가 관리하는
 * 내부 스키마라 GoTrue 가 바뀌면 조용히 깨진다. 공식 Admin API 만 쓴다.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

/** RLS 를 지나친다 — 계정 생성과 slot_admins 쓰기는 아무 정책도 허용하지 않는 일이다 */
const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

/**
 * 출처는 ai 함수와 **같은 secret** 을 쓴다.
 * 따로 두면 커스텀 도메인을 붙일 때 한 쪽만 고치고 다른 쪽이 조용히 죽는다.
 */
const ALLOWED = (Deno.env.get('AI_ALLOWED_ORIGINS') ?? 'http://localhost:5174')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const MIN_PASSWORD = 8

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED.includes(origin) ? origin : ALLOWED[0]
  return {
    'access-control-allow-origin': allow,
    'access-control-allow-headers': 'authorization, content-type, apikey',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    vary: 'origin',
  }
}

const json = (body: unknown, status: number, origin: string | null) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'content-type': 'application/json' },
  })

const bad = (status: number, message: string, origin: string | null) =>
  json({ error: message }, status, origin)

/** 최고관리자인가 — 판정은 DB 가 한다 (ai/index.ts 의 can() 과 같은 방식) */
async function isOwner(req: Request): Promise<boolean> {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return false
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { authorization: auth } },
  })
  const { data, error } = await client.rpc('is_owner')
  return !error && data === true
}

/**
 * 이 user_id 가 **주최자인가** — 비밀번호 재설정·삭제 전에 반드시 본다.
 *
 * 이걸 안 보면 최고관리자가 **다른 최고관리자의 비밀번호를 바꾸거나 계정을 지울 수 있다.**
 * slot_admins 에 있는 계정만 만질 수 있게 잠근다 — 최고관리자 계정은 SQL 로만 다룬다
 * (docs/BACKEND.md §1-3).
 *
 * **`.maybeSingle()` 을 쓰면 안 된다** — 한 계정이 슬롯 여럿을 맡을 수 있게 되면서
 * (`0006_multi_slot_admins.sql`) 겸업 주최자는 행이 여러 개다. maybeSingle 은 그 경우 에러를
 * 주는데, 여기서 그 에러를 삼키면 `null` 이 되어 "주최자 계정이 아니에요" 404 가 된다 —
 * 겸업 주최자만 비밀번호 재설정도 계정 삭제도 안 되는, **조용히 망가지는** 버그가 된다.
 */
async function organizerSlugs(userId: string): Promise<string[]> {
  const { data } = await admin.from('slot_admins').select('slug').eq('user_id', userId)
  return (data ?? []).map((row) => row.slug as string)
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * 임시 비밀번호 — **읽어서 옮겨 적을 값**이라 헷갈리는 글자를 뺀다 (0/O, 1/l/I).
 * 카톡으로 붙여넣든 전화로 불러주든 "영문 O 인가 숫자 0 인가" 를 묻게 하지 않는다.
 * 4글자씩 끊는 것도 같은 이유다.
 *
 * 31자 12개 = 약 7.6e17 가지. 최고관리자가 정하는 비번보다 오히려 세다.
 */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

function tempPassword(): string {
  const values = new Uint32Array(12)
  crypto.getRandomValues(values)
  const chars = Array.from(values, (v) => ALPHABET[v % ALPHABET.length])
  return [chars.slice(0, 4), chars.slice(4, 8), chars.slice(8, 12)].map((g) => g.join('')).join('-')
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(origin) })

  const url = new URL(req.url)
  const route = url.pathname.split('/').filter(Boolean).pop()

  /**
   * 만료 슬롯 청소 — **부르는 주체가 사람이 아니라 스케줄러다.**
   *
   * 최고관리자 세션이 없으므로 `is_owner()` 로는 못 막는다. 공유 비밀로 막고,
   * 그 비밀은 Edge Function secret 에만 산다 (`CRON_SECRET`). 아래 isOwner 검사보다
   * **먼저** 처리해야 한다 — 안 그러면 403 에 걸려 영영 안 돈다.
   *
   * secret 이 설정 안 돼 있으면 **닫는다.** 빈 문자열끼리 맞아떨어져 아무나 부를 수 있게 되면
   * 그 순간 남이 우리 슬롯을 통째로 지울 수 있다 (fail-closed).
   */
  if (route === 'purge-expired') {
    const expected = Deno.env.get('CRON_SECRET') ?? ''
    if (!expected || req.headers.get('x-cron-secret') !== expected) {
      return bad(403, '허용되지 않은 호출이에요', origin)
    }
    try {
      return await purgeExpired(origin)
    } catch (e) {
      return bad(500, String(e), origin)
    }
  }

  // 나머지 경로는 최고관리자 없이는 열리지 않는다 — 먼저 막고 본다
  if (!(await isOwner(req))) return bad(403, '최고관리자만 쓸 수 있어요', origin)

  try {
    if (route === 'organizers' && req.method === 'GET') {
      return await listOrganizers(url, origin)
    }
    if (req.method !== 'POST') return bad(405, 'POST 만 됩니다', origin)

    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return bad(400, '본문을 읽지 못했어요', origin)
    }

    if (route === 'organizers') return await createOrganizer(body, origin)
    if (route === 'password') return await resetPassword(body, origin)
    if (route === 'revoke') return await revokeOrganizer(body, origin)
    if (route === 'purge') return await purgeSlot(body, origin)
  } catch (e) {
    return bad(500, String(e), origin)
  }
  return bad(404, '그런 건 없어요', origin)
})

// ── 목록 ───────────────────────────────────────────
/**
 * 이메일은 auth.users 에 있고 그건 service_role 로만 읽힌다 — 그래서 이 왕복이 필요하다.
 * 슬롯당 주최자는 한 손에 꼽으므로 getUserById 를 병렬로 도는 걸로 충분하다.
 */
async function listOrganizers(url: URL, origin: string | null) {
  const slug = url.searchParams.get('slug')
  if (!slug) return bad(400, '슬롯이 없어요', origin)

  const { data: rows, error } = await admin
    .from('slot_admins')
    .select('user_id, created_at')
    .eq('slug', slug)
    .order('created_at')
  if (error) return bad(500, error.message, origin)

  const organizers = await Promise.all(
    rows.map(async (row) => {
      const { data } = await admin.auth.admin.getUserById(row.user_id)
      return {
        userId: row.user_id,
        // 계정이 대시보드에서 지워졌는데 매핑만 남은 경우 — 화면이 빈칸 대신 이걸 보여준다
        email: data.user?.email ?? '(삭제된 계정)',
        createdAt: row.created_at,
      }
    })
  )
  return json({ organizers }, 200, origin)
}

/**
 * 이 이메일이 **이미 주최자인가** — 맞으면 그 user_id.
 *
 * `auth.users` 는 PostgREST 로 못 읽고 GoTrue 에는 "이메일로 찾기" 가 없다. 전체 사용자를
 * 페이지로 훑는 대신 **slot_admins 에 있는 계정만** 확인한다: 훑는 양이 전체 사용자가 아니라
 * 주최자 수(슬롯 수 남짓)로 줄고, 덤으로 "주최자가 아닌 계정은 안 걸린다" 가 공짜로 따라온다 —
 * 최고관리자 계정이 이 경로로 슬롯에 묶이는 사고를 막는다.
 */
async function findOrganizerByEmail(email: string): Promise<string | null> {
  const { data: rows } = await admin.from('slot_admins').select('user_id')
  const ids = [...new Set((rows ?? []).map((r) => r.user_id as string))]
  const found = await Promise.all(
    ids.map(async (id) => {
      const { data } = await admin.auth.admin.getUserById(id)
      return data.user?.email?.toLowerCase() === email ? id : null
    })
  )
  return found.find((id) => id !== null) ?? null
}

// ── 계정 생성 + 슬롯 지정 ───────────────────────────
async function createOrganizer(body: Record<string, unknown>, origin: string | null) {
  const slug = String(body.slug ?? '')
  const email = String(body.email ?? '').trim().toLowerCase()
  const password = String(body.password ?? '')

  if (!slug) return bad(400, '슬롯이 없어요', origin)
  if (!EMAIL.test(email)) return bad(400, '이메일 형식이 아니에요', origin)
  if (password.length < MIN_PASSWORD) {
    return bad(400, `비밀번호는 ${MIN_PASSWORD}자 이상이어야 해요`, origin)
  }

  // 없는 슬롯이면 FK 가 잡지만, 그 메시지는 고객에게 보여줄 만한 말이 아니다
  const { data: slot } = await admin.from('slots').select('slug').eq('slug', slug).maybeSingle()
  if (!slot) return bad(404, '없는 슬롯이에요 (먼저 저장하세요)', origin)

  /** email_confirm: true — 확인 메일을 안 거치고 바로 로그인한다. 비번은 최고관리자가 직접 전달한다 */
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (createError || !created.user) {
    const message = createError?.message ?? '계정을 만들지 못했어요'
    // GoTrue 는 영어로 답한다 — 화면에 그대로 내보내지 않는다
    if (/already|exists|registered/i.test(message)) {
      /**
       * 이미 있는 이메일 = **겸업 주최자를 이 슬롯에도 연결**하는 자리다
       * (`0006_multi_slot_admins.sql` 이 열어준 경로). 타로 슬롯을 쓰던 주최자에게
       * 럭키드로우 슬롯을 열어줄 때 여기로 온다.
       *
       * **비밀번호는 건드리지 않는다.** 입력된 비번으로 덮으면 그 사람이 이미 쓰고 있는
       * 다른 슬롯 로그인이 그 순간 깨진다 — 계정은 하나이기 때문이다.
       * 비번을 새로 줘야 하면 목록의 "비밀번호 재발급" 을 쓴다.
       */
      const existing = await findOrganizerByEmail(email)
      if (!existing) return bad(409, '이미 있는 이메일이에요', origin)

      const { error: linkError } = await admin
        .from('slot_admins')
        .upsert({ user_id: existing, slug }, { onConflict: 'user_id,slug', ignoreDuplicates: true })
      if (linkError) return bad(500, linkError.message, origin)

      const { data: user } = await admin.auth.admin.getUserById(existing)
      return json(
        {
          organizer: {
            userId: existing,
            email,
            createdAt: user.user?.created_at ?? new Date().toISOString(),
          },
          // 화면이 "새 계정" 과 "기존 계정 연결" 을 다르게 안내해야 한다 (비번이 그대로이므로)
          linked: true,
        },
        200,
        origin
      )
    }
    return bad(400, message, origin)
  }

  const { error: mapError } = await admin
    .from('slot_admins')
    .insert({ user_id: created.user.id, slug })

  if (mapError) {
    /**
     * 매핑이 실패하면 **계정을 도로 지운다.**
     * 안 지우면 로그인은 되는데 아무 슬롯도 못 보는 유령 계정이 남고,
     * 그 이메일은 이미 쓰였으므로 다시 만들 수도 없다 — 손으로 대시보드를 뒤져야 한다.
     */
    await admin.auth.admin.deleteUser(created.user.id)
    return bad(500, mapError.message, origin)
  }

  return json(
    {
      organizer: { userId: created.user.id, email, createdAt: created.user.created_at },
    },
    200,
    origin
  )
}

// ── 비밀번호 재발급 ─────────────────────────────────
/**
 * **비번은 서버가 만든다** — 최고관리자가 정하지 않는다.
 *
 * 계정을 처음 만들 땐 최고관리자가 비번을 정한다(그 자리에서 고객에게 전달할 값이라 그게 편하다).
 * 하지만 재발급은 "잊어버렸다" 는 상황이라 성격이 다르다: 여기서 최고관리자가 또 비번을 정하면
 * 그 계정의 비번을 **계속 최고관리자가 아는 상태**로 남는다. 임시 비번을 주고
 * 주최자가 자기 것으로 바꾸게 하는 게 맞다 (주최자 화면의 비밀번호 변경 — auth.updateUser).
 *
 * 돌려준 비번은 **이때 한 번만** 볼 수 있다. 해시로만 저장되므로 다시 못 꺼낸다.
 */
async function resetPassword(body: Record<string, unknown>, origin: string | null) {
  const userId = String(body.userId ?? '')
  if (!userId) return bad(400, '계정이 없어요', origin)
  if ((await organizerSlugs(userId)).length === 0) {
    return bad(404, '주최자 계정이 아니에요', origin)
  }

  const password = tempPassword()
  const { error } = await admin.auth.admin.updateUserById(userId, { password })
  if (error) return bad(400, error.message, origin)
  return json({ password }, 200, origin)
}

// ── 슬롯 통째 정리 ─────────────────────────────────
/**
 * **슬롯과 관련된 모든 것을 지운다.**
 *
 * `delete from slots` 만으로는 부족하다: cascade 가 questions·slot_admins(매핑)·ai_usage·
 * reading_cache 는 지우지만, 주최자의 **실제 로그인 계정(`auth.users`)은 안 지운다** —
 * 매핑만 사라지고 아무 슬롯에도 안 묶인 유령 계정이 남는다 (그 이메일은 재사용도 안 된다).
 * 계정 삭제는 service_role 이 필요하므로 여기서, 슬롯을 지우기 **전에** 한다.
 *
 * 순서: 계정 → 이미지(best-effort) → 슬롯 행(cascade 가 나머지를 쓸어간다).
 * 계정을 먼저 지우는 이유: 유령 로그인이 남는 게 제일 위험하다. 이미지가 남는 건 저장 비용일 뿐이라
 * 실패해도 슬롯 삭제를 막지 않는다.
 */
async function purgeSlot(body: Record<string, unknown>, origin: string | null) {
  const slug = String(body.slug ?? '')
  if (!slug) return bad(400, '슬롯이 없어요', origin)

  try {
    return json({ ok: true, ...(await purgeOne(slug)) }, 200, origin)
  } catch (e) {
    return bad(500, String(e), origin)
  }
}

/**
 * 만료된 슬롯 자동 청소 — 스케줄러가 하루 한 번 부른다 (`0009_slot_lifecycle.sql` §5).
 *
 * **대상 판정을 여기서 하지 않는다.** "마감 +15일" 이라는 규칙은 DB 의 `expired_slots()` 에
 * 하나만 있어야 한다 — 함수와 SQL 이 각자 날짜를 계산하면 언젠가 어긋나고, 어긋난 쪽이
 * 지우는 쪽이면 **살아 있는 행사가 사라진다.**
 *
 * 한 슬롯이 실패해도 나머지는 계속 지운다. 실패를 통째로 물고 죽으면 그날 청소가 전부 밀린다.
 */
async function purgeExpired(origin: string | null) {
  const { data, error } = await admin.rpc('expired_slots')
  if (error) return bad(500, error.message, origin)

  const targets = (data ?? []) as { slug: string; name: string }[]
  const purged: { slug: string; deletedAccounts: number; deletedFiles: number }[] = []
  const failed: { slug: string; error: string }[] = []

  for (const t of targets) {
    try {
      purged.push({ slug: t.slug, ...(await purgeOne(t.slug)) })
    } catch (e) {
      failed.push({ slug: t.slug, error: String(e) })
    }
  }

  /**
   * 스케줄러가 읽을 로그다 — 무엇을 지웠는지 남겨야 나중에 "왜 없어졌지" 에 답할 수 있다.
   * 슬러그까지 남기는 이유: 되살릴 수 없는 작업이라 "무엇이" 사라졌는지가 유일한 단서다.
   */
  for (const p of purged) {
    console.log(`[purge-expired] ${p.slug} — 계정 ${p.deletedAccounts} · 파일 ${p.deletedFiles}`)
  }
  for (const f of failed) console.error(`[purge-expired] ${f.slug} 실패 — ${f.error}`)
  console.log(`[purge-expired] 대상 ${targets.length} · 삭제 ${purged.length} · 실패 ${failed.length}`)

  return json({ ok: true, purged, failed }, 200, origin)
}

/** 슬롯 하나를 통째로 지운다 — `purgeSlot`(수동)과 `purgeExpired`(자동)가 같이 쓴다 */
async function purgeOne(slug: string): Promise<{ deletedAccounts: number }> {
  // 1) 이 슬롯 주최자들의 계정 — **다른 슬롯도 맡고 있으면 지우지 않는다**
  const { data: admins, error: listError } = await admin
    .from('slot_admins')
    .select('user_id')
    .eq('slug', slug)
  // 여기서는 Response 를 만들지 않고 던진다 — 부르는 쪽이 둘이고(수동·자동) 응답 모양이 다르다
  if (listError) throw new Error(listError.message)

  let deletedAccounts = 0
  for (const a of admins ?? []) {
    /**
     * 한 계정이 슬롯 여럿을 맡을 수 있게 되면서(`0006_multi_slot_admins.sql`) 이 검사가 생겼다.
     * 없으면 **타로 슬롯을 지웠을 뿐인데 그 주최자의 럭키드로우 슬롯 로그인까지 증발한다** —
     * 계정이 사라지고 cascade 가 남은 매핑까지 쓸어가므로 되돌릴 수도 없다.
     * 이 슬롯이 그 사람의 **마지막** 슬롯일 때만 계정을 지운다.
     */
    const slugs = await organizerSlugs(a.user_id)
    if (slugs.some((s) => s !== slug)) continue

    const { error } = await admin.auth.admin.deleteUser(a.user_id)
    // 이미 대시보드에서 지운 계정이면 404 가 온다 — 매핑은 slot 삭제 때 cascade 로 정리된다
    if (!error) deletedAccounts++
  }

  // 2) 올린 이미지 — best-effort. 실패해도 슬롯 삭제로 넘어간다 (남아도 비용일 뿐)
  let deletedFiles = 0
  try {
    const paths = await storagePaths(slug)
    // remove 는 한 번에 받는 양에 한계가 있다 — 끊어서 보낸다
    for (let i = 0; i < paths.length; i += 100) {
      const chunk = paths.slice(i, i + 100)
      const { error } = await admin.storage.from('slots').remove(chunk)
      if (!error) deletedFiles += chunk.length
    }
  } catch {
    // 무시 — 이미지는 남아도 격리·보안 문제가 아니다
  }

  // 3) 슬롯 행 — cascade 가 questions·slot_admins·prizes·draw_logs·shipping_entries 까지 쓸어간다
  const { error: delError } = await admin.from('slots').delete().eq('slug', slug)
  if (delError) throw new Error(delError.message)

  return { deletedAccounts, deletedFiles }
}

/**
 * 슬롯이 올린 파일 **전부** — 재귀로 훑고 페이지를 끝까지 넘긴다.
 *
 * 예전엔 `list(prefix, {limit: 200})` 를 `slug` 와 `slug/cards` 두 곳에만 돌렸다. 둘 다 새는 구멍이다:
 *  - 카드 앞면만 78장이고 다시 올린 것까지 쌓이면 **200을 넘긴다** — 넘긴 만큼 그대로 남는다.
 *  - 폴더 이름을 손으로 적어 뒀으니 **새 폴더가 생기면 조용히 빠진다.**
 * 남은 파일은 지운 이벤트의 이미지가 공개 버킷에 계속 서 있다는 뜻이다 (버킷이 public read 다).
 *
 * `id` 가 없는 항목이 폴더다 — Storage 의 list 는 재귀가 아니라서 직접 내려간다.
 */
async function storagePaths(prefix: string, depth = 0): Promise<string[]> {
  // 폴더 구조는 slug/cards 정도라 3단이면 충분하다. 순환은 없지만 무한 재귀는 막아 둔다
  if (depth > 3) return []

  const PAGE = 100
  const out: string[] = []

  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin.storage
      .from('slots')
      .list(prefix, { limit: PAGE, offset })
    if (error || !data?.length) break

    for (const entry of data) {
      const path = `${prefix}/${entry.name}`
      if (entry.id) out.push(path)
      else out.push(...(await storagePaths(path, depth + 1)))
    }

    if (data.length < PAGE) break
  }

  return out
}

// ── 슬롯에서 빼기 (마지막 슬롯이면 계정 삭제) ────────
/**
 * **슬러그를 받는다.** 한 계정이 슬롯 여럿을 맡을 수 있게 되면서(`0006_multi_slot_admins.sql`)
 * "이 계정을 지운다" 는 말이 모호해졌다 — 어느 슬롯에서 빼는 건지 말해야 한다.
 *
 * 마지막 슬롯이면 **계정째** 지운다. 매핑만 지우면 로그인은 되는데 아무 데도 못 들어가는
 * 계정이 남고, 그 이메일로 다시 만들 수도 없어서(중복) 나중에 더 곤란해진다.
 * 다른 슬롯이 남아 있으면 **매핑만** 뺀다 — 그 사람은 남은 슬롯에서 계속 일해야 한다.
 */
async function revokeOrganizer(body: Record<string, unknown>, origin: string | null) {
  const userId = String(body.userId ?? '')
  const slug = String(body.slug ?? '')
  if (!userId) return bad(400, '계정이 없어요', origin)
  if (!slug) return bad(400, '슬롯이 없어요', origin)

  const slugs = await organizerSlugs(userId)
  if (slugs.length === 0) return bad(404, '주최자 계정이 아니에요', origin)
  if (!slugs.includes(slug)) return bad(404, '이 슬롯의 주최자가 아니에요', origin)

  // 다른 슬롯이 남아 있다 → 이 슬롯 매핑만 뺀다 (계정은 살려 둔다)
  if (slugs.some((s) => s !== slug)) {
    const { error } = await admin
      .from('slot_admins')
      .delete()
      .eq('user_id', userId)
      .eq('slug', slug)
    if (error) return bad(500, error.message, origin)
    return json({ ok: true, deletedAccount: false }, 200, origin)
  }

  // 마지막 슬롯 → 계정째. slot_admins 는 auth.users(id) 를 on delete cascade 로 참조한다
  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) return bad(400, error.message, origin)
  return json({ ok: true, deletedAccount: true }, 200, origin)
}
