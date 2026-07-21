import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Check, ChevronLeft, Sparkles, TriangleAlert } from 'lucide-react'

import { getDeck, type DeckRange } from '@/data/cards'
import { repo } from '@/lib/repo'
import type { GeneratedAnswer } from '@/lib/repo'
import { getSlotDeck } from '@/data/slots'
import { getPlan } from '@/data/plans'
import { CrystalBall } from '@/components/CrystalBall'
import { useSlot } from '@/slot/SlotProvider'
import type { Aspect, Card, Orientation } from '@/types/card'
import { QUESTION_CARD_COUNT, type Question, type QuestionAnswers } from '@/types/question'
import styles from './QuestionEditor.module.css'

const ASPECTS: { value: Aspect; label: string }[] = [
  { value: 'general', label: '종합' },
  { value: 'love', label: '애정' },
  { value: 'money', label: '금전' },
  { value: 'career', label: '직업' },
  { value: 'advice', label: '조언' },
]

/** 펼침 수 검증 (PLANNING.md §2) — 고를 여지가 없으면 뽑는 의미가 사라진다 */
function validate(q: Question, deck: DeckRange): string | null {
  const deckSize = getDeck(deck).length
  if (q.spreadCount === null) return null
  if (q.spreadCount > deckSize) return `펼치는 수가 덱 장수(${deckSize})보다 많아요.`
  // 뽑는 수는 항상 1 (질문 타로는 한 장) — 저장분에 옛 값이 남아 있어도 화면은 1로 돈다
  if (q.spreadCount < QUESTION_CARD_COUNT + 2)
    return `펼치는 수는 최소 ${QUESTION_CARD_COUNT + 2}장이어야 해요.`
  return null
}

