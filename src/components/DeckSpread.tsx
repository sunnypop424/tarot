import { useEffect, useState } from 'react'
import type { CSSProperties, MouseEvent } from 'react'

import { CARD_RATIO } from '@/lib/card'
import { CardBack } from './CardBack'
import styles from './DeckSpread.module.css'

/** 셔플 연출 타이밍 — 합계 1200ms (PLANNING.md §2: 1.2초, 스킵 가능) */
export const GATHER_MS = 420
export const DEAL_MS = 780

export type ShufflePhase = 'idle' | 'gather' | 'deal'

/**
 * 크기·줄수는 "작은 기기(375×667)에서도 덱 + 슬롯 + CTA 가 한 화면에 들어온다"를
 * 만족하도록 잡았다. 이 제약이 깨지면 카드를 더 줄이기보다 줄당 장수를 늘릴 것.
 */
const CARD_W = 56
/**
 * 비율은 `lib/card.ts` 가 단일 소스다.
 * 예전엔 여기 `(CARD_W * 5) / 3` 이 박혀 있었는데, 카드 비율을 63×88 로 바꾸자
 * **CSS 만 따라오고 이 값은 옛 비율로 남아** 줄 높이·피벗이 실제 카드와 어긋났다.
 */
const CARD_H = CARD_W / CARD_RATIO
/** 부채꼴 반쪽이 차지할 수 있는 최대 폭 (모바일 360px 기준, 좌우 패딩 제외) */
const HALF_SPAN = 140
/** 한 줄 부채꼴의 최대 벌어짐 각도 */
const MAX_ANGLE = 18
const MAX_ANGLE_RAD = (MAX_ANGLE * Math.PI) / 180

/**
 * 부채꼴 중심(피벗)을 카드 아래 먼 지점에 둔다.
 * 반지름 R 은 "양 끝 카드가 HALF_SPAN 만큼 벌어지는" 조건에서 역산 — R = S / sin(A).
 * 이때 이웃 카드 간 겹침 노출 폭은 R * Δθ 로 자동 결정된다 (8장 기준 약 38px).
 */
const RADIUS = HALF_SPAN / Math.sin(MAX_ANGLE_RAD)
/** transform-origin 의 y (카드 상단 기준) — 카드 중심에서 R 만큼 아래 */
const PIVOT = RADIUS + CARD_H / 2
/** 양 끝 카드가 아래로 처지는 양 */
const ARC_DIP = RADIUS * (1 - Math.cos(MAX_ANGLE_RAD))
const ROW_H = Math.round(CARD_H + 20 + ARC_DIP)
/** 줄끼리 세로로 겹치는 양 — 덱 + 슬롯이 모바일 한 화면에 들어와야 한다 */
const ROW_OVERLAP = 52

/** 한 줄에 12장을 넘기면 노출 폭이 너무 좁아 고르기 어렵다 */
const MAX_PER_ROW = 12
/** 이 높이 미만이면 줄 수를 줄여 한 화면에 욱여넣는다 (iPhone SE 667 등) */
const TALL_SCREEN = 760

/** 화면 높이에 따라 줄 수를 정한다 — 큰 화면 3줄, 작은 화면 2줄 */
function useMaxRows(): number {
  const [tall, setTall] = useState(() => window.innerHeight >= TALL_SCREEN)

  useEffect(() => {
    const onResize = () => setTall(window.innerHeight >= TALL_SCREEN)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return tall ? 3 : 2
}

/** 줄당 장수 — 많을수록 촘촘히 겹치고 줄 수가 준다 */
function perRow(count: number, maxRows: number): number {
  if (count <= 6) return count
  // 전체 78장 같은 큰 덱은 상한에 걸려 줄이 늘고, 한 화면을 포기하고 스크롤한다
  return Math.min(Math.ceil(count / maxRows), MAX_PER_ROW)
}

/** 인덱스를 줄 단위로 나눈다 */
function toRows(count: number, maxRows: number): number[][] {
  const n = perRow(count, maxRows)
  const rows: number[][] = []
  for (let i = 0; i < count; i += n) {
    rows.push(Array.from({ length: Math.min(n, count - i) }, (_, j) => i + j))
  }
  return rows
}

/**
 * 줄 안에서의 회전각.
 * 각도 간격은 "꽉 찬 줄" 기준으로 고정하고, 줄마다 0°를 중심으로 좌우 대칭 배치한다.
 * 장수에 맞춰 각도를 다시 나누면 장수가 모자란 마지막 줄만 간격이 벌어져 따로 논다.
 */
function rotationAt(j: number, rowLength: number, fullRow: number): number {
  if (fullRow <= 1) return 0
  const step = (MAX_ANGLE * 2) / (fullRow - 1)
  return (j - (rowLength - 1) / 2) * step
}

interface DeckSpreadProps {
  /** 펼칠 카드 수 */
  count: number
  /** 슬롯으로 옮겨간 카드 인덱스 — 덱에서는 자리만 남기고 숨긴다 */
  taken: number[]
  /** 카드 탭 — 날아가는 연출의 출발 좌표를 위해 엘리먼트를 함께 넘긴다 */
  onPick: (index: number, element: HTMLElement) => void
  /** 슬롯이 다 찼거나 셔플 중이면 고를 수 없다 */
  disabled: boolean
  phase: ShufflePhase
}

/**
 * 뒷면 카드를 부채꼴 여러 줄로 펼친다. 사용자는 뒷면만 보므로 무엇을 고를지 알 수 없다.
 * 고르지 않은 카드는 끝까지 공개하지 않는다 (PLANNING.md §2).
 */
export function DeckSpread({ count, taken, onPick, disabled, phase }: DeckSpreadProps) {
  const maxRows = useMaxRows()
  const fullRow = perRow(count, maxRows)
  const rows = toRows(count, maxRows)

  const phaseClass =
    phase === 'gather'
      ? styles['card--gathering']
      : phase === 'deal'
        ? styles['card--dealing']
        : ''

  const handleClick = (i: number) => (e: MouseEvent<HTMLButtonElement>) => {
    onPick(i, e.currentTarget)
  }

  return (
    <div
      className={styles.rows}
      style={
        {
          '--card-w': `${CARD_W}px`,
          '--pivot': `${PIVOT}px`,
          '--row-h': `${ROW_H}px`,
          '--row-overlap': `${-ROW_OVERLAP}px`,
        } as CSSProperties
      }
    >
      {rows.map((row, r) => (
        // 아랫줄이 윗줄 위로 겹친다
        <div key={r} data-deck-row className={styles.row} style={{ '--row-z': r } as CSSProperties}>
          {row.map((i, j) => {
            const isTaken = taken.includes(i)

            return (
              <button
                key={i}
                type="button"
                className={`${styles.card} ${isTaken ? styles['card--taken'] : ''} ${phaseClass}`}
                style={
                  {
                    '--rot': `${rotationAt(j, row.length, fullRow)}deg`,
                    // 뒤 카드가 앞 카드 위로 겹친다
                    zIndex: j,
                    // 딜은 앞에서부터, 걷어들이기는 뒤에서부터 — 쓸려나갔다 놓이는 결
                    '--deal-delay': `${i * 18}ms`,
                    '--gather-delay': `${(count - 1 - i) * 8}ms`,
                  } as CSSProperties
                }
                disabled={disabled || isTaken}
                aria-label={`${i + 1}번 카드 고르기`}
                onClick={handleClick(i)}
              >
                <span className="tarot-card" style={{ display: 'block' }}>
                  <CardBack />
                </span>
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
