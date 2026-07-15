import type { DrawnCard, Suit } from '@/types/card'

export type Verdict = 'yes' | 'no' | 'maybe'

export const VERDICT_LABEL: Record<Verdict, string> = {
  yes: '예',
  no: '아니오',
  maybe: '글쎄요',
}

/** 판정 아래 붙는 한 줄 — 단정하지 않는 화법 (DESIGN.md §10) */
export const VERDICT_NOTE: Record<Verdict, string> = {
  yes: '지금 흐름은 긍정 쪽으로 기울어 있어요.',
  no: '지금은 흐름이 받쳐주지 않는 편이에요.',
  maybe: '아직 어느 쪽으로도 기울지 않았어요.',
}

/** 메이저 아르카나 번호별 판정 (정방향 기준) */
const MAJOR: Record<number, Verdict> = {
  0: 'maybe', // 바보 — 시작은 열려 있지만 결과는 미지수
  1: 'yes', // 마법사
  2: 'maybe', // 여사제 — 아직 드러나지 않음
  3: 'yes', // 여황제
  4: 'yes', // 황제
  5: 'yes', // 교황
  6: 'yes', // 연인
  7: 'yes', // 전차
  8: 'yes', // 힘
  9: 'maybe', // 은둔자 — 지금은 멈춰 살필 때
  10: 'yes', // 운명의 수레바퀴
  11: 'maybe', // 정의 — 옳으냐에 달림
  12: 'no', // 매달린 사람 — 정체
  13: 'no', // 죽음 — 지금 형태로는 끝
  14: 'maybe', // 절제 — 조율이 필요
  15: 'no', // 악마
  16: 'no', // 탑
  17: 'yes', // 별
  18: 'no', // 달 — 불확실·혼란
  19: 'yes', // 태양
  20: 'yes', // 심판
  21: 'yes', // 세계
}

/** 마이너 수트별 기본 성향 (정방향) */
const SUIT_DEFAULT: Record<Suit, Verdict> = {
  wands: 'yes', // 불 — 추진
  cups: 'yes', // 물 — 감정의 긍정
  swords: 'no', // 공기 — 갈등·판단의 무게
  pentacles: 'yes', // 흙 — 현실적 결실
}

/** 수트 기본 성향에서 벗어나는 카드 */
const MINOR_EXCEPTIONS: Partial<Record<Suit, Record<number, Verdict>>> = {
  wands: { 5: 'maybe', 7: 'maybe', 10: 'no' },
  cups: { 5: 'no', 7: 'maybe', 8: 'no' },
  swords: { 2: 'maybe', 6: 'maybe', 11: 'maybe', 14: 'maybe' },
  pentacles: { 5: 'no', 7: 'maybe' },
}

/**
 * 예/아니오 판정 (PLANNING.md §2).
 * 역방향은 뒤집는다 — yes↔no, maybe 는 그대로.
 * (역방향이 답을 뒤집는 게 가장 직관적이고, 예/아니오 분포도 균형을 유지한다)
 */
export function verdictOf({ card, orientation }: DrawnCard): Verdict {
  const upright =
    card.arcana === 'major'
      ? (MAJOR[card.number] ?? 'maybe')
      : (MINOR_EXCEPTIONS[card.suit!]?.[card.number] ?? SUIT_DEFAULT[card.suit!])

  if (orientation === 'upright') return upright
  if (upright === 'yes') return 'no'
  if (upright === 'no') return 'yes'
  return 'maybe'
}
