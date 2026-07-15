import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { X } from 'lucide-react'

import { CardBack } from './CardBack'
import { DeckSpread, type ShufflePhase } from './DeckSpread'
import styles from './CardPicker.module.css'

/** --dur-fly 와 맞춘다 */
const FLY_MS = 420

interface Flight {
  /** 목적지 슬롯 */
  slot: number
  /** 출발 지점 (뷰포트 좌표) */
  from: DOMRect
  to: DOMRect
}

interface CardPickerProps {
  /** 덱에 펼칠 카드 수 */
  count: number
  /** 골라야 하는 수 = 슬롯 수 */
  slotCount: number
  /** 슬롯 라벨 (포지션명) — slotCount 와 길이가 같다 */
  slotLabels: string[]
  /** 고른 덱 인덱스 (슬롯 순서대로) */
  selected: number[]
  onChange: (selected: number[]) => void
  phase: ShufflePhase
}

/**
 * 슬롯 + 덱 그리드. 덱에서 고른 카드가 슬롯으로 날아가 얹히고,
 * 얹힌 카드는 X 로 물러서 다시 고를 수 있다.
 */
export function CardPicker({
  count,
  slotCount,
  slotLabels,
  selected,
  onChange,
  phase,
}: CardPickerProps) {
  const slotRefs = useRef<(HTMLDivElement | null)[]>([])
  const [flight, setFlight] = useState<Flight | null>(null)
  /** 두 번째 프레임에 목적지로 transform 을 걸어야 트랜지션이 산다 */
  const [flying, setFlying] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  // 셔플이 시작되면 비행 중인 카드는 의미가 없다
  useEffect(() => {
    if (phase !== 'idle') {
      window.clearTimeout(timer.current)
      setFlight(null)
      setFlying(false)
    }
  }, [phase])

  const handlePick = useCallback(
    (index: number, element: HTMLElement) => {
      const slot = selected.length
      const slotEl = slotRefs.current[slot]
      if (!slotEl) return

      const from = element.getBoundingClientRect()
      const to = slotEl.getBoundingClientRect()

      // 덱 카드는 곧바로 자리를 비우고, 날아가는 카드가 그 자리를 이어받는다
      onChange([...selected, index])
      setFlight({ slot, from, to })
      setFlying(false)

      requestAnimationFrame(() => requestAnimationFrame(() => setFlying(true)))
      timer.current = window.setTimeout(() => {
        setFlight(null)
        setFlying(false)
      }, FLY_MS)
    },
    [selected, onChange]
  )

  const handleRemove = useCallback(
    (slot: number) => {
      onChange(selected.filter((_, i) => i !== slot))
    },
    [selected, onChange]
  )

  const full = selected.length >= slotCount

  return (
    <>
      <DeckSpread
        count={count}
        taken={selected}
        onPick={handlePick}
        disabled={full || phase !== 'idle'}
        phase={phase}
      />

      {/* 고른 카드가 놓이는 자리 — 덱 아래 */}
      <div className={styles.slots}>
        {Array.from({ length: slotCount }, (_, i) => {
          const deckIndex = selected[i]
          // 날아오는 중인 슬롯은 아직 비어 있어야 한다 (날아가는 카드가 그 자리를 덮는다)
          const landed = deckIndex !== undefined && flight?.slot !== i
          const incoming = flight?.slot === i

          return (
            <div key={i} className={styles.slot}>
              <div className={styles.slotBox} ref={(el) => void (slotRefs.current[i] = el)}>
                {landed ? (
                  <>
                    <span className={`tarot-card tarot-card--fill ${styles.slotCard}`}>
                      <CardBack />
                    </span>
                    <button
                      type="button"
                      className={styles.remove}
                      aria-label={`${slotLabels[i]} 카드 다시 고르기`}
                      onClick={() => handleRemove(i)}
                    >
                      <X size={14} strokeWidth={2.5} aria-hidden="true" />
                    </button>
                  </>
                ) : (
                  <div
                    className={`${styles.slotEmpty} ${incoming ? styles['slotEmpty--incoming'] : ''}`}
                  />
                )}
              </div>
              <span className={`t-text-xxs t-muted ${styles.slotLabel}`}>{slotLabels[i]}</span>
            </div>
          )
        })}
      </div>

      {flight && (
        <div
          className={styles.flying}
          style={
            {
              left: flight.from.left,
              top: flight.from.top,
              width: flight.from.width,
              height: flight.from.height,
              transform: flying
                ? `translate(${flight.to.left - flight.from.left}px, ${
                    flight.to.top - flight.from.top
                  }px) scale(${flight.to.width / flight.from.width})`
                : 'none',
            } as CSSProperties
          }
          aria-hidden="true"
        >
          <span className="tarot-card tarot-card--fill" style={{ display: 'block' }}>
            <CardBack />
          </span>
        </div>
      )}
    </>
  )
}
