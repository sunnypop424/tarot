/**
 * AI 엔드포인트 — **배포에서 Claude 를 부르는 유일한 자리**.
 *
 *   GET  /ai/status   → { ready }   (키가 없으면 화면이 조용히 접힌다)
 *   POST /ai/reading  → SSE 스트림  (3장 리딩 종합 — 방문자)
 *   POST /ai/answers  → JSON        (질문 × 카드 답변 — 주최자)
 *   POST /ai/theme    → JSON        (슬롯 색 만들기 — 최고관리자)
 *
 * 계약은 개발 서버 미들웨어와 같다 — 클라이언트는 `VITE_AI_BASE` 만 여기로 돌리면 된다.
 *
 * **여기서 지키는 것** (docs/BACKEND.md §4-3 — 돈이 새는 자리들):
 *  - 슬롯별 예산 상한 (DB 원자적 증가 — 프로세스 메모리가 아니다)
 *  - 레이트리밋 (한도는 예산을 지키지 연타를 못 막는다)
 *  - 권한 (답변 생성은 그 슬롯 주최자만, 색 만들기는 최고관리자만)
 *  - CORS (아는 출처만)
 */

import { createClient as createSupabase } from 'jsr:@supabase/supabase-js@2'
import { createClient, generateJson, streamReading, DEFAULT_MODEL } from './claude.ts'
import { answersPrompt, getCard, synthesisPrompt, themePrompt } from './prompt.ts'
import type { DrawnItem } from './prompt.ts'

const MAX_DRAWN = 3
const MAX_CARDS_PER_BATCH = 12
const MAX_QUESTION_LEN = 200

/** 레이트리밋 — 사람이 카페에서 카드를 뽑는 속도를 기준으로 잡았다 */
const RATE = {
  reading: { per: 10, seconds: 60 },
  answers: { per: 20, seconds: 60 },
  theme: { per: 20, seconds: 60 },
}

const apiKey = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
const model = Deno.env.get('ANTHROPIC_MODEL') || DEFAULT_MODEL
const ready = Boolean(apiKey)
const claude = ready ? createClient(apiKey) : null

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

/** RLS 를 지나친다 — 사용량·캐시·레이트는 방문자가 만지면 안 되는 것들이다 */
const admin = createSupabase(SUPABASE_URL, SERVICE_KEY)

/**
 * 아는 출처만 — 없으면 개발 서버만 허용한다.
 * 배포 뒤엔 `supabase secrets set AI_ALLOWED_ORIGINS=https://내도메인` 로 채운다.
 */
const ALLOWED = (Deno.env.get('AI_ALLOWED_ORIGINS') ?? 'http://localhost:5174')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

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

/** 호출자가 누구인가 — 익명 로그인한 방문자도 uid 가 있다 */
async function callerId(req: Request): Promise<string | null> {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return null
  const client = createSupabase(SUPABASE_URL, ANON_KEY, {
    global: { headers: { authorization: auth } },
  })
  const { data } = await client.auth.getUser()
  return data.user?.id ?? null
}

/**
 * 그 슬롯 주최자인가 / 최고관리자인가 — 판정은 DB(RLS 헬퍼)가 한다.
 *
 * **`manages_slot` 이 아니라 `manages_slot_strict` 를 부른다.** 0034 로 일반판은 체험
 * 슬롯이면 그냥 통과한다(관리 화면을 로그인 없이 열려고). 그 판정을 여기서 쓰면
 * **아무나 78장 = 183원짜리 버튼을 누를 수 있다** — 돈이 나가는 문은 따로 잠근다.
 */
async function can(
  req: Request,
  fn: 'is_owner' | 'manages_slot_strict',
  slug?: string
): Promise<boolean> {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return false
  const client = createSupabase(SUPABASE_URL, ANON_KEY, {
    global: { headers: { authorization: auth } },
  })
  const { data, error } = await client.rpc(
    fn,
    fn === 'manages_slot_strict' ? { target: slug } : {}
  )
  return !error && data === true
}

/** 체험 슬롯인가 — 돈이 나가는 문 앞에서만 본다 (0034·0035 의 `demo` 플래그) */
async function isDemo(slug: string): Promise<boolean> {
  const { data } = await admin.from('slots').select('demo').eq('slug', slug).maybeSingle()
  return Boolean(data?.demo)
}

/**
 * 레이트리밋 — 누구 기준으로 셀 것인가.
 * 로그인한 사람은 uid, 방문자는 IP. 둘 다 없으면 슬롯 전체로 묶어 센다(최후의 방어).
 */
async function withinRate(
  kind: keyof typeof RATE,
  slug: string,
  who: string | null,
  req: Request
): Promise<boolean> {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const id = `${kind}:${slug}:${who ?? ip ?? 'unknown'}`
  const { data, error } = await admin.rpc('bump_ai_rate', {
    rate_id: id,
    per_window: RATE[kind].per,
    window_seconds: RATE[kind].seconds,
  })
  // 레이트 테이블이 못 돌면 막지 않는다 — 예산은 claim_ai_usage 가 따로 지킨다
  if (error) return true
  return data === true
}

