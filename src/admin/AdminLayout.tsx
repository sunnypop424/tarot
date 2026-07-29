import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'

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
  /** 관리 셸 밖으로 나가는 화면 — 새 탭으로 연다 (스태프 기기·스크린 같은 현장 화면) */
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
  tarot: [{ to: 'questions', label: '질문 타로' }],
  luckydraw: [
    { to: 'overview', label: '상품 · 운영' },
    { to: 'shipping', label: '배송 정보' },
  ],
  rolling: [{ to: 'messages', label: '롤링페이퍼' }],
  photozone: [{ to: 'photozone', label: '포토존' }],
  // 롤페와 같은 화면·같은 경로 — 메뉴 이름만 서비스에 맞춘다
  wish: [{ to: 'messages', label: '소원나무' }],
  poll: [
    { to: 'polls', label: '설문' },
    // 부스에 세워두는 화면 — 관리 도구가 아니라 손님에게 보여주는 것이다
    { to: 'live', label: '스크린' },
  ],
  // 보상 메뉴(수령확인·추첨·응모자)는 여기 없다 — 아래 REWARD_NAV 가 설정값으로 붙인다
  stamp: [{ to: 'stamp', label: '스탬프' }],
  quiz: [
    { to: 'quiz', label: '모의고사' },
    { to: 'stats', label: '통계' },
  ],
  cheer: [
    { to: 'cheer', label: '상영 설정' },
    { to: 'messages', label: '한마디' },
    // 상영 화면 둘 다 관리 셸 밖이라 새 탭으로 (노트북에서 띄워 영상 위에 얹는다)
    { to: 'overlay', label: '오버레이', external: true },
    { to: 'credits', label: '엔딩크레딧', external: true },
  ],
  photocard: [
    { to: 'photocard', label: '카드' },
    { to: 'tickets', label: '뽑기권' },
    /*
     * 부스에서 스태프가 쓰는 화면 — **관리 셸 밖**이라 새 탭으로 연다.
     * 태블릿을 카운터에 세워두면 손님이 같이 보는 화면이라 슬롯 색을 쓴다.
     */
    { to: 'staff', label: '스태프 화면', external: true },
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
  { to: 'redeem', label: '수령 확인' },
  { to: 'entries', label: '응모자' },
  { to: 'picker', label: '추첨' },
]

/** 보상 인프라(0019)를 쓰는 서비스 — 포토카드는 자기 뽑기권 목록을 따로 쓴다 */
const USES_REWARDS: ServiceId[] = ['stamp', 'quiz']

function rewardNav(service: ServiceId): NavItem[] {
  return USES_REWARDS.includes(service) ? REWARD_NAV : []
}

function useNav(service: ServiceId): NavGroup[] {
  const rewards = rewardNav(service)
  return [
    {
      title: '현황',
      items: [
        { to: '', label: '대시보드' },
        // 인쇄물 준비가 주최자의 첫 번째 일이다 — 서비스와 무관하게 늘 있다
        { to: 'qr', label: 'QR 만들기' },
      ],
    },
    // 묶음 제목이 곧 이 슬롯이 파는 서비스다 — 슬롯을 오갈 때 여기가 바뀐다
    { title: serviceLabel(service), items: SERVICE_NAV[service] },
    /* 노출어는 "선물" 이다 — "보상"(`rewardMode`)은 코드에만 둔다 (`docs/DESIGN.md` 「용어」) */
    ...(rewards.length ? [{ title: '선물', items: rewards }] : []),
    ...(hasSupabase
      ? [
          {
            title: '계정',
            items: [
              { to: 'account', label: '내 계정' },
              // 부스에 사람이 여럿이면 계정을 나눠야 한다 (한 계정을 돌려 쓰면 기록이 섞인다)
              { to: 'staff-accounts', label: '스태프 계정' },
            ],
          },
        ]
      : []),
  ]
}

