import { useState } from 'react'

import { CardFace } from '@/components/CardFace'
import { useSlotPath } from '@/slot/useSlotPath'
import { CARDS, SUIT_LABELS } from '@/data/cards'
import type { Suit } from '@/types/card'
import styles from './Cards.module.css'

type Filter = 'major' | Suit

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'major', label: '메이저' },
  { id: 'wands', label: SUIT_LABELS.wands },
  { id: 'cups', label: SUIT_LABELS.cups },
  { id: 'swords', label: SUIT_LABELS.swords },
  { id: 'pentacles', label: SUIT_LABELS.pentacles },
]

/** 카드 도감 — 78장 전체를 훑어보는 곳 */
export function Cards() {
  const { go } = useSlotPath()
  const [filter, setFilter] = useState<Filter>('major')

  const list = CARDS.filter((c) => (filter === 'major' ? c.arcana === 'major' : c.suit === filter))

  return (
    <div className="screen">
      <h1 className="t-title-l screen__title">카드 도감</h1>
      <p className="t-text-m screen__lead">78장의 의미를 살펴보세요.</p>

      <div className={`segment ${styles.suits}`} role="tablist" aria-label="수트">
        {FILTERS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            className="segment__item"
            aria-selected={filter === id}
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <ul className={styles.grid}>
        {list.map((card) => (
          <li key={card.id}>
            <button
              type="button"
              data-card-item
              className={styles.item}
              onClick={() => go(`cards/${card.id}`)}
            >
              <span className={`tarot-card ${styles.itemCard}`}>
                <CardFace card={card} orientation="upright" />
              </span>
              <span className={`t-text-xs ${styles.itemName}`}>{card.name}</span>
            </button>
          </li>
        ))}
      </ul>

      <p className="t-text-xxs disclaimer">타로는 재미와 성찰을 위한 것이에요.</p>
    </div>
  )
}
