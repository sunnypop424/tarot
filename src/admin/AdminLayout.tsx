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
  BarChart3,
  GraduationCap,
  Sparkles,
  Layers,
  Ticket as TicketIcon,
  ScanLine,
  Dices,
  Gift,
  Stamp,
  StickyNote,
  Truck,
  Users,
  UserCog,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { hasSupabase } from '@/lib/repo/client'
import { getSlotService, serviceLabel } from '@/data/services'
import type { ServiceId } from '@/data/services'
import { useSlot } from '@/slot/SlotProvider'
import { AdminFeedbackHost } from './AdminFeedback'
import { SlotSwitcher } from './SlotSwitcher'
import { useAdminAuth } from './useAdminAuth'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** 관리 셸 밖으로 나가는 화면 — 새 탭으로 연다 (스태프 기기·전광판 같은 현장 화면) */
  external?: boolean
}

/**
 * 메뉴 묶음 — **제목이 붙는다.**
 *
 * 한 계정이 슬롯을 여러 개 갖고(`0006_multi_slot_admins.sql`) 서비스도 아홉이 되면서,
 * 메뉴만 죽 늘어놓으면 **지금 무슨 서비스를 보고 있는지**가 사라졌다. 묶음 제목이 그걸 말한다
 * ("포토카드 뽑기" 아래 카드·뽑기권·스태프 화면).
 */
interface NavGroup {
  title: string
  items: NavItem[]
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
    { to: 'overview', label: '상품 · 운영', icon: Gift },
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
  quiz: [
    { to: 'quiz', label: '모의고사', icon: GraduationCap },
    { to: 'stats', label: '통계', icon: BarChart3 },
  ],
  photocard: [
    { to: 'photocard', label: '카드', icon: Layers },
    { to: 'tickets', label: '뽑기권', icon: TicketIcon },
    /*
     * 부스에서 스태프가 쓰는 화면 — **관리 셸 밖**이라 새 탭으로 연다.
     * 태블릿을 카운터에 세워두면 손님이 같이 보는 화면이라 슬롯 색을 쓴다.
     */
    { to: 'staff', label: '스태프 화면', icon: Sparkles, external: true },
  ],
}

/**
 * 보상 화면 셋 — **보상을 쓰는 서비스면 늘 붙인다.**
 *
 * 예전엔 `rewardMode` 를 읽어 골라 붙였는데 그게 틀렸다: **설정을 바꿔도 이미 나간 코드와
 * 응모는 그대로 남는다.** '응모' 로 받다가 '확정' 으로 돌리면 어제 응모하신 분들 명단이
 * 메뉴에서 통째로 사라진다 — 데이터는 있는데 볼 길이 없는 상태다.
 *
 * 그래서 메뉴는 늘 두고, **각 화면이 자기 상황을 스스로 설명한다**(0건이면 왜 비었는지).
 * 설정으로 화면을 숨기는 건 "지금 안 쓰는 기능" 을 감추는 데는 좋지만 **기록을 감추는 데는
 * 나쁘다** — 기록은 설정보다 오래 산다.
 */
const REWARD_NAV: NavItem[] = [
  { to: 'redeem', label: '수령 확인', icon: ScanLine },
  { to: 'entries', label: '응모자', icon: Users },
  { to: 'picker', label: '추첨', icon: Dices },
]

/** 보상 인프라(0019)를 쓰는 서비스 — 포토카드는 자기 뽑기권 목록을 따로 쓴다 */
const USES_REWARDS: ServiceId[] = ['stamp', 'quiz']

function rewardNav(service: ServiceId): NavItem[] {
  return USES_REWARDS.includes(service) ? REWARD_NAV : []
}

function useNav(service: ServiceId): NavGroup[] {
  const rewards = rewardNav(service)
  return [
    { title: '현황', items: [{ to: '', label: '대시보드', icon: LayoutDashboard }] },
    // 묶음 제목이 곧 이 슬롯이 파는 서비스다 — 슬롯을 오갈 때 여기가 바뀐다
    { title: serviceLabel(service), items: SERVICE_NAV[service] },
    ...(rewards.length ? [{ title: '보상', items: rewards }] : []),
    ...(hasSupabase ? [{ title: '계정', items: [{ to: 'account', label: '내 계정', icon: UserCog }] }] : []),
  ]
}

export function AdminLayout() {
  const slot = useSlot()
  const navigate = useNavigate()
  const { user, signOut } = useAdminAuth(slot.slug)
  const GROUPS = useNav(getSlotService(slot))

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
            {GROUPS.map((group) => (
              <div className="admin__navgroup" key={group.title}>
                <p className="admin__navtitle">{group.title}</p>
                {group.items.map(({ to, label, icon: Icon, external }) =>
                  external ? (
                    // 관리 셸 밖 화면 — 새 탭으로 연다 (부스 기기를 따로 띄워두고 쓴다)
                    <a
                      key={to}
                      className="admin__navlink"
                      href={`/${slot.slug}/${to}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Icon size={18} strokeWidth={2} aria-hidden="true" />
                      {label}
                      <ExternalLink size={13} strokeWidth={2} aria-hidden="true" style={{ marginLeft: 'auto', opacity: 0.5 }} />
                    </a>
                  ) : (
                    // 절대 경로로 — 상대 경로는 현재 URL 에 누적돼 /questions/questions… 로 늘어난다
                    <NavLink
                      key={to}
                      to={`/${slot.slug}/admin${to ? `/${to}` : ''}`}
                      end={to === ''}
                      className="admin__navlink"
                    >
                      <Icon size={18} strokeWidth={2} aria-hidden="true" />
                      {label}
                    </NavLink>
                  )
                )}
              </div>
            ))}
            <div className="admin__navgroup">
              <p className="admin__navtitle">이벤트</p>
              <a className="admin__navlink" href={`/${slot.slug}`} target="_blank" rel="noreferrer">
                <ExternalLink size={18} strokeWidth={2} aria-hidden="true" />
                내 페이지 보기
              </a>
            </div>
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
