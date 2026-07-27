import type { Slot } from '@/types/slot'
import type { FontId } from './fonts'

/**
 * 실시간 투표 **겉모습** — 최고관리자가 슬롯 편집기에서 정한다.
 * 설문·선택지 같은 **운영 데이터는 주최자**가 `/{slug}/admin` 에서 만든다 (럭드 상품표와 같은 경계).
 */
export interface PollDisplay {
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
  headText: '#1f1f1f',
  subText: '#7a7a78',
  buttonColor: '#26262a',
  bg: '#ffffff',
  barColor: '#26262a',
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
  return {
    title: saved.title || DEFAULT_POLL.title,
    showTitle: saved.showTitle ?? DEFAULT_POLL.showTitle,
    subtitle: saved.subtitle ?? DEFAULT_POLL.subtitle,
    showSubtitle: saved.showSubtitle ?? DEFAULT_POLL.showSubtitle,
    font: saved.font || DEFAULT_POLL.font,
    headText: saved.headText || DEFAULT_POLL.headText,
    subText: saved.subText || DEFAULT_POLL.subText,
    buttonColor: saved.buttonColor || DEFAULT_POLL.buttonColor,
    bg: saved.bg || DEFAULT_POLL.bg,
    barColor: saved.barColor || DEFAULT_POLL.barColor,
    logo: saved.logo ?? DEFAULT_POLL.logo,
    logoAlign: saved.logoAlign || DEFAULT_POLL.logoAlign,
    resultMode: saved.resultMode || DEFAULT_POLL.resultMode,
    showCount: saved.showCount ?? DEFAULT_POLL.showCount,
    chartStyle: saved.chartStyle || DEFAULT_POLL.chartStyle,
    voteLabel: saved.voteLabel || DEFAULT_POLL.voteLabel,
    thanksText: saved.thanksText ?? DEFAULT_POLL.thanksText,
  }
}
