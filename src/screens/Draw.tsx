import { useCallback, useState } from 'react'
import { useParams } from 'react-router-dom'

import { CardDraw } from '@/components/CardDraw'
import { ReadingCard } from '@/components/ReadingCard'
import { getCategory, positionsFor, type Category } from '@/data/categories'
import { getCardById } from '@/data/cards'
import { verdictOf, VERDICT_LABEL, VERDICT_NOTE } from '@/data/yesno'
import { savePeriodDraw, loadPeriodDraw } from '@/lib/storage'
import { useSlot } from '@/slot/SlotProvider'
import { effectiveDeck } from '@/data/slots'
import { useSlotPath } from '@/slot/useSlotPath'
import type { SpreadOptions } from '@/lib/deck'
import type { CategorySetting, Slot } from '@/types/slot'
import type { DrawnCard } from '@/types/card'
import { NotReady } from './NotReady'
import styles from './Draw.module.css'

export function Draw() {
  const { categoryId } = useParams<{ categoryId: string }>()
  const category = categoryId ? getCategory(categoryId) : undefined

  if (!category) return <NotReady title="없는 운세" />
  // 카테고리가 바뀌면 뽑기 상태를 전부 새로 시작한다
  return <DrawFlow key={category.id} category={category} />
}

/** 이번 기간에 뽑아둔 카드를 되살린다 (기간 카테고리가 아니면 없음) */
function restorePeriodDraw(category: Category): DrawnCard[] | null {
  if (!category.period) return null
  const saved = loadPeriodDraw(category.id, category.period)
  if (!saved) return null

  const drawn = saved
    .map(({ cardId, orientation }) => {
      const card = getCardById(cardId)
      return card ? { card, orientation } : null
    })
    .filter((d): d is DrawnCard => d !== null)

  // 카드 데이터가 바뀌어 못 찾는 게 섞이면 저장분을 버리고 다시 뽑게 한다
  return drawn.length === saved.length ? drawn : null
}

/** 슬롯의 이벤트 설정 → 덱 옵션. 덱은 슬롯 범위로 캡한다(22장 슬롯이면 마이너 안 나온다) */
function spreadOptionsFrom(setting: CategorySetting | undefined, slot: Slot): SpreadOptions {
  return {
    deck: effectiveDeck(slot, setting?.deck),
    spreadCount: setting?.spreadCount,
    allowReversed: setting?.allowReversed,
    reversedRate: setting?.reversedRate,
  }
}

function DrawFlow({ category }: { category: Category }) {
  const { go } = useSlotPath()
  const slot = useSlot()
  const setting = slot.event[category.id]
  // 기간 카테고리는 이미 뽑았으면 저장된 결과로 바로 들어간다
  const [revealed, setRevealed] = useState<DrawnCard[] | null>(() => restorePeriodDraw(category))

  const handleComplete = useCallback(
    (picked: DrawnCard[]) => {
      setRevealed(picked)
      if (category.period) {
        savePeriodDraw(
          category.id,
          category.period,
          picked.map(({ card, orientation }) => ({ cardId: card.id, orientation }))
        )
      }
    },
    [category]
  )

  if (revealed) {
    return (
      <Result
        category={category}
        drawn={revealed}
        onRedraw={() => setRevealed(null)}
        onDone={() => go()}
      />
    )
  }

  // 슬롯이 뽑는 수를 지정했으면 그걸, 아니면 카테고리 기본값
  const positions = positionsFor(category, setting?.cardCount ?? category.defaultCount)

  return (
    <CardDraw
      title={category.label}
      lead={category.prompt}
      note={category.renews}
      cardCount={positions.length}
      positions={positions}
      spread={spreadOptionsFrom(setting, slot)}
      onComplete={handleComplete}
    />
  )
}

interface ResultProps {
  category: Category
  drawn: DrawnCard[]
  onRedraw: () => void
  onDone: () => void
}

function Result({ category, drawn, onRedraw, onDone }: ResultProps) {
  // 기간 카테고리는 그 기간에 한 번뿐 — 다시 뽑을 수 없다
  const canRedraw = !category.period
  const isYesNo = category.id === 'yesno'
  const positions = positionsFor(category, drawn.length)

  return (
    <div className="screen">
      <h1 className="t-title-l screen__title">{category.label}</h1>
      {category.renews && <p className="t-text-xs t-muted screen__lead">{category.renews}</p>}

      <div className={styles.results}>
        {drawn.map((item, i) => (
          <ReadingCard
            key={item.card.id}
            drawn={item}
            position={positions[i]}
            aspect={category.aspect}
            // 3장 나열은 길어진다 — 각 장을 짧게
            brief={drawn.length > 1}
            verdict={isYesNo ? verdictFor(item) : undefined}
          />
        ))}
      </div>

      <div className={styles.resultActions}>
        {canRedraw ? (
          <button type="button" className="btn btn--md btn--slight btn--block" onClick={onRedraw}>
            다시 뽑기
          </button>
        ) : (
          <button type="button" className="btn btn--md btn--block" disabled>
            {category.locked}
          </button>
        )}
        <button type="button" className="btn btn--sm btn--ghost btn--block" onClick={onDone}>
          홈으로
        </button>
      </div>

      <p className="t-text-xxs disclaimer">타로는 재미와 성찰을 위한 것이에요.</p>
    </div>
  )
}

/** 예/아니오 — 답 한 줄. 해석 맨 앞에 놓인다 */
function verdictFor(drawn: DrawnCard) {
  const verdict = verdictOf(drawn)
  return { label: VERDICT_LABEL[verdict], note: VERDICT_NOTE[verdict] }
}
