import { useParams } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'

import { CardFace } from '@/components/CardFace'
import { useSlotPath } from '@/slot/useSlotPath'
import { getCardById, SUIT_LABELS } from '@/data/cards'
import type { Card, CardReading, Orientation } from '@/types/card'
import { NotReady } from './NotReady'
import styles from './Cards.module.css'
import { useT } from '@/i18n'
import { useCardText } from '@/i18n/cardText'

const FIELDS: { key: keyof Omit<CardReading, 'core'>; label: string }[] = [
  { key: 'general', label: '종합' },
  { key: 'love', label: '애정' },
  { key: 'money', label: '금전' },
  { key: 'career', label: '직업' },
  { key: 'advice', label: '조언' },
]

/** 카드 상세 — 상징과 정/역방향 전체 의미 */
export function CardDetail() {
  const t = useT()
  const lc = useCardText()
  const { cardId } = useParams<{ cardId: string }>()
  const { go } = useSlotPath()
  const raw = cardId ? getCardById(cardId) : undefined
  const card = raw && lc(raw)

  if (!card) return <NotReady title={t('없는 카드')} />

  return (
    <div className="screen">
      {/* 타이틀·리드는 다른 화면과 같은 자리에 둔다 — 이동할 때 어긋나 보이지 않게 */}
      <h1 className="t-title-l screen__title">{card.name}</h1>
      <p className="t-text-m screen__lead">
        {/* 영어에서는 이름이 곧 nameEn 이라 같은 글자가 두 번 뜬다 — 다를 때만 병기 */}
        {card.name !== card.nameEn && <>{card.nameEn} · </>}
        {arcanaLabel(card, t)}
      </p>

      <div className={`play-card ${styles.detailCard}`}>
        <CardFace card={card} orientation="upright" />
      </div>

      <ul className={styles.keywords}>
        {card.keywords.map((k) => (
          <li key={k} className="chip">
            {k}
          </li>
        ))}
      </ul>

      <section className={styles.section}>
        <h2 className={`t-title-s ${styles.sectionTitle}`}>{t('상징')}</h2>
        <p className="t-body t-fg-2">{card.symbolism}</p>
      </section>

      <Meanings card={card} orientation="upright" title={t('정방향')} />
      <Meanings card={card} orientation="reversed" title={t('역방향')} />

      {/* 뒤로가기는 다 읽고 난 아래쪽에 — 결과 화면의 "다시 뽑기"와 같은 자리·같은 모양 */}
      <button
        type="button"
        className="btn btn--md btn--slight btn--block"
        onClick={() => go('cards')}
      >
        <ChevronLeft size={20} strokeWidth={2} aria-hidden="true" />
        도감으로
      </button>

      <p className="t-text-xxs disclaimer">{t('타로는 재미와 성찰을 위한 것이에요.')}</p>
    </div>
  )
}

function arcanaLabel(card: Card, t: (ko: string) => string): string {
  if (card.arcana === 'major') return `${t('메이저 아르카나')} · ${card.number}`
  return `${t(SUIT_LABELS[card.suit!])} · ${t('마이너 아르카나')}`
}

function Meanings({
  card,
  orientation,
  title,
}: {
  card: Card
  orientation: Orientation
  title: string
}) {
  const t = useT()
  const reading = card[orientation]

  return (
    <section className={styles.section}>
      <h2 className={`t-title-s ${styles.sectionTitle}`}>{title}</h2>

      {/* 핵심 = 관점과 무관한 카드 자체의 의미 (중립 서술체) */}
      <p className="t-body t-fg-2" style={{ marginBottom: 'var(--space-md)' }}>
        {reading.core}
      </p>

      <div className={styles.meanings}>
        {FIELDS.map(({ key, label }) => (
          <div key={key} className={`surface ${styles.meaning}`}>
            <span className="t-text-s t-primary">{t(label)}</span>
            <span className="t-body">{reading[key]}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
