import type { Slot } from '@/types/slot'

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
   * 박스 아래 '스태프 로그인' 링크 색 — 투명도가 붙은 rgba 를 그대로 받는다.
   *
   * 색 하나를 따로 두는 이유: 이 링크는 **손님 눈에 안 띄어야 하고 스태프는 찾을 수 있어야**
   * 한다. 그 균형이 배경 사진마다 다르다 — 밝은 사진 위 흰 글자는 사라지고,
   * 어두운 사진 위 검은 글자도 사라진다.
   */
  adminLinkColor: string

  /**
   * 본문 폰트 — 옮겨온 원본이 고르게 하던 세 가지 (`WEBFONTS`).
   * 값은 `font-family` 스택 그대로 들어간다.
   */
  fontFamily: FontId
}

/**
 * 고를 수 있는 폰트 — 원본 빌더와 같은 세 가지.
 *
 * **웹폰트 주소를 여기 한 곳에만 둔다.** 화면과 편집기가 각자 들고 있으면 하나만 바꿨을 때
 * 미리보기와 실제가 다른 폰트로 뜬다.
 */
export const WEBFONTS = {
  pretendard: {
    label: 'Pretendard (깔끔함)',
    stack: "'Pretendard', system-ui, sans-serif",
    href: 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css',
  },
  paperlogy: {
    label: 'Paperlogy (또렷함)',
    stack: "'Paperlogy', 'Pretendard', sans-serif",
    href: 'https://fastly.jsdelivr.net/gh/projectnoonnu/2408-3@1.0/Paperlogy-4Regular.woff2',
  },
  noto: {
    label: 'Noto Sans KR (무난함)',
    stack: "'Noto Sans KR', sans-serif",
    href: 'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&display=swap',
  },
} as const

export type FontId = keyof typeof WEBFONTS

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
  extras?: ('boxRadius' | 'boxPadding' | 'boxTopMargin' | 'buttonRadius' | 'font' | 'background' | 'texts' | 'cover' | 'badge')[]
}[] = [
  {
    title: '박스',
    hint: '사진 위에 뜨는 흰 상자예요.',
    colors: [
      { key: 'surface', label: '배경색', part: 'box', alpha: true, hint: '사진이 비칠수록 낮게' },
    ],
    extras: ['boxRadius', 'boxPadding', 'boxTopMargin'],
  },
  {
    title: '버튼',
    colors: [
      { key: 'primary', label: '배경색', part: 'button' },
      { key: 'onPrimary', label: '글자색', part: 'button' },
    ],
    extras: ['buttonRadius', 'texts'],
  },
  {
    title: '상품 타일',
    hint: '뽑은 결과가 놓이는 칸이에요.',
    colors: [
      { key: 'surfaceRaised', label: '배경색', part: 'tile' },
      { key: 'fg2', label: '글자색', part: 'tile' },
      { key: 'border', label: '테두리', part: 'tile' },
    ],
  },
  {
    title: '당첨 (긁는 등수)',
    hint: '비싼 등수만 덮어두고 직접 긁게 해요.',
    colors: [
      { key: 'wash', label: '커버 배경', part: 'cover' },
      { key: 'accent', label: '커버 문자색', part: 'cover' },
      { key: 'high', label: '열린 뒤 배경', part: 'high' },
      { key: 'onHigh', label: '열린 뒤 글자', part: 'high' },
    ],
    extras: ['cover'],
  },
  {
    title: '글자 · 폰트',
    colors: [
      { key: 'fg1', label: '제목', part: 'title' },
      { key: 'fg3', label: '안내 문구', part: 'note' },
    ],
    extras: ['font', 'badge'],
  },
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
  closedText: '럭키드로우가 마감되었습니다',
  // 원본 빌더의 기본값 그대로 (160px / 2rem)
  boxTopMargin: 160,
  boxPadding: 32,
  adminLinkColor: 'rgba(255, 255, 255, 0.3)',
  fontFamily: 'pretendard',
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
    highlightRanks: saved.highlightRanks ?? DEFAULT_DISPLAY.highlightRanks,
    coverMark: saved.coverMark || DEFAULT_DISPLAY.coverMark,
    // null 은 "안 띄운다" 는 뜻이라 살려야 한다 — ?? 로 기본값을 덮으면 그 의도가 사라진다
    lowStockThreshold:
      saved.lowStockThreshold === undefined
        ? DEFAULT_DISPLAY.lowStockThreshold
        : saved.lowStockThreshold,
    drawLabel: saved.drawLabel || DEFAULT_DISPLAY.drawLabel,
    closedText: saved.closedText || DEFAULT_DISPLAY.closedText,
    // 0 은 유효한 값이다 (박스를 맨 위에 붙임) — ?? 로 기본값에 먹히면 안 된다
    boxTopMargin: saved.boxTopMargin ?? DEFAULT_DISPLAY.boxTopMargin,
    boxPadding: saved.boxPadding ?? DEFAULT_DISPLAY.boxPadding,
    adminLinkColor: saved.adminLinkColor || DEFAULT_DISPLAY.adminLinkColor,
    // 없는 폰트 id 가 저장돼 있으면 기본으로 (옛 저장분·손으로 고친 JSON)
    fontFamily: saved.fontFamily && saved.fontFamily in WEBFONTS ? saved.fontFamily : DEFAULT_DISPLAY.fontFamily,
  }
}
