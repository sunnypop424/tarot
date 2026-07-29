import { serviceTheme } from './serviceTheme'
import type { Slot } from '@/types/slot'
import type { FontId } from './fonts'

/**
 * 최애 모의고사 **겉모습** — 최고관리자가 슬롯 편집기에서 정한다.
 * 문항·정답·커트라인 같은 **운영값은 주최자**가 `/{slug}/admin` 에서 정한다
 * (`quiz_questions`·`quiz_settings`).
 *
 * 여기서 유일하게 겉모습이 아닌 게 **칭호(`titles`)** 다. 점수대별 이름은 이벤트의 톤 그
 * 자체("입덕 새싹" / "찐팬 인증")이고, 실제로 손님이 공유하는 건 점수가 아니라 칭호다 —
 * 그래서 문안을 만드는 사람 쪽에 뒀다.
 */
export interface QuizDisplay {
  title: string
  showTitle: boolean
  subtitle: string
  showSubtitle: boolean

  /** 점수대별 칭호 — `min` 이상이면 그 칭호. 높은 것부터 찾는다 */
  titles: QuizTitle[]

  font: FontId
  headText: string
  subText: string
  buttonColor: string
  bg: string
  /** 결과 화면 배경 — 칭호 카드를 띄우는 판이라 본문보다 살짝 어둡다 (시안 #f2f1ee) */
  resultBg: string
  logo: string
  logoAlign: 'left' | 'center' | 'right'

  startLabel: string
  nextLabel: string
  submitLabel: string
  resultKicker: string
  /** 칭호 카드 아래 한 줄 — 보통 이벤트 주소 */
  cardFooter: string
  /**
   * 문항 순서 섞기.
   *
   * **보기 섞기는 없다.** 정답이 보기 *인덱스*로 저장돼 있어서(0024) 보기를 섞으면
   * 인덱스가 어긋나 전부 오답이 된다. 제대로 하려면 화면이 "원래 인덱스" 를 들고 다니며
   * 제출 때 되돌려야 하는데, 그건 정답 위치를 클라이언트가 계산한다는 뜻이라
   * "정답은 서버에만" 이라는 이 서비스의 규약과 어긋난다. 켜도 안 되는 스위치를 두느니 뺀다.
   */
  shuffleQuestions: boolean
}

export interface QuizTitle {
  /** 이 점수 이상이면 이 칭호 (백분율) */
  min: number
  label: string
  /**
   * 칭호 그림 (투명 PNG). 칭호 **위**에 뜬다.
   *
   * **`background-image` 로 그린다** — 슬롯 자산이라 길게 눌러 저장되면 안 된다.
   * 다만 저장되는 칭호 카드(캔버스)에는 이 그림이 **같이 그려진다** — 그건 방문자가
   * 획득한 결과물이라 저장이 목적이다 (CLAUDE.md 의 예외).
   */
  image?: string
}

export const DEFAULT_QUIZ: QuizDisplay = {
  title: '최애 모의고사',
  showTitle: true,
  subtitle: '문제를 풀고 나만의 칭호를 받아 가세요',
  showSubtitle: true,
  titles: [
    { min: 0, label: '입덕 새싹' },
    { min: 60, label: '성실한 팬' },
    { min: 90, label: '찐팬 인증' },
  ],
  font: 'pretendard',
  /* 색은 비워 둔다 — 안 고르면 **슬롯 테마에서 파생한다** (`serviceTheme.ts`) */
  headText: '',
  subText: '',
  buttonColor: '',
  bg: '',
  resultBg: '',
  logo: '',
  logoAlign: 'center',
  startLabel: '시작하기',
  nextLabel: '다음',
  submitLabel: '제출하기',
  resultKicker: 'MY TITLE',
  cardFooter: '',
  shuffleQuestions: false,
}

/** 슬롯 설정 + 기본값 — **키 단위로 채운다** */
export function quizDisplay(slot: Slot): QuizDisplay {
  const saved = (slot.quiz ?? {}) as Partial<QuizDisplay>
  const base = serviceTheme(slot)
  return {
    title: saved.title || DEFAULT_QUIZ.title,
    showTitle: saved.showTitle ?? DEFAULT_QUIZ.showTitle,
    subtitle: saved.subtitle ?? DEFAULT_QUIZ.subtitle,
    showSubtitle: saved.showSubtitle ?? DEFAULT_QUIZ.showSubtitle,
    // 빈 배열은 "칭호를 안 쓴다" — 살린다
    titles: saved.titles ?? DEFAULT_QUIZ.titles,
    font: saved.font || DEFAULT_QUIZ.font,
    // 색은 고른 값이 늘 이기고, 안 골랐으면 슬롯 테마를 따른다 (`serviceTheme.ts`)
    headText: saved.headText || base.headText,
    subText: saved.subText || base.subText,
    buttonColor: saved.buttonColor || base.button,
    bg: saved.bg || base.bg,
    resultBg: saved.resultBg || base.wash,
    logo: saved.logo ?? DEFAULT_QUIZ.logo,
    logoAlign: saved.logoAlign || DEFAULT_QUIZ.logoAlign,
    startLabel: saved.startLabel || DEFAULT_QUIZ.startLabel,
    nextLabel: saved.nextLabel || DEFAULT_QUIZ.nextLabel,
    submitLabel: saved.submitLabel || DEFAULT_QUIZ.submitLabel,
    resultKicker: saved.resultKicker ?? DEFAULT_QUIZ.resultKicker,
    cardFooter: saved.cardFooter ?? DEFAULT_QUIZ.cardFooter,
    shuffleQuestions: saved.shuffleQuestions ?? DEFAULT_QUIZ.shuffleQuestions,
  }
}

/**
 * 점수 → 칭호. **백분율로 본다** — 문항 수가 이벤트마다 다른데 칭호 기준을 절대 점수로 두면
 * 문항을 하나 지우는 순간 아무도 최고 칭호를 못 받는다.
 */
export function titleFor(titles: QuizTitle[], score: number, total: number): QuizTitle | null {
  if (!titles.length) return null
  const pct = total > 0 ? Math.round((score / total) * 100) : 0
  const sorted = [...titles].sort((a, b) => b.min - a.min)
  return sorted.find((t) => pct >= t.min) ?? sorted[sorted.length - 1]
}
