import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2, ChevronRight } from 'lucide-react'

import { repo } from '@/lib/repo'
import { useSlot } from '@/slot/SlotProvider'
import { getSlotDeck } from '@/data/slots'
import type { Question } from '@/types/question'

/** 새 질문의 기본값 — 가장 가벼운 설정(메이저 1장)에서 시작한다 */
function blankQuestion(): Question {
  return {
    id: `q-${Date.now().toString(36)}`,
    question: '',
    published: false,
    cardCount: 1,
    deck: 'major',
    spreadCount: null,
    allowReversed: true,
    reversedRate: 30,
    fallbackAspect: 'general',
    answers: {},
  }
}

export function QuestionList() {
  const slot = useSlot()
  const slug = slot.slug
  const majorOnly = getSlotDeck(slot) === 'major'
  const navigate = useNavigate()
  const [questions, setQuestions] = useState<Question[] | null>(null)

  const load = useCallback(async () => {
    setQuestions(await repo.questions.listAll(slug))
  }, [slug])

  useEffect(() => {
    void load()
  }, [load])

  async function handleAdd() {
    const q = blankQuestion()
    await repo.questions.save(slug, q)
    navigate(`/${slug}/admin/questions/${q.id}`)
  }

  async function handleTogglePublish(q: Question) {
    await repo.questions.save(slug, { ...q, published: !q.published })
    await load()
  }

  async function handleRemove(q: Question) {
    if (!confirm(`"${q.question || '(제목 없음)'}" 질문을 삭제할까요?`)) return
    await repo.questions.remove(slug, q.id)
    await load()
  }

  return (
    <>
      <div className="admin__head">
        <div>
          <h1 className="t-title-l">질문 타로</h1>
          <p className="t-text-xs t-muted">
            방문자가 고를 질문과, 카드가 나왔을 때 보여줄 답변을 관리해요.
          </p>
        </div>
        <button type="button" className="btn btn--sm btn--primary" onClick={() => void handleAdd()}>
          <Plus size={18} strokeWidth={2} aria-hidden="true" />
          질문 추가
        </button>
      </div>

      {questions === null ? (
        <div className="row-list" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: 64 }} />
          ))}
        </div>
      ) : questions.length === 0 ? (
        <p className="t-body t-muted">아직 질문이 없어요. 위에서 추가해 보세요.</p>
      ) : (
        <ul className="row-list">
          {questions.map((q) => (
            <li key={q.id} className="row-item">
              <label className="check">
                <input
                  type="checkbox"
                  checked={q.published}
                  onChange={() => void handleTogglePublish(q)}
                  aria-label={`${q.question || '제목 없음'} 공개`}
                />
                <span className="t-text-xs t-muted">공개</span>
              </label>

              <button
                type="button"
                className="row-item__grow"
                style={{ textAlign: 'left' }}
                onClick={() => navigate(`/${slug}/admin/questions/${q.id}`)}
              >
                <span className="t-text-m">{q.question || '(제목 없음)'}</span>
                <br />
                <span className="t-text-xs t-muted">
                  {q.cardCount}장 · {majorOnly || q.deck === 'major' ? '메이저 22장' : '전체 78장'} ·{' '}
                  {answeredCount(q)}개 답변 입력됨
                </span>
              </button>

              <button
                type="button"
                className="btn-icon"
                aria-label="삭제"
                onClick={() => void handleRemove(q)}
              >
                <Trash2 size={18} strokeWidth={2} aria-hidden="true" />
              </button>
              <ChevronRight size={18} strokeWidth={2} className="icon-muted" aria-hidden="true" />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

/** 실제로 채워진 답변 칸 수 — 안 채운 건 카드 의미로 폴백된다 */
function answeredCount(q: Question): number {
  return Object.values(q.answers).reduce(
    (n, byOrientation) =>
      n + Object.values(byOrientation ?? {}).filter((t) => t && t.trim()).length,
    0
  )
}
