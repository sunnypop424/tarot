/**
 * 수량 고르기(스테퍼 + 프리셋 + 실행 버튼)의 **겉모습** — 럭키드로우와 포토카드가 같이 쓴다.
 *
 * 두 서비스가 같은 묶음을 각자 그리고 있었다: `− 숫자 +` 스테퍼, `1·5·10` 프리셋, 큰 실행
 * 버튼. 화면도 같고 다루는 값도 같은데 CSS 와 마크업이 두 벌이라 한쪽만 고치는 날이 온다
 * (프리셋 숫자도 이미 갈라져 있었다 — 럭드 1·5·10 vs 포토카드 1·3·5·10).
 *
 * **색은 여기 안 든다.** 이 타입은 "어떻게 생겼나" 만 담고, 실제 색은 각 서비스가
 * `pickerVars()` 로 CSS 커스텀 프로퍼티에 실어 보낸다 — 슬롯 테마 색을 그대로 쓰는 서비스도
 * 있고 자기 팔레트를 쓰는 서비스도 있어서다.
 */
export interface CountPickerStyle {
  /** 모서리 둥글기 (px) — 스테퍼·프리셋·실행 버튼에 비례해 들어간다 */
  radius: number
  /** 테두리 굵기 (px). 0 이면 테두리가 없다 */
  borderWidth: number
  borderColor: string
  /** 스테퍼 상자 배경 */
  bg: string
  /** 숫자·프리셋 글자색 */
  fg: string
  /** ± 버튼 배경 */
  stepBg: string
  /**
   * ± 글자색 — **안 고르면 숫자색(`fg`)을 따라간다.**
   *
   * 원래 ± 는 숫자와 같은 색으로 못박혀 있었는데, ± 버튼만 배경을 따로 줄 수 있어서
   * (`stepBg`) 그 배경이 진해지면 ± 가 안 보였다. 짝이 되는 칸이 없으면 배경만 고를 수 있고
   * 글자는 못 고치는 상태가 된다 — 색 짝은 늘 같이 열어 둔다.
   */
  stepFg: string
  /** 고른 프리셋 */
  onBg: string
  onFg: string
  /** 실행 버튼 */
  goBg: string
  goFg: string
}

export const DEFAULT_COUNT_PICKER: CountPickerStyle = {
  radius: 16,
  borderWidth: 1,
  borderColor: '#e5e7eb',
  bg: '#f3f4f6',
  fg: '#1f1f1f',
  stepBg: '#ffffff',
  stepFg: '#1f1f1f',
  onBg: '#26262a',
  onFg: '#ffffff',
  goBg: '#26262a',
  goFg: '#ffffff',
}

/**
 * 저장값 + 기본값 — **키 단위로 채운다** (한 값만 저장한 슬롯에서 나머지가 비지 않게).
 *
 * `base` 를 받는 이유: 안 고른 색의 기본값이 서비스마다 다르다. 럭드는 슬롯 테마 토큰을
 * 그대로 쓰고 포토카드는 자기 팔레트를 쓴다 — 하나로 정하면 한쪽이 반드시 어긋난다.
 */
export function countPicker(
  saved: Partial<CountPickerStyle> | undefined,
  base: Partial<CountPickerStyle> = {}
): CountPickerStyle {
  const s = saved ?? {}
  const pick = <K extends keyof CountPickerStyle>(k: K): CountPickerStyle[K] =>
    (s[k] ?? base[k] ?? DEFAULT_COUNT_PICKER[k]) as CountPickerStyle[K]
  return {
    // 숫자는 0 이 유효한 값이라 `??` 로 (0 을 "없음" 으로 보면 테두리를 못 끈다)
    radius: s.radius ?? base.radius ?? DEFAULT_COUNT_PICKER.radius,
    borderWidth: s.borderWidth ?? base.borderWidth ?? DEFAULT_COUNT_PICKER.borderWidth,
    borderColor: pick('borderColor'),
    bg: pick('bg'),
    fg: pick('fg'),
    stepBg: pick('stepBg'),
    /**
     * ± 글자색은 **숫자색으로 폴백한다** — 지금까지 ± 는 `--cp-fg` 로 그려졌으니,
     * 안 고른 슬롯의 화면이 이 칸이 생겼다고 달라지면 안 된다.
     */
    stepFg: s.stepFg ?? base.stepFg ?? pick('fg'),
    onBg: pick('onBg'),
    onFg: pick('onFg'),
    goBg: pick('goBg'),
    goFg: pick('goFg'),
  }
}

/** CSS 커스텀 프로퍼티로 — `<CountPicker>` 를 감싼 어디에든 얹으면 된다 */
export function pickerVars(s: CountPickerStyle): Record<string, string> {
  return {
    '--cp-radius': `${Math.max(0, Math.min(40, s.radius))}px`,
    '--cp-border': s.borderWidth > 0 ? `${s.borderWidth}px solid ${s.borderColor}` : 'none',
    '--cp-bg': s.bg,
    '--cp-fg': s.fg,
    '--cp-step-bg': s.stepBg,
    '--cp-step-fg': s.stepFg,
    '--cp-on-bg': s.onBg,
    '--cp-on-fg': s.onFg,
    '--cp-go-bg': s.goBg,
    '--cp-go-fg': s.goFg,
  }
}

/**
 * 프리셋 — **1·5·10 으로 통일한다.**
 *
 * 럭드는 1·5·10, 포토카드는 1·3·5·10 이었다. 같은 화면인데 숫자가 다르면 그건 그냥
 * 갈라진 것이고, 방문자가 두 이벤트를 오가면 손이 헷갈린다. 상한(`max`)을 넘는 건 뺀다.
 */
export const COUNT_PRESETS = [1, 5, 10] as const
