import { isLight, withAlpha } from './color'
import type { Theme, ThemeColors, ThemeShape } from '@/types/theme'

/**
 * 테마 색 키 → CSS 커스텀 프로퍼티 이름.
 * tokens.css 에 선언된 기본값을 런타임에 덮어쓴다.
 * 여기 없는 토큰(스페이싱·타이포·모션)은 이벤트별로 바뀌지 않는다.
 */
const COLOR_VARS: Record<keyof ThemeColors, string> = {
  canvas: '--color-canvas',
  surface: '--color-surface',
  surfaceRaised: '--color-surface-raised',
  wash: '--color-wash',
  primary: '--color-primary',
  primaryHover: '--color-primary-hover',
  primarySoft: '--color-primary-soft',
  accent: '--color-accent',
  accentSoft: '--color-accent-soft',
  fg1: '--color-fg-1',
  fg2: '--color-fg-2',
  fg3: '--color-fg-3',
  border: '--color-border',
  borderHover: '--color-border-hover',
  onPrimary: '--color-on-primary',
  cardBackFrom: '--card-back-from',
  cardBackTo: '--card-back-to',
}

/** 밝은 배경에선 그림자를 옅게 — 같은 세기를 쓰면 뭉쳐 보인다 */
const SHADOW_CARD = {
  dark: '0 4px 16px rgba(0, 0, 0, 0.4)',
  light: '0 4px 16px rgba(0, 0, 0, 0.12)',
}
const SHADOW_LIFTED = {
  dark: '0 16px 40px rgba(0, 0, 0, 0.5)',
  light: '0 16px 40px rgba(0, 0, 0, 0.16)',
}

/** 형태 키 → CSS 커스텀 프로퍼티 (--radius-full 은 pill 이라 테마 대상이 아니다) */
const SHAPE_VARS: Record<keyof ThemeShape, string> = {
  radiusSm: '--radius-sm',
  radiusMd: '--radius-md',
  radiusLg: '--radius-lg',
}

/** 문서 루트에 테마를 주입한다 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement

  for (const [key, cssVar] of Object.entries(COLOR_VARS)) {
    root.style.setProperty(cssVar, theme.colors[key as keyof ThemeColors])
  }

  for (const [key, cssVar] of Object.entries(SHAPE_VARS)) {
    root.style.setProperty(cssVar, `${theme.shape[key as keyof ThemeShape]}px`)
  }

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
  root.style.setProperty('--color-dim', light ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.7)')

  const { backgroundPattern, backgroundPatternOpacity, backgroundPatternSize, backgroundPatternRepeat } =
    theme.assets
  root.style.setProperty('--bg-pattern', backgroundPattern ? `url("${backgroundPattern}")` : 'none')
  root.style.setProperty('--bg-pattern-opacity', String(backgroundPatternOpacity))
  root.style.setProperty('--bg-pattern-size', backgroundPatternSize)
  root.style.setProperty('--bg-pattern-repeat', backgroundPatternRepeat)

  // 브라우저 UI(주소창) 색까지 테마에 맞춘다
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.colors.canvas)
}

/** 카드 앞면 이미지 경로 — 테마에 앞면 이미지가 없으면 null */
export function cardFrontSrc(theme: Theme, cardId: string): string | null {
  const { cardFrontBase, cardFrontExt } = theme.assets
  return cardFrontBase ? `${cardFrontBase}/${cardId}.${cardFrontExt}` : null
}
