import type { Slot } from '@/types/slot'
import type { FontId } from './fonts'

/**
 * 포토카드 뽑기 **겉모습** — 최고관리자가 슬롯 편집기에서 정한다.
 * 카드 목록·모드·재고 같은 **운영값은 주최자**가 `/{slug}/admin` 에서 정한다
 * (`photocards`·`photocard_settings`).
 */
export interface PhotocardDisplay {
  title: string
  showTitle: boolean

  /** 덱에 깔 뒷면 장수 — 실제 카드 종류와 무관한 **연출값**이다 */
  spreadCount: number
  deckGuide: string
  drawLabel: string
  saveLabel: string
  lockerLabel: string
  ticketHeadline: string
  ticketGuide: string
  /** sale 모드 안내 화면 (방문자 폰엔 이것뿐이다) */
  counterTitle: string
  counterBody: string
  counterHours: string

  font: FontId
  /** 덱·결과 화면의 바탕. **어두운 게 기본이다** — 카드가 주인공이라 주변이 밝으면 눈이 그리로 간다 */
  deckBg: string
  deckGlow: string
  /** 밝은 화면(뽑기권·보관함·안내)의 값 */
  bg: string
  headText: string
  subText: string
  buttonColor: string
  logo: string
}

export const DEFAULT_PHOTOCARD: PhotocardDisplay = {
  title: '포토카드 뽑기',
  showTitle: true,
  spreadCount: 13,
  deckGuide: '마음이 가는 카드를 한 장 골라 주세요',
  drawLabel: '뽑기권 받기',
  saveLabel: '저장',
  lockerLabel: '보관함',
  ticketHeadline: '뽑기권을 받아 주세요',
  ticketGuide: '뽑기권을 받아 카운터에 보여 주시면 스태프가 대신 뽑아 드려요.',
  counterTitle: '카운터에서 뽑을 수 있어요',
  counterBody: '포토카드 뽑기는 현장 스태프 기기에서 진행돼요. 카운터에 방문해 주세요.',
  counterHours: '',
  font: 'pretendard',
  deckBg: '#1c1d22',
  deckGlow: '#3b3d4c',
  bg: '#ffffff',
  headText: '#1f1f1f',
  subText: '#7a7a78',
  buttonColor: '#26262a',
  logo: '',
}

/** 슬롯 설정 + 기본값 — **키 단위로 채운다** */
export function photocardDisplay(slot: Slot): PhotocardDisplay {
  const saved = (slot.photocard ?? {}) as Partial<PhotocardDisplay>
  return {
    title: saved.title || DEFAULT_PHOTOCARD.title,
    showTitle: saved.showTitle ?? DEFAULT_PHOTOCARD.showTitle,
    spreadCount: saved.spreadCount ?? DEFAULT_PHOTOCARD.spreadCount,
    deckGuide: saved.deckGuide ?? DEFAULT_PHOTOCARD.deckGuide,
    drawLabel: saved.drawLabel || DEFAULT_PHOTOCARD.drawLabel,
    saveLabel: saved.saveLabel || DEFAULT_PHOTOCARD.saveLabel,
    lockerLabel: saved.lockerLabel || DEFAULT_PHOTOCARD.lockerLabel,
    ticketHeadline: saved.ticketHeadline || DEFAULT_PHOTOCARD.ticketHeadline,
    ticketGuide: saved.ticketGuide ?? DEFAULT_PHOTOCARD.ticketGuide,
    counterTitle: saved.counterTitle || DEFAULT_PHOTOCARD.counterTitle,
    counterBody: saved.counterBody ?? DEFAULT_PHOTOCARD.counterBody,
    counterHours: saved.counterHours ?? DEFAULT_PHOTOCARD.counterHours,
    font: saved.font || DEFAULT_PHOTOCARD.font,
    deckBg: saved.deckBg || DEFAULT_PHOTOCARD.deckBg,
    deckGlow: saved.deckGlow || DEFAULT_PHOTOCARD.deckGlow,
    bg: saved.bg || DEFAULT_PHOTOCARD.bg,
    headText: saved.headText || DEFAULT_PHOTOCARD.headText,
    subText: saved.subText || DEFAULT_PHOTOCARD.subText,
    buttonColor: saved.buttonColor || DEFAULT_PHOTOCARD.buttonColor,
    logo: saved.logo ?? DEFAULT_PHOTOCARD.logo,
  }
}

export type PhotocardMode = 'save' | 'gift' | 'sale'

/**
 * 모드가 정하는 것들 — **주최자는 모드 하나만 고르고 나머지는 여기서 파생된다.**
 *
 * `purpose × operator × ticket` 을 독립 축으로 두면 8조합이 되고 그중 대부분이 말이 안 된다
 * (돈은 받는데 방문자 폰에서 뽑기 등). 이 표 하나가 그 조합 폭발을 없앤다.
 *
 * **화면·RPC 가 전부 여기서 읽는다.** 새 모드가 생기면 여기만 고친다.
 */
export interface PhotocardRules {
  /** 방문자 폰에서 직접 뽑나 */
  visitorDraws: boolean
  /** 뽑기권을 쓰나 */
  usesTicket: boolean
  /** 실물을 주나 */
  physical: boolean
  /** 방문자 화면이 존재하나 (sale 은 안내 한 장뿐) */
  visitorScreen: boolean
  /** 스태프 기기에서 N연차를 뽑나 */
  batch: boolean
}

export function photocardRules(mode: PhotocardMode): PhotocardRules {
  switch (mode) {
    case 'save':
      return { visitorDraws: true, usesTicket: false, physical: false, visitorScreen: true, batch: false }
    case 'gift':
      // 방문자 폰이 뽑기권을 만들고 **스태프 기기**가 뽑는다 — 실물이 걸리면 방문자 폰이 단독으로 결정하지 않는다
      return { visitorDraws: false, usesTicket: true, physical: true, visitorScreen: true, batch: false }
    case 'sale':
      return { visitorDraws: false, usesTicket: false, physical: true, visitorScreen: false, batch: true }
  }
}

/** 레어도 이름 — 숫자만 보이면 손님에게 아무 뜻이 없다 */
export const RARITY_LABEL: Record<number, string> = {
  1: '기본',
  2: '레어',
  3: '스페셜',
  4: '시크릿',
  5: '전설',
}
