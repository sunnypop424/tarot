import { useState } from 'react'
import { useParams } from 'react-router-dom'

import { CardDraw } from '@/components/CardDraw'
import { useSlotPath } from '@/slot/useSlotPath'
import { useSlot } from '@/slot/SlotProvider'
import { effectiveDeck } from '@/data/slots'
import { FlipCard } from '@/components/FlipCard'
import { useQuestion, useQuestions } from '@/lib/questions'
import { answerFor } from '@/lib/answer'
import { useInView } from '@/lib/useInView'
import type { DrawnCard } from '@/types/card'
import type { Question as QuestionType } from '@/types/question'
import { NotReady } from './NotReady'
import styles from './Question.module.css'

/** 질문 타로 — 주최자가 등록한 질문에 카드를 뽑아 답을 본다 (PLANNING.md §2) */
export function Question() {
  const { questionId } = useParams<{ questionId: string }>()
  const { status } = useQuestions()
  const question = useQuestion(questionId)

  // 아직 불러오는 중이면 "없는 질문"으로 단정하면 안 된다
  if (status === 'loading') return <div className="screen" aria-busy="true" />
  if (!question || !question.published) return <NotReady title="없는 질문" />
  return <QuestionFlow key={question.id} question={question} />
}

function QuestionFlow({ question }: { question: QuestionType }) {
  const { go } = useSlotPath()
  const slot = useSlot()
  const [revealed, setRevealed] = useState<DrawnCard[] | null>(null)

  if (!revealed) {
    return (
      <CardDraw
        title="질문 타로"
        lead={question.question}
        cardCount={question.cardCount}
        positions={positionsFor(question)}
        // 질문마다 덱 범위·펼침 수·역방향을 따로 정할 수 있다 (단, 슬롯 범위로 캡)
        spread={{
          deck: effectiveDeck(slot, question.deck),
          spreadCount: question.spreadCount,
          allowReversed: question.allowReversed,
          reversedRate: question.reversedRate,
        }}
        onComplete={setRevealed}
      />
    )
  }

  return (
    <div className="screen">
      {/* 리드는 다른 화면과 같은 모양·같은 자리 — 뽑기 화면에서 넘어와도 어긋나지 않게 */}
      <h1 className="t-title-l screen__title">질문 타로</h1>
      <p className="t-text-m screen__lead">{question.question}</p>

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
          다시 뽑기
        </button>
        <button
          type="button"
          className="btn btn--sm btn--ghost btn--block"
          onClick={() => go('fortune')}
        >
          다른 질문 보기
        </button>
      </div>

      <p className="t-text-xxs disclaimer">타로는 재미와 성찰을 위한 것이에요.</p>
    </div>
  )
}

/** 한 장이면 포지션 라벨이 굳이 필요 없다 */
function positionsFor(question: QuestionType): string[] {
  if (question.cardCount === 1) return ['답']
  return Array.from({ length: question.cardCount }, (_, i) => `${i + 1}번째`)
}

/** 스크롤로 화면에 들어올 때 뒤집힌다 */
function AnswerCard({ question, drawn }: { question: QuestionType; drawn: DrawnCard }) {
  const [ref, inView] = useInView<HTMLElement>()
  const answer = answerFor(question, drawn)

  return (
    <section ref={ref} className={styles.result}>
      <FlipCard drawn={drawn} flipped={inView} className={styles.card} />

      <p data-card-name className={`t-title-m ${styles.name}`}>
        {drawn.card.name}
        {drawn.orientation === 'reversed' && <span className="t-text-s t-muted"> (역방향)</span>}
      </p>

      <ul className={styles.keywords}>
        {drawn.card.keywords.slice(0, 4).map((k) => (
          <li key={k} className="chip">
            {k}
          </li>
        ))}
      </ul>

      <p className="t-body">{answer.text}</p>
    </section>
  )
}
