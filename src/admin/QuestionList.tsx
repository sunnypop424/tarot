import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { repo } from '@/lib/repo'
import { REVERSED_RATE } from '@/lib/deck'
import { useSlot } from '@/slot/SlotProvider'
import { getSlotDeck } from '@/data/slots'
import { QUESTION_CARD_COUNT, type Question } from '@/types/question'
import { confirmAction, toast } from './AdminFeedback'
import { useT } from '@/i18n'

/**
 * 새 질문의 기본값.
 * `cardCount`·`deck`·`reversedRate` 는 화면이 읽지 않는다 — 각각 한 장 고정,
 * 슬롯 설정, 고정 50% 다. 옛 저장분과 모양을 맞추려고 값만 채워둔다.
 */
function blankQuestion(): Question {
  return {
    id: `q-${Date.now().toString(36)}`,
    question: '',
    published: false,
    cardCount: QUESTION_CARD_COUNT,
    deck: 'major',
    spreadCount: null,
    allowReversed: true,
    reversedRate: REVERSED_RATE,
    fallbackAspect: 'general',
    answers: {},
  }
}

export function QuestionList() {
  const t = useT()
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
    toast(t('저장했어요'))
  }

  async function handleRemove(q: Question) {
    const ok = await confirmAction({
      title: '이 질문을 지울까요?',
      desc: `“${q.question.trim() || t('제목 없음')}” 과 여기에 적어 둔 답변이 모두 사라져요.`,
      okLabel: t('지우기'),
      danger: true,
    })
    if (!ok) return
    await repo.questions.remove(slug, q.id)
    await load()
    toast('질문을 지웠어요')
  }

  const total = questions?.length ?? 0
  const open = questions?.filter((q) => q.published).length ?? 0

  return (
    <>
      <header className="ad-head">
        <div className="ad-head__row">
          <h1 className="ad-head__title">{t('질문 타로')}</h1>
          {questions && (
            <span className="ad-head__count tnum">
              전체 {total} · 공개 {open}
            </span>
          )}
        </div>
        <p className="ad-head__desc">
          방문자가 고를 질문과, 카드가 나왔을 때 보여줄 답변을 관리해요.
        </p>
      </header>

      <div className="ad-card">
        <div className="ad-card__head">
          <div className="ad-card__titleRow">
            <span className="ad-card__title">질문</span>
            <span className="ad-card__num tnum">
              전체 {total} · 공개 {open}
            </span>
          </div>
          <button type="button" className="ad-btn ad-btn--soft ad-btn--sm" onClick={() => void handleAdd()}>
            + 질문 추가
          </button>
        </div>

        {questions === null ? (
          <div className="ad-skels">
            {[0, 1, 2].map((i) => (
              <div key={i} className="ad-skel ad-skel--row" />
            ))}
          </div>
        ) : questions.length === 0 ? (
          <div className="ad-empty">
            <div className="ad-empty__title">아직 질문이 없어요</div>
            <div className="ad-empty__sub">
              질문을 만들면 방문자가 그 중 하나를 골라 카드를 뽑게 돼요.
            </div>
            <button
              type="button"
              className="ad-btn ad-btn--primary ad-btn--lg"
              style={{ marginTop: 16 }}
              onClick={() => void handleAdd()}
            >
              + 첫 질문 만들기
            </button>
          </div>
        ) : (
          <div className="ad-rows">
            {questions.map((q) => (
              <div key={q.id} className="ad-row">
                <button
                  type="button"
                  className="ad-check__box"
                  data-on={q.published || undefined}
                  aria-label={`${q.question || t('제목 없음')} 공개`}
                  style={{
                    cursor: 'pointer',
                    background: q.published ? 'var(--ad-key)' : 'var(--ad-surface)',
                    borderColor: q.published ? 'var(--ad-key)' : 'var(--ad-line-2)',
                  }}
                  onClick={() => void handleTogglePublish(q)}
                >
                  {q.published ? '✓' : ''}
                </button>

                <button
                  type="button"
                  className="ad-row__grow"
                  onClick={() => navigate(`/${slug}/admin/questions/${q.id}`)}
                >
                  <div className="ad-row__title" data-empty={q.question.trim() ? undefined : true}>
                    {q.question.trim() || t('(제목 없음)')}
                  </div>
                  {/* 장수는 안 쓴다 — 질문 타로는 전부 한 장이라 줄마다 "1장"이 붙으면 잡음이다 */}
                  <div className="ad-row__meta">
                    {majorOnly || q.deck === 'major' ? t('메이저 22장') : '전체 78장'} ·{' '}
                    {answeredCount(q)}개 답변 입력됨
                    {!q.published && (
                      <span className="ad-tag ad-tag--sm">{t('비공개')}</span>
                    )}
                  </div>
                </button>

                <button
                  type="button"
                  className="ad-x"
                  aria-label="삭제"
                  onClick={() => void handleRemove(q)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
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
