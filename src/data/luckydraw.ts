import type { Slot } from '@/types/slot'
import type { CountPickerStyle } from './countPicker'

/**
 * 럭키드로우 **겉모습** — 최고관리자가 슬롯 편집기에서 정한다 (주최자는 못 건드린다).
 *
 * 옮겨온 원본(Firebase)은 이 값들이 전부 코드에 박혀 있었다: 1·2등만 스크래치, 커버는 ♥,
 * 남은 수량 배지는 50개 이하일 때. 상품 구성은 행사마다 다른데(1등만 있는 행사도, 7등까지
 * 있는 행사도 있다) 그때마다 코드를 고칠 수는 없다.
 *
 * **색은 여기 없다.** 색은 테마(`Theme.colors`)가 이미 갖고 있고, hex 를 tokens.css 밖에
 * 두지 않는 게 이 프로젝트의 규칙이다. 하이라이트는 `--color-primary`(글자색 짝이 보장된
 * 유일한 색)를 쓰고 테두리에 `--color-accent` 를 얹는다.
 */
export interface LuckydrawDisplay {
  /**
   * 주최자가 언어별로 적어 둔 값 — 키는 이 설정의 필드 이름이다.
   * `useLocalizedDisplay` 가 화면을 그리기 전에 갈아 끼운다 (`src/i18n/display.ts`).
   */
  i18n?: DisplayI18n

  /**
   * 스크래치로 가려 놓고 **직접 긁게** 할 등수.
   *
   * 비싼 상품만 긁는 재미를 준다 — 전부 긁게 하면 10개 뽑을 때 10번 긁어야 해서
   * 리추얼이 노동이 된다. 빈 배열이면 전부 바로 보인다.
   */
  highlightRanks: number[]
  /** 긁기 전 커버에 찍히는 글자 (이모지 한 글자를 상정한다) */
  coverMark: string
  /**
   * "N개 남았습니다" 배지를 띄우기 시작하는 재고. null 이면 안 띄운다.
   *
   * 원본은 50 고정이었다. 상품이 30개뿐인 행사에선 처음부터 계속 떠 있어서
   * "얼마 안 남았다" 는 신호가 신호 구실을 못 한다.
   */
  lowStockThreshold: number | null
  /** 추첨 버튼 문구 — 행사 컨셉에 맞춰 바꾼다 */
  drawLabel: string
  /** 마감됐을 때 방문자에게 보이는 문구 */
  closedText: string

  /**
   * 화면 오른쪽 아래에 아주 흐리게 들어가는 제작사 표기 (원본의 Copyright 자리).
   * 비우면 안 그린다 — 표기가 필요 없는 행사도 있다.
   */
  footerNote: string

  /**
   * 박스를 화면 위에서 얼마나 내릴지 (px).
   *
   * 옮겨온 원본의 `boxMarginTop` 이다. 가운데 정렬이 아니라 **위에서 내려 앉히는** 이유는
   * 배경이 보통 사진이기 때문이다 — 아이돌 얼굴이 화면 위쪽에 오는 사진이 많아서,
   * 박스를 가운데 두면 얼굴을 덮는다. 얼마나 내릴지는 사진마다 다르다.
   */
  boxTopMargin: number
  /** 박스 안쪽 여백 (px) — 원본의 `boxPadding` */
  boxPadding: number

  /**
   * 박스 아래 '관리자로 로그인' 링크 색 — 투명도가 붙은 rgba 를 그대로 받는다.
   *
   * 색 하나를 따로 두는 이유: 이 링크는 **방문자 눈에 안 띄어야 하고 스태프는 찾을 수 있어야**
   * 한다. 그 균형이 배경 사진마다 다르다 — 밝은 사진 위 흰 글자는 사라지고,
   * 어두운 사진 위 검은 글자도 사라진다.
   */
  adminLinkColor: string

