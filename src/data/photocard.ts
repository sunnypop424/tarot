import { serviceTheme } from './serviceTheme'
import type { Slot } from '@/types/slot'
import type { FontId } from './fonts'
import type { CountPickerStyle } from './countPicker'
import type { DisplayI18n } from './multilingual'

/**
 * 포토카드 뽑기 **겉모습** — 최고관리자가 슬롯 편집기에서 정한다.
 * 카드 목록·모드·재고 같은 **운영값은 주최자**가 `/{slug}/admin` 에서 정한다
 * (`photocards`·`photocard_settings`).
 *
 * **화면이 두 종류라 색도 두 벌이다.** 뽑기권·보관함·안내는 슬롯 색을 쓰고
 * (`serviceTheme.ts` 파생), **덱·뽑는 중·결과만 어두운 무대로 고정**한다(`deckBg`·`deckGlow`).
 * 카드가 주인공인 화면이라 주변이 밝으면 카드 그림이 죽는다 — 밝은 이벤트 색을 그 자리에
 * 넣으면 뽑는 순간의 연출이 통째로 사라진다.
 */
export interface PhotocardDisplay {
  /**
   * 주최자가 언어별로 적어 둔 값 — 키는 이 설정의 필드 이름이다.
   * `useLocalizedDisplay` 가 화면을 그리기 전에 갈아 끼운다 (`src/i18n/display.ts`).
   */
  i18n?: DisplayI18n

  title: string
  showTitle: boolean
  showSubtitle: boolean

  /** 덱에 깔 뒷면 장수 — 실제 카드 종류와 무관한 **연출값**이다 */
  spreadCount: number
  subtitle: string
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
  /**
   * 로고·제목·부제 정렬 — 셋이 **함께** 움직인다 (`ServiceHeader` 의 `align`).
   *
   * 다른 서비스는 다 갖고 있는데 여기만 없어서, 로고를 가운데 두고 싶어도 방법이 없었다.
   * 기본은 `left` — 지금 화면과 같은 모양이라 이미 도는 행사가 안 바뀐다.
   */
  logoAlign: 'left' | 'center' | 'right'
  /**
   * 덱에 깔리는 **카드 뒷면** 이미지 — 비우면 내장 무늬(덱 색에서 파생한 그러데이션).
   *
   * 타로 뒷면(`theme.assets.cardBack`)과 **별개다.** 카드 비율이 다르고(55×85 vs 63×88),
   * 한 슬롯이 두 서비스를 같이 팔지 않으니 굳이 같은 값을 공유할 이유가 없다.
   * `background-image` 로 그린다 — 길게 눌러 저장되면 안 된다 (CLAUDE.md).
   */
  cardBack: string

  /** 수량 고르기 겉모습 — **럭키드로우와 같은 컴포넌트** (`src/components/CountPicker.tsx`) */
  picker: Partial<CountPickerStyle>

  /*
   * ── 스태프 화면의 박스 — **럭키드로우와 같은 무대**를 쓴다
   * (`src/components/DrawStage.module.css`). 그래서 설정 항목도 럭드와 같다.
   *
   * 배경(사진)·로고는 슬롯 테마가 이미 갖고 있어 여기 없다 — 럭드도 같다.
   */

  /** 박스를 화면 가운데에서 얼마나 더 내릴지 (px). 배경 사진마다 얼굴이 오는 높이가 다르다 */
  boxTopMargin: number
  /** 박스 안쪽 여백 (px) */
  boxPadding: number
  /** 박스 테두리 — 두께 0 이면 없음 */
  boxBorderWidth: number
  boxBorderColor: string
  /** 박스 그림자 — 색·번짐·내림. 번짐 0 이면 사실상 없다 */
  boxShadowColor: string
  boxShadowBlur: number
  boxShadowY: number
  /** '관리자 페이지로 이동' 링크 색 — 방문자 눈엔 안 띄고 스태프는 찾을 수 있어야 한다.
   * **스태프 화면과 방문자 화면이 같은 값을 쓴다** (같은 성격의 링크다) */
  adminLinkColor: string

