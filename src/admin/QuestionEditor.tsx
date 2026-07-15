import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Sparkles } from 'lucide-react'

import { getDeck, type DeckRange } from '@/data/cards'
import { repo } from '@/lib/repo'
import { useSlot } from '@/slot/SlotProvider'
import type { Aspect, Card, Orientation } from '@/types/card'
import type { Question } from '@/types/question'
import styles from './QuestionEditor.module.css'

const ASPECTS: { value: Aspect; label: string }[] = [
  { value: 'general', label: '종합' },
  { value: 'love', label: '애정' },
  { value: 'money', label: '금전' },
  { value: 'career', label: '직업' },
  { value: 'advice', label: '조언' },
]

/** 펼침 수 검증 (PLANNING.md §2) — 고를 여지가 없으면 뽑는 의미가 사라진다 */
function validate(q: Question): string | null {
  const deckSize = getDeck(q.deck).length
  if (q.spreadCount === null) return null
  if (q.spreadCount > deckSize) return `펼치는 수가 덱 장수(${deckSize})보다 많아요.`
  if (q.spreadCount < q.cardCount + 2)
    return `펼치는 수는 뽑는 수보다 최소 2장 많아야 해요 (${q.cardCount + 2}장 이상).`
  return null
}

export function QuestionEditor() {
  const { slug } = useSlot()
  const { questionId } = useParams<{ questionId: string }>()
  const navigate = useNavigate()

  const [draft, setDraft] = useState<Question | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void (async () => {
      const all = await repo.questions.listAll(slug)
      setDraft(all.find((q) => q.id === questionId) ?? null)
    })()
  }, [slug, questionId])

  // 편집 즉시 저장 — 별도 저장 버튼 없이 (주최자가 저장을 잊어 날리는 게 더 나쁘다)
  const patch = useCallback(
    (change: Partial<Question>) => {
      setDraft((prev) => {
        if (!prev) return prev
        const next = { ...prev, ...change }
        setSaving(true)
        void repo.questions.save(slug, next).finally(() => setSaving(false))
        return next
      })
    },
    [slug]
  )

  const setAnswer = useCallback(
    (cardId: string, orientation: Orientation, text: string) => {
      setDraft((prev) => {
        if (!prev) return prev
        const next: Question = {
          ...prev,
          answers: {
            ...prev.answers,
            [cardId]: { ...prev.answers[cardId], [orientation]: text },
          },
        }
        setSaving(true)
        void repo.questions.save(slug, next).finally(() => setSaving(false))
        return next
      })
    },
    [slug]
  )

  const cards = useMemo(() => (draft ? getDeck(draft.deck) : []), [draft])

  if (draft === null) {
    return <p className="t-body t-muted">질문을 찾을 수 없어요.</p>
  }

  const error = validate(draft)

  return (
    <>
      <button
        type="button"
        className={styles.back}
        onClick={() => navigate(`/${slug}/admin/questions`)}
      >
        <ChevronLeft size={20} strokeWidth={2} aria-hidden="true" />
        질문 목록
      </button>

      <div className="admin__head">
        <h1 className="t-title-l">질문 편집</h1>
        <span className={`save-state ${saving ? 'save-state--dirty' : ''}`}>
          {saving ? '저장 중…' : '저장됨'}
        </span>
      </div>

      <section className="admin-section">
        <h2 className={`t-title-s admin-section__title`}>질문</h2>
        <div className="field">
          <label className="field__label" htmlFor="q-text">
            방문자에게 보이는 질문
          </label>
          <input
            id="q-text"
            className="input"
            value={draft.question}
            placeholder="예: 지금 이직해도 괜찮을까요?"
            onChange={(e) => patch({ question: e.target.value })}
          />
        </div>

        <label className="check" style={{ marginTop: 'var(--space-md)' }}>
          <input
            type="checkbox"
            checked={draft.published}
            onChange={(e) => patch({ published: e.target.checked })}
          />
          <span className="t-text-s">공개 — 끄면 방문자에게 보이지 않아요</span>
        </label>
      </section>

      <section className="admin-section">
        <h2 className="t-title-s admin-section__title">뽑기 설정</h2>
        <div className="form-grid">
          <div className="field">
            <label className="field__label" htmlFor="q-count">
              뽑는 카드 수
            </label>
            <select
              id="q-count"
              className="select"
              value={draft.cardCount}
              onChange={(e) => patch({ cardCount: Number(e.target.value) })}
            >
              {[1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {n}장
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="q-deck">
              카드 범위
            </label>
            <select
              id="q-deck"
              className="select"
              value={draft.deck}
              onChange={(e) => patch({ deck: e.target.value as DeckRange })}
            >
              <option value="major">메이저 22장</option>
              <option value="full">전체 78장</option>
            </select>
            <span className="field__hint">답변을 채울 카드 수가 달라져요.</span>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="q-spread">
              펼치는 카드 수
            </label>
            <input
              id="q-spread"
              className="input"
              type="number"
              min={3}
              max={78}
              value={draft.spreadCount ?? ''}
              placeholder="비우면 덱 전체"
              onChange={(e) =>
                patch({ spreadCount: e.target.value === '' ? null : Number(e.target.value) })
              }
            />
            <span className="field__hint">비우면 덱 전체를 펼쳐요.</span>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="q-aspect">
              답변 미입력 시 사용할 의미
            </label>
            <select
              id="q-aspect"
              className="select"
              value={draft.fallbackAspect}
              onChange={(e) => patch({ fallbackAspect: e.target.value as Aspect })}
            >
              {ASPECTS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <span className="field__hint">안 채운 카드는 이 관점의 카드 의미가 나가요.</span>
          </div>
        </div>

        <label className="check" style={{ marginTop: 'var(--space-md)' }}>
          <input
            type="checkbox"
            checked={draft.allowReversed}
            onChange={(e) => patch({ allowReversed: e.target.checked })}
          />
          <span className="t-text-s">역방향 사용</span>
        </label>

        {draft.allowReversed && (
          <div className="field" style={{ marginTop: 'var(--space-md)', maxWidth: 220 }}>
            <label className="field__label" htmlFor="q-rev">
              역방향 확률 (%)
            </label>
            <input
              id="q-rev"
              className="input"
              type="number"
              min={0}
              max={100}
              value={draft.reversedRate}
              onChange={(e) => patch({ reversedRate: Number(e.target.value) })}
            />
          </div>
        )}

        {error && <p className="field__error" style={{ marginTop: 'var(--space-md)' }}>{error}</p>}
      </section>

      <section className="admin-section">
        <div className={styles.answerHead}>
          <div>
            <h2 className="t-title-s">카드별 답변</h2>
            <p className="t-text-xs t-muted">
              안 채워도 괜찮아요 — 비운 카드는 카드 본래 의미가 나갑니다.
            </p>
          </div>
          {/* AI 일괄 생성은 M4 */}
          <button type="button" className="btn btn--sm btn--slight" disabled>
            <Sparkles size={18} strokeWidth={2} aria-hidden="true" />
            AI로 전체 생성 (준비 중)
          </button>
        </div>

        <div>
          {cards.map((card) => (
            <AnswerRow
              key={card.id}
              card={card}
              question={draft}
              onChange={setAnswer}
            />
          ))}
        </div>
      </section>
    </>
  )
}

function AnswerRow({
  card,
  question,
  onChange,
}: {
  card: Card
  question: Question
  onChange: (cardId: string, orientation: Orientation, text: string) => void
}) {
  const [open, setOpen] = useState(false)
  const written = question.answers[card.id]
  const upright = written?.upright ?? ''
  const reversed = written?.reversed ?? ''
  const filled = [upright, reversed].filter((t) => t.trim()).length
  const total = question.allowReversed ? 2 : 1

  return (
    <div className={styles.answerRow}>
      <button
        type="button"
        className={styles.answerToggle}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={`t-text-m ${styles.answerName}`}>{card.name}</span>
        <span
          className={`${styles.badge} ${filled > 0 ? styles['badge--written'] : styles['badge--fallback']}`}
        >
          {filled === 0 ? '폴백 사용 중' : `${filled}/${total} 입력됨`}
        </span>
      </button>

      {open && (
        <div className={styles.answerBody}>
          <AnswerField
            label="정방향"
            meaning={card.upright[question.fallbackAspect]}
            value={upright}
            onChange={(t) => onChange(card.id, 'upright', t)}
          />
          {question.allowReversed && (
            <AnswerField
              label="역방향"
              meaning={card.reversed[question.fallbackAspect]}
              value={reversed}
              onChange={(t) => onChange(card.id, 'reversed', t)}
            />
          )}
        </div>
      )}
    </div>
  )
}

function AnswerField({
  label,
  meaning,
  value,
  onChange,
}: {
  label: string
  /** 안 채웠을 때 대신 나갈 카드 의미 — 뭘 쓸지 참고가 된다 */
  meaning: string
  value: string
  onChange: (text: string) => void
}) {
  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <p className={`t-text-xs ${styles.answerMeaning}`}>비우면 이 문장이 나가요: {meaning}</p>
      <textarea
        className="textarea"
        value={value}
        placeholder="이 카드가 나왔을 때 보여줄 답변을 적어주세요."
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
