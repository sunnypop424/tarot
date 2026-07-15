import type { DrawnCard } from '@/types/card'
import type { Question } from '@/types/question'
import { readingOf } from './deck'

export interface Answer {
  text: string
  /** 관리자가 직접 쓴 답인지 — 아니면 카드 기본 의미로 대신한 것 */
  fromAdmin: boolean
}

/**
 * 질문 × 카드 답변 (PLANNING.md §2 답변 소스 우선순위)
 *   1. 관리자가 직접 입력한 답변
 *   2. 미입력 시 카드 기본 의미 중 질문에 설정된 관점 텍스트
 *   3. (추후) AI 생성 답변
 */
export function answerFor(question: Question, drawn: DrawnCard): Answer {
  const written = question.answers[drawn.card.id]?.[drawn.orientation]?.trim()
  if (written) return { text: written, fromAdmin: true }

  return { text: readingOf(drawn)[question.fallbackAspect], fromAdmin: false }
}
