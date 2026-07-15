import type { Card, DrawnCard, Orientation } from '@/types/card'
import { getDeck, type DeckRange } from '@/data/cards'

/** 역방향 기본 확률 (PLANNING.md §2) */
export const DEFAULT_REVERSED_RATE = 30

export interface SpreadOptions {
  deck?: DeckRange
  /** 펼치는 카드 수 — 미지정 시 덱 전체 (기본: 메이저 22장) */
  spreadCount?: number | null
  allowReversed?: boolean
  reversedRate?: number
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
  reversedRate = DEFAULT_REVERSED_RATE,
}: SpreadOptions = {}): DrawnCard[] {
  const pool: Card[] = getDeck(deck)
  const count = spreadCount ?? pool.length
  const picked = shuffle(pool).slice(0, Math.min(count, pool.length))

  return picked.map((card) => ({
    card,
    orientation: rollOrientation(allowReversed, reversedRate),
  }))
}

function rollOrientation(allowReversed: boolean, rate: number): Orientation {
  if (!allowReversed) return 'upright'
  return Math.random() * 100 < rate ? 'reversed' : 'upright'
}

/** 뽑힌 카드에서 방향에 맞는 해석 묶음을 꺼낸다 */
export function readingOf({ card, orientation }: DrawnCard) {
  return card[orientation]
}
