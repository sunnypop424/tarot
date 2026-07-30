import { authHeader, db, hasSupabase } from './client'
import { fail } from './http'
import type {
  AiUsageRow,
  AnswerGenInput,
  GeneratedAnswer,
  AiRepo,
  SynthesisInput,
  ThemeGenInput,
} from './types'

/**
 * AI 리딩 어댑터 — 서버 엔드포인트를 부른다.
 *
 * **키를 클라이언트에 둘 수 없다**는 게 이 파일이 존재하는 이유 전부다.
 * 여기는 fetch 만 하고, Claude 는 저쪽에서 부른다:
 * 개발도 배포도 **같은 Supabase Edge Function** 을 부른다 (`VITE_AI_BASE`).
 * 구현이 둘이면 프롬프트·한도가 어긋난다 — 그래서 개발 서버 미들웨어를 없앴다 (docs/BACKEND.md §4).
 *
 * 저장소 어댑터(local/supabase)와 독립이다. 질문이 localStorage 에 있든 DB 에 있든
 * AI 를 부르는 쪽은 같다.
 *
 * **인증은 붙인다.** 배포된 함수는 경로마다 권한이 다르다 — 답변 생성은 그 슬롯 주최자만,
 * 색 만들기는 최고관리자만, 리딩은 (익명이라도) 토큰이 있어야 레이트리밋을 셀 수 있다.
 * Supabase 를 안 붙였으면 `authHeader` 가 빈 헤더를 주고, 함수는 그걸 권한 없음으로 본다.
 */

/** 없으면 AI 는 꺼진 채로 돈다 — `ready()` 가 false 를 주고 화면이 조용히 접힌다 */
const BASE = import.meta.env.VITE_AI_BASE ?? ''

/** 한 번에 보낼 카드 수 — 서버의 MAX_CARDS_PER_BATCH 와 맞춘다 */
const BATCH = 12

export const httpAi: AiRepo = {
  async ready() {
    try {
      const res = await fetch(`${BASE}/status`)
      if (!res.ok) return false
      const { ready } = (await res.json()) as { ready: boolean }
      return ready
    } catch {
      // 엔드포인트가 아예 없는 배포(=지금)에선 조용히 꺼진다
      return false
    }
  },

  async synthesize(slug, input: SynthesisInput, onText) {
    // 방문자는 로그인하지 않는다 — 여기서 익명 토큰을 받는다 (repo/client.ts)
    const auth = await authHeader({ anonymous: true })
    const res = await fetch(`${BASE}/reading`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify({ slug, ...input }),
    })
    if (!res.ok || !res.body) return fail(res)

    // SSE — `event: text|done|error` + `data: {...}`
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let full = ''

    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // 이벤트는 빈 줄로 끊긴다. 마지막 조각은 아직 안 끝났을 수 있으니 남겨둔다
      const chunks = buffer.split('\n\n')
      buffer = chunks.pop() ?? ''

      for (const chunk of chunks) {
        const event = /^event: (.+)$/m.exec(chunk)?.[1]
        const raw = /^data: (.+)$/m.exec(chunk)?.[1]
        if (!event || !raw) continue
        const data = JSON.parse(raw) as { text?: string; error?: string }

        if (event === 'error') throw new Error(data.error ?? '리딩을 만들지 못했어요')
        if (event === 'text' && data.text) {
          full += data.text
          onText?.(data.text)
        }
      }
    }

    return full
  },

  async generateTheme(input: ThemeGenInput) {
    // 최고관리자만 — 이미 로그인해 있다
    const res = await fetch(`${BASE}/theme`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(input),
    })
    if (!res.ok) return fail(res)
    // usage 는 서버가 붙여 보내지만 화면은 안 쓴다 — 색만 꺼낸다
    const { usage, ...colors } = (await res.json()) as Record<string, string>
    void usage
    return colors
  },

  async generateAnswers(slug, input: AnswerGenInput, onProgress) {
    const out: GeneratedAnswer[] = []
    // 그 슬롯 주최자만 — 이미 로그인해 있다
    const auth = await authHeader()

    // 78장을 한 번에 요청하면 응답이 잘린다 — 묶음으로 나눠 보내고 진행률을 알린다.
    // `batchIndex` 는 서버가 한도를 세는 단위다 — 7묶음이 와도 "전체 생성 1회"로 센다
    for (let i = 0; i < input.cardIds.length; i += BATCH) {
      const cardIds = input.cardIds.slice(i, i + BATCH)
      const res = await fetch(`${BASE}/answers`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...auth },
        body: JSON.stringify({ slug, ...input, cardIds, batchIndex: i / BATCH }),
      })
      if (!res.ok) return fail(res)

      const { answers } = (await res.json()) as { answers: GeneratedAnswer[] }
      out.push(...answers)
      onProgress?.(Math.min(i + BATCH, input.cardIds.length), input.cardIds.length)
    }

    return out
  },

  /**
   * 사용량 — **Edge Function 이 아니라 DB 를 직접 읽는다.**
   *
   * 함수를 거칠 이유가 없다: 키가 필요한 일(Claude 호출)이 아니고, 누가 읽을 수 있나는
   * 이미 RLS 가 정한다(`owner reads ai usage`, 0040 §3). 함수를 하나 더 만들면 같은 판정이
   * 두 곳에 생긴다.
   *
   * 못 읽으면 **빈 배열**이다 — 최고관리자가 아니거나 Supabase 를 안 붙인 빌드.
   * 화면은 그걸 "0" 이 아니라 "볼 수 없다" 로 그린다 (0 과 모름은 다르다).
   */
  async usage(): Promise<AiUsageRow[]> {
    if (!hasSupabase) return []
    try {
      const client = await db()
      const { data, error } = await client
        .from('ai_usage')
        .select(
          'slug,reading,answer_gen,reading_in,reading_out,answer_in,answer_out,cache_read,cache_write,updated_at'
        )
        .order('updated_at', { ascending: false })
      if (error || !data) return []
      return data.map((r) => ({
        slug: r.slug as string,
        reading: (r.reading as number) ?? 0,
        answerGen: (r.answer_gen as number) ?? 0,
        readingIn: (r.reading_in as number) ?? 0,
        readingOut: (r.reading_out as number) ?? 0,
        answerIn: (r.answer_in as number) ?? 0,
        answerOut: (r.answer_out as number) ?? 0,
        cacheRead: (r.cache_read as number) ?? 0,
        cacheWrite: (r.cache_write as number) ?? 0,
        updatedAt: (r.updated_at as string) ?? '',
      }))
    } catch {
      return []
    }
  },
}
