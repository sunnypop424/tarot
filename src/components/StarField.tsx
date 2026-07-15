/**
 * 히어로 뒤 별 장식 — 정적 SVG, 애니메이션 없음 (DESIGN.md §6: 파티클 라이브러리 금지).
 * 불투명도 0.3 이하로 카드보다 뒤에 머문다.
 */
export function StarField({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 390 380"
      className={className}
      fill="var(--color-accent)"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="46" cy="60" r="1.2" />
      <circle cx="120" cy="30" r="1" />
      <circle cx="300" cy="48" r="1.4" />
      <circle cx="352" cy="110" r="1" />
      <circle cx="30" cy="150" r="1" />
      <circle cx="360" cy="210" r="1.2" />
      <circle cx="70" cy="250" r="1" />
      <circle cx="330" cy="300" r="1.3" />
      <circle cx="200" cy="20" r="0.8" />
      <circle cx="24" cy="300" r="1" />
      <path d="M85 110 l1.5 -5 l1.5 5 l5 1.5 l-5 1.5 l-1.5 5 l-1.5 -5 l-5 -1.5 z" opacity="0.9" />
      <path d="M312 160 l1.2 -4 l1.2 4 l4 1.2 l-4 1.2 l-1.2 4 l-1.2 -4 l-4 -1.2 z" opacity="0.9" />
      <path d="M52 200 l1 -3.5 l1 3.5 l3.5 1 l-3.5 1 l-1 3.5 l-1 -3.5 l-3.5 -1 z" opacity="0.9" />
    </svg>
  )
}
