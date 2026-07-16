import { contrastRatio, readableShade } from '@/lib/color'
import type { ThemeColors } from '@/types/theme'

/**
 * AI 가 만든 테마 색을 **읽히게 고쳐서** 받는다.
 *
 * 모델에게 색 감각(어울리는 색조·이벤트 분위기)은 맡기지만 **대비는 안 맡긴다.**
 * "4.5:1 넘게 해줘"라고 부탁하면 대충 맞춰 오고, 대충 맞은 색은 카페 햇빛 아래서 안 읽힌다.
 * 여기서 `readableShade` 로 강제하면 모델이 뭘 주든 결과는 항상 읽힌다 —
 * 대비 검사 패널이 초록인 이유가 운이 아니라 계산이 된다.
 *
 * 고치는 건 **글자·아이콘뿐**이다. 바탕·브랜드 색(canvas·surface·primary·accent)은
 * 모델이 고른 그대로 둔다 — 그게 이 기능을 쓰는 이유다.
 */

/** AI 가 채워 주는 색 (primarySoft·accentSoft 는 파생이라 안 받는다) */
export type GeneratedTheme = Omit<ThemeColors, 'primarySoft' | 'accentSoft'>

/** 본문은 7:1, 보조는 4.5:1, 흐린 글자는 3:1 — WCAG AA 기준 */
const TARGET = { fg1: 7, fg2: 4.5, fg3: 3, onPrimary: 4.5, accent: 4.5 } as const

/**
 * 안 읽히는 글자색만 배경 대비를 넘게 조정한다.
 * 이미 넘으면 **손대지 않는다** — 모델이 고른 색을 존중한다.
 */
export function repairContrast(colors: GeneratedTheme): {
  colors: ThemeColors
  fixed: string[]
} {
  const fixed: string[] = []
  const fix = (
    label: string,
    value: string,
    bg: string,
    target: number
  ): string => {
    const ratio = contrastRatio(value, bg)
    if (ratio !== null && ratio >= target) return value
    fixed.push(label)
    return readableShade(value, bg, target)
  }

  const out: ThemeColors = {
    ...colors,
    // 글자 — 표면 위에서 읽혀야 한다
    fg1: fix('본문', colors.fg1, colors.surface, TARGET.fg1),
    fg2: fix('보조 텍스트', colors.fg2, colors.surface, TARGET.fg2),
    fg3: fix('흐린 텍스트', colors.fg3, colors.surface, TARGET.fg3),
    // CTA 글자 — 버튼 위에서 읽혀야 한다
    onPrimary: fix('CTA 글자', colors.onPrimary, colors.primary, TARGET.onPrimary),
    // 포인트 — **어두운 카드 뒷면 위**의 장식이다 (표면이 아니라 cardBackFrom 이 배경)
    accent: fix('포인트', colors.accent, colors.cardBackFrom, TARGET.accent),

    /**
     * 파생색이라 저장값은 안 쓰인다 (applyTheme 이 덮어쓴다).
     * 그래도 타입을 채워야 하니 같은 규칙으로 넣어둔다 — 값이 어긋나 보이면 다음 사람이 헷갈린다.
     */
    primarySoft: readableShade(colors.primary, colors.wash),
    accentSoft: readableShade(colors.accent, colors.surface),
  }

  return { colors: out, fixed }
}