  /**
   * 박스 그림자 색 — 투명도가 붙은 rgba.
   *
   * 배경 사진에 따라 어울리는 값이 다르다: 밝은 사진 위에선 짙은 그림자가 박스를 띄우고,
   * 어두운 사진 위에선 같은 값이 그냥 검은 얼룩이 된다. 투명도를 0 으로 두면 그림자가 없다.
   */
  boxShadowColor: string
  /**
   * 그림자 **값** — 번짐(blur)과 아래로 내림(y), px.
   *
   * 색만으론 그림자 인상을 다 못 잡는다: 같은 색이라도 크게 번지면 은은히 뜨고, 좁으면 또렷한
   * 테두리처럼 앉는다. 번짐 0 이면 사실상 그림자가 사라진다.
   */
  boxShadowBlur: number
  boxShadowY: number

  /**
   * 박스 테두리 — 두께(px)와 색. 두께 0 이면 테두리 없음(기본).
   *
   * 사진 위 박스가 배경과 색이 비슷해 경계가 흐릿할 때 얇은 테두리로 또렷하게 세운다.
   */
  boxBorderWidth: number
  boxBorderColor: string

  /**
   * 본문 폰트 — 옮겨온 원본이 고르게 하던 세 가지 (`WEBFONTS`).
   * 값은 `font-family` 스택 그대로 들어간다.
   */
  fontFamily: FontId

  /**
   * 배송·경품 **모달** 전용 색 — 비우면 슬롯 테마 색을 그대로 쓴다.
   *
   * 모달은 박스와 따로 꾸미고 싶을 때가 있다(박스는 반투명인데 입력창은 또렷한 흰색으로 등).
   * 각 값이 비어 있으면 CSS 가 테마 토큰으로 폴백한다 — 그래서 기본은 지금과 똑같다.
   */
  modalBg: string
  modalText: string
  modalItemBg: string
  modalBorder: string
  /**
   * 모달 테두리를 아예 없앤다 (입력칸·배송 상품 줄·경품 줄의 테두리를 투명하게).
   * `noBorder`(결과 타일용)와 짝이지만 **모달은 body 로 포털돼 따로 산다** — 그래서 별도 플래그다.
   * 켜지면 `modalBorder` 색은 무시된다.
   */
  modalNoBorder: boolean

  /**
   * **타일 테두리를 아예 뺀다.** 결과 타일·요약 줄·수량 칸 같은 상자들의 테두리를
   * 투명하게 만든다 — 배경색만으로 구분되는 더 납작한 인상을 원할 때. 색은 그대로 두고
   * 테두리만 없앤다 (모달은 자기 테두리색을 따로 갖는다).
   */
  noBorder: boolean

  /**
   * **당첨(긁는 등수) 타일만 따로 테두리 없음.**
   *
   * 위 `noBorder` 는 상품 타일·요약 줄·경품 줄을 한꺼번에 다룬다. 당첨 타일은 사정이 다르다 —
   * 밑면이 '열린 뒤 배경'(대개 흰색)이라 **테두리가 커버 둘레에 얇은 링으로 새어 보인다.**
   * 링을 없애자고 위 토글을 켜면 안 덮인 타일의 테두리까지 같이 사라진다. 그래서 칸을 나눈다.
   */
  highNoBorder: boolean

  /**
   * 수량 카운터(알약) 전용 색 — 비우면 테마 색으로 폴백한다.
   *
   * 카운터는 화면 한가운데 큰 알약이라 따로 꾸미고 싶을 때가 있다. `counterBg` 는 알약 배경,
   * `counterBorder` 는 전체를 감싸는 테두리색, `counterShadow` 는 그 아래 그림자색(번짐·내림은 시안 고정).
   */
  counterBg: string
  counterBorder: string
  counterShadow: string

