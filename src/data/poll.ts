import { serviceTheme } from './serviceTheme'
import type { Slot } from '@/types/slot'
import type { FontId } from './fonts'
import type { DisplayI18n } from './multilingual'

/**
 * 실시간 투표 **겉모습** — 최고관리자가 슬롯 편집기에서 정한다.
 * 설문·선택지 같은 **운영 데이터는 주최자**가 `/{slug}/admin` 에서 만든다 (럭드 상품표와 같은 경계).
 */
export interface PollDisplay {
  /**
   * 주최자가 언어별로 적어 둔 값 — 키는 이 설정의 필드 이름이다.
   * `useLocalizedDisplay` 가 화면을 그리기 전에 갈아 끼운다 (`src/i18n/display.ts`).
   */
  i18n?: DisplayI18n

  title: string
  showTitle: boolean
  subtitle: string
  showSubtitle: boolean

  font: FontId
  headText: string
  subText: string
  buttonColor: string
  bg: string
  /** 막대·하트가 차오르는 색 */
  barColor: string
  logo: string
  logoAlign: 'left' | 'center' | 'right'

  /**
   * 결과를 언제 보여줄지.
   *  live      — 투표 전에도 결과가 보인다
   *  afterVote — 내가 찍은 뒤에만 (초반 표 쏠림을 막는다)
   *  closed    — 마감된 뒤에만
   */
  resultMode: 'live' | 'afterVote' | 'closed'
  /** 표 수를 숨긴다 — 순위가 민망한 항목이 있을 때 (퍼센트·막대만) */
  showCount: boolean
  /** 막대 대신 하트가 채워지는 변형 */
  chartStyle: 'bar' | 'heart'

  voteLabel: string
  thanksText: string
}

export const DEFAULT_POLL: PollDisplay = {
  title: '실시간 투표',
  showTitle: true,
  subtitle: '참여하고 싶은 설문을 골라 주세요',
  showSubtitle: true,
  font: 'pretendard',
  /* 색은 비워 둔다 — 안 고르면 **슬롯 테마에서 파생한다** (`serviceTheme.ts`) */
  headText: '',
  subText: '',
  buttonColor: '',
  bg: '',
  barColor: '',
  logo: '',
  logoAlign: 'left',
  resultMode: 'afterVote',
  showCount: true,
  chartStyle: 'bar',
  voteLabel: '투표하기',
  thanksText: '참여해 주셔서 고마워요',
}

/** 슬롯 설정 + 기본값 — **키 단위로 채운다** (`rollingDisplay` 와 같은 이유) */
export function pollDisplay(slot: Slot): PollDisplay {
  const saved = (slot.poll ?? {}) as Partial<PollDisplay>
  const base = serviceTheme(slot)
  return {
    /** 주최자가 언어별로 적어 둔 값 — 기본값이 없다 (안 적으면 없는 게 맞다) */
    i18n: saved.i18n,
    title: saved.title || DEFAULT_POLL.title,
    showTitle: saved.showTitle ?? DEFAULT_POLL.showTitle,
    subtitle: saved.subtitle ?? DEFAULT_POLL.subtitle,
    showSubtitle: saved.showSubtitle ?? DEFAULT_POLL.showSubtitle,
    font: saved.font || DEFAULT_POLL.font,
    // 색은 고른 값이 늘 이기고, 안 골랐으면 슬롯 테마를 따른다 (`serviceTheme.ts`)
    headText: saved.headText || base.headText,
    subText: saved.subText || base.subText,
    buttonColor: saved.buttonColor || base.button,
    bg: saved.bg || base.bg,
    // 막대·하트가 차오르는 색 — 버튼과 같은 강조색에서 온다
    barColor: saved.barColor || base.button,
    logo: saved.logo ?? DEFAULT_POLL.logo,
    logoAlign: saved.logoAlign || DEFAULT_POLL.logoAlign,
    resultMode: saved.resultMode || DEFAULT_POLL.resultMode,
    showCount: saved.showCount ?? DEFAULT_POLL.showCount,
    chartStyle: saved.chartStyle || DEFAULT_POLL.chartStyle,
    voteLabel: saved.voteLabel || DEFAULT_POLL.voteLabel,
    thanksText: saved.thanksText ?? DEFAULT_POLL.thanksText,
  }
}
