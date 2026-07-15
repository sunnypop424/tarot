/**
 * 이벤트별 테마 — 생일카페마다 색·로고·패턴·카드 이미지가 전부 달라진다.
 * 여기 정의된 값이 CSS 커스텀 프로퍼티로 주입되어 tokens.css 의 기본값을 덮어쓴다.
 * (매핑은 src/lib/theme.ts 의 COLOR_VARS 참조)
 */

export interface ThemeColors {
  /** 화면 바탕 */
  canvas: string
  /** 카드·타일 표면 */
  surface: string
  /** 떠 있는 표면 (토스트, 모달) */
  surfaceRaised: string
  /** 보조 버튼·칩 배경 워시 */
  wash: string

  /** 인터랙션 색 — CTA, 활성 탭, 선택 글로우 */
  primary: string
  primaryHover: string
  /** 워시 위에 얹는 옅은 인터랙션 색 (칩·보조버튼 텍스트) */
  primarySoft: string

  /** 포인트 색 — 카드 테두리, 장식 아이콘, 별 문양 (기본 테마의 골드 자리) */
  accent: string
  accentSoft: string

  fg1: string
  fg2: string
  fg3: string
  border: string
  borderHover: string
  onPrimary: string

  /** 기본 카드 뒷면 SVG 의 방사형 그라디언트 (뒷면 이미지가 없을 때만 쓰임) */
  cardBackFrom: string
  cardBackTo: string
}

/**
 * 형태 — 이벤트마다 인상이 달라지는 값. 소유자가 테마 편집기에서 조정한다.
 * tokens.css 의 --radius-* 와 1:1 대응 (--radius-full 은 pill 이라 고정).
 */
export interface ThemeShape {
  /** --radius-sm — 미세 요소 (px) */
  radiusSm: number
  /** --radius-md — 버튼·토스트 (px) */
  radiusMd: number
  /** --radius-lg — 카드·타일 (px) */
  radiusLg: number
}

export interface ThemeAssets {
  /** 로고 이미지 URL — 없으면 서비스명 텍스트로 대체 */
  logo: string | null
  /** 로고 대체 텍스트 — 스크린리더용. 이벤트명을 넣는다 */
  logoAlt: string
  /** 로고 표시 높이(px) */
  logoHeight: number

  /** 배경 패턴 이미지 URL */
  backgroundPattern: string | null
  /** 배경 패턴 불투명도 (0~1) — 카드를 가리지 않게 낮게 */
  backgroundPatternOpacity: number
  /** CSS background-size 값 (예: 'cover', '200px auto') */
  backgroundPatternSize: string
  /** CSS background-repeat 값 */
  backgroundPatternRepeat: string

  /**
   * 카드 앞면 이미지 경로 규칙 — `{base}/{cardId}.webp` 로 조합한다.
   * 예: '/themes/twice-2026/cards' → '/themes/twice-2026/cards/major-0.webp'
   * null 이면 앞면 이미지 없이 텍스트로 표시한다.
   */
  cardFrontBase: string | null
  /** 카드 앞면 이미지 확장자 */
  cardFrontExt: string
  /** 카드 뒷면 이미지 URL — null 이면 내장 SVG 뒷면을 쓴다 */
  cardBack: string | null
}

export interface Theme {
  colors: ThemeColors
  shape: ThemeShape
  assets: ThemeAssets
}
