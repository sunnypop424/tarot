import { useState } from 'react'
import { Heart, Coins, Briefcase } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { CardBack } from '@/components/CardBack'
import { StarField } from '@/components/StarField'
import { Logo } from '@/components/Logo'
import { ReadingCard } from '@/components/ReadingCard'
import { PERIOD_CATEGORIES, getCategory, positionsFor, type Category } from '@/data/categories'
import { getCardById } from '@/data/cards'
import { readingOf } from '@/lib/deck'
import { firstSentence } from '@/lib/date'
import { loadPeriodDraw } from '@/lib/storage'
import { useSlotPath } from '@/slot/useSlotPath'
import type { Aspect, DrawnCard } from '@/types/card'
import styles from './Home.module.css'

/**
 * 홈 — 기간 운세(오늘·주간·월간).
 * 매일 오늘의 카드를 뽑는 게 이 앱의 핵심 루프라 첫 화면에 둔다.
 * 셋은 뽑는 주기만 다른 같은 것이라 세그먼트로 묶었다.
 * 주제별 운세(애정·금전 등)는 성격이 달라 운세 탭에 있다.
 */
export function Home() {
  const [periodId, setPeriodId] = useState<string>(PERIOD_CATEGORIES[0].id)
  const period = getCategory(periodId)!

  return (
    <div className={`screen ${styles.home}`}>
      <StarField className={styles.stars} />

      <Logo className={styles.logo} />

      <div className={`segment ${styles.segment}`} role="tablist" aria-label="기간">
        {PERIOD_CATEGORIES.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            className="segment__item"
            aria-selected={periodId === id}
            onClick={() => setPeriodId(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 기간이 바뀌면 카드도 새로 그려야 플립이 다시 걸린다 */}
      <PeriodPanel key={periodId} category={period} />

      <p className="t-text-xxs disclaimer">타로는 재미와 성찰을 위한 것이에요.</p>
    </div>
  )
}

/** 이번 기간에 뽑아둔 카드를 되살린다 */
function restore(category: Category): DrawnCard[] | null {
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

/** 뽑았으면 결과를, 아직이면 뽑으러 보낸다 */
function PeriodPanel({ category }: { category: Category }) {
  const drawn = restore(category)

  return (
    <>
      <p className={`t-text-xs t-muted ${styles.renews}`}>{category.renews}</p>
      {drawn ? (
        <PeriodResult category={category} drawn={drawn} />
      ) : (
        <PeriodEmpty category={category} />
      )}
    </>
  )
}

function PeriodEmpty({ category }: { category: Category }) {
  const { go: goTo } = useSlotPath()
  const go = () => goTo(`draw/${category.id}`)

  return (
    <div className={styles.empty}>
      <button
        type="button"
        className={`tarot-card tarot-card--lifted ${styles.emptyCard}`}
        aria-label={`${category.label} 카드 뽑기`}
        onClick={go}
      >
        <CardBack />
      </button>
      <p className="t-text-l">{category.label} 카드가 당신을 기다리고 있어요</p>
      {/* 기간 라벨은 세 세그먼트 모두 같은 자리에 — 없으면 버튼이 위아래로 움직인다 */}
      <p className="t-text-xs t-muted">{category.periodLabel?.()}</p>
      <button
        type="button"
        className={`btn btn--sm btn--primary btn--glow ${styles.emptyCta}`}
        onClick={go}
      >
        카드 뽑기
      </button>
    </div>
  )
}

function PeriodResult({ category, drawn }: { category: Category; drawn: DrawnCard[] }) {
  const positions = positionsFor(category, drawn.length)

  return (
    <>
      <div className={styles.readings}>
        {drawn.map((item, i) => (
          <ReadingCard
            key={item.card.id}
            drawn={item}
            position={positions[i]}
            aspect={category.aspect}
          />
        ))}
      </div>

      {/* 한 장짜리 기간 운세는 관점별 한 줄 요약을 덧붙인다 */}
      {drawn.length === 1 && <AspectSummaries drawn={drawn[0]} />}
    </>
  )
}

const SUMMARY_ASPECTS: { aspect: Aspect; label: string; icon: LucideIcon }[] = [
  { aspect: 'love', label: '애정', icon: Heart },
  { aspect: 'money', label: '금전', icon: Coins },
  { aspect: 'career', label: '직업', icon: Briefcase },
]

function AspectSummaries({ drawn }: { drawn: DrawnCard }) {
  const reading = readingOf(drawn)

  return (
    <div className={styles.summaries}>
      {SUMMARY_ASPECTS.map(({ aspect, label, icon: Icon }) => (
        <div key={aspect} className={`surface ${styles.summary}`}>
          <Icon
            size={20}
            strokeWidth={1.75}
            className={`icon-accent ${styles.summaryIcon}`}
            aria-hidden="true"
          />
          <span className={styles.summaryText}>
            <span className="t-text-s">{label}</span>
            <span className="t-text-m t-fg-2">{firstSentence(reading[aspect])}</span>
          </span>
        </div>
      ))}
    </div>
  )
}
