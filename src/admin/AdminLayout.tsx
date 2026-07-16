import { NavLink, Outlet, useNavigate } from 'react-router-dom'
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
  const navigate = useNavigate()
  const { user, signOut } = useAdminAuth(slot.slug)

  /**
   * 로그아웃하면 **바로** 나간다.
   * `useAdminAuth` 는 부르는 곳마다 상태가 따로라(여기와 RequireAuth 가 각각 부른다),
   * 세션만 지우면 가드는 그걸 모르고 화면이 그대로 남는다 — 직접 로그인으로 보낸다.
   */
  async function handleSignOut() {
    await signOut()
    navigate(`/${slot.slug}/admin/login`, { replace: true })
  }

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
              // 절대 경로로 — 상대 경로는 현재 URL 에 누적돼 /questions/questions… 로 늘어난다
              <NavLink key={to} to={`/${slot.slug}/admin/${to}`} className="admin__navlink">
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
              onClick={() => void handleSignOut()}
              style={{ width: '100%' }}
              data-signout
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
