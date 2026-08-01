import { useState } from 'react'
import { useParams } from 'react-router-dom'

import { CardDraw } from '@/components/CardDraw'
import { useSlotPath } from '@/slot/useSlotPath'
import { useSlot } from '@/slot/SlotProvider'
import { getSlotDeck } from '@/data/slots'
import { FlipCard } from '@/components/FlipCard'
import { useQuestion, useQuestions } from '@/lib/questions'
import { answerFor } from '@/lib/answer'
import { useInView } from '@/lib/useInView'
import type { DrawnCard } from '@/types/card'
import { QUESTION_CARD_COUNT, type Question as QuestionType } from '@/types/question'
import { NotReady } from './NotReady'
import styles from './Question.module.css'
import { useT, useLang } from '@/i18n'
import { pick } from '@/data/multilingual'
import { useCardText } from '@/i18n/cardText'

/** 질문 타로 — 주최자가 등록한 질문에 카드를 뽑아 답을 본다 (PLANNING.md §2) */
export function Question() {
  const t = useT()
  const { questionId } = useParams<{ questionId: string }>()
  const { status } = useQuestions()
  const question = useQuestion(questionId)

  // 아직 불러오는 중이면 "없는 질문"으로 단정하면 안 된다
  if (status === 'loading') return <div className="screen" aria-busy="true" />
  if (!question || !question.published) return <NotReady title={t('없는 질문')} />
  return <QuestionFlow key={question.id} question={question} />
}

function QuestionFlow({ question }: { question: QuestionType }) {
  const t = useT()
  const { lang } = useLang()
  const { go } = useSlotPath()
  const slot = useSlot()
  const [revealed, setRevealed] = useState<DrawnCard[] | null>(null)

  if (!revealed) {
    return (
      <CardDraw
        title={t('질문 타로')}
        lead={pick(question.question, question.questionI18n, lang)}
        cardCount={QUESTION_CARD_COUNT}
        positions={POSITIONS.map((p) => t(p))}
        /**
         * 카드 범위는 **슬롯 설정**이다 — 최고관리자만 정한다.
         * 주최자가 질문마다 고를 수 있는 건 펼침 수와 역방향 사용 여부뿐이고,
         * 역방향 확률은 고정이다 (REVERSED_RATE).
         */
        spread={{
          deck: getSlotDeck(slot),
          spreadCount: question.spreadCount,
          allowReversed: question.allowReversed,
        }}
        onComplete={setRevealed}
      />
    )
  }

  return (
    <div className={`screen ${styles.resultScreen}`}>
      {/* 리드는 다른 화면과 같은 모양·같은 자리 — 뽑기 화면에서 넘어와도 어긋나지 않게 */}
      <h1 className="t-title-l screen__title">{t('질문 타로')}</h1>
      <p className="t-text-m screen__lead" data-user-text>
        {pick(question.question, question.questionI18n, lang)}
      </p>

      <div className={styles.results}>
        {revealed.map((drawn) => (
          <AnswerCard key={drawn.card.id} question={question} drawn={drawn} />
        ))}
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className="btn btn--md btn--slight btn--block"
          onClick={() => setRevealed(null)}
        >
          {t('다시 뽑기')}
        </button>
        <button
          type="button"
          className="btn btn--sm btn--ghost btn--block"
          onClick={() => go('fortune')}
        >
          {t('다른 질문 보기')}
        </button>
      </div>

      <p className="t-text-xxs disclaimer">{t('타로는 재미와 성찰을 위한 것이에요.')}</p>
    </div>
  )
}

/** 한 장이라 포지션 라벨은 "답" 하나뿐 (QUESTION_CARD_COUNT — src/types/question.ts) */
const POSITIONS = ['답']

/** 스크롤로 화면에 들어올 때 뒤집힌다 */
function AnswerCard({ question, drawn }: { question: QuestionType; drawn: DrawnCard }) {
  const t = useT()
  const { lang } = useLang()
  const lc = useCardText()
  const [ref, inView] = useInView<HTMLElement>()
  const card = lc(drawn.card)
  /*
   * 주최자가 쓴 답변은 그분의 글이라 사전이 못 옮긴다 — 대신 **주최자가 언어별로 적어 둔**
   * 판이 있으면 그걸 쓴다(`answerFor` 가 고른다). 안 적었으면 원문, 원문도 없으면 카드 해석.
   */
  const answer = answerFor(question, { ...drawn, card }, lang)

  return (
    <section ref={ref} className={styles.result}>
      <div className={styles.cardSide}>
        <FlipCard drawn={drawn} flipped={inView} className={styles.card} />
      </div>

      <div className={styles.textSide}>
        <p data-card-name className={`t-title-m ${styles.name}`}>
          {card.name}
          {drawn.orientation === 'reversed' && <span className="t-text-s t-muted">{t('(역방향)')}</span>}
        </p>

        <ul className={styles.keywords}>
          {card.keywords.slice(0, 4).map((k) => (
            <li key={k} className="chip">
              {k}
            </li>
          ))}
        </ul>

        <p className="t-body">{answer.text}</p>
      </div>
    </section>
  )
}
