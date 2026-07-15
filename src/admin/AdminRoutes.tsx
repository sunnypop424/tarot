import { Navigate, Outlet, Route, Routes } from 'react-router-dom'

import { useSlotOrNull } from '@/slot/SlotProvider'
import { NotFound } from '@/screens/NotFound'
import { AdminLayout } from './AdminLayout'
import { Login } from './Login'
import { QuestionList } from './QuestionList'
import { QuestionEditor } from './QuestionEditor'
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

  return (
    <Routes>
      <Route path="login" element={<Login />} />
      <Route element={<RequireAuth />}>
        <Route index element={<Navigate to="questions" replace />} />
        <Route element={<AdminLayout />}>
          <Route path="questions" element={<QuestionList />} />
          <Route path="questions/:questionId" element={<QuestionEditor />} />
        </Route>
        <Route path="*" element={<Navigate to="questions" replace />} />
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
