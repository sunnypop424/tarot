import { useId } from 'react'

import { useSlot } from '@/slot/SlotProvider'
import { cssUrl, useImageAsset } from '@/lib/image'

/**
 * 타로 카드 뒷면.
 * 이벤트 테마가 뒷면 이미지를 주면 그 이미지를, 없으면 내장 SVG(방사형 바탕 + 포인트색 별 문양)를 쓴다.
 * 프레임(비율·테두리·그림자)은 감싸는 쪽의 .tarot-card 가 담당한다.
 *
 * 이미지는 background-image 로만 그린다 (lib/image.ts) — 카페에서 길게 눌러 저장되면 안 된다.
 */
export function CardBack() {
  const { theme } = useSlot()
  const src = theme.assets.cardBack
  const { status } = useImageAsset(src)

  // 이미지가 깨지면 내장 뒷면으로 — 덱 전체가 빈칸으로 펼쳐지면 안 된다
  if (src && status !== 'failed') {
    return (
      <div
        aria-hidden="true"
        style={{
          width: '100%',
          height: '100%',
          backgroundImage: cssUrl(src),
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />
    )
  }

  return <DefaultCardBack />
}

function DefaultCardBack() {
  const gradientId = useId()

  return (
    // viewBox 는 189×264 = 63×88 ×3 — **`--card-ratio`(tokens.css)와 같은 비율이어야 한다.**
    // 어긋나면 slice 가 넘치는 쪽을 잘라내 테두리 위아래가 화면 밖으로 밀린다
    // (3/5 이던 시절 좌표를 63/88 카드에 그대로 얹었다가 테두리가 세로선 두 개만 남았다).
    <svg
      viewBox="0 0 189 264"
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

      <rect width="189" height="264" fill={`url(#${gradientId})`} />
      {/* 12 는 네 변 모두 같은 물리 여백 — viewBox 가 통째로 등비 확대되므로 */}
      <rect
        x="12"
        y="12"
        width="165"
        height="240"
        rx="10"
        fill="none"
        stroke="var(--color-accent)"
        strokeOpacity="0.35"
      />

      <g fill="var(--color-accent)">
        <path d="M94.5 31.7 l2 -7 l2 7 l7 2 l-7 2 l-2 7 l-2 -7 l-7 -2 z" opacity="0.75" />
        <path d="M44.5 65.3 l1.4 -5 l1.4 5 l5 1.4 l-5 1.4 l-1.4 5 l-1.4 -5 l-5 -1.4 z" opacity="0.6" />
        <path d="M144.5 65.3 l1.4 -5 l1.4 5 l5 1.4 l-5 1.4 l-1.4 5 l-1.4 -5 l-5 -1.4 z" opacity="0.6" />
        <path d="M40 195.9 l1.4 -5 l1.4 5 l5 1.4 l-5 1.4 l-1.4 5 l-1.4 -5 l-5 -1.4 z" opacity="0.6" />
        <path d="M146.8 197.8 l1.4 -5 l1.4 5 l5 1.4 l-5 1.4 l-1.4 5 l-1.4 -5 l-5 -1.4 z" opacity="0.6" />
        <path d="M94.5 233.2 l2 -7 l2 7 l7 2 l-7 2 l-2 7 l-2 -7 l-7 -2 z" opacity="0.75" />
        <circle cx="66.7" cy="42" r="1" />
        <circle cx="124.5" cy="42" r="1" />
        <circle cx="33.4" cy="130.6" r="1" />
        <circle cx="155.7" cy="130.6" r="1" />
        <circle cx="61.1" cy="219.2" r="1" />
        <circle cx="130.1" cy="219.2" r="1" />
        <circle cx="94.5" cy="65.3" r="1" />
        <circle cx="94.5" cy="197.8" r="1" />
      </g>

      {/* 중앙 moon-star (Lucide) — 24×24 글리프를 2.5배(60×60)로, 카드 중앙(94.5, 132)에 */}
      <g
        transform="translate(64.5 102) scale(2.5)"
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
