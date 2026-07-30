import { Navigate, Outlet, Route, Routes } from 'react-router-dom'

import { Board } from './Board'
import { OwnerLogin } from './OwnerLogin'
import { SlotList } from './SlotList'
import { SlotEditor } from './SlotEditor'
import { useOwnerAuth } from './useOwnerAuth'

/**
 * 최고관리자 — `/theme-editor/*`. **Supabase 가 설정된 빌드에만 라우트가 존재한다** (App.tsx).
 * 슬롯을 만들고(`/theme-editor`) 슬롯 하나의 테마를 맞춘다(`/theme-editor/:slug`).
 *
 * 주최자 관리(`/{slug}/admin`)와 문이 다르다 — 주최자 세션으로는 여기 못 들어온다.
 */
export default function OwnerRoutes() {
  return (
    <Routes>
      <Route path="login" element={<OwnerLogin />} />
      <Route element={<RequireOwner />}>
        <Route index element={<SlotList />} />
        {/* 운영 보드 — 목록이 답하지 못하는 것만 (종료 임박·자료 회수·AI 원가·점검) */}
        <Route path="board" element={<Board />} />
        {/* 'login' 은 위에서 먼저 잡히고, 예약어라 슬러그로 만들 수도 없다 (owner/slug.ts) */}
        <Route path=":slug" element={<SlotEditor />} />
        <Route path="*" element={<Navigate to="/theme-editor" replace />} />
      </Route>
    </Routes>
  )
}

function RequireOwner() {
  const { status } = useOwnerAuth()

  if (status === 'checking') return null
  if (status === 'out') return <Navigate to="/theme-editor/login" replace />
  return <Outlet />
}
