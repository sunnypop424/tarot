import { useSlot } from '@/slot/SlotProvider'
import { cssUrl, useImageAsset } from '@/lib/image'

/**
 * 이벤트 로고 — 테마에 로고 이미지가 있으면 이미지, 없으면 이벤트명 텍스트.
 * 생일카페마다 교체되는 자리다 (PLANNING.md §5 테마).
 *
 * 이미지는 background-image 로만 그린다 (lib/image.ts) — 폭은 높이 × 원본 비율로 잡는다.
 */
export function Logo({ className }: { className?: string }) {
  const { theme } = useSlot()
  const { logo, logoAlt, logoHeight } = theme.assets
  const { status, ratio } = useImageAsset(logo)

  if (!logo || status === 'failed') {
    return (
      // 주최자가 지은 행사 이름 — 사전이 옮길 말이 아니다
      <span
        className={`t-text-l ${className ?? ''}`}
        style={{ lineHeight: 1 }}
        data-user-text
      >
        {logoAlt}
      </span>
    )
  }

  return (
    <span
      role="img"
      aria-label={logoAlt}
      className={className}
      style={{
        display: 'block',
        height: logoHeight,
        // 비율을 알기 전엔 0 — <img> 도 로드 전엔 폭이 0 이었다
        width: status === 'ok' ? Math.round(logoHeight * ratio) : 0,
        backgroundImage: cssUrl(logo),
        backgroundSize: 'contain',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center',
      }}
    />
  )
}
