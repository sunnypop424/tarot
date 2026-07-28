import defaultThemeJson from '@/data/slot-default.json'
import { cardRadius } from './card'
import { isLight, readableShade, withAlpha } from './color'
import type { Theme, ThemeColors, ThemeShape } from '@/types/theme'

/**
 * 테마 색 키 → CSS 커스텀 프로퍼티 이름.
 * tokens.css 에 선언된 기본값을 런타임에 덮어쓴다.
 * 여기 없는 토큰(스페이싱·타이포·모션)은 이벤트별로 바뀌지 않는다.
 */
const COLOR_VARS: Partial<Record<keyof ThemeColors, string>> = {
  canvas: '--color-canvas',
  surface: '--color-surface',
  surfaceRaised: '--color-surface-raised',
  wash: '--color-wash',
  primary: '--color-primary',
  primaryHover: '--color-primary-hover',
  // primarySoft·accentSoft 는 저장값을 쓰지 않고 배경 밝기로 파생한다 (아래 applyTheme 참고)
  accent: '--color-accent',
  fg1: '--color-fg-1',
  fg2: '--color-fg-2',
  fg3: '--color-fg-3',
  border: '--color-border',
  borderHover: '--color-border-hover',
  onPrimary: '--color-on-primary',
  // 럭키드로우 당첨 강조 — 넓은 면을 채우고 글자를 얹으므로 짝으로 간다
  high: '--color-high',
  onHigh: '--color-on-high',
  cardBackFrom: '--card-back-from',
  cardBackTo: '--card-back-to',
}

/**
 * **배경 밝기로 파생하는 색** — 저장값을 쓰지 않는다.
 *
 * 소유자가 고르는 brand 색은 한 가지 배경(보통 어두운 카드·표면)을 보고 고르게 된다.
 * 그 색을 반대 밝기 배경에 그대로 쓰면 사라진다 — 골드(#D4AF37)는 흰 표면에서 2.1:1 이라
 * 1.75px 아이콘이 안 보인다. 그래서 배경 대비 4.5:1 을 넘게 조정한 것을 따로 낸다.
 *
 * **여기가 단일 소스다.** 소유자 도구의 대비 검사(owner/contrast.ts)도 이걸 불러 쓴다 —
 * 규칙이 갈라지면 검사는 통과라는데 화면은 안 읽히는 색이 나간다.
 */
export const DERIVED_COLORS = {
  /** 칩·배지·보조버튼 글자 — wash 위에 얹힌다 */
  primarySoft: (c: Pick<ThemeColors, 'primary' | 'wash'>) => readableShade(c.primary, c.wash),
  /** 포인트 글자·아이콘 — 표면 위에 얹힌다 (raw accent 는 어두운 카드 위 장식용) */
  accentSoft: (c: Pick<ThemeColors, 'accent' | 'surface'>) => readableShade(c.accent, c.surface),
} as const

/** 밝은 배경에선 그림자를 옅게 — 같은 세기를 쓰면 뭉쳐 보인다 */
const SHADOW_CARD = {
  dark: '0 4px 16px rgba(0, 0, 0, 0.4)',
  light: '0 4px 16px rgba(0, 0, 0, 0.12)',
}
const SHADOW_LIFTED = {
  dark: '0 16px 40px rgba(0, 0, 0, 0.5)',
  light: '0 16px 40px rgba(0, 0, 0, 0.16)',
}

/** 비활성 색도 배경 밝기를 따라야 한다 — 다크 값을 밝은 캔버스에 쓰면 버튼이 시커멓게 뜬다 */
const DISABLED = {
  dark: { bg: '#2e2f45', fg: '#6b6880' },
  light: { bg: '#eeeeee', fg: '#8a8797' },
}

/** 형태 키 → CSS 커스텀 프로퍼티 (--radius-full 은 pill 이라 테마 대상이 아니다) */
const SHAPE_VARS: Record<keyof ThemeShape, string> = {
  radiusSm: '--radius-sm',
  radiusMd: '--radius-md',
  radiusLg: '--radius-lg',
}

const DEFAULTS = defaultThemeJson as Theme

/**
 * **없는 키를 기본값으로 채운다 — 이 한 줄이 화면을 지킨다.**
 *
 * `setProperty(name, undefined)` 는 조용히 문자열 `"undefined"` 를 넣는다. 그러면 그 토큰을
 * 쓰는 모든 규칙이 죽고, 배경도 글자도 버튼도 색을 못 받아 **화면이 통째로 안 보인다.**
 * 던지지도 않고 콘솔에도 안 뜬다 — 개발자도구에서 인라인 스타일을 열어야 비로소 보인다.
 *
 * 키가 빌 수 있는 경로는 실제로 여럿이다: 테마에 색을 새로 더하면 그 전에 저장된 슬롯엔
 * 그 키가 없고, 손으로 넣은 슬롯은 `theme.colors` 가 `{}` 일 수 있다.
 * 편집기는 이미 같은 방어를 하고 있었는데(`SlotEditor` 의 초안 채우기) **방문자·주최자
 * 경로에는 없었다** — 방어는 화면을 그리기 직전인 여기 있어야 한다.
 */
