import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  MessageCircleQuestion,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  Truck,
  UserCog,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { hasSupabase } from '@/lib/repo/client'
import { getSlotService } from '@/data/services'
import { useSlot } from '@/slot/SlotProvider'
import { AdminFeedbackHost } from './AdminFeedback'
import { SlotSwitcher } from './SlotSwitcher'
import { useAdminAuth } from './useAdminAuth'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

/**
 * 주최자가 만질 수 있는 건 **그 서비스의 운영 데이터와 자기 계정**뿐 —
 * 테마·이미지는 최고관리자가 배포한다.
 *
 * 계정이 여기 있는 이유: 주최자는 최고관리자가 만들어 준 계정으로 들어온다.
 * 처음엔 남이 아는 비밀번호라 자기 것으로 바꿀 자리가 필요하다 (`Account`).
 * local 어댑터엔 바꿀 비번이 없으므로(아무 값이나 통과한다) 그 빌드에선 메뉴를 안 만든다.
 */
function navFor(service: string): NavItem[] {
  const own: NavItem[] =
    service === 'luckydraw'
      ? [
          { to: 'overview', label: '대시보드', icon: LayoutDashboard },
          { to: 'shipping', label: '배송 정보', icon: Truck },
        ]
      : [{ to: 'questions', label: '질문 타로', icon: MessageCircleQuestion }]

  return [...own, ...(hasSupabase ? [{ to: 'account', label: '내 계정', icon: UserCog }] : [])]
}

export function AdminLayout() {
  const slot = useSlot()
  const navigate = useNavigate()
  const { user, signOut } = useAdminAuth(slot.slug)
  const NAV = navFor(getSlotService(slot))

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
          <div className="admin__brand">
            <p className="t-text-l">{slot.name}</p>
            <p className="t-text-xs t-muted">/{slot.slug} · 관리</p>
          </div>

          {/* 슬롯이 하나뿐인 주최자에겐 아무것도 안 그린다 */}
          {user && <SlotSwitcher current={slot.slug} slugs={user.slugs} />}

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
            {/**
             * **최고관리자로 들어와 있으면 그렇다고 말한다.**
             * 남의 이벤트 데이터를 자기 것인 줄 알고 고치면 안 된다 — 여기 뜨는 상품·질문은
             * 고객의 것이고, 고치면 그 고객 화면이 그 자리에서 바뀐다.
             */}
            {user?.owner && !user.slugs.includes(slot.slug) && (
              <p className="t-text-xs" style={{ color: 'var(--color-accent)' }} data-owner-view>
                최고관리자로 보는 중이에요 — 고치면 고객 화면에 바로 반영돼요.
              </p>
            )}
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
      <AdminFeedbackHost />
    </div>
  )
}
