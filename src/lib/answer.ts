import type { DrawnCard } from '@/types/card'
import type { Question } from '@/types/question'
import { readingOf } from './deck'
import { pick } from '@/data/multilingual'
import type { Lang } from '@/i18n'

export interface Answer {
  text: string
  /** 관리자가 직접 쓴 답인지 — 아니면 카드 기본 의미로 대신한 것 */
  fromAdmin: boolean
}

/**
 * 질문 × 카드 답변 (PLANNING.md §2 답변 소스 우선순위)
 *   1. 관리자가 직접 입력한 답변 — **지금 언어로 적어 둔 게 있으면 그것**
 *   2. 미입력 시 카드 기본 의미 중 질문에 설정된 관점 텍스트
 *   3. (추후) AI 생성 답변
 *
 * 폴백이 두 겹이다: 그 언어를 안 적었으면 원문(한국어)으로, 원문도 없으면 카드 의미로.
 * 그래서 주최자가 78장 × 2방향을 세 언어로 다 채우지 않아도 행사가 열린다.
 *
 * **화면은 이 함수 하나만 안다** — 언어를 여기서 받으면 렌더 코드는 안 고쳐도 된다.
 */
export function answerFor(question: Question, drawn: DrawnCard, lang: Lang = 'ko'): Answer {
  const base = question.answers[drawn.card.id]?.[drawn.orientation]?.trim()
  const alt = question.answersI18n?.[drawn.card.id]?.[drawn.orientation]
  const written = pick(base ?? '', alt, lang).trim()
  if (written) return { text: written, fromAdmin: true }

  return { text: readingOf(drawn)[question.fallbackAspect], fromAdmin: false }
}