  /**
   * **보조 버튼('처음으로') 색** — 비우면 지금까지처럼 테마에서 파생한다.
   *
   * 파생 규칙은 "칩 바탕(`--color-wash`) 위에서 읽히는 글자색"(`--color-primary-soft`)이라
   * 대비는 늘 맞지만 **색을 고를 수는 없었다.** 실제로 커버 배경을 진한 빨강으로 둔 슬롯에서
   * 이 버튼이 빨간 바탕에 검은 글자로 나왔다(파생이 그 배경에서 읽히는 색을 고른 결과다).
   * 바탕 쪽은 이제 옅게 파생되지만, 그래도 **직접 고르고 싶은 자리**라 칸을 연다.
   */
  subBtnBg: string
  subBtnFg: string

  /**
   * 등수 배지 스타일 (전체 결과·경품 목록의 "1등" 알약).
   *
   * - `soft`: 배경이 **글자색을 따라 옅게** 깔린다 (글자에 색, 배경은 그 색의 투명 톤). 시안 기본.
   * - `solid`: 배경이 **진한 solid**, 글자는 흰색(onPrimary). 또렷하게 도장 찍은 느낌.
   */
  badgeStyle: 'soft' | 'solid'

  /**
   * 수량 고르기(스테퍼·프리셋·뽑기 버튼)의 겉모습 — **포토카드와 같은 컴포넌트를 쓴다**
   * (`src/components/CountPicker.tsx`). 색이 비면 아래 `counterBg` 등 옛 값에서 물려받는다.
   */
  picker: Partial<CountPickerStyle>
}

/**
 * 고를 수 있는 폰트 — 원본 빌더와 같은 세 가지.
 *
 * **웹폰트 주소를 여기 한 곳에만 둔다.** 화면과 편집기가 각자 들고 있으면 하나만 바꿨을 때
 * 미리보기와 실제가 다른 폰트로 뜬다.
 */
// 웹폰트는 fonts.ts 로 모았다 (럭드·롤페가 함께 쓴다). 기존 import 경로를 위해 여기서 재수출한다.
import { WEBFONTS, type FontId } from './fonts'
import type { DisplayI18n } from './multilingual'
export { WEBFONTS, loadWebfont, fontStack, type FontId } from './fonts'

/**
 * 럭키드로우 화면에 **들어가는 색 전부** — 편집기가 이 목록대로 낸다.
 *
 * 테마 색 키를 그대로 쓰되 **이름을 화면 기준으로 바꿔 부른다.** 최고관리자가 보는 건
 * 'surfaceRaised' 가 아니라 "상품 타일 배경" 이다 — 역할 이름은 타로 화면을 전제로 붙은 것이라
 * 럭키드로우에선 뭘 가리키는지 알 수 없다.
 *
 * `part` 는 미리보기에서 **어느 자리인지 비춰줄 때** 쓰는 이름이다 (`data-part`).
 */
export interface LuckydrawColorField {
  key: string
  label: string
  part: string
  alpha?: boolean
  hint?: string
}

/**
 * 편집기의 **카드 묶음** — 한 화면 요소에 딸린 것들을 한 카드에 모은다.
 *
 * 색은 색끼리, 크기는 크기끼리 늘어놓으면 "박스를 손보려면 색 목록에서 하나, 형태 목록에서
 * 하나, 여백 목록에서 하나" 를 오가게 된다. 최고관리자가 실제로 하는 일은 **"박스를 손본다"**
 * 이지 "색을 손본다" 가 아니다.
 */
