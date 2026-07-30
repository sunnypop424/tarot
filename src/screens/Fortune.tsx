import { ChevronRight } from 'lucide-react'

import { TOPIC_CATEGORIES } from '@/data/categories'
import { useQuestions } from '@/lib/questions'
import { useSlotPath } from '@/slot/useSlotPath'
import styles from './Fortune.module.css'
import { useT } from '@/i18n'

/**
 * 운세 탭 — 주제별 뽑기 + 관리자가 등록한 질문 타로.
 * 둘 다 "궁금한 걸 골라 뽑는다"는 같은 성격이라 한 탭에 둔다.
 * 기간 운세(오늘·주간·월간)는 매일 여는 리추얼이라 홈에 있다.
 */
export function Fortune() {
  const t = useT()
  const { go } = useSlotPath()
  const { questions, status } = useQuestions()

  return (
    <div className="screen">
      <h1 className="t-title-l screen__title">{t('운세')}</h1>
      <p className="t-text-m screen__lead">{t('무엇이 궁금한가요?')}</p>

      <div className="grid-2">
        {TOPIC_CATEGORIES.map(({ id, label, desc, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className="surface surface--outlined tile"
            onClick={() => go(`draw/${id}`)}
          >
            <Icon size={24} strokeWidth={1.75} className="icon-accent" aria-hidden="true" />
            <span className="t-text-l">{label}</span>
            <span className="t-text-xs t-muted">{desc}</span>
          </button>
        ))}
      </div>

      {/* 질문은 주최자가 관리하는 원격 데이터 — 불러오는 동안 자리를 잡아둔다 */}
      {(status === 'loading' || questions.length > 0) && (
        <section className={styles.questions}>
          <h2 className="t-title-s section__head">{t('질문 타로')}</h2>
          {status === 'loading' ? (
            <ul className="stack" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <li key={i} className={`skeleton ${styles.questionSkeleton}`} />
              ))}
            </ul>
          ) : (
            <ul className="stack">
              {questions.map(({ id, question }) => (
                <li key={id}>
                  <button
                    type="button"
                    className="surface surface--outlined list-row"
                    onClick={() => go(`question/${id}`)}
                  >
                    <span className="t-text-m">{question}</span>
                    <ChevronRight
                      size={20}
                      strokeWidth={2}
                      className="icon-muted"
                      aria-hidden="true"
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <p className="t-text-xxs disclaimer">{t('타로는 재미와 성찰을 위한 것이에요.')}</p>
    </div>
  )
}
