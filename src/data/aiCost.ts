/**
 * AI 원가 — **`docs/PRICING.md` §1 과 같은 값이어야 한다.**
 *
 * 숫자를 화면에 직접 적지 않고 여기 모으는 이유: 단가는 모델을 바꾸면 바뀌고, 환율은 늘 바뀐다.
 * 화면 여기저기에 곱셈이 흩어져 있으면 한 곳만 고치는 날이 오고, 그러면 **틀린 원가를 보고
 * 가격을 정하게 된다** — 그건 아예 안 보는 것보다 나쁘다.
 *
 * 여기 값은 **추정**이다. 실제 청구는 Anthropic 콘솔이 정한다 — 이 숫자는
 * "실측 원가(`PRICING.md`)가 지금도 맞나" 를 보기 위한 것이다.
 */

/** 지금 쓰는 모델 — `supabase/functions/ai/index.ts` 의 기본값과 같다 */
export const AI_MODEL = 'claude-haiku-4-5'

/** 100만 토큰당 달러 (Haiku 4.5) */
export const RATE_USD_PER_MTOK = {
  input: 1,
  output: 5,
  /** 캐시 읽기는 입력의 0.1배 — 아직 안 켰다 (`0040_ai_tokens.sql`) */
  cacheRead: 0.1,
  /** 캐시 쓰기는 입력의 1.25배 */
  cacheWrite: 1.25,
} as const

/**
 * 환율 — `PRICING.md` 와 같은 1,400원.
 * **실시간 환율을 안 쓴다.** 정산이 아니라 감을 잡는 숫자라, 매번 달라지면 지난달과 비교가 안 된다.
 */
export const USD_TO_KRW = 1400

export interface TokenCounts {
  input: number
  output: number
  cacheRead?: number
  cacheWrite?: number
}

/** 토큰 → 원 (반올림 전 실수). 0.5원짜리 호출이 많아 정수로 접으면 합계가 어긋난다 */
export function costKrw(t: TokenCounts): number {
  const usd =
    (t.input * RATE_USD_PER_MTOK.input +
      t.output * RATE_USD_PER_MTOK.output +
      (t.cacheRead ?? 0) * RATE_USD_PER_MTOK.cacheRead +
      (t.cacheWrite ?? 0) * RATE_USD_PER_MTOK.cacheWrite) /
    1_000_000
  return usd * USD_TO_KRW
}

/** 화면용 — 1원 미만은 소수 한 자리까지 (0원으로 접으면 "안 썼다" 로 읽힌다) */
export function krwLabel(won: number): string {
  if (won === 0) return '0원'
  if (won < 1) return `${won.toFixed(1)}원`
  return `${Math.round(won).toLocaleString('ko-KR')}원`
}
