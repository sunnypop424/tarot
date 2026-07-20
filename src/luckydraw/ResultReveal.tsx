import { useCallback, useEffect, useMemo, useState } from 'react'

import type { LuckydrawDisplay } from '@/data/luckydraw'
import type { DrawResult, DrawnPrize, LuckydrawSettings } from '@/lib/repo'
import { Confetti } from './Confetti'
import { ShippingForm } from './ShippingForm'
import styles from './Luckydraw.module.css'

/** 긁히는 데 걸리는 시간 — CSS 의 transition 과 같아야 한다 */
const SCRATCH_MS = 700

interface Props {
  result: DrawResult
  display: LuckydrawDisplay
  displayMode: LuckydrawSettings['displayMode']
  slug: string
  onFinish: () => void
  /** 편집기 미리보기 전용 — 전체 결과 화면을 바로 보여준다 (거기까지 눌러 갈 수 없다) */
  startAtSummary?: boolean
}

/**
 * 당첨 결과 — **연출이 본체다.**
 *
 * 낮은 등수는 순서대로 스르륵 나타나고, 비싼 등수(`highlightRanks`)만 덮여 있어 직접 긁는다.
 * 전부 긁게 하면 10개 뽑을 때 10번 긁어야 해서 리추얼이 노동이 되고, 전부 그냥 보여주면
 * 1등이 나온 순간이 밋밋해진다. 원본(Firebase)의 이 감각이 좋아서 그대로 가져왔다.
 */
export function ResultReveal({
  result,
  display,
  displayMode,
  slug,
  onFinish,
  startAtSummary = false,
}: Props) {
  const { results } = result
  const [revealed, setRevealed] = useState<number[]>([])
  const [scratching, setScratching] = useState<number | null>(null)
  const [summary, setSummary] = useState(startAtSummary)
  const [shipping, setShipping] = useState(false)
  const [celebrate, setCelebrate] = useState(false)

  const isHigh = useCallback(
    (p: DrawnPrize) => display.highlightRanks.includes(p.rank),
    [display.highlightRanks]
  )

  /** 덮이지 않은 것은 처음부터 공개다 — 애니메이션이 순서를 만든다 */
  useEffect(() => {
    setRevealed(results.map((p, i) => (isHigh(p) ? -1 : i)).filter((i) => i >= 0))
  }, [results, isHigh])

  function reveal(index: number) {
    if (revealed.includes(index) || scratching !== null) return
    setScratching(index)
    setCelebrate(true)
    window.setTimeout(() => {
      setRevealed((prev) => [...prev, index])
      setScratching(null)
    }, SCRATCH_MS)
  }

  const label = useCallback(
    (p: DrawnPrize) => {
      if (displayMode === 'rank') return `${p.rank}등`
      if (displayMode === 'prize') return p.name
      return `${p.rank}등 · ${p.name}`
    },
    [displayMode]
  )

  /** 같은 상품끼리 묶는다 — 10개 뽑으면 낱개로 보는 것보다 이쪽이 읽힌다 */
  const grouped = useMemo(() => {
    const map = new Map<string, DrawnPrize & { count: number }>()
    for (const p of results) {
      const key = `${p.rank}-${p.name}`
      const hit = map.get(key)
      if (hit) hit.count += 1
      else map.set(key, { ...p, count: 1 })
    }
    return [...map.values()].sort((a, b) => a.rank - b.rank)
  }, [results])

  const needsShipping = grouped.some((p) => p.requiresShipping)
  const allRevealed = revealed.length === results.length

  if (summary) {
    return (
      <div className={styles.reveal}>
        <h2 className="t-title-s" data-part="title">전체 결과</h2>

        <ul className={`stack ${styles.summary}`}>
          {grouped.map((p) => (
            <li key={`${p.rank}-${p.name}`} className={styles.summaryRow}>
              <span>{label(p)}</span>
              <span className={styles.summaryCount}>{p.count}개</span>
            </li>
          ))}
        </ul>

        {result.rehearsal && (
          <p className="t-text-xs t-muted">리허설이라 재고는 줄지 않았어요.</p>
        )}

        {needsShipping && (
          <button
            type="button"
            className="btn btn--slight btn--block"
            onClick={() => setShipping(true)}
          >
            배송 정보 입력하기
          </button>
        )}

        <button type="button" className="btn btn--primary btn--block" onClick={onFinish}>
          처음으로
        </button>

        {shipping && (
          <ShippingForm
            slug={slug}
            prizes={grouped
              .filter((p) => p.requiresShipping)
              .map((p) => ({ rank: p.rank, name: p.name, count: p.count }))}
            onClose={() => setShipping(false)}
          />
        )}
      </div>
    )
  }

  return (
    <div className={styles.reveal}>
      {celebrate && <Confetti />}
      <h2 className="t-title-s" data-part="title">당첨 결과</h2>

      <ul className={styles.results} data-results>
        {results.map((p, i) => {
          const high = isHigh(p)
          const open = revealed.includes(i)
          const busy = scratching === i
          return (
            <li
              key={i}
              className={styles.resultItem}
              style={{ ['--i' as string]: i }}
              data-high={high || undefined}
              /**
               * **긁는 동안에도 열린 색이다.** `open` 만 보면 커버가 다 벗겨진 뒤에야 색이
               * 바뀌어서, 긁는 0.7초 동안 기본 타일 색이 드러났다가 뒤늦게 당첨 색으로
               * 튄다 — 긁어서 드러나는 게 아니라 나중에 칠해지는 것처럼 보인다.
               * 커버가 움직이기 시작할 때 **이미 그 색이어야** 드러나는 연출이 된다.
               */
              data-open={open || busy || undefined}
            >
              <span className={styles.resultLabel}>{label(p)}</span>

              {high && !open && (
                <button
                  type="button"
                  className={`${styles.cover} ${busy ? styles.coverGone : ''}`}
                  aria-label={`${i + 1}번째 결과 확인하기`}
                  onClick={() => reveal(i)}
                >
                  {!busy && <span aria-hidden="true">{display.coverMark}</span>}
                </button>
              )}
            </li>
          )
        })}
      </ul>

      <button
        type="button"
        className="btn btn--primary btn--block"
        disabled={!allRevealed}
        onClick={() => setSummary(true)}
      >
        {allRevealed ? '전체 결과 보기' : '남은 카드를 눌러 확인하세요'}
      </button>
    </div>
  )
}
