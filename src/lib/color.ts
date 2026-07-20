/**
 * 색 계산 — 테마 적용(사용자 앱)과 대비 검사(소유자 도구)가 함께 쓴다.
 * 소유자 도구는 프로덕션에서 제거되므로, 공용 계산은 여기 lib 에 둔다
 * (lib 이 owner 를 import 하면 소유자 코드가 프로덕션 번들에 딸려 들어온다).
 */

/**
 * `rgba(r, g, b, a)` 의 알파 — 없으면 1.
 * 박스 배경처럼 **사진이 비쳐야 하는 색**은 hex 로 표현할 수 없어 rgba 로 저장된다.
 */
export function alphaOf(color: string | null | undefined): number {
  const m = /^rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(
    String(color ?? '').trim()
  )
  return m ? Math.min(1, Math.max(0, Number(m[1] ?? 1))) : 1
}

/** 색에서 hex 부분만 — rgba 든 hex 든 `#rrggbb` 로 (색 고르개에 넣을 값) */
export function hexOf(color: string): string {
  const rgb = toRgb(color)
  if (!rgb) return '#000000'
  return `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

/** hex + 알파 → 저장할 색 문자열. 알파가 1 이면 hex 그대로 둔다 (읽기 좋다) */
export function withAlphaValue(hex: string, alpha: number): string {
  const rgb = toRgb(hex)
  if (!rgb || alpha >= 1) return hex
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${Math.round(alpha * 100) / 100})`
}

/**
 * **rgb()·rgba() 도 받는다** — 알파는 버린다.
 *
 * 대비 계산에서 알파를 무시하는 게 맞는 이유: 반투명 박스 뒤에 오는 건 대개 **사진**이라
 * 무엇과 섞일지 알 수 없다. 최고관리자가 고른 불투명 색으로 재는 편이 예측 가능하고,
 * 실제로 사진 위에서 어떻게 보이는지는 미리보기가 답한다.
 */
function toRgb(hex: string | null | undefined): [number, number, number] | null {
  /**
   * **없는 값도 받는다.** 테마에 색 키를 새로 더하면 그 전에 저장된 슬롯엔 그 키가 없다
   * (`high`·`onHigh` 를 추가했을 때 실제로 편집기가 하얗게 죽었다).
   * 색 하나가 비었다고 화면이 통째로 죽으면 안 된다 — 못 읽는 색은 null 로 답하고,
   * 부르는 쪽이 기본값으로 그린다.
   */
  const value = String(hex ?? '').trim()
  const rgba = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(value)
  if (rgba) {
    return [Number(rgba[1]), Number(rgba[2]), Number(rgba[3])].map((v) =>
      Math.min(255, Math.max(0, Math.round(v)))
    ) as [number, number, number]
  }

  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value)
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

/** hex 를 흰/검정 쪽으로 t(0~1)만큼 섞은 hex. 못 읽는 색은 그대로 돌려준다 */
export function mix(hex: string, toward: 'white' | 'black', t: number): string {
  const rgb = toRgb(hex)
  if (!rgb) return hex
  const edge = toward === 'white' ? 255 : 0
  const [r, g, b] = rgb.map((v) => Math.round(v + (edge - v) * t))
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

/**
 * bg 위에서 target 대비를 넘는 base 의 명암 조정본.
 * 저장값 하나로는 못 맞추는 토큰(칩·배지 글자, 포인트 아이콘)을 런타임에 계산한다.
 *
 * **양쪽 방향을 다 시도한다.** 배경 밝기만 보고 방향을 정하면 중간 밝기 배경에서 틀린다 —
 * 핑크(#FF6BA8)는 휘도 0.35 라 `isLight` 가 "어둡다"고 답하지만, 그 위의 흰 글자는 2.65:1 이고
 * 검은 글자는 8:1 이다. "어두우니 밝은 글자"는 중간톤에서 성립하지 않는다.
 *
 * 조금씩 섞어가며 먼저 target 을 넘는 쪽을 쓴다 — 고른 색에서 **덜 벗어나는 답**을 고르기 위해서다.
 * 끝내 못 넘으면 가장 대비가 큰 값을 준다 (best-effort).
 */
export function readableShade(base: string, bg: string, target = 4.5): string {
  let best = base
  let bestRatio = contrastRatio(base, bg) ?? 0
  if (bestRatio >= target) return base

  for (let t = 0.1; t <= 1.0001; t += 0.1) {
    for (const toward of ['black', 'white'] as const) {
      const shade = mix(base, toward, t)
      const ratio = contrastRatio(shade, bg) ?? 0
      if (ratio > bestRatio) {
        best = shade
        bestRatio = ratio
      }
      if (bestRatio >= target) return best
    }
  }
  return best
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
