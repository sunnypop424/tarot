import { useCallback, useEffect, useState } from 'react'

import { repo } from '@/lib/repo'
import type { Poll } from '@/lib/repo/types'
import { pollDisplay } from '@/data/poll'
import { useSlot } from '@/slot/SlotProvider'
import styles from './Live.module.css'

/**
 * 스크린 — **부스에 세워두는 화면.** 조작 버튼이 없다.
 *
 * 주최자 화면에 있지만 `.admin` 고정 라이트를 쓰지 않는다: 이건 관리 도구가 아니라
 * **손님에게 보여주는 화면**이라 어두운 배경에 큰 글씨여야 멀리서 읽힌다 (시안 ④).
 * 럭키드로우 추첨 화면이 부스 태블릿용인 것과 같은 자리다.
 */
export function Live() {
  const slot = useSlot()
  const slug = slot.slug
  const display = pollDisplay(slot)
  const [polls, setPolls] = useState<Poll[]>([])
  const [idx, setIdx] = useState(0)

  const load = useCallback(() => {
    void repo.poll
      .listAll(slug)
      .then((all) => setPolls(all.filter((p) => !p.hidden)))
      .catch(() => {})
  }, [slug])

  useEffect(() => {
    load()
    return repo.poll.watch(slug, load)
  }, [slug, load])

  /**
   * 설문이 여럿이면 **자동으로 넘긴다** — 부스 화면은 아무도 안 만진다.
   * 12초는 사람이 1~5위를 읽고 다음 걸 기다릴 만한 길이다.
   */
  useEffect(() => {
    if (polls.length < 2) return
    const t = setInterval(() => setIdx((i) => (i + 1) % polls.length), 12000)
    return () => clearInterval(t)
  }, [polls.length])

  const poll = polls[Math.min(idx, Math.max(0, polls.length - 1))]
  if (!poll) {
    return (
      <div className={styles.board}>
        <div className={styles.empty}>공개된 설문이 없어요</div>
      </div>
    )
  }

  const sum = poll.options.reduce((n, o) => n + o.votes, 0)
  // 1~5위만 — 부스 화면은 멀리서 보는 거라 항목이 많으면 아무것도 안 읽힌다
  const top = [...poll.options].sort((a, b) => b.votes - a.votes).slice(0, 5)

  return (
    <div className={styles.board} style={{ ['--live-bar' as string]: display.barColor }} data-live-board>
      <header className={styles.head}>
        <div className={styles.headText}>
          <div className={styles.eventName}>{display.title}</div>
          <h2 className={styles.q}>{poll.title}</h2>
        </div>
        <div className={styles.headRight}>
          <span className={styles.livePill}>
            <span className={styles.dot} aria-hidden="true" />
            실시간
          </span>
          {display.showCount && <span className={styles.total}>{sum.toLocaleString('ko-KR')}표</span>}
        </div>
      </header>

      <div className={styles.rows}>
        {top.map((o, i) => {
          const pct = sum ? Math.round((o.votes / sum) * 100) : 0
          return (
            <div key={o.id} className={styles.row} data-first={i === 0 || undefined}>
              <div className={styles.rowTop}>
                <span className={styles.rank}>{i + 1}</span>
                <span className={styles.label}>{o.label}</span>
                <span className={styles.pct}>{pct}%</span>
              </div>
              <div className={styles.track}>
                <div className={styles.bar} style={{ width: `${pct}%` }} />
              </div>
            </div>
          )
        })}
      </div>

      {polls.length > 1 && (
        <div className={styles.dots} aria-hidden="true">
          {polls.map((p, i) => (
            <span key={p.id} className={styles.pageDot} data-on={i === idx || undefined} />
          ))}
        </div>
      )}
    </div>
  )
}