function filled(theme: Theme): Theme {
  return {
    ...DEFAULTS,
    ...theme,
    colors: { ...DEFAULTS.colors, ...(theme?.colors ?? {}) },
    shape: { ...DEFAULTS.shape, ...(theme?.shape ?? {}) },
  }
}

/** 문서 루트에 테마를 주입한다 */
export function applyTheme(raw: Theme): void {
  const root = document.documentElement
  const theme = filled(raw)

  for (const [key, cssVar] of Object.entries(COLOR_VARS)) {
    const value = theme.colors[key as keyof ThemeColors]
    if (cssVar && value) root.style.setProperty(cssVar, value)
  }

  // radius 는 40px 까지만 — 편집기 상한과 같다. 옛 저장분에 큰 값(예: 999)이 있어도 박스가
  // 알약처럼 뭉개지지 않게 여기서 한 번 더 막는다.
  const clampRadius = (v: number) => Math.max(0, Math.min(40, v))
  for (const [key, cssVar] of Object.entries(SHAPE_VARS)) {
    // Number.isFinite 로 한 번 더 — 문자열이 들어와 NaNpx 가 나가면 radius 가 통째로 죽는다
    const v = theme.shape[key as keyof ThemeShape]
    root.style.setProperty(cssVar, `${clampRadius(Number.isFinite(v) ? v : DEFAULTS.shape[key as keyof ThemeShape])}px`)
  }

  /**
   * 카드 radius 는 **카드 크기에 비례한다** — 고정 px 을 쓰면 56px 짜리 덱 카드가
   * 170px 짜리 홈 카드와 같은 16px 을 써서 3배로 뭉툭해진다 (`lib/card.ts`).
   * 슬롯이 고른 radiusLg 는 홈 카드 기준이고, 나머지 화면은 여기서 나온 퍼센트로 자동으로 줄어든다.
   */
  root.style.setProperty('--card-radius', cardRadius(clampRadius(theme.shape.radiusLg)))

  // 인터랙션 글로우는 primary 에서 파생 — 테마 색이 바뀌면 글로우도 따라간다
  root.style.setProperty(
    '--shadow-glow',
    `0 0 24px ${withAlpha(theme.colors.primary, 0.25)}`
  )

  /**
   * 그림자·딤은 배경 밝기에 따라 세기가 달라야 한다.
   * 다크 전제로 짠 rgba(0,0,0,0.4~0.5) 를 밝은 캔버스에 그대로 쓰면 그림자가 시커멓게 뭉친다.
   * 캔버스 휘도로 자동 판정한다 — 소유자가 따로 스위치를 켤 필요가 없다.
   */
  const light = isLight(theme.colors.canvas)
  root.style.setProperty('color-scheme', light ? 'light' : 'dark')
  root.style.setProperty('--shadow-card', light ? SHADOW_CARD.light : SHADOW_CARD.dark)
  root.style.setProperty(
    '--shadow-card-lifted',
    `${light ? SHADOW_LIFTED.light : SHADOW_LIFTED.dark}, 0 0 24px ${withAlpha(theme.colors.primary, 0.12)}`
  )

  // 배경 밝기 종속 색 — 규칙은 DERIVED_COLORS 한 곳에 있다 (대비 검사도 같은 걸 쓴다)
  root.style.setProperty('--color-primary-soft', DERIVED_COLORS.primarySoft(theme.colors))
  root.style.setProperty('--color-accent-soft', DERIVED_COLORS.accentSoft(theme.colors))

  // 비활성 색도 캔버스 밝기로 전환 (그림자·딤과 같은 판정)
  const disabled = light ? DISABLED.light : DISABLED.dark
  root.style.setProperty('--color-disabled-bg', disabled.bg)
  root.style.setProperty('--color-disabled-fg', disabled.fg)

  const { backgroundPattern, backgroundPatternSize, backgroundPatternRepeat } =
    theme.assets
  root.style.setProperty('--bg-pattern', backgroundPattern ? `url("${backgroundPattern}")` : 'none')
  root.style.setProperty('--bg-pattern-size', backgroundPatternSize)
  root.style.setProperty('--bg-pattern-repeat', backgroundPatternRepeat)

  // 브라우저 UI(주소창) 색까지 테마에 맞춘다
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.colors.canvas)
}

/**
 * 카드 앞면 이미지 경로 — 테마에 앞면 이미지가 없으면 null.
 * `?v=` 는 앞면을 다시 올렸을 때 옛 그림이 캐시에서 나오는 걸 막는다 (ThemeAssets 참고).
 */
export function cardFrontSrc(theme: Theme, cardId: string): string | null {
  const { cardFrontBase, cardFrontExt, cardFrontVersion } = theme.assets
  if (!cardFrontBase) return null
  return `${cardFrontBase}/${cardId}.${cardFrontExt}${cardFrontVersion ? `?v=${cardFrontVersion}` : ''}`
}
