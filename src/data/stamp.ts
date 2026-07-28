import type { Slot } from '@/types/slot'
import type { FontId } from './fonts'

/**
 * 방문 스탬프 **겉모습** — 최고관리자가 슬롯 편집기에서 정한다.
 * 현장 암호·보상 방식 같은 **운영값은 주최자**가 `/{slug}/admin` 에서 정한다
 * (`stamp_settings` 테이블) — 럭드에서 상품표가 주최자 것인 것과 같은 경계다.
 */
export interface StampDisplay {
  title: string
  showTitle: boolean
  subtitle: string
  showSubtitle: boolean

  /**
   * 칸 정의 — 이 개수가 곧 판의 크기다. **서버도 이 값을 읽는다**
   * (`stamp_checkin` 이 완성 여부를 판단할 때) — 화면과 서버가 같은 수를 봐야 한다.
   */
  stamps: StampCell[]

  font: FontId
  headText: string
  subText: string
  buttonColor: string
  bg: string
  /** 찍힌 도장 색 */
  stampColor: string
  logo: string
  logoAlign: 'left' | 'center' | 'right'

  codeLabel: string
  codeHint: string
}

export interface StampCell {
  /** 코드와 이어지는 열쇠 — `stamp_codes.stamp_id` */
  id: string
  /** 칸 이름 — "1번 카페", "포토존 참여" */
  name: string
  /**
   * 찍힌 도장 그림 (투명 PNG). 없으면 내장 아이콘(도장·별·하트)이 돌아가며 들어간다.
   *
   * **`background-image` 로 그린다** — 슬롯 자산이라 길게 눌러 저장되면 안 된다 (CLAUDE.md).
   * 도장색(`stampColor`)은 이 그림엔 안 먹는다: PNG 의 색이 그대로 나온다.
   */
  icon?: string
}

export const DEFAULT_STAMP: StampDisplay = {
  title: '방문 스탬프',
  showTitle: true,
  subtitle: '이벤트에 참여하고 받은 암호를 입력하면 도장이 찍혀요',
  showSubtitle: true,
  stamps: [],
  font: 'pretendard',
  headText: '#1f1f1f',
  subText: '#7a7a78',
  buttonColor: '#26262a',
  bg: '#ffffff',
  stampColor: '#3a3a3f',
  logo: '',
  logoAlign: 'left',
  codeLabel: '암호 입력',
  codeHint: '각 이벤트를 마치면 암호를 알려드려요.',
}

/** 슬롯 설정 + 기본값 — **키 단위로 채운다** */
export function stampDisplay(slot: Slot): StampDisplay {
  const saved = (slot.stamp ?? {}) as Partial<StampDisplay>
  return {
    title: saved.title || DEFAULT_STAMP.title,
    showTitle: saved.showTitle ?? DEFAULT_STAMP.showTitle,
    subtitle: saved.subtitle ?? DEFAULT_STAMP.subtitle,
    showSubtitle: saved.showSubtitle ?? DEFAULT_STAMP.showSubtitle,
    // 빈 배열은 "아직 칸을 안 만들었다" — 살린다
    stamps: saved.stamps ?? DEFAULT_STAMP.stamps,
    font: saved.font || DEFAULT_STAMP.font,
    headText: saved.headText || DEFAULT_STAMP.headText,
    subText: saved.subText || DEFAULT_STAMP.subText,
    buttonColor: saved.buttonColor || DEFAULT_STAMP.buttonColor,
    bg: saved.bg || DEFAULT_STAMP.bg,
    stampColor: saved.stampColor || DEFAULT_STAMP.stampColor,
    logo: saved.logo ?? DEFAULT_STAMP.logo,
    logoAlign: saved.logoAlign || DEFAULT_STAMP.logoAlign,
    codeLabel: saved.codeLabel || DEFAULT_STAMP.codeLabel,
    codeHint: saved.codeHint ?? DEFAULT_STAMP.codeHint,
  }
}
