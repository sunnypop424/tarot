import { FlipCard } from './FlipCard'
import { readingOf } from '@/lib/deck'
import { useInView } from '@/lib/useInView'
import type { Aspect, DrawnCard } from '@/types/card'
import styles from './ReadingCard.module.css'
import { useT } from '@/i18n'
import { useCardText } from '@/i18n/cardText'

interface ReadingCardProps {
  drawn: DrawnCard
  /** 포지션명 — "나의 마음", "주 초반" 등 */
  position: string
  /** 어느 관점 텍스트를 함께 보여줄지. 'general' 이면 종합만 */
  aspect: Aspect
  /**
   * 짧게 — 조언 한 줄만.
   * 3장 스프레드처럼 여러 장이 나열될 때 쓴다
   * (한 장짜리 완결 해석을 3번 반복하면 읽히지 않는다).
   */
  brief?: boolean
  /** 해석 맨 앞에 놓을 한 줄 답 — 예/아니오 판정 */
  verdict?: { label: string; note: string }
}

/**
 * 뽑힌 카드 한 장 + 해석. 뽑기 결과와 기간 운세가 같은 모양으로 읽히도록 공유한다.
 * 스크롤로 화면에 들어올 때 뒤집힌다 — 한 장씩 드러나는 리듬.
 */
export function ReadingCard({
  drawn,
  position,
  aspect,
  brief = false,
  verdict,
}: ReadingCardProps) {
  const t = useT()
  const lc = useCardText()
  // 뷰포트 하단 35% 를 잘라낸 기준으로 판정 — 카드가 화면 중앙쯤 올라와야 열려서
  // 뒤집히는 모션이 제대로 보인다 (살짝 걸치자마자 열려버리지 않게)
  const [ref, inView] = useInView<HTMLElement>(0.35, '0px 0px -35% 0px')
  // 카드 의미는 그리기 직전에 번역을 덧입힌다 (`i18n/cardText.ts`)
  const card = lc(drawn.card)
  const reading = readingOf({ ...drawn, card })
  const aspectText = reading[aspect]

  return (
    <section ref={ref} className={`${styles.reading} ${brief ? styles.brief : ''}`}>
      {/* 카드 쪽 — 한 장이면 넓은 화면에서 왼쪽. 여러 장(brief)이면 카드 위에 포지션 라벨을 보여준다 */}
      <div className={styles.cardSide}>
        {brief && position && <p className="t-title-s t-primary t-center">{t(position)}</p>}
        <FlipCard drawn={drawn} flipped={inView} className={styles.card} />
      </div>

      {/* 해석 쪽 — 넓은 화면에선 카드 오른쪽, 모바일에선 아래 */}
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

        {/* 간결 모드는 조언 한 줄만 — 종합·관점 텍스트는 접는다 */}
        <div className={styles.body}>
          {verdict && (
            <p className={`t-body ${styles.verdict}`}>
              <b className={styles.verdictLabel}>{t(verdict.label)}</b>
              {t(verdict.note)}
            </p>
          )}
          {!brief && (
            <>
              <p className="t-body">{reading.general}</p>
              {/* 카테고리 관점 텍스트 — 종합과 겹치면 생략 */}
              {aspectText !== reading.general && <p className="t-body">{aspectText}</p>}
            </>
          )}
          <p className={`t-body ${styles.advice}`}>{reading.advice}</p>
        </div>
      </div>
    </section>
  )
}
