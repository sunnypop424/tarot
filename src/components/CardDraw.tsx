import { useCallback, useEffect, useRef, useState } from 'react'
import { Shuffle } from 'lucide-react'

import { CardPicker } from './CardPicker'
import { GATHER_MS, DEAL_MS, type ShufflePhase } from './DeckSpread'
import { buildSpread, type SpreadOptions } from '@/lib/deck'
import type { DrawnCard } from '@/types/card'
import styles from './CardDraw.module.css'
import { useT } from '@/i18n'

interface CardDrawProps {
  title: string
  /** 질문 떠올리기 안내 */
  lead: string
  /** 리드 아래 부가 안내 (기간 갱신 문구 등) */
  note?: string
  /** 뽑는 카드 수 */
  cardCount: number
  /** 포지션 라벨 — cardCount 와 길이가 같아야 한다 */
  positions: string[]
  /** 덱 범위·펼침 수·역방향 설정 */
  spread?: SpreadOptions
  onComplete: (drawn: DrawnCard[]) => void
}

/**
 * 카드 뽑기 — 덱 펼치기 → 셔플 → 선택 → 결과 보기.
 * 카테고리 운세와 질문 타로가 같은 손맛으로 동작하도록 공유한다 (PLANNING.md §2).
 */
export function CardDraw({
  title,
  lead,
  note,
  cardCount,
  positions,
  spread: options,
  onComplete,
}: CardDrawProps) {
  const t = useT()
  const [deck, setDeck] = useState<DrawnCard[]>(() => buildSpread(options))
  const [selected, setSelected] = useState<number[]>([])
  const [phase, setPhase] = useState<ShufflePhase>('idle')
  const timers = useRef<number[]>([])

  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach(clearTimeout)
  }, [])

  const runLater = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms))
  }, [])

  const handleShuffle = useCallback(() => {
    if (phase !== 'idle') return
    // 카드가 쓸려 나가는 동안(gather) 덱을 새로 만들고, 다시 한 장씩 놓인다(deal)
    setPhase('gather')
    setSelected([])
    runLater(() => {
      setDeck(buildSpread(options))
      setPhase('deal')
    }, GATHER_MS)
    runLater(() => setPhase('idle'), GATHER_MS + DEAL_MS)
  }, [phase, runLater, options])

  const done = selected.length === cardCount

  return (
    <div className={`screen ${styles.draw}`}>
      <h1 className="t-title-l screen__title">{t(title)}</h1>
      <p className="t-text-m screen__lead">{t(lead)}</p>
      {note && <p className="t-text-xs t-muted screen__lead">{t(note)}</p>}

      <div className={styles.pickArea}>
        <CardPicker
          count={deck.length}
          slotCount={cardCount}
          slotLabels={positions}
          selected={selected}
          onChange={setSelected}
          phase={phase}
        />

        <p className={`t-text-s t-muted ${styles.count}`}>
          {phase !== 'idle'
            ? t('카드를 섞고 있어요…')
            : done
              ? t('다 골랐어요')
              : t('{total}장 중 {n}장 골랐어요', { total: cardCount, n: selected.length })}
        </p>
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={`btn btn--md btn--slight ${styles.shuffleBtn}`}
          onClick={handleShuffle}
          disabled={phase !== 'idle'}
          aria-label={t('카드 다시 섞기')}
        >
          <Shuffle size={20} strokeWidth={2} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="btn btn--md btn--primary btn--glow btn--block"
          onClick={() => onComplete(selected.map((i) => deck[i]))}
          disabled={!done || phase !== 'idle'}
        >
          {t('결과 보기')}
        </button>
      </div>
    </div>
  )
}
