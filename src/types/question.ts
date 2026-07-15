import type { Aspect, Orientation } from './card'
import type { DeckRange } from '@/data/cards'

/** 카드별 관리자 입력 답변 — 미입력 시 카드 기본 의미로 폴백 */
export type QuestionAnswers = Record<string, Partial<Record<Orientation, string>>>

/**
 * 관리자가 등록하는 커스텀 질문 (PLANNING.md §4-1).
 * v1 은 관리자 페이지에서 내보낸 questions.json 을 빌드에 포함한다.
 */
export interface Question {
  id: string
  question: string
  published: boolean
  /** 뽑는 카드 수 (1~3) */
  cardCount: number
  deck: DeckRange
  /** 펼치는 카드 수 — null 이면 덱 전체 (기본: 메이저 22장) */
  spreadCount: number | null
  allowReversed: boolean
  reversedRate: number
  /** 답변 미입력 시 폴백으로 읽을 카드 관점 */
  fallbackAspect: Aspect
  /** `{cardId}` → 방향별 답변 */
  answers: QuestionAnswers
}
