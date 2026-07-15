import { NavLink } from 'react-router-dom'
import { House, Sparkles } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { useSlotPath } from '@/slot/useSlotPath'

interface Tab {
  /** 슬롯 기준 상대 경로 — '' 은 슬롯 홈 */
  to: string
  label: string
  icon: LucideIcon
}

/**
 * 홈 = 기간 운세(오늘·주간·월간) — 매일 여는 리추얼.
 * 운세 = 주제별 뽑기 + 질문 타로 — 궁금할 때 골라 뽑는 것.
 */
const TABS: Tab[] = [
  { to: '', label: '홈', icon: House },
  { to: 'fortune', label: '운세', icon: Sparkles },
]

export function TabBar() {
  const { path } = useSlotPath()

  return (
    <nav className="tabbar" aria-label="주요 메뉴">
      {TABS.map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={path(to)} end={to === ''} className="tabbar__item">
          <Icon size={24} strokeWidth={2} aria-hidden="true" />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
