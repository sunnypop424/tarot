import { useCallback, useEffect, useState } from 'react'

import { repo } from '@/lib/repo'
import type { QuizStat } from '@/lib/repo/types'
import { useSlot } from '@/slot/SlotProvider'
import { confirmAction, toast } from '../AdminFeedback'

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

  const head = (
    <header className="ad-head">
      <div className="ad-head__row">
        <h1 className="ad-head__title">통계</h1>
        {data && <span className="ad-head__count tnum">응시 {data.attempts}명</span>}
      </div>
      <p className="ad-head__desc">
        어느 문항이 어려웠는지 보고, 인정할 답을 더한 뒤 다시 채점합니다.
      </p>
    </header>
  )

  if (!repo.quiz.ready()) {
    return (
      <>
        {head}
        <div className="ad-card">
          <div className="ad-empty">
            <div className="ad-empty__title">지금 빌드에서는 통계를 쓸 수 없어요</div>
          </div>
        </div>
      </>
    )
  }
  if (!data) return null

  const hardest = [...data.questions]
    .filter((q) => q.tried > 0)
    .sort((a, b) => a.correct / a.tried - b.correct / b.tried)[0]

  async function rescore() {
    const ok = await confirmAction({
      title: '다시 채점할까요?',
      desc: '이미 응시한 분들의 점수도 함께 고쳐집니다. 인정할 답을 더한 뒤에 눌러 주세요.',
      okLabel: '다시 채점',
    })
    if (!ok) return
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
  }

  return (
    <>
      {head}

      <div className="ad-stack">
        <div className="ad-stats">
          <div className="ad-stat">
            <div className="ad-stat__label">응시</div>
            <div className="ad-stat__row">
              <span className="ad-stat__value tnum">{data.attempts}</span>
              <span className="ad-stat__unit">명</span>
            </div>
          </div>
          <div className="ad-stat">
            <div className="ad-stat__label">평균</div>
            <div className="ad-stat__row">
              <span className="ad-stat__value tnum">{data.attempts ? data.avg : '—'}</span>
              {data.attempts > 0 && <span className="ad-stat__unit">%</span>}
            </div>
          </div>
          <div className="ad-stat">
            <div className="ad-stat__label">가장 어려운 문항</div>
            <div style={{ fontSize: 15, fontWeight: 700, marginTop: 10, lineHeight: 1.5 }}>
              {hardest ? hardest.body : '아직 없어요'}
            </div>
          </div>
        </div>

        <div className="ad-card">
          <div className="ad-card__head" style={{ marginBottom: 16 }}>
            <span className="ad-card__title">문항별 정답률</span>
            <button
              type="button"
              className="ad-btn ad-btn--soft ad-btn--md"
              disabled={busy || data.attempts === 0}
              onClick={() => void rescore()}
              data-regrade
            >
              다시 채점
            </button>
          </div>
          <p className="ad-sub" style={{ marginBottom: 18 }}>
            정답률이 낮은 주관식은 표현 차이일 때가 많아요. 인정할 답을 더한 뒤 다시 채점하면 이미
            응시하신 분들의 점수도 함께 고쳐집니다.
          </p>

          {data.questions.length === 0 ? (
            <div className="ad-empty">
              <div className="ad-empty__title">아직 문항이 없어요</div>
            </div>
          ) : (
            <div className="ad-bars" style={{ gap: 16 }} data-stats>
              {data.questions.map((q, i) => {
                const pct = q.tried ? Math.round((q.correct / q.tried) * 100) : 0
                return (
                  <div key={q.questionId} className="ad-bar" data-tone={pct < 50 ? 'low' : undefined}>
                    <div className="ad-bar__top">
                      <span className="ad-bar__name">
                        {i + 1}. {q.body}
                      </span>
                      <span className="ad-bar__num tnum">{pct}%</span>
                    </div>
                    <div className="ad-bar__track">
                      <span className="ad-bar__fill" style={{ ['--ad-pct' as string]: `${pct}%` }} />
                    </div>
                    <div className="ad-fine tnum" style={{ marginTop: 5 }}>
                      {q.correct} / {q.tried}명
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
