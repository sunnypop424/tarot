import { NavLink } from 'react-router-dom'
import { House, Sparkles, BookOpen } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { Logo } from '@/components/Logo'
import { useSlotPath } from '@/slot/useSlotPath'

interface Link {
  to: string
  label: string
  icon: LucideIcon
}

const LINKS: Link[] = [
  { to: '', label: '홈', icon: House },
  { to: 'fortune', label: '운세', icon: Sparkles },
  { to: 'cards', label: '도감', icon: BookOpen },
]

/**
 * 데스크톱 상단 네비게이션 — 패드·태블릿·PC 에서만 보인다 (`.topnav` 가 CSS 로 숨김/표시).
 * 하단 탭바는 모바일 패턴이라 넓은 화면에선 이걸로 대신한다 (탭바·헤더 책 아이콘은 CSS 로 감춘다).
 */
export function TopNav() {
  const { path } = useSlotPath()

  return (
    <nav className="topnav" aria-label="주요 메뉴">
      <div className="topnav__inner">
        <NavLink to={path('')} end className="topnav__brand" aria-label="홈">
          <Logo />
        </NavLink>
        <div className="topnav__links">
          {LINKS.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={path(to)} end={to === ''} className="topnav__link">
              <Icon size={17} strokeWidth={2} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </div>
      </div>
    </nav>
  )
}
