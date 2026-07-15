import { useId } from 'react'

import { useSlot } from '@/slot/SlotProvider'

/**
 * 타로 카드 뒷면.
 * 이벤트 테마가 뒷면 이미지를 주면 그 이미지를, 없으면 내장 SVG(방사형 바탕 + 포인트색 별 문양)를 쓴다.
 * 프레임(비율·테두리·그림자)은 감싸는 쪽의 .tarot-card 가 담당한다.
 */
export function CardBack() {
  const { theme } = useSlot()

  if (theme.assets.cardBack) {
    return (
      <img
        src={theme.assets.cardBack}
        alt=""
        aria-hidden="true"
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    )
  }

  return <DefaultCardBack />
}

function DefaultCardBack() {
  const gradientId = useId()

  return (
    <svg
      viewBox="0 0 170 283"
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id={gradientId} cx="50%" cy="42%" r="72%">
          <stop offset="0%" stopColor="var(--card-back-from)" />
          <stop offset="100%" stopColor="var(--card-back-to)" />
        </radialGradient>
      </defs>

      <rect width="170" height="283" fill={`url(#${gradientId})`} />
      <rect
        x="11"
        y="11"
        width="148"
        height="261"
        rx="9"
        fill="none"
        stroke="var(--color-accent)"
        strokeOpacity="0.35"
      />

      <g fill="var(--color-accent)">
        <path d="M85 34 l2 -7 l2 7 l7 2 l-7 2 l-2 7 l-2 -7 l-7 -2 z" opacity="0.75" />
        <path d="M40 70 l1.4 -5 l1.4 5 l5 1.4 l-5 1.4 l-1.4 5 l-1.4 -5 l-5 -1.4 z" opacity="0.6" />
        <path d="M130 70 l1.4 -5 l1.4 5 l5 1.4 l-5 1.4 l-1.4 5 l-1.4 -5 l-5 -1.4 z" opacity="0.6" />
        <path d="M36 210 l1.4 -5 l1.4 5 l5 1.4 l-5 1.4 l-1.4 5 l-1.4 -5 l-5 -1.4 z" opacity="0.6" />
        <path d="M132 212 l1.4 -5 l1.4 5 l5 1.4 l-5 1.4 l-1.4 5 l-1.4 -5 l-5 -1.4 z" opacity="0.6" />
        <path d="M85 250 l2 -7 l2 7 l7 2 l-7 2 l-2 7 l-2 -7 l-7 -2 z" opacity="0.75" />
        <circle cx="60" cy="45" r="1" />
        <circle cx="112" cy="45" r="1" />
        <circle cx="30" cy="140" r="1" />
        <circle cx="140" cy="140" r="1" />
        <circle cx="55" cy="235" r="1" />
        <circle cx="117" cy="235" r="1" />
        <circle cx="85" cy="70" r="1" />
        <circle cx="85" cy="212" r="1" />
      </g>

      {/* 중앙 moon-star (Lucide) */}
      <g
        transform="translate(55 112) scale(2.5)"
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M18 5h4" />
        <path d="M20 3v4" />
        <path d="M21.53 13.11A8.5 8.5 0 1 1 10.89 2.47a1 1 0 0 1 1.13 1.48 6 6 0 0 0 7.99 7.99 1 1 0 0 1 1.52 1.17z" />
      </g>
    </svg>
  )
}
