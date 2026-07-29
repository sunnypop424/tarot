import { filledTheme } from '@/lib/theme'
import type { Slot } from '@/types/slot'

/**
 * 서비스 겉모습의 **색 기본값** — 슬롯 테마에서 파생한다.
 *
 * 왜 있느냐: 예전엔 서비스마다 `DEFAULT_*` 에 리터럴 hex 를 박아 뒀다(`#26262a`, `#7d7364` …).
 * 그래서 **최고관리자가 편집기에서 슬롯 색을 고르고 저장해도 그 슬롯의 서비스 화면은 안 바뀌었다** —
 * 서비스 칸에서 같은 색을 한 번 더 골라야 했고, 그래야 한다는 걸 알려주는 화면이 없었다.
 * 방문자 눈에는 같은 이벤트의 QR 두 개가 서로 다른 회사 제품으로 보였다 (`docs/REVIEW_COMMON.md` 1번).
 *
 * **매핑을 여기 한 곳에만 둔다.** 서비스마다 "버튼은 무슨 색에서 오나" 를 각자 정하면
 * 다음 서비스가 또 다르게 정한다 — 지금 갈라진 게 정확히 그 이유다.
 *
 * 쓰는 쪽은 `<svc>Display()` 리졸버다:
 *   `buttonColor: saved.buttonColor || base.button`
 * 저장된 값이 늘 이긴다 — **이미 색을 고른 슬롯의 화면은 안 바뀐다.**
 *
 * 여기서 색을 안 받고 **고정으로 남는 자리**가 있다. 연출이 그 색에 걸려 있는 곳이다 —
 * 소원나무의 밤하늘, 포토카드의 덱 무대, 포토존의 촬영 화면, 응원의 어두운 입력 화면.
 * 각 파일 머리말에 이유를 적어 뒀다. 새로 고정하고 싶으면 **거기에도 이유를 적는다.**
 */
export interface ServiceThemeBase {
  /** 화면 바탕 */
  bg: string
  /** 결과 카드 뒤·보조 면처럼 바탕보다 한 겹 눌린 자리 */
  wash: string
  /** 제목 글자 */
  headText: string
  /** 안내·보조 글자 */
  subText: string
  /** 주 버튼 배경. 막대·도장처럼 **차오르는 강조**도 같은 색에서 온다 */
  button: string
}

/**
 * 슬롯 테마 → 서비스 색 기본값.
 *
 * `filledTheme` 를 거치는 이유: 손으로(SQL·API) 만든 슬롯은 `theme.colors` 가 `{}` 일 수 있다.
 * 방문자 경로는 `SlotProvider` 가 이미 채워서 넘기지만 **편집기 초안은 그 길을 안 지난다** —
 * 빠진 키가 그대로 오면 버튼 색이 `undefined` 로 나가 그 규칙이 통째로 죽는다.
 */
export function serviceTheme(slot: Slot): ServiceThemeBase {
  const c = filledTheme(slot.theme).colors
  return {
    bg: c.canvas,
    wash: c.wash,
    headText: c.fg1,
    subText: c.fg2,
    button: c.primary,
  }
}