export const LUCKYDRAW_GROUPS: {
  title: string
  hint?: string
  colors?: LuckydrawColorField[]
  /** 이 카드에 같이 오는 형태·여백·문구 칸 (편집기가 이름으로 알아본다) */
  extras?: (
    | 'boxRadius' | 'boxPadding' | 'boxTopMargin' | 'buttonRadius' | 'subBtn'
    | 'font' | 'background' | 'texts' | 'cover' | 'badge' | 'footer' | 'shadow' | 'modal'
    | 'noBorder' | 'highNoBorder' | 'counter' | 'badgeStyle' | 'boxBorder'
  )[]
}[] = [
  // ── 박스 (사진 위에 뜨는 상자) — 배경·테두리·둥글기·여백·그림자 한자리에 ──
  {
    title: '박스',
    hint: '사진 위에 뜨는 상자예요. 배경·테두리·둥글기·여백·그림자를 여기서.',
    colors: [
      { key: 'surface', label: '배경색', part: 'box', alpha: true, hint: '사진이 비칠수록 낮게' },
    ],
    extras: ['boxBorder', 'boxRadius', 'boxPadding', 'boxTopMargin', 'shadow'],
  },
  // ── 버튼 ──
  {
    title: '버튼',
    hint: '주요 버튼(뽑기·전체 결과 보기)과 보조 버튼(처음으로)이에요.',
    colors: [
      { key: 'primary', label: '배경색', part: 'button' },
      { key: 'onPrimary', label: '글자색', part: 'button' },
    ],
    extras: ['buttonRadius', 'subBtn', 'texts'],
  },
  // ── 수량 카운터 (가운데 큰 알약) — 배경·테두리·그림자색 ──
  {
    title: '수량 카운터',
    hint: '가운데 큰 알약이에요. 비우면 테마 색·시안 그림자를 써요.',
    extras: ['counter'],
  },
  // ── 결과 화면 (상품 타일 · 등수 배지) ──
  {
    title: '상품 타일 · 등수 배지',
    hint: '뽑은 결과가 놓이는 칸과 “1등” 배지예요.',
    colors: [
      { key: 'surfaceRaised', label: '타일 배경색', part: 'tile' },
      { key: 'fg2', label: '타일 글자색', part: 'tile' },
      { key: 'border', label: '타일 테두리', part: 'tile' },
    ],
    extras: ['noBorder', 'badgeStyle'],
  },
  // ── 당첨 연출 (긁는 등수) ──
  {
    title: '당첨 (긁는 등수)',
    hint: '비싼 등수만 덮어두고 직접 긁게 해요.',
    colors: [
      {
        key: 'wash',
        label: '커버 배경',
        part: 'cover',
        // 진한 색을 골라도 화면 곳곳이 그 색으로 물들지 않는다 — 칩·배너 바탕은 옅게 파생된다
        hint: '진해도 괜찮아요',
      },
      { key: 'accent', label: '커버 문자색', part: 'cover' },
      { key: 'high', label: '열린 뒤 배경', part: 'high' },
      { key: 'onHigh', label: '열린 뒤 글자', part: 'high' },
    ],
    extras: ['cover', 'highNoBorder'],
  },
  // ── 글자 · 폰트 ──
  {
    title: '글자 · 폰트',
    colors: [
      { key: 'fg1', label: '제목', part: 'title' },
      { key: 'fg3', label: '안내 문구', part: 'note' },
    ],
    extras: ['font', 'badge', 'footer'],
  },
  // ── 배송·경품 모달 ──
  {
    title: '배송·경품 모달',
    hint: '배송 정보를 받는 창이에요. 비우면 위 테마 색을 그대로 써요.',
    extras: ['modal'],
  },
  // ── 배경 (사진 · 관리자 링크) ──
  {
    title: '배경',
    colors: [],
    extras: ['background'],
  },
]

/**
 * 럭키드로우로 바꿀 때 깔아주는 **시작 색** — 옮겨온 base-template 의 값이다.
 *
 * 붙박이가 아니라 출발점이다: 전부 편집기에서 고칠 수 있다. 다만 다크 테마 값이 그대로
 * 남아 있으면 밝은 박스 안에서 글자가 안 보이므로, 서비스를 바꾸는 순간 한 번 맞춰준다.
 *
 */
