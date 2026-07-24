import { Navigate, Outlet, Route, Routes } from 'react-router-dom'

import { hasSupabase } from '@/lib/repo/client'
import { getSlotService } from '@/data/services'
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
import { useAdminAuth } from './useAdminAuth'

/**
 * 주최자 관리 — `/{slug}/admin/*`.
 * 슬롯 안에서만 존재하므로 디노 관리자는 나연 슬롯 관리 화면을 열 수 없다
 * (열어도 `useAdminAuth` 가 슬러그 불일치로 로그인 화면으로 보낸다).
 */
export default function AdminRoutes() {
  const slot = useSlotOrNull()

  // 없는 슬롯의 관리 화면은 존재하지 않는다
  if (!slot) return <NotFound />

  /**
   * **서비스마다 주최자가 만지는 게 다르다.** 타로 주최자는 질문·답변을, 럭키드로우 주최자는
   * 상품·수량·배송을 만진다. 라우트를 합쳐두면 럭키드로우 슬롯에서 `/admin/questions` 가
   * 빈 화면으로 열리고, 그게 "질문 기능이 고장났나" 로 읽힌다.
   */
  const service = getSlotService(slot)
  /**
   * **절대 경로여야 한다.** 상대 경로(`to="prizes"`)를 catch-all 에 쓰면 리다이렉트가
   * 경로를 **덧붙여서** `/admin/x/prizes/prizes/prizes/…` 로 무한히 자란다.
   * 못 찾은 주소를 첫 화면으로 되돌리는 게 이 라우트의 일인데, 상대 경로면 되돌리는 게 아니라
   * 계속 파고든다.
   */
  const home = `/${slot.slug}/admin/${
    service === 'luckydraw' ? 'overview' : service === 'rolling' ? 'messages' : 'questions'
  }`

  return (
    <Routes>
      <Route path="login" element={<Login />} />
      <Route element={<RequireAuth />}>
        <Route index element={<Navigate to={home} replace />} />
        <Route element={<AdminLayout />}>
          {service === 'luckydraw' ? (
            <>
              <Route path="overview" element={<Overview />} />
              <Route path="shipping" element={<Shipping />} />
            </>
          ) : service === 'rolling' ? (
            <Route path="messages" element={<Moderation />} />
          ) : (
            <>
              <Route path="questions" element={<QuestionList />} />
              <Route path="questions/:questionId" element={<QuestionEditor />} />
            </>
          )}
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
