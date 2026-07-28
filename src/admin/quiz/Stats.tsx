import { useCallback, useEffect, useState } from 'react'
import { BarChart3, RefreshCw } from 'lucide-react'

import { repo } from '@/lib/repo'
import type { QuizStat } from '@/lib/repo/types'
import { useSlot } from '@/slot/SlotProvider'
import { toast } from '../AdminFeedback'
import styles from './Quiz.module.css'

/**
 * 문항별 정답률 — **주관식 오답 처리가 불만의 주된 원천**이라, 정답률이 유난히 낮은 문항을
 * 찾는 게 이 화면의 실제 쓸모다. "이 답도 맞다" 를 문항 편집에서 추가한 뒤
 * **다시 채점**을 누르면 이미 낸 사람들의 점수도 같이 고쳐진다.
 *
 * 점수는 **백분율 평균**이다 — 문항을 늘리면 절대 점수가 뛰어서 이벤트끼리 비교가 안 된다.
 */
export function Stats() {
  const slot = useSlot()
  const slug = slot.slug
  const [data, setData] = useState<{ attempts: number; avg: number; questions: QuizStat[] } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setData(await repo.quiz.stats(slug))
  }, [slug])

  useEffect(() => {
    void load()
  }, [load])

  if (!repo.quiz.ready()) {
    return (
      <div className="admin-empty">
        <BarChart3 size={44} strokeWidth={1.6} aria-hidden="true" />
        <div className="admin-empty__title">지금 빌드에서는 통계를 쓸 수 없어요</div>
      </div>
    )
  }
  if (!data) return null

  const hardest = [...data.questions]
    .filter((q) => q.tried > 0)
    .sort((a, b) => a.correct / a.tried - b.correct / b.tried)[0]

  return (
    <div>
      <header className="admin__head">
        <div>
          <h1 className="t-title-l">통계</h1>
          <p className="t-text-xs t-muted">응시한 분들의 문항별 정답률이에요.</p>
        </div>
        <button
          type="button"
          className="btn btn--outline btn--sm"
          disabled={busy || data.attempts === 0}
          onClick={async () => {
            setBusy(true)
            try {
              const n = await repo.quiz.regrade(slug)
              await load()
              toast(n > 0 ? `${n}명의 점수를 다시 매겼어요` : '바뀐 점수가 없어요')
            } catch (e) {
              toast(e instanceof Error ? e.message : '다시 채점하지 못했어요')
            } finally {
              setBusy(false)
            }
          }}
          data-regrade
        >
          <RefreshCw size={15} aria-hidden="true" />
          다시 채점
        </button>
      </header>

      <div className={styles.kpis}>
        <div className={styles.kpi}>
          <div className={styles.kpiLabel}>응시</div>
          <div className={styles.kpiValue}>{data.attempts}명</div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kpiLabel}>평균</div>
          <div className={styles.kpiValue}>{data.avg}%</div>
        </div>
        {hardest && (
          <div className={styles.kpi}>
            <div className={styles.kpiLabel}>가장 어려운 문항</div>
            <div className="t-text-s" style={{ marginTop: 5, fontWeight: 700, lineHeight: 1.4 }}>
              {hardest.body}
            </div>
          </div>
        )}
      </div>

      <p className="admin-note" style={{ margin: '0 0 14px' }}>
        정답률이 유난히 낮은 <b>주관식</b>은 표현 차이 때문일 때가 많아요. 문항 편집에서 인정할 답을
        더한 뒤 <b>다시 채점</b>을 누르면 이미 응시하신 분들의 점수도 같이 고쳐집니다.
      </p>

      {data.questions.length === 0 ? (
        <div className="admin-empty">
          <BarChart3 size={44} strokeWidth={1.6} aria-hidden="true" />
          <div className="admin-empty__title">아직 문항이 없어요</div>
        </div>
      ) : (
        <div className={styles.list} data-stats>
          {data.questions.map((q, i) => {
            const pct = q.tried ? Math.round((q.correct / q.tried) * 100) : 0
            return (
              <div key={q.questionId} className={styles.row}>
                <div className={styles.rowNum}>{i + 1}</div>
                <div className={styles.rowMain}>
                  <div className={styles.rowBody}>{q.body}</div>
                  <div className={styles.statBar}>
                    <div className={styles.statFill} style={{ width: `${pct}%` }} />
                  </div>
                  <div className={styles.rowMeta}>
                    <span>
                      정답률 <b>{pct}%</b>
                    </span>
                    <span>
                      {q.correct} / {q.tried}명
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