const claim = async (slug: string, kind: 'reading' | 'answer_gen') => {
  const { data, error } = await admin.rpc('claim_ai_usage', { target: slug, kind })
  if (error) throw new Error(error.message)
  return data === true
}

const release = (slug: string, kind: 'reading' | 'answer_gen') =>
  admin.rpc('release_ai_usage', { target: slug, kind })

/** 클라이언트가 말할 수 있는 건 "무엇이 어디에 어느 방향으로" 뿐이다 — 의미 텍스트는 서버가 붙인다 */
function validateDrawn(drawn: DrawnItem[]): string | null {
  if (!Array.isArray(drawn) || drawn.length === 0 || drawn.length > MAX_DRAWN) {
    return `카드는 1~${MAX_DRAWN}장이어야 해요`
  }
  for (const item of drawn) {
    if (!getCard(item?.cardId)) return `모르는 카드예요: ${item?.cardId}`
    if (item.orientation !== 'upright' && item.orientation !== 'reversed') {
      return '방향이 이상해요'
    }
    if (typeof item.position !== 'string' || item.position.length > 30) {
      return '포지션이 이상해요'
    }
  }
  return null
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(origin) })

  const route = new URL(req.url).pathname.split('/').filter(Boolean).pop()

  // ── 상태 — 인증 없이. 화면이 AI 블록을 띄울지 이걸로 정한다 ──
  if (route === 'status') {
    return json({ ready, model: ready ? model : null }, 200, origin)
  }

  if (req.method !== 'POST') return bad(405, 'POST 만 됩니다', origin)
  if (!ready) return bad(503, 'AI 가 아직 연결되지 않았어요', origin)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return bad(400, '본문을 읽지 못했어요', origin)
  }

  try {
    if (route === 'reading') return await handleReading(req, body, origin)
    if (route === 'answers') return await handleAnswers(req, body, origin)
    if (route === 'theme') return await handleTheme(req, body, origin)
  } catch (e) {
    return bad(500, String(e), origin)
  }
  return bad(404, '그런 건 없어요', origin)
})

// ── 리딩 종합 — 방문자 ─────────────────────────────
async function handleReading(req: Request, body: Record<string, unknown>, origin: string | null) {
  const { slug, category, aspect, drawn, question } = body as {
    slug: string
    category: string
    aspect: string
    drawn: DrawnItem[]
    question?: string
  }
  if (typeof slug !== 'string' || !slug) return bad(400, '슬롯이 없어요', origin)

  /**
   * **체험 슬롯은 리딩을 안 만든다.** 랜딩이 링크하는 공개 주소라 3장을 뽑을 때마다
   * 실제로 돈이 나간다 — 화면도 안 부르지만(`screens/Draw.tsx`), 요청을 직접 보내는
   * 길이 남아 있으면 막은 게 아니다. 앱은 카드별 해석으로 그대로 돌아간다.
   */
  if (await isDemo(slug)) {
    return bad(403, '체험 슬롯에서는 AI 리딩을 쓰지 않아요', origin)
  }

  const invalid = validateDrawn(drawn)
  if (invalid) return bad(400, invalid, origin)
  if (question && String(question).length > MAX_QUESTION_LEN) {
    return bad(400, '질문이 너무 길어요', origin)
  }

  /**
   * 방문자는 로그인하지 않는다 — 대신 **익명 로그인**으로 JWT 를 받는다 (docs/BACKEND.md §4-4).
   * 그래야 레이트리밋을 걸 주체가 생긴다. 토큰이 없으면 IP 로 센다.
   */
  const who = await callerId(req)
  if (!(await withinRate('reading', slug, who, req))) {
    return bad(429, '조금 천천히 해주세요', origin)
  }

  // (카테고리 + 카드 + 방향 + 관점 + 질문) 이 같으면 같은 리딩이다
  const key = JSON.stringify([
    slug,
    category,
    aspect,
    question ?? null,
    drawn.map((d) => [d.cardId, d.orientation, d.position]),
  ])

  const send = (c: ReadableStreamDefaultController, event: string, data: unknown) =>
    c.enqueue(new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))

  // 캐시 히트는 토큰을 한 톨도 안 쓴다 — 그래서 한도도 안 깎는다
  const { data: cached } = await admin
    .from('reading_cache')
    .select('text')
    .eq('key', key)
    .maybeSingle()

  if (cached) {
    const stream = new ReadableStream({
      start(c) {
        send(c, 'text', { text: cached.text })
        send(c, 'done', { cached: true, usage: null })
        c.close()
      },
    })
    return new Response(stream, {
      headers: { ...corsHeaders(origin), 'content-type': 'text/event-stream; charset=utf-8' },
    })
  }

  // 한도는 **토큰을 쓰기 직전에** 깎는다 (생성이 실패하면 되돌린다)
  if (!(await claim(slug, 'reading'))) {
    return bad(402, '이 슬롯의 AI 리딩 한도를 다 썼어요', origin)
  }

  const { system, user } = synthesisPrompt({ category, aspect, drawn, question })

  const stream = new ReadableStream({
    async start(c) {
      try {
        const { text, usage } = await streamReading({
          client: claude!,
          model,
          system,
          user,
          onText: (delta) => send(c, 'text', { text: delta }),
        })
        await admin.from('reading_cache').upsert({ key, slug, text })
        send(c, 'done', { cached: false, usage })
      } catch (e) {
        // 못 만들었으면 한도를 돌려준다 — 실패에 돈을 물리지 않는다
        await release(slug, 'reading')
        send(c, 'error', { error: String(e) })
      } finally {
        c.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      ...corsHeaders(origin),
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
    },
  })
}

