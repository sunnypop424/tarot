import { contrastLevel, contrastRatio, type ContrastLevel } from '@/lib/color'
import { DERIVED_COLORS } from '@/lib/theme'
import type { ThemeColors } from '@/types/theme'

/**
 * 테마 대비 검사 — 최고관리자가 고른 색이 가독성을 깨뜨리는 걸 배포 전에 잡는다 (PLANNING.md §5).
 * 색이 예뻐도 본문이 안 읽히면 이벤트가 망한다.
 *
 * 계산은 lib/color.ts, **파생 규칙은 lib/theme.ts 의 DERIVED_COLORS** 를 그대로 부른다.
 * 여기서 규칙을 다시 적으면 안 된다 — 갈라지는 순간 검사는 "통과"라는데 화면엔
 * 안 읽히는 색이 나간다. 검사가 거짓말을 하면 안 하느니만 못하다.
 */

export interface ContrastCheck {
  label: string
  ratio: number | null
  level: ContrastLevel | null
}

/** 실제로 겹쳐 놓이는 조합만 검사한다 */
export function checkThemeContrast(colors: ThemeColors): ContrastCheck[] {
  const pairs: [string, string, string][] = [
    ['본문 / 배경', colors.fg1, colors.canvas],
    ['본문 / 표면', colors.fg1, colors.surface],
    ['보조 텍스트 / 표면', colors.fg2, colors.surface],
    ['흐린 텍스트 / 표면', colors.fg3, colors.surface],
    ['버튼 글자 / 버튼', colors.onPrimary, colors.primary],
    /**
     * 아래 둘은 저장값이 아니라 **런타임 파생색**을 검사한다 (실제로 화면에 나가는 색).
     * 칩 배경도 파생이다 — 저장된 `wash` 는 럭키드로우에선 '커버 배경' 이라 진할 수 있고,
     * 화면에 실제로 깔리는 건 캔버스 쪽으로 끌어온 옅은 값이다 (`DERIVED_COLORS.wash`).
     */
    ['칩 글자 / 칩 배경', DERIVED_COLORS.primarySoft(colors), DERIVED_COLORS.wash(colors)],
    ['포인트 아이콘 / 표면', DERIVED_COLORS.accentSoft(colors), colors.surface],
  ]

  return pairs.map(([label, fg, bg]) => {
    const ratio = contrastRatio(fg, bg)
    return { label, ratio, level: ratio === null ? null : contrastLevel(ratio) }
  })
}
