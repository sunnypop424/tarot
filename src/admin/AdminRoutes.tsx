import { Navigate, Outlet, Route, Routes } from 'react-router-dom'

import type { ReactNode } from 'react'

import { hasSupabase } from '@/lib/repo/client'
import { getSlotService } from '@/data/services'
import type { ServiceId } from '@/data/services'
import { useSlotOrNull } from '@/slot/SlotProvider'
import { NotFound } from '@/screens/NotFound'
import { Account } from './Account'
import { AdminLayout } from './AdminLayout'
import { Login } from './Login'
import { QuestionList } from './QuestionList'
import { QuestionEditor } from './QuestionEditor'
import { Overview } from './luckydraw/Overview'
import { Shipping } from './luckydraw/Shipping'
import { Moderation } from './rolling/Moderation'
import { Guide as PhotozoneGuide } from './photozone/Guide'
import { Polls } from './poll/Polls'
import { Live } from './poll/Live'
import { Board as StampBoard } from './stamp/Board'
import { Redeem } from './reward/Redeem'
import { Picker } from './reward/Picker'
import { Entries } from './reward/Entries'
import { Questions as QuizQuestions } from './quiz/Questions'
import { Stats as QuizStats } from './quiz/Stats'
import { useAdminAuth } from './useAdminAuth'

/**
 * **서비스마다 주최자가 만지는 게 다르다.** 타로 주최자는 질문·답변을, 럭키드로우 주최자는
 * 상품·수량·배송을 만진다. 라우트를 합쳐두면 럭키드로우 슬롯에서 `/admin/questions` 가
 * 빈 화면으로 열리고, 그게 "질문 기능이 고장났나" 로 읽힌다.
 *
 * **`Record` 라 모든 서비스가 필수다** — 삼항 체인이었을 땐 새 서비스가 조용히 `else`(타로 질문
 * 화면)로 떨어졌다. 이제 `SERVICES` 에 한 줄 넣으면 여기가 컴파일 에러로 터진다.
 *
 * `home` 은 **경로 조각만** 든다. 절대 경로 조립은 아래에서 한다 — 상대 경로(`to="prizes"`)를
 * catch-all 에 쓰면 리다이렉트가 경로를 **덧붙여서** `/admin/x/prizes/prizes/prizes/…` 로
 * 무한히 자란다. 못 찾은 주소를 첫 화면으로 되돌리는 게 이 라우트의 일인데, 상대 경로면
 * 되돌리는 게 아니라 계속 파고든다.
 */
const ADMIN_HOME: Record<ServiceId, string> = {
  tarot: 'questions',
  luckydraw: 'overview',
  rolling: 'messages',
  photozone: 'photozone',
  wish: 'messages',
  poll: 'polls',
  stamp: 'stamp',
  quiz: 'quiz',
}

const ADMIN_ROUTES: Record<ServiceId, ReactNode> = {
  tarot: (
    <>
      <Route path="questions" element={<QuestionList />} />
      <Route path="questions/:questionId" element={<QuestionEditor />} />
    </>
  ),
  luckydraw: (
    <>
      <Route path="overview" element={<Overview />} />
      <Route path="shipping" element={<Shipping />} />
    </>
  ),
  rolling: <Route path="messages" element={<Moderation />} />,
  // 만질 데이터가 없어 안내 한 장뿐이다 (admin/photozone/Guide.tsx 의 주석)
  photozone: <Route path="photozone" element={<PhotozoneGuide />} />,
  /**
   * 소원나무는 **롤페 후검수 화면을 그대로 쓴다** — 데이터가 같은 테이블이라 검수도 같은 일이다.
   * 전용 화면을 만들면 같은 코드가 둘이 되고, 한쪽만 고치는 날이 온다.
   */
  wish: <Route path="messages" element={<Moderation />} />,
  poll: (
    <>
      <Route path="polls" element={<Polls />} />
      <Route path="live" element={<Live />} />
    </>
  ),
  /**
   * 스탬프는 **자기 화면 하나 + 공용 보상 화면 셋**이다. 수령확인·추첨·응모자는
   * `src/admin/reward/*` 라 모의고사·포토카드도 같은 컴포넌트를 가리키게 된다.
   *
   * 라우트는 셋 다 항상 등록한다 — 메뉴만 `rewardMode` 에 따라 켜고, 주소로 직접 들어와도
   * 화면이 스스로 상황을 설명하는 편이 빈 화면보다 낫다.
   */
  stamp: (
    <>
      <Route path="stamp" element={<StampBoard />} />
      <Route path="redeem" element={<Redeem />} />
      <Route path="picker" element={<Picker />} />
      <Route path="entries" element={<Entries />} />
    </>
  ),
  // 스탬프와 같은 공용 보상 화면 셋을 그대로 쓴다 — 문항·통계만 자기 것이다
  quiz: (
    <>
      <Route path="quiz" element={<QuizQuestions />} />
      <Route path="stats" element={<QuizStats />} />
      <Route path="redeem" element={<Redeem />} />
      <Route path="picker" element={<Picker />} />
      <Route path="entries" element={<Entries />} />
    </>
  ),
}

/**
 * 주최자 관리 — `/{slug}/admin/*`.
 * 슬롯 안에서만 존재하므로 디노 관리자는 나연 슬롯 관리 화면을 열 수 없다
 * (열어도 `useAdminAuth` 가 슬러그 불일치로 로그인 화면으로 보낸다).
 */
export default function AdminRoutes() {
  const slot = useSlotOrNull()

  // 없는 슬롯의 관리 화면은 존재하지 않는다
  if (!slot) return <NotFound />

  const service = getSlotService(slot)
  const home = `/${slot.slug}/admin/${ADMIN_HOME[service]}`

  return (
    <Routes>
      <Route path="login" element={<Login />} />
      <Route element={<RequireAuth />}>
        <Route index element={<Navigate to={home} replace />} />
        <Route element={<AdminLayout />}>
          {ADMIN_ROUTES[service]}
          {/* local 어댑터엔 바꿀 비밀번호가 없다 (아무 값이나 통과한다) — 메뉴도 화면도 안 만든다 */}
          {hasSupabase && <Route path="account" element={<Account />} />}
        </Route>
        <Route path="*" element={<Navigate to={home} replace />} />
      </Route>
    </Routes>
  )
}

/** 로그인 + 슬롯 일치를 함께 본다 */
function RequireAuth() {
  const slot = useSlotOrNull()!
  const { status } = useAdminAuth(slot.slug)

  if (status === 'checking') return null
  if (status === 'out') return <Navigate to={`/${slot.slug}/admin/login`} replace />
  return <Outlet />
}
