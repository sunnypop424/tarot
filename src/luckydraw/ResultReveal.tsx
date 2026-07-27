import { useCallback, useEffect, useMemo, useState } from 'react'
import { Info, Truck } from 'lucide-react'

import type { LuckydrawDisplay } from '@/data/luckydraw'
import type { DrawResult, DrawnPrize, LuckydrawSettings } from '@/lib/repo'
import { Confetti } from './Confetti'
import { ScratchCover } from './ScratchCover'
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
 *
 * 레이아웃·여백·글자 크기는 방문자 시안(`럭키드로우 방문자 화면.dc.html`)을 그대로 따른다 —
 * 색·테두리색·radius 만 슬롯 테마 토큰으로 갈아끼운다.
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
  const [scratching, setScratching] = useState<number[]>([])
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
    // **다른 타일이 긁히는 중이어도 긁을 수 있다** (원본과 같다).
    // 0.7초씩 줄 세우면 10개 뽑았을 때 7초를 기다려야 한다.
    if (revealed.includes(index) || scratching.includes(index)) return
    setScratching((prev) => [...prev, index])
    setCelebrate(true)
    window.setTimeout(() => {
      setRevealed((prev) => [...prev, index])
      setScratching((prev) => prev.filter((i) => i !== index))
    }, SCRATCH_MS)
  }

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

  if (summary) {
    return (
      <div className={styles.reveal}>
        <header className={styles.revealHead}>
          <h2 className={styles.revealTitle} data-part="title">
            전체 결과
          </h2>
        </header>

        {result.rehearsal && (
          <div className={styles.infoBanner}>
            <Info size={16} aria-hidden="true" />
            <span>
              리허설이라 <b>재고는 줄지 않았어요</b>.
            </span>
          </div>
        )}

        <ul className={styles.summary}>
          {grouped.map((p) => (
            <li
              key={`${p.rank}-${p.name}`}
              className={styles.summaryRow}
              data-high={isHigh(p) || undefined}
            >
              <span className={styles.summaryBadge} data-high={isHigh(p) || undefined}>
                {p.rank}등
              </span>
              {/* 전체 결과는 방문자 연출이 아니라 스태프 핸드오프 목록이다 —
                  displayMode(등수만/상품명만) 와 무관하게 늘 상품명을 보여준다.
                  스태프가 뭘 줘야 하는지 여기서 한눈에 봐야 하기 때문. */}
              <span className={styles.summaryName}>{p.name}</span>
              {p.requiresShipping && (
                <span className={styles.shipChip}>
                  <Truck size={13} aria-hidden="true" />
                  배송
                </span>
              )}
              <span className={styles.summaryCount}>{p.count}개</span>
            </li>
          ))}
        </ul>

        <div className={styles.revealFoot}>
          {needsShipping && (
            <button
              type="button"
              className="btn btn--primary btn--block"
              onClick={() => setShipping(true)}
            >
              배송 정보 입력하기
            </button>
          )}
          <button type="button" className="btn btn--slight btn--block" onClick={onFinish}>
            처음으로
          </button>
        </div>

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

  /** 1개면 1열, 2개면 2열, 그 이상은 3열 — 적게 뽑았을 때 빈 칸이 남지 않게 */
  const cols = results.length === 1 ? 1 : results.length === 2 ? 2 : 3

  return (
    <div className={styles.reveal}>
      {celebrate && <Confetti />}

      <header className={styles.revealHead}>
        <p className={styles.eyebrow}>✦ 두근두근</p>
        <h2 className={styles.revealTitle} data-part="title">
          당첨 결과
        </h2>
      </header>

      <ul className={styles.results} data-results style={{ ['--cols' as string]: cols }}>
        {results.map((p, i) => {
          const high = isHigh(p)
          const open = revealed.includes(i)
          const busy = scratching.includes(i)
          return (
            <li
              key={i}
              className={styles.resultItem}
              style={{ ['--i' as string]: i }}
              data-high={high || undefined}
              /** 덮인(비싼) 칸은 바로 보여 긁게 하고, 나머지만 순서대로 등장시킨다 */
              data-anim={!high || undefined}
              /**
               * **긁는 동안에도 열린 색이다.** 커버 밑면이 이미 당첨 색이라, 긁혀 나가며
               * 그 색이 드러난다 — 나중에 칠해지는 게 아니라.
               */
              data-open={open || busy || undefined}
            >
              {displayMode !== 'prize' && <span className={styles.resultRank}>{p.rank}등</span>}
              {displayMode !== 'rank' && <span className={styles.resultName}>{p.name}</span>}

              {high && !open && (
                <ScratchCover mark={display.coverMark} onReveal={() => reveal(i)} />
              )}
            </li>
          )
        })}
      </ul>

      <div className={styles.revealFoot}>
        <button
          type="button"
          className="btn btn--primary btn--block"
          onClick={() => setSummary(true)}
        >
          전체 결과 보기
        </button>
      </div>
    </div>
  )
}
