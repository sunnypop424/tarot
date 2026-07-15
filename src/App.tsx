import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Outlet, useNavigate } from 'react-router-dom'
import { BookOpen } from 'lucide-react'

import { SlotProvider, useSlotOrNull } from '@/slot/SlotProvider'
import { QuestionsProvider } from '@/lib/questions'
import { TabBar } from '@/components/TabBar'
import { Home } from '@/screens/Home'
import { Fortune } from '@/screens/Fortune'
import { Draw } from '@/screens/Draw'
import { Question } from '@/screens/Question'
import { Cards } from '@/screens/Cards'
import { CardDetail } from '@/screens/CardDetail'
import { NotFound } from '@/screens/NotFound'

/** 관리자 코드는 방문자(카페에서 모바일)에게 내려가면 안 된다 — 별도 청크로 분리 */
const AdminRoutes = lazy(() => import('@/admin/AdminRoutes'))

/**
 * 테마 편집기는 소유자 전용 — 프로덕션 번들에서 **아예 제거**한다.
 * 라우트에만 DEV 가드를 걸면 lazy(import(...)) 는 그대로 평가돼 청크가 빌드에 남는다.
 * 삼항의 조건이 빌드 시 false 로 치환되면서 동적 import 까지 죽은 코드로 걷힌다.
 */
const ThemeEditor = import.meta.env.DEV ? lazy(() => import('@/owner/ThemeEditor')) : null

/** 슬롯 사용자 앱 셸 */
function SlotLayout() {
  const navigate = useNavigate()
  const slot = useSlotOrNull()

  // 없는 슬롯이면 테마도 질문도 의미가 없다
  if (!slot) return <NotFound />

  return (
    <QuestionsProvider>
      <div className="app">
        <header className="app__header">
          <button
            type="button"
            className="btn-icon"
            aria-label="카드 도감"
            onClick={() => navigate(`/${slot.slug}/cards`)}
          >
            <BookOpen size={24} strokeWidth={2} aria-hidden="true" />
          </button>
        </header>

        <main className="app__scroll">
          <Outlet />
        </main>
        <TabBar />
      </div>
    </QuestionsProvider>
  )
}

/** 슬롯 스코프 — 사용자 화면과 관리자 모두 이 아래 */
function SlotScope() {
  return (
    <SlotProvider>
      <Outlet />
    </SlotProvider>
  )
}

export function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={null}>
        <Routes>
          {/* 배포 루트에는 아무 이벤트도 없다 — 슬러그로만 들어온다 */}
          <Route index element={<NotFound />} />

          {ThemeEditor && <Route path="theme-editor" element={<ThemeEditor />} />}

          <Route path=":slug" element={<SlotScope />}>
            {/* 주최자 관리 — 자기 슬롯만 */}
            <Route path="admin/*" element={<AdminRoutes />} />

            <Route element={<SlotLayout />}>
              <Route index element={<Home />} />
              <Route path="fortune" element={<Fortune />} />
              <Route path="draw/:categoryId" element={<Draw />} />
              <Route path="question/:questionId" element={<Question />} />
              <Route path="cards" element={<Cards />} />
              <Route path="cards/:cardId" element={<CardDetail />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