export function QuestionEditor() {
  const slot = useSlot()
  const slug = slot.slug
  const { questionId } = useParams<{ questionId: string }>()
  const navigate = useNavigate()

  const [draft, setDraft] = useState<Question | null>(null)
  const [saving, setSaving] = useState(false)

  /**
   * AI 생성분 — **저장 전 검수 자리**.
   * 생성하자마자 answers 에 넣지 않는다. AI 가 이상한 답을 써도 방문자에게 바로 나가면 안 된다
   * (PLANNING.md §4-1: 일괄 생성 → 관리자 검수 후 저장).
   */
  const [pending, setPending] = useState<QuestionAnswers | null>(null)
  const [gen, setGen] = useState<{ done: number; total: number } | null>(null)
  const [genError, setGenError] = useState<string | null>(null)
  const [aiReady, setAiReady] = useState(false)

  useEffect(() => {
    void (async () => {
      const all = await repo.questions.listAll(slug)
      setDraft(all.find((q) => q.id === questionId) ?? null)
    })()
  }, [slug, questionId])

  // AI 가 안 붙어 있으면 버튼은 눌러도 소용없다 — 왜 안 되는지 화면이 말한다
  useEffect(() => {
    void repo.ai.ready().then(setAiReady)
  }, [])

  /**
   * 이 슬롯이 산 플랜 — 답변 AI 생성이 되는지, 몇 번까지인지가 여기서 나온다.
   * 주최자는 플랜을 못 바꾼다 (최고관리자가 슬롯 편집기에서 정한다).
   */
  const plan = getPlan(slot)
  const canGenerate = aiReady && plan.answerGenLimit > 0

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

  /**
   * 답변칸이 채워야 할 카드 = **슬롯의 카드 범위**.
   * 질문마다 범위를 고를 수 없다 — 최고관리자가 슬롯에 정해둔 값만 따른다.
   */
  const effDeck = getSlotDeck(slot)
  const cards = useMemo(() => (draft ? getDeck(effDeck) : []), [draft, effDeck])

  /** 질문 × 카드 답변 일괄 생성 → pending 에 담아 검수 화면으로 */
  const generate = useCallback(async () => {
    if (!draft) return
    setGenError(null)
    setPending(null)
    setGen({ done: 0, total: cards.length })
    try {
      const generated = await repo.ai.generateAnswers(
        slug,
        {
          question: draft.question,
          aspect: draft.fallbackAspect,
          cardIds: cards.map((c) => c.id),
          allowReversed: draft.allowReversed,
        },
        (done, total) => setGen({ done, total })
      )
      setPending(toAnswers(generated, draft.allowReversed))
    } catch (e) {
      setGenError(e instanceof Error ? e.message : '생성하지 못했어요')
    } finally {
      setGen(null)
    }
  }, [draft, cards, slug])

  if (draft === null) {
    return <p className="t-body t-muted">질문을 찾을 수 없어요.</p>
  }

  const error = validate(draft, effDeck)

  /** 검수 끝 — 여기서 비로소 answers 에 들어간다 (patch 가 곧 저장이다) */
  const applyPending = () => {
    if (!pending) return
    const merged: QuestionAnswers = { ...draft.answers }
    for (const [cardId, answer] of Object.entries(pending)) {
      merged[cardId] = { ...merged[cardId], ...answer }
    }
    patch({ answers: merged })
    setPending(null)
  }

  const pendingCount = pending ? Object.keys(pending).length : 0
  // 이미 손으로 쓴 답변을 덮어쓰게 되는 카드 — 조용히 지워지면 안 된다
  const overwrites = pending
    ? Object.keys(pending).filter((id) => {
        const written = draft.answers[id]
        return Boolean(written?.upright?.trim() || written?.reversed?.trim())
      }).length
    : 0

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

      <div className={styles.editorHead}>
        <h1 className="t-title-l">질문 편집</h1>
        <span className={styles.autoSaveChip} data-saving={saving || undefined}>
          <Check size={13} strokeWidth={2.6} aria-hidden="true" />
          {saving ? '저장 중…' : '자동 저장'}
        </span>
      </div>
      <p className={styles.editorSub}>
        답변은 고치는 즉시 저장돼요. 저장을 잊어 내용을 날리는 일이 없게요.
      </p>

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
        {/* 뽑는 수(항상 1장)·카드 범위·역방향 확률(50%)은 주최자가 고르지 않는다.
            범위는 슬롯 설정이라 최고관리자만 바꾼다 — 여긴 결과만 알려준다 */}
        <p className="t-text-xs t-muted" style={{ marginBottom: 'var(--space-base)' }}>
          이 슬롯은 <b>{effDeck === 'major' ? '메이저 22장' : '전체 78장'}</b>을 써요. 카드를 한 장
          뽑고, 역방향은 50% 로 나와요. 카드 범위는 슬롯 설정이라 여기서는 못 바꿔요.
        </p>

        <div className="form-grid">
          <div className="field">
            <label className="field__label" htmlFor="q-spread">
              펼치는 카드 수
            </label>
            <input
              id="q-spread"
              className="input"
              type="number"
              min={QUESTION_CARD_COUNT + 2}
              max={cards.length}
              value={draft.spreadCount ?? ''}
              placeholder={`비우면 ${cards.length}장 전부`}
              onChange={(e) =>
                patch({ spreadCount: e.target.value === '' ? null : Number(e.target.value) })
              }
            />
            <span className="field__hint">
              최소 {QUESTION_CARD_COUNT + 2}장 · <b>최대 {cards.length}장</b> (이 슬롯의 카드 범위).
              비우면 {cards.length}장을 전부 펼쳐요.
            </span>
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

        {/* 확률은 못 고른다 — 쓸지 말지만 (REVERSED_RATE, src/lib/deck.ts) */}
        <label className="check" style={{ marginTop: 'var(--space-md)' }}>
          <input
            type="checkbox"
            checked={draft.allowReversed}
            onChange={(e) => patch({ allowReversed: e.target.checked })}
          />
          <span className="t-text-s">
            역방향 사용 — 켜면 절반은 역방향으로 나와요 (답변도 두 배로 써야 해요)
          </span>
        </label>

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
          {/* 플랜에 AI 생성이 없으면 버튼 자체를 안 보여준다 — 눌러도 안 되는 버튼은 잡음이다 */}
          {plan.answerGenLimit > 0 && (
            <button
              type="button"
              className="btn btn--sm btn--slight"
              disabled={!canGenerate || gen !== null || !draft.question.trim()}
              onClick={() => void generate()}
              data-generate
            >
              <Sparkles size={18} strokeWidth={2} aria-hidden="true" />
              AI로 전체 생성
            </button>
          )}
        </div>

        {plan.answerGenLimit === 0 ? (
          <p className="t-text-xs t-muted" style={{ marginBottom: 'var(--space-base)' }}>
            {plan.label} 플랜은 답변을 <b>직접 입력</b>해요. AI 일괄 생성은 라이트 플랜부터예요.
          </p>
        ) : (
          !aiReady && (
            <p className="t-text-xs t-muted" style={{ marginBottom: 'var(--space-base)' }}>
              AI 가 아직 연결되지 않았어요 — 연결되면 이 버튼으로 {cards.length}장을 한 번에 만들어
              검수할 수 있어요.
            </p>
          )
        )}

        {gen && (
          <CrystalBall label={`카드를 읽고 있어요 · ${gen.done} / ${gen.total}장`} />
        )}

        {genError && (
          <p className="field__error" style={{ marginBottom: 'var(--space-base)' }}>
            {genError}
          </p>
        )}

        {/* 검수 바 — 저장을 누르기 전까지 방문자에겐 아무것도 안 나간다 */}
        {pending && (
          <div className={styles.review} data-review>
            <div className={styles.reviewText}>
              <p className="t-text-s">
                <b>{pendingCount}장 생성됨</b> — 읽어보고 고친 다음 저장하세요.
              </p>
              {overwrites > 0 && (
                <p className={`t-text-xs ${styles.reviewWarn}`}>
                  <TriangleAlert size={14} strokeWidth={2} aria-hidden="true" />
                  이미 쓰신 답변 {overwrites}장이 덮어써져요.
                </p>
              )}
            </div>
            <div className={styles.reviewActions}>
              <button
                type="button"
                className="btn btn--sm btn--slight"
                onClick={() => setPending(null)}
              >
                버리기
              </button>
              <button type="button" className="btn btn--sm btn--primary" onClick={applyPending} data-apply>
                저장
              </button>
            </div>
          </div>
        )}

        <div>
          {cards.map((card) => (
            <AnswerRow
              key={card.id}
              card={card}
              question={draft}
              pending={pending?.[card.id]}
              onChange={setAnswer}
              onChangePending={(orientation, text) =>
                setPending((prev) =>
                  prev
                    ? { ...prev, [card.id]: { ...prev[card.id], [orientation]: text } }
                    : prev
                )
              }
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
  pending,
  onChange,
  onChangePending,
}: {
  card: Card
  question: Question
  /** AI 가 만들었지만 아직 저장 안 된 답변 — 있으면 이걸 보여준다 */
  pending?: Partial<Record<Orientation, string>>
  onChange: (cardId: string, orientation: Orientation, text: string) => void
  onChangePending: (orientation: Orientation, text: string) => void
}) {
  const [open, setOpen] = useState(false)
  const written = question.answers[card.id]
  const source = pending ?? written
  const upright = source?.upright ?? ''
  const reversed = source?.reversed ?? ''
  const filled = [upright, reversed].filter((t) => t.trim()).length
  const total = question.allowReversed ? 2 : 1

  // 검수 중엔 그 자리에서 바로 고칠 수 있다 — 고친 것도 저장을 눌러야 들어간다
  const edit = (orientation: Orientation, text: string) =>
    pending ? onChangePending(orientation, text) : onChange(card.id, orientation, text)

  return (
    <div className={styles.answerRow} data-answer-row data-pending={pending ? '' : undefined}>
      <button
        type="button"
        className={styles.answerToggle}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={`t-text-m ${styles.answerName}`}>{card.name}</span>
        {pending ? (
          <span className={`${styles.badge} ${styles['badge--pending']}`}>검수 중</span>
        ) : (
          <span
            className={`${styles.badge} ${filled > 0 ? styles['badge--written'] : styles['badge--fallback']}`}
          >
            {filled === 0 ? '폴백 사용 중' : `${filled}/${total} 입력됨`}
          </span>
        )}
      </button>

      {open && (
        <div className={styles.answerBody}>
          <AnswerField
            label="정방향"
            meaning={card.upright[question.fallbackAspect]}
            value={upright}
            onChange={(t) => edit('upright', t)}
          />
          {question.allowReversed && (
            <AnswerField
              label="역방향"
              meaning={card.reversed[question.fallbackAspect]}
              value={reversed}
              onChange={(t) => edit('reversed', t)}
            />
          )}
        </div>
      )}
    </div>
  )
}

/** 생성 결과 → answers 모델. 빈 문자열은 담지 않는다 (폴백이 나가는 게 낫다) */
function toAnswers(generated: GeneratedAnswer[], allowReversed: boolean): QuestionAnswers {
  const out: QuestionAnswers = {}
  for (const item of generated) {
    const answer: Partial<Record<Orientation, string>> = {}
    if (item.upright?.trim()) answer.upright = item.upright.trim()
    if (allowReversed && item.reversed?.trim()) answer.reversed = item.reversed.trim()
    if (Object.keys(answer).length) out[item.cardId] = answer
  }
  return out
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
