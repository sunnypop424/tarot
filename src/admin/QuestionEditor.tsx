import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { getDeck, type DeckRange } from '@/data/cards'
import { repo } from '@/lib/repo'
import type { GeneratedAnswer } from '@/lib/repo'
import { getSlotDeck } from '@/data/slots'
import { getPlan } from '@/data/plans'
import { useSlot } from '@/slot/SlotProvider'
import type { Aspect, Card, Orientation } from '@/types/card'
import { QUESTION_CARD_COUNT, type Question, type QuestionAnswers } from '@/types/question'
import { confirmAction, toast } from './AdminFeedback'

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
  /**
   * **체험 슬롯에서는 안 만든다.** 이 화면은 로그인 없이 열리는데(0034), 78장 한 번이
   * 183원이라 누르는 만큼 실제 돈이 나간다. 서버도 같은 판정을 한다 —
   * AI 함수는 `manages_slot_strict` 를 봐서 체험 슬롯을 거절한다. 화면은 그걸 미리 알릴 뿐이다.
   */
  const canGenerate = aiReady && plan.answerGenLimit > 0 && !slot.demo

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
    return <p className="ad-sub">질문을 찾을 수 없어요.</p>
  }

  const error = validate(draft, effDeck)

  /** 검수 끝 — 여기서 비로소 answers 에 들어간다 (patch 가 곧 저장이다) */
  const applyPending = async () => {
    if (!pending) return
    const ok = await confirmAction({
      title: '생성한 답변을 저장할까요?',
      desc:
        overwrites > 0
          ? `이미 써 두신 답변 ${overwrites}장이 덮어써져요.`
          : '검수한 내용 그대로 방문자에게 나가요.',
      okLabel: '저장',
      danger: overwrites > 0,
    })
    if (!ok) return
    const merged: QuestionAnswers = { ...draft.answers }
    for (const [cardId, answer] of Object.entries(pending)) {
      merged[cardId] = { ...merged[cardId], ...answer }
    }
    patch({ answers: merged })
    setPending(null)
    toast('저장했어요')
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
      <header className="ad-head">
        <button
          type="button"
          className="ad-head__back"
          onClick={() => navigate(`/${slug}/admin/questions`)}
        >
          ‹ 질문 목록
        </button>
        <div className="ad-head__row">
          <h1 className="ad-head__title">질문 편집</h1>
        </div>
        <p className="ad-head__desc">
          고치는 즉시 저장돼요. 저장을 잊어 날리는 편이 더 나쁘니까요.
        </p>
      </header>

      <div className="ad-stack">
        <div>
          <span className="ad-note">
            {saving ? '저장 중…' : '자동 저장'} · 저장을 잊어 날리는 편이 더 나빠서 즉시 저장해요
          </span>
        </div>

        <div className="ad-card ad-card--form">
          <label className="ad-card__title" htmlFor="q-text">
            질문
          </label>
          <input
            id="q-text"
            className="ad-input ad-input--lg"
            value={draft.question}
            placeholder="방문자에게 보일 문구"
            onChange={(e) => patch({ question: e.target.value })}
          />
          <button
            type="button"
            className="ad-checkbare"
            style={{ marginTop: 14 }}
            onClick={() => patch({ published: !draft.published })}
          >
            <span className="ad-check__box" data-on={draft.published || undefined}>
              {draft.published ? '✓' : ''}
            </span>
            <span className="ad-checkbare__label">방문자에게 공개</span>
          </button>
        </div>

        <div className="ad-card ad-card--form">
          <div className="ad-card__title">뽑기 설정</div>
          {/* 뽑는 수(항상 1장)·카드 범위·역방향 확률(50%)은 주최자가 고르지 않는다.
              범위는 슬롯 설정이라 최고관리자만 바꾼다 — 여긴 결과만 알려준다 */}
          <p className="ad-card__desc">
            이 슬롯의 카드 범위({effDeck === 'major' ? '메이저 22장' : '전체 78장'})는 여기서 바꿀 수
            없어요 · 한 장 뽑고 역방향 50%로 나와요.
          </p>

          <div style={{ marginTop: 18 }}>
            <span className="ad-field__label">펼치는 카드 수</span>
            <div className="ad-inline">
              <input
                className="ad-input ad-input--num"
                inputMode="numeric"
                value={draft.spreadCount ?? ''}
                placeholder="전부"
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9]/g, '')
                  patch({ spreadCount: v === '' ? null : Number(v) })
                }}
              />
              <span className="ad-range">
                {QUESTION_CARD_COUNT + 2}–{cards.length} · 비우면 {cards.length}장을 전부 펼쳐요
              </span>
            </div>
            {error && <div className="ad-field__hint ad-field__hint--bad">{error}</div>}
          </div>

          <div style={{ marginTop: 18 }}>
            <span className="ad-field__label">답변을 안 채웠을 때 쓸 관점</span>
            <div className="ad-choices">
              {ASPECTS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  className="ad-choice ad-choice--sm"
                  data-on={draft.fallbackAspect === value || undefined}
                  onClick={() => patch({ fallbackAspect: value })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 확률은 못 고른다 — 쓸지 말지만 (REVERSED_RATE, src/lib/deck.ts) */}
          <button
            type="button"
            className="ad-checkbare"
            style={{ marginTop: 18, alignItems: 'flex-start' }}
            onClick={() => patch({ allowReversed: !draft.allowReversed })}
          >
            <span className="ad-check__box" data-on={draft.allowReversed || undefined}>
              {draft.allowReversed ? '✓' : ''}
            </span>
            <span>
              <span className="ad-check__name">역방향 사용</span>
              <span className="ad-check__hint">켜면 카드마다 답변을 두 배로 써야 해요.</span>
            </span>
          </button>
        </div>

        <div className="ad-card ad-card--form">
          <div className="ad-card__head">
            <div className="ad-card__title">카드별 답변</div>
            {/* 플랜에 AI 생성이 없으면 버튼 자체를 안 보여준다 — 눌러도 안 되는 버튼은 잡음이다 */}
            {plan.answerGenLimit > 0 && (
              <button
                type="button"
                className="ad-btn ad-btn--soft ad-btn--md"
                disabled={!canGenerate || gen !== null || !draft.question.trim()}
                onClick={() => void generate()}
                data-generate
              >
                {gen ? `${gen.done} / ${gen.total}장째 만드는 중…` : 'AI로 전체 생성'}
              </button>
            )}
          </div>

          {/* 막힌 이유를 말한다 — 이유 없는 disabled 는 버그로 취급한다 (docs/DESIGN.md 「화법」) */}
          {slot.demo ? (
            <p className="ad-sub" style={{ marginBottom: 14 }}>
              체험 화면이라 AI 생성은 꺼 뒀어요. 실제 슬롯에서는 이 버튼으로 {cards.length}장을
              한 번에 만들어 검수할 수 있어요.
            </p>
          ) : plan.answerGenLimit === 0 ? (
            <p className="ad-sub" style={{ marginBottom: 14 }}>
              {plan.label} 플랜은 답변을 <b>직접 입력</b>해요. AI 일괄 생성은 라이트 플랜부터예요.
            </p>
          ) : (
            !aiReady && (
              <p className="ad-sub" style={{ marginBottom: 14 }}>
                AI 가 아직 연결되지 않았어요 — 연결되면 이 버튼으로 {cards.length}장을 한 번에 만들어
                검수할 수 있어요.
              </p>
            )
          )}

          {genError && (
            <div className="ad-field__hint ad-field__hint--bad" style={{ marginBottom: 14 }}>
              {genError}
            </div>
          )}

          {/* 검수 바 — 저장을 누르기 전까지 방문자에겐 아무것도 안 나간다 */}
          {pending && (
            <div className="ad-card ad-card--key" style={{ marginBottom: 14 }} data-review>
              <div className="ad-card__title">{pendingCount}장 생성됐어요 · 아직 저장 전이에요</div>
              {overwrites > 0 && (
                <div
                  className="ad-banner__body"
                  style={{ color: 'var(--ad-bad)', fontWeight: 700 }}
                >
                  이미 써 두신 답변 {overwrites}장이 덮어써져요. 아래 표시된 줄에서 그 자리에서 고칠
                  수 있어요.
                </div>
              )}
              <div className="ad-btnrow" style={{ marginTop: 14 }}>
                <button type="button" className="ad-btn ad-btn--primary ad-btn--lg" onClick={() => void applyPending()} data-apply>
                  저장
                </button>
                <button
                  type="button"
                  className="ad-btn ad-btn--line ad-btn--lg"
                  onClick={() => {
                    setPending(null)
                    toast('생성한 답변을 버렸어요')
                  }}
                >
                  버리기
                </button>
              </div>
            </div>
          )}

          <div className="ad-rows">
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
        </div>
      </div>
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
    // `data-pending` 은 검수 중인 줄 표시다 (verify-ai 가 이걸로 줄을 짚는다)
    <div className="ad-fold" data-answer-row data-pending={pending ? '' : undefined}>
      <button type="button" className="ad-fold__head" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="ad-fold__name">{card.name}</span>
        {pending ? (
          <span className="ad-tag ad-tag--sm" data-tone="on">
            검수 중
          </span>
        ) : (
          <span className="ad-tag ad-tag--sm" data-tone={filled === 0 ? undefined : filled < total ? 'warn' : 'on'}>
            {filled === 0 ? '폴백 사용 중' : `${filled}/${total} 입력됨`}
          </span>
        )}
      </button>

      {open && (
        <div className="ad-fold__body">
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
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ad-ink-2)', marginBottom: 6 }}>
        {label}
      </div>
      <textarea
        className="ad-textarea"
        value={value}
        placeholder={`이 카드가 ${label}으로 나왔을 때 보여줄 문장`}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="ad-fine" style={{ marginTop: 5 }}>
        비우면: {meaning}
      </div>
    </div>
  )
}