export function AdminLayout() {
  const slot = useSlot()
  const navigate = useNavigate()
  const { user, signOut } = useAdminAuth(slot.slug)
  const service = getSlotService(slot)
  const GROUPS = useNav(service)
  const [menuOpen, setMenuOpen] = useState(false)
  const [proxyShown, setProxyShown] = useState(true)

  /**
   * 로그아웃하면 **바로** 나간다.
   * `useAdminAuth` 는 부르는 곳마다 상태가 따로라(여기와 RequireAuth 가 각각 부른다),
   * 세션만 지우면 가드는 그걸 모르고 화면이 그대로 남는다 — 직접 로그인으로 보낸다.
   */
  async function handleSignOut() {
    await signOut()
    navigate(`/${slot.slug}/admin/login`, { replace: true })
  }

  /** 최고관리자가 남의 슬롯을 대신 보고 있는가 — 고치면 그 고객 화면이 그 자리에서 바뀐다 */
  const proxy = Boolean(user?.owner && !user.slugs.includes(slot.slug))

  const menu = (
    <>
      {GROUPS.map((group) => (
        <div className="ad-nav__group" key={group.title}>
          <p className="ad-nav__title">{group.title}</p>
          <div className="ad-nav__items">
            {group.items.map(({ to, label, external }) =>
              external ? (
                // 관리 셸 밖 화면 — 새 탭으로 연다 (부스 기기를 따로 띄워두고 쓴다)
                <a
                  key={to}
                  className="ad-nav__link"
                  href={`/${slot.slug}/${to}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span>{label}</span>
                  <span className="ad-nav__badge ad-nav__badge--ext">새 탭 ↗</span>
                </a>
              ) : (
                // 절대 경로로 — 상대 경로는 현재 URL 에 누적돼 /questions/questions… 로 늘어난다
                // 지금 화면 표시는 NavLink 가 붙이는 aria-current 로 (CSS 가 그걸 본다)
                <NavLink
                  key={to}
                  to={`/${slot.slug}/admin${to ? `/${to}` : ''}`}
                  end={to === ''}
                  className="ad-nav__link"
                  onClick={() => setMenuOpen(false)}
                >
                  <span>{label}</span>
                </NavLink>
              )
            )}
          </div>
        </div>
      ))}
      <div className="ad-nav__sep" />
      {/*
        * 대시보드의 바로가기 카드와 **같은 주소를 여는 같은 링크**다 — 이름도 같아야 한다.
        * 예전엔 여기가 "방문자 페이지 열기", 저쪽이 "내 페이지 보기" 라서 주최자가 둘을
        * 다른 기능으로 읽었다 (`docs/REVIEW_COMMON.md` 4번).
        */}
      <a className="ad-nav__visit" href={`/${slot.slug}`} target="_blank" rel="noreferrer">
        내 페이지 보기 ↗
      </a>
    </>
  )

  return (
    <div className="admin">
      <header className="ad-top">
        <div className="ad-top__bar">
          <div className="ad-top__left">
            <button
              type="button"
              className="ad-menubtn"
              onClick={() => setMenuOpen(true)}
              aria-label="메뉴 열기"
            >
              ☰
            </button>
            <div style={{ minWidth: 0 }}>
              <div className="ad-top__name">
                <span>{slot.name}</span>
                <span className="ad-svc">{serviceLabel(service)}</span>
              </div>
              <div className="ad-top__slug">
                /<b>{slot.slug}</b> · 관리
              </div>
            </div>
          </div>

          <div className="ad-top__right">
            {user && (
              <div className="ad-top__who">
                <div className="ad-top__whoMail">{user.email}</div>
                <div className="ad-top__whoRole">{user.owner ? '최고관리자' : '주최자'}</div>
              </div>
            )}
            <button
              type="button"
              className="ad-btn ad-btn--line ad-btn--sm"
              onClick={() => void handleSignOut()}
              data-signout
            >
              로그아웃
            </button>
          </div>
        </div>

        {/**
         * **최고관리자로 들어와 있으면 그렇다고 말한다.**
         * 남의 이벤트 데이터를 자기 것인 줄 알고 고치면 안 된다 — 여기 뜨는 상품·질문은
         * 고객의 것이고, 고치면 그 고객 화면이 그 자리에서 바뀐다.
         */}
        {proxy && proxyShown && (
          <div className="ad-proxy" data-owner-view>
            <span className="ad-proxy__dot" aria-hidden="true" />
            <span className="ad-proxy__text">
              최고관리자로 이 슬롯을 대신 보고 있어요. 고치면 손님 화면에 바로 반영돼요.
            </span>
            <button
              type="button"
              className="ad-proxy__close"
              onClick={() => setProxyShown(false)}
              aria-label="닫기"
            >
              ×
            </button>
          </div>
        )}
      </header>

      {menuOpen && (
        <>
          <button
            type="button"
            className="ad-scrim"
            aria-label="메뉴 닫기"
            onClick={() => setMenuOpen(false)}
          />
          <div className="ad-drawer">
            <div className="ad-drawer__head">
              <span>메뉴</span>
              <button
                type="button"
                className="ad-drawer__close"
                onClick={() => setMenuOpen(false)}
                aria-label="메뉴 닫기"
              >
                ×
              </button>
            </div>
            {/* 슬롯이 하나뿐인 주최자에겐 아무것도 안 그린다 */}
            {user && <SlotSwitcher current={slot.slug} slugs={user.slugs} />}
            <nav aria-label="관리 메뉴">{menu}</nav>
          </div>
        </>
      )}

      <div className="ad-body">
        <aside className="ad-side">
          <nav className="ad-nav" aria-label="관리 메뉴">
            {menu}
          </nav>
          {user && <SlotSwitcher current={slot.slug} slugs={user.slugs} />}
        </aside>

        <main className="ad-main">
          <Outlet />
        </main>
      </div>
      <AdminFeedbackHost />
    </div>
  )
}
