import type { FontId } from '@/data/fonts'

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

  /**
   * 당첨 강조 — 럭키드로우에서 **비싼 등수를 긁었을 때** 채워지는 색과 그 위 글자색.
   *
   * `accent` 로 대신하지 않는 이유: accent 는 테두리·아이콘용이라 글자색 짝이 없다.
   * 여기는 넓은 면을 채우고 그 위에 상품명을 얹으므로 짝이 있어야 대비가 보장된다.
   * (옮겨온 원본의 `highBgColor` / `highTextColor` 자리다.)
   */
  high: string
  onHigh: string

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

  /**
   * 웹앱 아이콘 URL — 방문자가 "홈 화면에 추가" 하면 이 아이콘으로 앱이 된다 (모든 서비스 공통).
   * 정사각 PNG 권장(512×512). 없으면 홈 화면 아이콘이 기본(브라우저 생성)으로 뜬다.
   */
  appIcon: string | null

  /**
   * 배경 이미지 URL — **올린 그대로 그린다.**
   *
   * 예전엔 불투명도(`backgroundPatternOpacity`)가 있었는데 **화면 어디서도 안 읽고 있었다** —
   * 편집기에서 값을 내려도 아무 일이 없었다. 슬롯이 배경으로 쓰는 건 대개 패턴이 아니라
   * 사진이고, 사진을 반투명하게 만들 이유가 없다. 고를 수 있는 건 **크기·반복 둘뿐**이다.
   */
  backgroundPattern: string | null
  /** CSS background-size — 꽉 채우면 'cover', 반복이면 'auto' */
  backgroundPatternSize: string
  /** CSS background-repeat — 'no-repeat'(기본) 또는 'repeat' */
  backgroundPatternRepeat: string

  /**
   * 카드 앞면 이미지 경로 규칙 — `{base}/{cardId}.webp` 로 조합한다.
   * 예: '/themes/moonset-2026/cards' → '/themes/moonset-2026/cards/major-0.webp'
   * null 이면 앞면 이미지 없이 텍스트로 표시한다.
   */
  cardFrontBase: string | null
  /** 카드 앞면 이미지 확장자 */
  cardFrontExt: string
  /**
   * 카드 앞면 캐시 버전 — `?v=` 로 붙는다. null 이면 안 붙인다(옛 슬롯).
   *
   * 앞면을 다시 올려도 경로가 같아 URL 이 그대로다 → 브라우저·CDN 이 옛 그림을 계속 쓴다.
   * 올릴 때 이 값을 바꿔 **URL 자체를 다르게** 만든다. 캐시를 지우는 게 아니라 비껴가는 방식이라
   * 저장소(Storage / 개발 서버)나 요금제와 무관하게 성립한다.
   */
  cardFrontVersion?: string | null
  /** 카드 뒷면 이미지 URL — null 이면 내장 SVG 뒷면을 쓴다 */
  cardBack: string | null
  /** AI 리딩 로더의 수정구슬 이미지 URL — null 이면 내장 SVG 수정구슬을 쓴다 */
  crystalBall: string | null
}

export interface Theme {
  colors: ThemeColors
  shape: ThemeShape
  assets: ThemeAssets
  /**
   * **슬롯의 기본 글꼴** — 서비스가 자기 글꼴을 안 고르면 이걸 쓴다.
   *
   * 예전엔 글꼴이 서비스별 설정에만 있어서 (`<Svc>Display.font`), **자기 설정이 없는
   * 서비스는 글꼴을 고를 길이 없었다** — 타로가 그랬다. 색·radius 와 같은 결의 값이라
   * (서비스와 무관한 슬롯의 겉모습) 여기가 제자리다.
   *
   * `applyTheme` 이 `--font-sans` 로 주입한다 — 화면은 이미 그 토큰만 본다.
   */
  font?: FontId
}