// ── 질문 × 카드 답변 — 그 슬롯 주최자만 ─────────────
async function handleAnswers(req: Request, body: Record<string, unknown>, origin: string | null) {
  const { slug, question, aspect, cardIds, allowReversed, batchIndex } = body as {
    slug: string
    question: string
    aspect: string
    cardIds: string[]
    allowReversed?: boolean
    batchIndex?: number
  }
  if (typeof slug !== 'string' || !slug) return bad(400, '슬롯이 없어요', origin)

  /**
   * **78장 = 183원짜리 버튼이다.** 개발 미들웨어에선 누구나 부를 수 있었다.
   * 주최자는 어차피 로그인하니 여기서 막는다 — 판정은 DB 의 manages_slot_strict() 가 한다
   * (체험 슬롯은 관리 화면이 열려 있어도 여기서 거절된다 — 0034).
   */
  if (!(await can(req, 'manages_slot_strict', slug)) && !(await can(req, 'is_owner'))) {
    return bad(403, '이 슬롯의 주최자만 답변을 생성할 수 있어요', origin)
  }

  if (typeof question !== 'string' || !question.trim()) return bad(400, '질문이 비어 있어요', origin)
  if (question.length > MAX_QUESTION_LEN) return bad(400, '질문이 너무 길어요', origin)
  if (!Array.isArray(cardIds) || cardIds.length === 0) return bad(400, '카드가 없어요', origin)
  if (cardIds.length > MAX_CARDS_PER_BATCH) {
    return bad(400, `한 번에 ${MAX_CARDS_PER_BATCH}장까지예요`, origin)
  }
  for (const id of cardIds) {
    if (!getCard(id)) return bad(400, `모르는 카드예요: ${id}`, origin)
  }

  const who = await callerId(req)
  if (!(await withinRate('answers', slug, who, req))) {
    return bad(429, '조금 천천히 해주세요', origin)
  }

  /**
   * 한도는 **"전체 생성" 실행 1회** 단위다 — 78장이 7묶음으로 쪼개져 와도 1회.
   * 그래서 첫 묶음(batchIndex 0)에서만 깎는다. 안 그러면 78장 한 번이 7회로 세어진다.
   */
  const first = batchIndex === 0 || batchIndex === undefined
  if (first && !(await claim(slug, 'answer_gen'))) {
    return bad(402, '답변 생성 한도를 다 썼어요 (또는 이 슬롯은 직접 입력이에요)', origin)
  }

  try {
    const { system, user, schema } = answersPrompt({
      question,
      aspect,
      cardIds,
      allowReversed: Boolean(allowReversed),
    })
    const result = await generateJson({ client: claude!, model, system, user, schema })
    return json(result, 200, origin)
  } catch (e) {
    if (first) await release(slug, 'answer_gen')
    throw e
  }
}

// ── 슬롯 색 만들기 — 최고관리자 전용 ────────────────
async function handleTheme(req: Request, body: Record<string, unknown>, origin: string | null) {
  /**
   * 플랜 한도를 안 건다: 슬롯을 여는 사람(=우리)이 쓰는 기능이라 슬롯당 몇 번뿐이고
   * 원가가 1원도 안 된다. 대신 **최고관리자만** 부를 수 있어야 한다.
   */
  if (!(await can(req, 'is_owner'))) {
    return bad(403, '최고관리자만 쓸 수 있어요', origin)
  }

  const { baseColor, mode, eventName } = body as {
    baseColor: string
    mode: string
    eventName?: string
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(baseColor ?? '')) {
    return bad(400, '대표 색이 #RRGGBB 형식이 아니에요', origin)
  }
  if (mode !== 'light' && mode !== 'dark') return bad(400, '모드가 이상해요', origin)
  if (eventName && String(eventName).length > 60) return bad(400, '이벤트명이 너무 길어요', origin)

  const who = await callerId(req)
  if (!(await withinRate('theme', 'owner', who, req))) {
    return bad(429, '조금 천천히 해주세요', origin)
  }

  const { system, user, schema } = themePrompt({ baseColor, mode: mode as 'light' | 'dark', eventName })
  const result = await generateJson({ client: claude!, model, system, user, schema })
  return json(result, 200, origin)
}
