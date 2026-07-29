import type { CSSProperties } from 'react'

import { CardBack } from './CardBack'
import { CardFace } from './CardFace'
import type { DrawnCard } from '@/types/card'
import styles from './FlipCard.module.css'

interface FlipCardProps {
  drawn: DrawnCard
  flipped: boolean
  /** 순차 플립용 지연(ms) — 3장 스프레드에서 0.15s 간격 */
  delay?: number
  className?: string
}

/** 뒷면 → 앞면 rotateY 플립. 프레임은 .play-card 가 담당한다. */
export function FlipCard({ drawn, flipped, delay = 0, className }: FlipCardProps) {
  return (
    <div className={`${styles.scene} ${className ?? ''}`}>
      <div
        className={`${styles.inner} ${flipped ? styles['inner--flipped'] : ''}`}
        style={{ '--flip-delay': `${delay}ms` } as CSSProperties}
      >
        {/* 면(.face)은 배치, 프레임(.play-card)은 안쪽에 — 같은 요소에 겹치면 position 이 충돌한다 */}
        <div className={styles.face}>
          <div className="play-card play-card--fill">
            <CardBack />
          </div>
        </div>
        <div className={`${styles.face} ${styles['face--back']}`}>
          <div className="play-card play-card--fill">
            <CardFace {...drawn} />
          </div>
        </div>
      </div>
    </div>
  )
}
