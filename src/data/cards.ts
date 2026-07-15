import cardsJson from './cards.json'
import type { Card, Suit } from '@/types/card'

/** 78장 전체 — docs/cards/*.md 에서 생성됨 (npm run cards:build) */
export const CARDS = cardsJson as Card[]

export const MAJOR_CARDS = CARDS.filter((c) => c.arcana === 'major')

/** 덱 범위 — 관리자 설정값과 대응 (PLANNING.md §4-1) */
export type DeckRange = 'major' | 'full'

export function getDeck(range: DeckRange): Card[] {
  return range === 'major' ? MAJOR_CARDS : CARDS
}

export function getCardById(id: string): Card | undefined {
  return CARDS.find((c) => c.id === id)
}

export const SUIT_LABELS: Record<Suit, string> = {
  wands: '완드',
  cups: '컵',
  swords: '소드',
  pentacles: '펜타클',
}
