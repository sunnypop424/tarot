import { NavLink, Outlet } from 'react-router-dom'
import { MessageCircleQuestion, ExternalLink, LogOut } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { useSlot } from '@/slot/SlotProvider'
import { useAdminAuth } from './useAdminAuth'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

/** 주최자가 만질 수 있는 건 질문/답변뿐 — 테마·이미지는 소유자가 배포한다 */
const NAV: NavItem[] = [{ to: 'questions', label: '질문 타로', icon: MessageCircleQuestion }]

export function AdminLayout() {
  const slot = useSlot()
  const { user, signOut } = useAdminAuth(slot.slug)

  return (
    <div className="admin">
      <div className="admin__shell">
        <aside className="admin__side">
          <div>
            <p className="t-text-l">{slot.name}</p>
            <p className="t-text-xs t-muted">/{slot.slug} · 관리</p>
          </div>

          <nav className="admin__nav" aria-label="관리 메뉴">
            {NAV.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} className="admin__navlink">
                <Icon size={20} strokeWidth={2} aria-hidden="true" />
                {label}
              </NavLink>
            ))}
            <a
              className="admin__navlink"
              href={`/${slot.slug}`}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={20} strokeWidth={2} aria-hidden="true" />
              내 페이지 보기
            </a>
          </nav>

          <div style={{ marginTop: 'auto' }}>
            {user && <p className="t-text-xs t-muted">{user.email}</p>}
            <button
              type="button"
              className="admin__navlink"
              onClick={() => void signOut()}
              style={{ width: '100%' }}
            >
              <LogOut size={20} strokeWidth={2} aria-hidden="true" />
              로그아웃
            </button>
          </div>
        </aside>

        <main className="admin__main">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
