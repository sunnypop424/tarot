import { useSlot } from '@/slot/SlotProvider'
import { cardFrontSrc } from '@/lib/theme'
import { cssUrl, useImageAsset } from '@/lib/image'
import type { DrawnCard } from '@/types/card'
import styles from './CardFace.module.css'

/**
 * 카드 앞면 — 이벤트 테마가 앞면 이미지를 주면 이미지, 없으면 텍스트로 폴백한다.
 * 역방향은 이미지를 180° 뒤집어 보여준다.
 * 프레임(비율·테두리·그림자)은 감싸는 쪽의 .play-card 가 담당한다.
 *
 * 이미지는 background-image 로만 그린다 (lib/image.ts) — 카페에서 길게 눌러 저장되면 안 된다.
 */
export function CardFace({ card, orientation }: DrawnCard) {
  const { theme } = useSlot()
  const src = cardFrontSrc(theme, card.id)
  const { status } = useImageAsset(src)

  const reversed = orientation === 'reversed'
  const label = `${card.name}${reversed ? ' (역방향)' : ''}`

  if (src && status !== 'failed') {
    return (
      <div
        role="img"
        aria-label={label}
        className={styles.image}
        style={{
          backgroundImage: cssUrl(src),
          transform: reversed ? 'rotate(180deg)' : undefined,
        }}
      />
    )
  }

  // 이미지 미제공 이벤트 폴백 — 카드 이름과 번호만으로도 결과를 읽을 수 있어야 한다.
  // 이미지와 달리 텍스트는 뒤집지 않는다 (읽을 수 없어진다). 역방향은 아래 배지로 알린다.
  return (
    <div className={styles.fallback} role="img" aria-label={label}>
      <span className={`t-text-xxs t-muted ${styles.number}`}>
        {card.arcana === 'major' ? card.number : card.nameEn.split(' of ')[0]}
      </span>
      <span className={`t-text-l ${styles.name}`}>{card.name}</span>
      <span className={`t-text-xxs t-muted ${styles.nameEn}`}>{card.nameEn}</span>
      {reversed && <span className={`t-text-xxs ${styles.reversed}`}>역방향</span>}
    </div>
  )
}
