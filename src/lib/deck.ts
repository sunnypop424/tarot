import type { Card, DrawnCard, Orientation } from '@/types/card'
import { getDeck, type DeckRange } from '@/data/cards'

/**
 * 역방향 확률 — **고정 50%**. 아무도 못 바꾼다 (주최자도, 최고관리자도).
 *
 * 확률을 열어두면 "몇 %가 맞나"라는 답 없는 질문이 생기고, 슬롯마다 값이 갈려
 * 같은 카드가 다른 앱처럼 나온다. 정/역은 동전 던지기 — 그게 가장 설명하기 쉽다.
 */
export const REVERSED_RATE = 50

export interface SpreadOptions {
  deck?: DeckRange
  /** 펼치는 카드 수 — 미지정 시 덱 전체 (기본: 메이저 22장) */
  spreadCount?: number | null
  /** 역방향을 쓸지 말지만 고른다 — 확률은 REVERSED_RATE 고정 */
  allowReversed?: boolean
}

/** Fisher-Yates — 원본 배열을 건드리지 않는다 */
export function shuffle<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * 화면에 펼칠 카드를 만든다.
 * 각 카드의 정/역방향은 이 시점에 결정되고, 사용자는 뒷면만 보므로 알 수 없다.
 */
export function buildSpread({
  deck = 'major',
  spreadCount = null,
  allowReversed = true,
}: SpreadOptions = {}): DrawnCard[] {
  const pool: Card[] = getDeck(deck)
  const count = spreadCount ?? pool.length
  const picked = shuffle(pool).slice(0, Math.min(count, pool.length))

  return picked.map((card) => ({
    card,
    orientation: rollOrientation(allowReversed),
  }))
}

function rollOrientation(allowReversed: boolean): Orientation {
  if (!allowReversed) return 'upright'
  return Math.random() * 100 < REVERSED_RATE ? 'reversed' : 'upright'
}

/** 뽑힌 카드에서 방향에 맞는 해석 묶음을 꺼낸다 */
export function readingOf({ card, orientation }: DrawnCard) {
  return card[orientation]
}
