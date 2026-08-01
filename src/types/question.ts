import type { Aspect, Orientation } from './card'
import type { I18nText } from '@/data/multilingual'
import type { DeckRange } from '@/data/cards'

/**
 * 질문 타로는 **한 장이다.**
 *
 * 질문 하나에 답 하나 — 여러 장을 뽑으면 답이 여러 덩어리로 흩어져서 "그래서 답이 뭔데?"가 사라진다.
 * 여러 장을 하나의 흐름으로 읽는 건 포지션에 역할이 있는 주제별 3장 스프레드(애정·금전·직업)가 맡고,
 * 거기서만 AI 종합이 붙는다.
 *
 * 화면·검증은 저장분의 `cardCount` 대신 이 값을 쓴다 (옛 저장분에 다른 값이 남아 있어도 한 장으로 돈다).
 */
export const QUESTION_CARD_COUNT = 1

/** 카드별 관리자 입력 답변 — 미입력 시 카드 기본 의미로 폴백 */
export type QuestionAnswers = Record<string, Partial<Record<Orientation, string>>>

/**
 * 같은 답변의 **언어별 판** — `{카드id: {정/역: {en: '…', ja: '…'}}}`.
 *
 * 원문(`answers`)은 그대로 둔다. 안 적은 언어는 원문으로 떨어지고, 원문도 없으면 지금처럼
 * 카드 기본 의미로 간다 (`src/lib/answer.ts`) — 폴백이 두 겹이라 빈칸이 고장이 아니다.
 */
export type QuestionAnswersI18n = Record<string, Partial<Record<Orientation, I18nText>>>

/**
 * 관리자가 등록하는 커스텀 질문 (PLANNING.md §4-1).
 * v1 은 관리자 페이지에서 내보낸 questions.json 을 빌드에 포함한다.
 */
export interface Question {
  id: string
  question: string
  published: boolean
  /**
   * 뽑는 카드 수 — **항상 1**. 질문 하나에 답 하나다.
   * 화면은 이 값을 읽지 않고 `QUESTION_CARD_COUNT`(src/screens/Question.tsx)를 쓴다.
   * 여러 장을 하나의 흐름으로 읽는 건 포지션에 역할이 있는 주제별 3장 스프레드가 맡는다.
   */
  cardCount: number
  /**
   * @deprecated 카드 범위는 **슬롯 설정**이다 (`getSlotDeck`) — 최고관리자만 정한다.
   * 화면은 이 값을 읽지 않는다. 옛 저장분 호환으로만 남아 있다.
   */
  deck: DeckRange
  /** 펼치는 카드 수 — null 이면 슬롯 덱 전체. 주최자가 정한다 */
  spreadCount: number | null
  /** 역방향을 쓸지 — 확률은 고정 50% (`REVERSED_RATE`), 아무도 못 바꾼다 */
  allowReversed: boolean
  /**
   * @deprecated 역방향 확률은 고정이다 (`REVERSED_RATE`, src/lib/deck.ts).
   * 화면은 이 값을 읽지 않는다. 옛 저장분 호환으로만 남아 있다.
   */
  reversedRate: number
  /** 답변 미입력 시 폴백으로 읽을 카드 관점 */
  fallbackAspect: Aspect
  /** `{cardId}` → 방향별 답변 */
  answers: QuestionAnswers
  /** 주최자가 언어별로 적은 질문 — 없으면 `question` */
  questionI18n?: I18nText
  /** 주최자가 언어별로 적은 답변 — 없으면 `answers` */
  answersI18n?: QuestionAnswersI18n
}
