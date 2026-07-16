/**
 * Claude 호출 — **API 키를 만지는 유일한 자리.**
 *
 * 키는 Edge Function secret 으로만 산다 (`supabase secrets set ANTHROPIC_API_KEY=...`).
 * 레포·프론트·Vercel 환경변수 어디에도 없다 — 있으면 브라우저로 내려간다.
 */

import Anthropic from 'npm:@anthropic-ai/sdk@0.71.0'

/**
 * 기본 모델 — 리딩은 입력이 작고(카드 3장) 출력이 짧아서 Haiku 4.5 로 충분하다.
 * 품질이 모자라면 secret 으로 ANTHROPIC_MODEL=claude-sonnet-5 를 올린다 (docs/PRICING.md 가격표).
 */
export const DEFAULT_MODEL = 'claude-haiku-4-5'

/**
 * 이 모델들은 적응형 사고(adaptive thinking)가 **기본으로 켜진다**.
 * 짧은 타로 리딩엔 지연·비용만 늘어서 명시적으로 끈다. Haiku 4.5 는 기본이 사고 없음이라 그냥 둔다.
 * 모델을 바꿔도 이 정규식이 알아서 가른다.
 */
const THINKS_BY_DEFAULT = /^claude-(sonnet-5|opus-4-[678]|fable-5|mythos-5)/

const thinkingFor = (model: string) =>
  THINKS_BY_DEFAULT.test(model) ? ({ type: 'disabled' } as const) : undefined

export interface Usage {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

// deno-lint-ignore no-explicit-any
type Message = any

/** 토큰 사용량 — 돈이다. 값을 모르면 슬롯 가격을 정할 수 없다 (docs/PRICING.md) */
function usageOf(message: Message): Usage {
  const u = message.usage ?? {}
  return {
    input: u.input_tokens ?? 0,
    output: u.output_tokens ?? 0,
    cacheRead: u.cache_read_input_tokens ?? 0,
    cacheWrite: u.cache_creation_input_tokens ?? 0,
  }
}

const textOf = (message: Message): string =>
  message.content
    .filter((b: Message) => b.type === 'text')
    .map((b: Message) => b.text)
    .join('')

export const createClient = (apiKey: string) => new Anthropic({ apiKey })

/**
 * 일시적인 상류 장애 — 다시 부르면 되는 것들.
 * `overloaded_error` 는 모델이 몰릴 때 온다 (실제로 검증 중에 두 번 맞았다).
 */
const TRANSIENT = /overloaded|rate_limit|api_error|529|503|500/i

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * 리딩 종합 — 스트리밍. 카페에서 30초 안에 읽는 앱이라 몇 초 멈추면 안 된다.
 * `onText(delta)` 로 조각을 흘려보내고, 전체 문자열을 돌려준다.
 *
 * **글자를 내보내기 전이면 다시 시도한다.** 과부하는 스트림 **도중에** 이벤트로 와서
 * SDK 의 자동 재시도가 안 걸린다 — 그대로 두면 카페 방문자의 리딩이 상류 사정으로 날아간다.
 * 이미 내보낸 뒤라면 재시도하지 않는다: 앞부분이 두 번 나가 글이 겹친다.
 */
export async function streamReading({
  client,
  model,
  system,
  user,
  onText,
  attempts = 3,
}: {
  client: Anthropic
  model: string
  system: string
  user: string
  onText: (delta: string) => void
  attempts?: number
}): Promise<{ text: string; usage: Usage }> {
  let lastError: unknown

  for (let i = 0; i < attempts; i++) {
    let emitted = false
    try {
      const stream = client.messages.stream({
        model,
        max_tokens: 1024,
        system,
        thinking: thinkingFor(model),
        messages: [{ role: 'user', content: user }],
      })

      stream.on('text', (delta: string) => {
        emitted = true
        onText(delta)
      })
      const message = await stream.finalMessage()

      return { text: textOf(message), usage: usageOf(message) }
    } catch (e) {
      lastError = e
      // 이미 글자가 나갔거나, 다시 불러도 소용없는 에러면 그대로 올린다
      if (emitted || !TRANSIENT.test(String(e))) throw e
      if (i < attempts - 1) await sleep(400 * 2 ** i)
    }
  }

  throw lastError
}

/**
 * 구조화 출력으로 JSON 을 받는다 — 질문 답변, 테마 색 둘 다 이걸 쓴다.
 * 스키마를 강제하므로 파싱이 흔들리지 않는다 (흔들리면 검수 화면이 통째로 깨진다).
 * 스트리밍하지 않는다 — 한 덩어리로 와야 쓸 수 있는 결과들이다.
 */
export async function generateJson({
  client,
  model,
  system,
  user,
  schema,
}: {
  client: Anthropic
  model: string
  system: string
  user: string
  schema: unknown
}): Promise<Record<string, unknown> & { usage: Usage }> {
  const message = await client.messages.create({
    model,
    max_tokens: 8192,
    system,
    thinking: thinkingFor(model),
    output_config: { format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content: user }],
  })

  if (message.stop_reason === 'refusal') throw new Error('생성이 거절됐어요')
  if (message.stop_reason === 'max_tokens') {
    throw new Error('답변이 잘렸어요 — 묶음 크기를 줄여주세요')
  }

  return { ...JSON.parse(textOf(message)), usage: usageOf(message) }
}
