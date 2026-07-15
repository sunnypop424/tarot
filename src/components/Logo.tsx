import { useSlot } from '@/slot/SlotProvider'

/**
 * 이벤트 로고 — 테마에 로고 이미지가 있으면 이미지, 없으면 이벤트명 텍스트.
 * 생일카페마다 교체되는 자리다 (PLANNING.md §5 테마).
 */
export function Logo({ className }: { className?: string }) {
  const { theme } = useSlot()
  const { logo, logoAlt, logoHeight } = theme.assets

  if (!logo) {
    return (
      <span className={`t-text-l ${className ?? ''}`} style={{ lineHeight: 1 }}>
        {logoAlt}
      </span>
    )
  }

  return (
    <img
      src={logo}
      alt={logoAlt}
      height={logoHeight}
      className={className}
      style={{ height: logoHeight, width: 'auto' }}
    />
  )
}
