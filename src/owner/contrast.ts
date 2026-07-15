import { contrastLevel, contrastRatio, type ContrastLevel } from '@/lib/color'

/**
 * 테마 대비 검사 — 주최자가 준 색이 가독성을 깨뜨리는 걸 배포 전에 잡는다 (PLANNING.md §5).
 * 색이 예뻐도 본문이 안 읽히면 이벤트가 망한다.
 * 계산 자체는 lib/color.ts 에 있다 (사용자 앱도 휘도를 쓴다).
 */

export interface ContrastCheck {
  label: string
  ratio: number | null
  level: ContrastLevel | null
}

/** 실제로 겹쳐 놓이는 조합만 검사한다 */
export function checkThemeContrast(colors: {
  canvas: string
  surface: string
  fg1: string
  fg2: string
  fg3: string
  primary: string
  onPrimary: string
  wash: string
  primarySoft: string
}): ContrastCheck[] {
  const pairs: [string, string, string][] = [
    ['본문 / 배경', colors.fg1, colors.canvas],
    ['본문 / 표면', colors.fg1, colors.surface],
    ['보조 텍스트 / 표면', colors.fg2, colors.surface],
    ['흐린 텍스트 / 표면', colors.fg3, colors.surface],
    ['버튼 글자 / 버튼', colors.onPrimary, colors.primary],
    ['칩 글자 / 칩 배경', colors.primarySoft, colors.wash],
  ]

  return pairs.map(([label, fg, bg]) => {
    const ratio = contrastRatio(fg, bg)
    return { label, ratio, level: ratio === null ? null : contrastLevel(ratio) }
  })
}