export const LUCKYDRAW_NEUTRALS = {
  // 박스 배경 — 기본은 원본과 같은 **반투명 흰색**. 이건 편집기에서 고칠 수 있다
  surface: 'rgba(255, 255, 255, 0.85)',
  canvas: '#f3f4f6', // 사진이 없을 때의 바탕 (base-template body)
  surfaceRaised: '#ffffff', // 수량 입력칸·결과 타일
  wash: '#f3f4f6', // 덮인 타일
  fg1: '#1f2937', // gray-800
  fg2: '#374151', // gray-700
  fg3: '#6b7280', // gray-500
  border: '#e5e7eb', // gray-200
  borderHover: '#d1d5db', // gray-300
  accent: '#d4af37', // 커버의 하트
} as const

export const DEFAULT_DISPLAY: LuckydrawDisplay = {
  highlightRanks: [1, 2],
  coverMark: '♥',
  lowStockThreshold: 50,
  drawLabel: 'DRAW!',
  closedText: '럭키드로우가 마감됐어요',
  footerNote: '',
  // 원본 빌더의 기본값 그대로 (160px / 2rem)
  boxTopMargin: 160,
  boxPadding: 32,
  /**
   * 원본은 흰색 30% 였다. 그건 **배경이 어두운 사진**일 때 맞는 값이고, 럭키드로우 기본이
   * 라이트라 그대로 두면 밝은 바탕에 흰 글자가 되어 **아무것도 안 보인다** — 색을 고르라고
   * 만든 칸인데 무슨 색인지 확인할 수가 없다. 어두운 사진을 깔면 흰색으로 바꾸면 된다.
   */
  adminLinkColor: 'rgba(0, 0, 0, 0.45)',
  boxShadowColor: 'rgba(0, 0, 0, 0.12)',
  // 은은하게 뜨는 기본값 — 밝은 사진 위에서 박스가 무겁지 않게
  boxShadowBlur: 40,
  boxShadowY: 12,
  // 기본은 테두리 없음 — 그림자만으로 떠 보이게
  boxBorderWidth: 0,
  boxBorderColor: '',
  // 원본 빌더의 기본이자 추천값이었다 — 획이 또렷해 부스 태블릿에서 멀리서도 읽힌다
  fontFamily: 'paperlogy',
  // 비우면 슬롯 테마 색을 그대로 쓴다 (CSS 폴백)
  modalBg: '',
  modalText: '',
  modalItemBg: '',
  modalBorder: '',
  modalNoBorder: false,
  noBorder: false,
  highNoBorder: false,
  // 비우면 테마 색 / 시안 기본 그림자색으로 폴백
  counterBg: '',
  counterBorder: '',
  counterShadow: '',
  // 비우면 지금까지처럼 파생색 (칩 바탕 + 그 위에서 읽히는 글자)
  subBtnBg: '',
  subBtnFg: '',
  // 시안 기본 — 옅은 배경 + 글자색
  badgeStyle: 'soft',
  picker: {},
}

/**
 * 슬롯의 설정 + 기본값 — **키 단위로 채운다.**
 *
 * `slot.luckydraw ?? DEFAULT` 로 뭉뚱그리면 편집기가 한 값만 저장한 슬롯에서 나머지가
 * undefined 가 된다. 0008 이전에 만든 슬롯은 이 컬럼이 `{}` 라 전부 기본값으로 뜬다.
 */