  /** 마감됐을 때 스태프 화면에 뜨는 문구 */
  closedText: string
  /** 화면 아래 아주 흐리게 들어가는 제작사 표기. 비우면 안 그린다 */
  footerNote: string
  /**
   * **타일 테두리를 아예 뺀다** — 결과 카드·요약 줄·배너 같은 상자들의 테두리를 투명하게.
   * 배경색만으로 구분되는 더 납작한 인상을 원할 때 (럭드의 같은 설정과 짝이다).
   */
  noBorder: boolean

  /**
   * 포토카드 미리보기 **모달** 전용 색 — 비우면 슬롯 테마 색을 그대로 쓴다.
   * 모달은 화면 위에 따로 뜨는 판이라 박스와 다르게 꾸미고 싶을 때가 있다 (럭드와 같은 이유).
   */
  modalBg: string
  modalText: string
  modalItemBg: string
  modalBorder: string
  /** 모달 안 테두리를 아예 없앤다 (켜지면 `modalBorder` 는 무시된다) */
  modalNoBorder: boolean
}


/**
 * 옛 이름으로 저장된 값 — 읽기만 한다.
 *
 * 부제·제목을 서비스마다 다른 이름으로 두던 시절의 값이 슬롯 jsonb 에 남아 있다.
 * 새 이름만 읽으면 **이미 도는 행사의 제목이 기본값으로 돌아간다** — 마이그레이션 없이
 * 둘 다 보고, 저장은 새 이름으로만 한다(옛 키는 저절로 안 쓰이게 된다).
 */
type LegacyPhotocardDisplay = { deckGuide?: string }

export const DEFAULT_PHOTOCARD: PhotocardDisplay = {
  title: '포토카드 뽑기',
  showTitle: true,
  showSubtitle: true,
  spreadCount: 13,
  subtitle: '마음이 가는 카드를 한 장 골라 주세요',
  drawLabel: '뽑기권 받기',
  saveLabel: '저장',
  lockerLabel: '보관함',
  ticketHeadline: '뽑기권을 받아 주세요',
  ticketGuide: '뽑기권을 받아 카운터에 보여 주시면 스태프가 대신 뽑아 드려요.',
  counterTitle: '카운터에서 뽑을 수 있어요',
  counterBody: '포토카드 뽑기는 현장 스태프 기기에서 진행돼요. 카운터에 방문해 주세요.',
  counterHours: '',
  font: 'pretendard',
  /* 덱 무대만 고정 다크 — 카드가 주인공이다 (파일 머리말) */
  deckBg: '#1c1d22',
  deckGlow: '#3b3d4c',
  /* 나머지는 비워 둔다 — 안 고르면 **슬롯 테마에서 파생한다** (`serviceTheme.ts`) */
  bg: '',
  headText: '',
  subText: '',
  buttonColor: '',
  logo: '',
  logoAlign: 'left',
  cardBack: '',
  picker: {},
  // 럭키드로우와 같은 출발점 (`DEFAULT_DISPLAY`) — 같은 무대라 기본값도 같아야 한다
  boxTopMargin: 160,
  boxPadding: 32,
  boxBorderWidth: 0,
  boxBorderColor: '',
  boxShadowColor: 'rgba(0, 0, 0, 0.12)',
  boxShadowBlur: 40,
  boxShadowY: 12,
  adminLinkColor: 'rgba(0, 0, 0, 0.45)',
  closedText: '오늘은 마감됐어요',
  footerNote: '',
  noBorder: false,
  modalBg: '',
  modalText: '',
  modalItemBg: '',
  modalBorder: '',
  modalNoBorder: false,
}

