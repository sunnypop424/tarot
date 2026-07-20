import type { Slot } from '@/types/slot'

/**
 * 럭키드로우 **겉모습** — 최고관리자가 슬롯 편집기에서 정한다 (주최자는 못 건드린다).
 *
 * 옮겨온 원본(Firebase)은 이 값들이 전부 코드에 박혀 있었다: 1·2등만 스크래치, 커버는 ♥,
 * 남은 수량 배지는 50개 이하일 때. 상품 구성은 행사마다 다른데(1등만 있는 행사도, 7등까지
 * 있는 행사도 있다) 그때마다 코드를 고칠 수는 없다.
 *
 * **색은 여기 없다.** 색은 테마(`Theme.colors`)가 이미 갖고 있고, hex 를 tokens.css 밖에
 * 두지 않는 게 이 프로젝트의 규칙이다. 하이라이트는 `--color-primary`(글자색 짝이 보장된
 * 유일한 색)를 쓰고 테두리에 `--color-accent` 를 얹는다.
 */
export interface LuckydrawDisplay {
  /**
   * 스크래치로 가려 놓고 **직접 긁게** 할 등수.
   *
   * 비싼 상품만 긁는 재미를 준다 — 전부 긁게 하면 10개 뽑을 때 10번 긁어야 해서
   * 리추얼이 노동이 된다. 빈 배열이면 전부 바로 보인다.
   */
  highlightRanks: number[]
  /** 긁기 전 커버에 찍히는 글자 (이모지 한 글자를 상정한다) */
  coverMark: string
  /**
   * "N개 남았습니다" 배지를 띄우기 시작하는 재고. null 이면 안 띄운다.
   *
   * 원본은 50 고정이었다. 상품이 30개뿐인 행사에선 처음부터 계속 떠 있어서
   * "얼마 안 남았다" 는 신호가 신호 구실을 못 한다.
   */
  lowStockThreshold: number | null
  /** 추첨 버튼 문구 — 행사 컨셉에 맞춰 바꾼다 */
  drawLabel: string
  /** 마감됐을 때 방문자에게 보이는 문구 */
  closedText: string
}

export const DEFAULT_DISPLAY: LuckydrawDisplay = {
  highlightRanks: [1, 2],
  coverMark: '♥',
  lowStockThreshold: 50,
  drawLabel: 'DRAW!',
  closedText: '럭키드로우가 마감되었습니다',
}

/**
 * 슬롯의 설정 + 기본값 — **키 단위로 채운다.**
 *
 * `slot.luckydraw ?? DEFAULT` 로 뭉뚱그리면 편집기가 한 값만 저장한 슬롯에서 나머지가
 * undefined 가 된다. 0008 이전에 만든 슬롯은 이 컬럼이 `{}` 라 전부 기본값으로 뜬다.
 */
export function luckydrawDisplay(slot: Slot): LuckydrawDisplay {
  const saved = slot.luckydraw ?? {}
  return {
    highlightRanks: saved.highlightRanks ?? DEFAULT_DISPLAY.highlightRanks,
    coverMark: saved.coverMark || DEFAULT_DISPLAY.coverMark,
    // null 은 "안 띄운다" 는 뜻이라 살려야 한다 — ?? 로 기본값을 덮으면 그 의도가 사라진다
    lowStockThreshold:
      saved.lowStockThreshold === undefined
        ? DEFAULT_DISPLAY.lowStockThreshold
        : saved.lowStockThreshold,
    drawLabel: saved.drawLabel || DEFAULT_DISPLAY.drawLabel,
    closedText: saved.closedText || DEFAULT_DISPLAY.closedText,
  }
}
