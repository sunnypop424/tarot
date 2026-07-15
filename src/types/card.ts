export type Arcana = 'major' | 'minor'
export type Suit = 'wands' | 'cups' | 'swords' | 'pentacles'
export type Orientation = 'upright' | 'reversed'

/** 카드 관점별 해석 — 사용자에게 노출되는 운세 텍스트 + AI 참고용 core */
export interface CardReading {
  /** 카드 자체의 본질 의미 (관점 무관, 중립 서술체). 도감 + AI 프롬프트 컨텍스트용 */
  core: string
  general: string
  love: string
  money: string
  career: string
  advice: string
}

/** 운세 관점 — 카테고리별로 어떤 필드를 읽을지 고를 때 사용 */
export type Aspect = keyof Omit<CardReading, 'core'>

export interface Card {
  /** `major-0`, `wands-3` 형식 */
  id: string
  name: string
  nameEn: string
  arcana: Arcana
  suit: Suit | null
  number: number
  keywords: string[]
  /** 카드 그림·상징 묘사 (방향 무관) */
  symbolism: string
  upright: CardReading
  reversed: CardReading
}

/** 뽑힌 카드 한 장 — 카드 + 방향 */
export interface DrawnCard {
  card: Card
  orientation: Orientation
}
