/**
 * 색 계산 — 테마 적용(사용자 앱)과 대비 검사(소유자 도구)가 함께 쓴다.
 * 소유자 도구는 프로덕션에서 제거되므로, 공용 계산은 여기 lib 에 둔다
 * (lib 이 owner 를 import 하면 소유자 코드가 프로덕션 번들에 딸려 들어온다).
 */

function toRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const body = m[1]
  const full =
    body.length === 3
      ? body
          .split('')
          .map((c) => c + c)
          .join('')
      : body
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ]
}

/** 상대 휘도 (WCAG 2.x). 색을 못 읽으면 null */
export function luminance(hex: string): number | null {
  const rgb = toRgb(hex)
  if (!rgb) return null
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * 밝은 색인가 — 그림자·딤 세기를 정할 때 쓴다.
 * 0.5 는 흰 배경(1.0)과 검은 배경(0.0) 사이의 중간. 못 읽는 색은 다크로 본다(기본 테마가 다크).
 */
export function isLight(hex: string): boolean {
  const l = luminance(hex)
  return l !== null && l > 0.5
}

/** 명도비 1~21. 색을 못 읽으면 null */
export function contrastRatio(a: string, b: string): number | null {
  const la = luminance(a)
  const lb = luminance(b)
  if (la === null || lb === null) return null
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

export type ContrastLevel = 'pass' | 'large-only' | 'fail'

/** 본문 기준 4.5:1, 큰 글자 3:1 (WCAG AA) */
export function contrastLevel(ratio: number): ContrastLevel {
  if (ratio >= 4.5) return 'pass'
  if (ratio >= 3) return 'large-only'
  return 'fail'
}

/**
 * hex(#RGB/#RRGGBB) 에 알파를 입혀 rgba 로. hex 가 아니면 color-mix 로 넘긴다
 * (rgb()/hsl()/CSS 변수 등 어떤 색 표기가 들어와도 깨지지 않게).
 */
export function withAlpha(color: string, alpha: number): string {
  const rgb = toRgb(color)
  if (!rgb) return `color-mix(in srgb, ${color} ${alpha * 100}%, transparent)`
  const [r, g, b] = rgb
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
