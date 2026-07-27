import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  Camera,
  ClipboardList,
  Lamp,
  MonitorPlay,
  MessageCircleQuestion,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  ScanLine,
  Dices,
  Stamp,
  StickyNote,
  Truck,
  Users,
  UserCog,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { repo } from '@/lib/repo'
import { hasSupabase } from '@/lib/repo/client'
import { getSlotService } from '@/data/services'
import type { ServiceId } from '@/data/services'
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
/**
 * **`Record` 라 모든 서비스가 필수다** — 삼항 체인이었을 땐 새 서비스가 조용히 `else`(질문 타로)
 * 메뉴를 받았다. 이제 `SERVICES` 에 한 줄 넣으면 여기가 컴파일 에러로 터진다.
 * 경로는 `AdminRoutes` 의 `ADMIN_ROUTES` 와 짝이 맞아야 한다 — 한쪽만 고치면 빈 화면이 열린다.
 */
const SERVICE_NAV: Record<ServiceId, NavItem[]> = {
  tarot: [{ to: 'questions', label: '질문 타로', icon: MessageCircleQuestion }],
  luckydraw: [
    { to: 'overview', label: '대시보드', icon: LayoutDashboard },
    { to: 'shipping', label: '배송 정보', icon: Truck },
  ],
  rolling: [{ to: 'messages', label: '롤링페이퍼', icon: StickyNote }],
  photozone: [{ to: 'photozone', label: '포토존', icon: Camera }],
  // 롤페와 같은 화면·같은 경로 — 메뉴 이름만 서비스에 맞춘다
  wish: [{ to: 'messages', label: '소원나무', icon: Lamp }],
  poll: [
    { to: 'polls', label: '설문', icon: ClipboardList },
    // 부스에 세워두는 화면 — 관리 도구가 아니라 손님에게 보여주는 것이다
    { to: 'live', label: '전광판', icon: MonitorPlay },
  ],
  // 보상 메뉴(수령확인·추첨·응모자)는 여기 없다 — 아래 REWARD_NAV 가 설정값으로 붙인다
  stamp: [{ to: 'stamp', label: '스탬프', icon: Stamp }],
}

/**
 * **서비스가 아니라 설정값으로 메뉴가 갈리는 첫 사례다.**
 *
 * 확정선물 이벤트에 '추첨'·'응모자' 가 떠 있으면 주최자가 뭘 눌러야 하는지 헷갈린다.
 * 반대로 응모 이벤트에 '수령 확인' 은 쓸 자리가 없다. 그래서 `rewardMode` 를 읽어 붙인다.
 *
 * 읽어오기 전에는 아무것도 안 붙인다 — 잠깐 뒤에 메뉴가 늘어나는 건 괜찮지만,
 * 잘못된 메뉴가 먼저 떠 있다가 사라지면 그건 고장으로 읽힌다.
 */
const REWARD_NAV: Record<'guaranteed' | 'raffle', NavItem[]> = {
  guaranteed: [{ to: 'redeem', label: '수령 확인', icon: ScanLine }],
  raffle: [
    { to: 'picker', label: '추첨', icon: Dices },
    { to: 'entries', label: '응모자', icon: Users },
  ],
}

/** 보상을 쓰는 서비스만 여기 등록한다 (모의고사·포토카드가 뒤따른다) */
function useRewardNav(service: ServiceId, slug: string): NavItem[] {
  const [mode, setMode] = useState<'none' | 'guaranteed' | 'raffle'>('none')

  useEffect(() => {
    if (service !== 'stamp' || !repo.stamp.ready()) return
    let alive = true
    void repo.stamp.settings(slug).then((s) => {
      if (alive) setMode(s.rewardMode)
    })
    return () => {
      alive = false
    }
  }, [service, slug])

  return mode === 'none' ? [] : REWARD_NAV[mode]
}

function useNav(service: ServiceId, slug: string): NavItem[] {
  const reward = useRewardNav(service, slug)
  return [
    ...SERVICE_NAV[service],
    ...reward,
    ...(hasSupabase ? [{ to: 'account', label: '내 계정', icon: UserCog }] : []),
  ]
}

export function AdminLayout() {
  const slot = useSlot()
  const navigate = useNavigate()
  const { user, signOut } = useAdminAuth(slot.slug)
  const NAV = useNav(getSlotService(slot), slot.slug)

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