/** 슬롯 설정 + 기본값 — **키 단위로 채운다** */
export function photocardDisplay(slot: Slot): PhotocardDisplay {
  const saved = (slot.photocard ?? {}) as Partial<PhotocardDisplay> & LegacyPhotocardDisplay
  const base = serviceTheme(slot)
  return {
    /** 주최자가 언어별로 적어 둔 값 — 기본값이 없다 (안 적으면 없는 게 맞다) */
    i18n: saved.i18n,
    title: saved.title || DEFAULT_PHOTOCARD.title,
    showTitle: saved.showTitle ?? DEFAULT_PHOTOCARD.showTitle,
    showSubtitle: saved.showSubtitle ?? DEFAULT_PHOTOCARD.showSubtitle,
    spreadCount: saved.spreadCount ?? DEFAULT_PHOTOCARD.spreadCount,
    subtitle: saved.subtitle ?? saved.deckGuide ?? DEFAULT_PHOTOCARD.subtitle,
    drawLabel: saved.drawLabel || DEFAULT_PHOTOCARD.drawLabel,
    saveLabel: saved.saveLabel || DEFAULT_PHOTOCARD.saveLabel,
    lockerLabel: saved.lockerLabel || DEFAULT_PHOTOCARD.lockerLabel,
    ticketHeadline: saved.ticketHeadline || DEFAULT_PHOTOCARD.ticketHeadline,
    ticketGuide: saved.ticketGuide ?? DEFAULT_PHOTOCARD.ticketGuide,
    counterTitle: saved.counterTitle || DEFAULT_PHOTOCARD.counterTitle,
    counterBody: saved.counterBody ?? DEFAULT_PHOTOCARD.counterBody,
    counterHours: saved.counterHours ?? DEFAULT_PHOTOCARD.counterHours,
    font: saved.font || DEFAULT_PHOTOCARD.font,
    // 덱 무대는 테마를 안 받는다 (파일 머리말)
    deckBg: saved.deckBg || DEFAULT_PHOTOCARD.deckBg,
    deckGlow: saved.deckGlow || DEFAULT_PHOTOCARD.deckGlow,
    // 나머지는 고른 값이 늘 이기고, 안 골랐으면 슬롯 테마를 따른다 (`serviceTheme.ts`)
    bg: saved.bg || base.bg,
    headText: saved.headText || base.headText,
    subText: saved.subText || base.subText,
    buttonColor: saved.buttonColor || base.button,
    logo: saved.logo ?? DEFAULT_PHOTOCARD.logo,
    logoAlign: saved.logoAlign || DEFAULT_PHOTOCARD.logoAlign,
    cardBack: saved.cardBack ?? DEFAULT_PHOTOCARD.cardBack,
    // 저장값만 든다 — 안 고른 색의 기본값은 화면이 자기 팔레트로 채운다
    picker: saved.picker ?? {},
    // 0 은 유효한 값이다 (맨 위 · 여백 없음 · 테두리 없음) — ?? 로 살린다
    boxTopMargin: saved.boxTopMargin ?? DEFAULT_PHOTOCARD.boxTopMargin,
    boxPadding: saved.boxPadding ?? DEFAULT_PHOTOCARD.boxPadding,
    boxBorderWidth: saved.boxBorderWidth ?? DEFAULT_PHOTOCARD.boxBorderWidth,
    boxBorderColor: saved.boxBorderColor ?? DEFAULT_PHOTOCARD.boxBorderColor,
    boxShadowColor: saved.boxShadowColor || DEFAULT_PHOTOCARD.boxShadowColor,
    // 번짐 0 = 그림자 없음 — ?? 로 살린다
    boxShadowBlur: saved.boxShadowBlur ?? DEFAULT_PHOTOCARD.boxShadowBlur,
    boxShadowY: saved.boxShadowY ?? DEFAULT_PHOTOCARD.boxShadowY,
    adminLinkColor: saved.adminLinkColor || DEFAULT_PHOTOCARD.adminLinkColor,
    closedText: saved.closedText || DEFAULT_PHOTOCARD.closedText,
    // 빈 문자열은 "안 그린다" 는 뜻이라 살린다
    footerNote: saved.footerNote ?? DEFAULT_PHOTOCARD.footerNote,
    noBorder: saved.noBorder ?? DEFAULT_PHOTOCARD.noBorder,
    // 빈 문자열은 "테마 색을 쓴다" 는 뜻이라 살린다
    modalBg: saved.modalBg ?? DEFAULT_PHOTOCARD.modalBg,
    modalText: saved.modalText ?? DEFAULT_PHOTOCARD.modalText,
    modalItemBg: saved.modalItemBg ?? DEFAULT_PHOTOCARD.modalItemBg,
    modalBorder: saved.modalBorder ?? DEFAULT_PHOTOCARD.modalBorder,
    modalNoBorder: saved.modalNoBorder ?? DEFAULT_PHOTOCARD.modalNoBorder,
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

/** 레어도 이름 — 숫자만 보이면 방문자에게 아무 뜻이 없다 */
export const RARITY_LABEL: Record<number, string> = {
  1: '기본',
  2: '레어',
  3: '스페셜',
  4: '시크릿',
  5: '전설',
}

/** 확률을 셀 때 쓰는 카드 한 장 — 주최자 목록(`PhotocardReportRow`)과 편집기 양쪽에서 부른다 */
export interface OddsCard {
  name: string
  rarity: number
  /** null = 무제한. 0 이면 후보에서 빠진다 */
  remaining: number | null
}

export interface OddsRow extends OddsCard {
  /** 한 번 뽑을 때 이 카드가 나올 확률 (0~1) */
  p: number
}

/** 레어도 간격 — 주최자가 고른다 (`photocard_settings.rarity_curve`, 0045) */
export type RarityCurve = 'gentle' | 'steep'

export const RARITY_CURVES: { id: RarityCurve; label: string; desc: string }[] = [
  { id: 'gentle', label: '완만', desc: '전설이 기본보다 5배 귀해요' },
  { id: 'steep', label: '가파름', desc: '전설이 기본보다 16배 귀해요' },
]

/**
 * 레어도 → 가중치. **`photocard_weight` (0045) 와 같은 산식이어야 한다.**
 *
 *   완만  : 6 − 레어도      → 5·4·3·2·1
 *   가파름: 2^(5 − 레어도)  → 16·8·4·2·1
 *
 * **숫자가 클수록 작아진다** — 레어도 5('전설')가 가장 귀하다.
 * 0026 은 반대였고(가중치 = 레어도) 그래서 가장 귀한 카드가 가장 자주 나왔다. 0045 가 뒤집었다.
 */
export function rarityWeight(rarity: number, curve: RarityCurve = 'gentle'): number {
  const r = Math.min(Math.max(rarity || 1, 1), 5)
  return curve === 'steep' ? 2 ** (5 - r) : 6 - r
}

/**
 * 한 번 뽑을 때의 출현 확률 — **`_photocard_pick` (0045) 과 같은 규칙이어야 한다.**
 *
 *   가중치 = `rarityWeight(레어도, 곡선)` · 재고는 **후보를 거를 때만** 쓴다
 *   (0이면 빠지고, null 은 영원히 후보)
 *
 * 0026 이 "이 두 줄이 가장 중요하다" 고 적어 둔 자리를 여기서 그대로 옮긴 것이다. 옮긴 사본이라
 * **갈라질 수 있다** — 갈라지면 화면이 거짓 확률을 보여준다. DB 가중치를 고치면 여기도 고친다.
 *
 * **묶음 상한(batchCapRatio)과 재고 소진은 안 본다.** 그 둘은 뽑는 도중에 후보가 줄어드는
 * 효과라 한 장짜리 확률로는 표현할 수 없다 — 화면이 그 한계를 같이 적는다.
 */
export function photocardOdds(cards: OddsCard[], curve: RarityCurve = 'gentle'): OddsRow[] {
  const live = cards.filter((c) => c.remaining === null || c.remaining > 0)
  const total = live.reduce((a, c) => a + rarityWeight(c.rarity, curve), 0)
  return cards.map((c) => {
    const out = c.remaining !== null && c.remaining <= 0
    return { ...c, p: out || total === 0 ? 0 : rarityWeight(c.rarity, curve) / total }
  })
}
