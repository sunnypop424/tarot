/**
 * 카드 치수의 **단일 소스**.
 *
 * 실물 타로 카드 규격 63×88mm. 이 비율은 CSS(`--card-ratio`)와 JS(덱 부채꼴 기하) 양쪽이
 * 알아야 해서 여기 둔다 — 예전엔 `tokens.css` 에 `3 / 5`, `DeckSpread.tsx` 에 `CARD_W * 5 / 3`
 * 이 따로 있었고, 비율을 바꾸자 **CSS 만 바뀌고 JS 는 옛 비율로 남아** 줄 높이가 어긋났다.
 *
 * `tokens.css` 의 `--card-ratio` 도 이 값과 같아야 한다 (CSS 는 여기서 못 읽는다).
 */
export const CARD_W_MM = 63
export const CARD_H_MM = 88

/** 가로 / 세로 = 0.7159… */
export const CARD_RATIO = CARD_W_MM / CARD_H_MM

/**
 * radius 기준 카드 폭(px) — 홈의 오늘/주간/월간 카드 크기.
 *
 * 슬롯이 고르는 `shape.radiusLg` 는 **이 크기의 카드에 적용될 때의 값**이다.
 * 더 작은 카드(덱·도감)는 그만큼 줄어든 radius 를 쓴다 — 안 그러면 56px 짜리 덱 카드가
 * 170px 카드와 같은 16px radius 를 써서 3배로 뭉툭해 보인다 (`cardRadius`).
 */
export const CARD_REF_W = 170

/**
 * 카드 radius 를 **크기에 비례하는 퍼센트**로 환산한다 → `border-radius: <x>% / <y>%`.
 *
 * 퍼센트 radius 는 가로를 폭 기준, 세로를 높이 기준으로 재므로 그냥 `9%` 라고 쓰면
 * 모서리가 타원이 된다. 카드 비율이 어디서나 같으니 세로 퍼센트를 `CARD_RATIO` 만큼
 * 줄여주면 **어떤 크기에서도 정확히 원형**이고, 크기에 자동으로 비례한다.
 *
 * 이렇게 하는 이유: CSS 로는 길이를 길이로 나눌 수 없어서(`16px / 170px` 은 불가)
 * "폭의 몇 %" 를 CSS 안에서 계산할 방법이 없다. 그래서 여기서 계산해 넣는다.
 */
export function cardRadius(radiusLg: number): string {
  const x = (radiusLg / CARD_REF_W) * 100
  return `${round(x)}% / ${round(x * CARD_RATIO)}%`
}

const round = (n: number) => Math.round(n * 1000) / 1000