export function luckydrawDisplay(slot: Slot): LuckydrawDisplay {
  const saved = slot.luckydraw ?? {}
  return {
    /** 주최자가 언어별로 적어 둔 값 — 기본값이 없다 (안 적으면 없는 게 맞다) */
    i18n: saved.i18n,
    highlightRanks: saved.highlightRanks ?? DEFAULT_DISPLAY.highlightRanks,
    coverMark: saved.coverMark || DEFAULT_DISPLAY.coverMark,
    // null 은 "안 띄운다" 는 뜻이라 살려야 한다 — ?? 로 기본값을 덮으면 그 의도가 사라진다
    lowStockThreshold:
      saved.lowStockThreshold === undefined
        ? DEFAULT_DISPLAY.lowStockThreshold
        : saved.lowStockThreshold,
    drawLabel: saved.drawLabel || DEFAULT_DISPLAY.drawLabel,
    closedText: saved.closedText || DEFAULT_DISPLAY.closedText,
    // 빈 문자열은 "안 그린다" 는 뜻이라 살려야 한다 (|| 로 기본값을 덮으면 그 의도가 사라진다)
    footerNote: saved.footerNote ?? DEFAULT_DISPLAY.footerNote,
    // 0 은 유효한 값이다 (박스를 맨 위에 붙임) — ?? 로 기본값에 먹히면 안 된다
    boxTopMargin: saved.boxTopMargin ?? DEFAULT_DISPLAY.boxTopMargin,
    boxPadding: saved.boxPadding ?? DEFAULT_DISPLAY.boxPadding,
    adminLinkColor: saved.adminLinkColor || DEFAULT_DISPLAY.adminLinkColor,
    boxShadowColor: saved.boxShadowColor || DEFAULT_DISPLAY.boxShadowColor,
    // 0 은 유효한 값이다 (번짐 0 = 그림자 없음) — ?? 로 기본값에 먹히면 안 된다
    boxShadowBlur: saved.boxShadowBlur ?? DEFAULT_DISPLAY.boxShadowBlur,
    boxShadowY: saved.boxShadowY ?? DEFAULT_DISPLAY.boxShadowY,
    // 0 은 유효한 값(테두리 없음) — ?? 로 살린다
    boxBorderWidth: saved.boxBorderWidth ?? DEFAULT_DISPLAY.boxBorderWidth,
    boxBorderColor: saved.boxBorderColor ?? DEFAULT_DISPLAY.boxBorderColor,
    // 없는 폰트 id 가 저장돼 있으면 기본으로 (옛 저장분·손으로 고친 JSON)
    fontFamily: saved.fontFamily && saved.fontFamily in WEBFONTS ? saved.fontFamily : DEFAULT_DISPLAY.fontFamily,
    // 빈 문자열은 "테마 색을 쓴다" 는 뜻이라 살린다
    modalBg: saved.modalBg ?? DEFAULT_DISPLAY.modalBg,
    modalText: saved.modalText ?? DEFAULT_DISPLAY.modalText,
    modalItemBg: saved.modalItemBg ?? DEFAULT_DISPLAY.modalItemBg,
    modalBorder: saved.modalBorder ?? DEFAULT_DISPLAY.modalBorder,
    // false 가 기본이라 ?? 로 살린다 (있는 그대로)
    modalNoBorder: saved.modalNoBorder ?? DEFAULT_DISPLAY.modalNoBorder,
    noBorder: saved.noBorder ?? DEFAULT_DISPLAY.noBorder,
    highNoBorder: saved.highNoBorder ?? DEFAULT_DISPLAY.highNoBorder,
    counterBg: saved.counterBg ?? DEFAULT_DISPLAY.counterBg,
    counterBorder: saved.counterBorder ?? DEFAULT_DISPLAY.counterBorder,
    counterShadow: saved.counterShadow ?? DEFAULT_DISPLAY.counterShadow,
    subBtnBg: saved.subBtnBg ?? DEFAULT_DISPLAY.subBtnBg,
    subBtnFg: saved.subBtnFg ?? DEFAULT_DISPLAY.subBtnFg,
    // 'solid' 만 유효값으로 받고 나머지는 기본 soft
    badgeStyle: saved.badgeStyle === 'solid' ? 'solid' : 'soft',
    /*
     * **저장값만 든다.** 안 고른 색의 기본값은 화면이 정한다 — 럭드는 슬롯 테마 토큰을
     * 그대로 쓰고 포토카드는 자기 팔레트를 쓰기 때문에, 여기서 하나로 못 정한다.
     */
    picker: saved.picker ?? {},
  }
}
