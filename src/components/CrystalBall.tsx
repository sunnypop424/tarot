import { useId } from 'react'

import { useSlotOrNull } from '@/slot/SlotProvider'
import { cssUrl, useImageAsset } from '@/lib/image'
import styles from './CrystalBall.module.css'

/**
 * 수정구슬 로더 — AI 가 리딩을 쓰는 동안 이 자리를 지킨다.
 *
 * 스피너 대신 구슬인 이유: 이 앱에서 기다림은 로딩이 아니라 **리추얼의 일부**다.
 * 카페에서 리더가 카드를 들여다보는 그 몇 초를 그대로 옮긴다.
 *
 * 슬롯이 구슬 이미지를 올렸으면 그걸, 없으면 내장 SVG 를 쓴다 — 카드 뒷면과 같은 규칙.
 * 올린 이미지는 `<img>` 가 아니라 **background-image** 다 (src/lib/image.ts).
 */
export function CrystalBall({ label = '카드를 읽고 있어요' }: { label?: string }) {
  const slot = useSlotOrNull()
  const src = slot?.theme.assets.crystalBall ?? null
  const { status } = useImageAsset(src)

  return (
    <p className={styles.wrap} role="status">
      {src && status !== 'failed' ? (
        // 올린 구슬도 같이 떠 있게 — 애니메이션은 내장 구슬과 같은 리듬
        <span
          className={`${styles.ball} ${styles.image} ${styles.orb}`}
          role="img"
          aria-label="수정구슬"
          style={{ backgroundImage: cssUrl(src) }}
        />
      ) : (
        <DefaultBall />
      )}

      <span className={`t-text-s ${styles.label}`}>{label}</span>
    </p>
  )
}

function DefaultBall() {
  const glow = useId()

  return (
    <>
      <svg
        className={styles.ball}
        viewBox="0 0 64 64"
        width="64"
        height="64"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <radialGradient id={glow} cx="38%" cy="32%" r="72%">
            <stop offset="0%" stopColor="var(--color-primary-soft)" stopOpacity="0.85" />
            <stop offset="60%" stopColor="var(--color-primary)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0.12" />
          </radialGradient>
        </defs>

        {/* 받침 */}
        <g className={styles.stand}>
          <ellipse cx="32" cy="54" rx="13" ry="2.5" fill="var(--color-accent)" opacity="0.35" />
          <path d="M22 50 h20 l-3 6 h-14 z" fill="var(--color-accent)" opacity="0.7" />
        </g>

        {/* 구슬 — 안에서 빛이 도는 것처럼 */}
        <g className={styles.orb}>
          <circle
            cx="32"
            cy="29"
            r="20"
            fill={`url(#${glow})`}
            stroke="var(--color-accent)"
            strokeOpacity="0.4"
          />
          {/* 안개 — 천천히 돈다 */}
          <circle className={styles.mist} cx="27" cy="34" r="9" fill="var(--color-primary-soft)" opacity="0.18" />
          {/* 하이라이트 */}
          <ellipse
            cx="25"
            cy="21"
            rx="6"
            ry="3.5"
            fill="var(--color-fg-1)"
            opacity="0.2"
            transform="rotate(-28 25 21)"
          />
        </g>

        {/* 별 — 하나씩 반짝인다 */}
        <g fill="var(--color-accent)">
          <path
            className={`${styles.star} ${styles['star--a']}`}
            d="M32 6 l1 -3.4 l1 3.4 l3.4 1 l-3.4 1 l-1 3.4 l-1 -3.4 l-3.4 -1 z"
          />
          <path
            className={`${styles.star} ${styles['star--b']}`}
            d="M55 24 l0.8 -2.6 l0.8 2.6 l2.6 0.8 l-2.6 0.8 l-0.8 2.6 l-0.8 -2.6 l-2.6 -0.8 z"
          />
          <path
            className={`${styles.star} ${styles['star--c']}`}
            d="M8 30 l0.8 -2.6 l0.8 2.6 l2.6 0.8 l-2.6 0.8 l-0.8 2.6 l-0.8 -2.6 l-2.6 -0.8 z"
          />
        </g>
      </svg>
    </>
  )
}
