import type { ThemeColors } from '@/types/theme'

/**
 * 바탕 계열 프리셋 — 배경·표면·텍스트 9개만 밝은/어두운 쪽으로 한 번에 스왑한다.
 * 포인트·인터랙션 색(primary/accent/onPrimary)과 카드 뒷면은 슬롯의 브랜드 색이므로 건드리지 않는다.
 * 값은 tokens.css 의 다크 `:root` / `[data-theme='light']` 와 동일 — 자동 그림자 전환은
 * `applyTheme()` 이 캔버스 휘도로 처리한다.
 *
 * `SlotEditor.tsx` 에서 뺐다 — 값 표(hex 아홉 쌍)라 화면 코드와 섞여 있을 이유가 없었다.
 */

export const BASE_KEYS = [
  'canvas', 'surface', 'surfaceRaised', 'wash', 'fg1', 'fg2', 'fg3', 'border', 'borderHover',
] as const satisfies readonly (keyof ThemeColors)[]

export const BASE_PRESETS: { id: 'dark' | 'light'; label: string; base: Pick<ThemeColors, (typeof BASE_KEYS)[number]> }[] = [
  {
    id: 'dark',
    label: '다크 우선',
    base: {
      canvas: '#0F1020', surface: '#1A1B2E', surfaceRaised: '#242537', wash: '#241F45',
      fg1: '#F2F0FA', fg2: '#C6C3D8', fg3: '#9A97B0', border: '#2E2F45', borderHover: '#3A3B57',
    },
  },
  {
    id: 'light',
    label: '라이트 우선',
    base: {
      canvas: '#FAF8FF', surface: '#FFFFFF', surfaceRaised: '#FFFFFF', wash: '#F0EDFF',
      fg1: '#1A1B2E', fg2: '#4A4860', fg3: '#7A7791', border: '#E8E5F2', borderHover: '#D5D0E8',
    },
  },
]

