import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Outlet, useNavigate } from 'react-router-dom'
import { BookOpen } from 'lucide-react'

import { SlotProvider, useSlotState } from '@/slot/SlotProvider'
import { getSlotService } from '@/data/services'
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
 * 슬롯 편집기(최고관리자) — **진짜 인증이 있을 때만 존재한다.**
 *
 * 예전엔 `import.meta.env.DEV` 로 걸었다. 로그인이 아무 값이나 통과하고 업로드가 개발 서버
 * 미들웨어에 매여 있어서, 배포하면 **열린 문만 배포되는** 꼴이었기 때문이다 (docs/BACKEND.md §2-3).
 * 이제 슬롯은 DB 에 있고 이미지는 Storage 로 가고 로그인은 Supabase 가 한다 — 그래서 배포한다.
 *
 * 조건이 DEV 가 아니라 "Supabase 가 설정됐나" 인 이유: 환경변수를 빠뜨린 채 배포하면 인증이
 * local 어댑터로 떨어져 **아무나 슬롯을 만들고 지운다.** 그 경우엔 편집기가 아예 없는 편이 맞다.
 *
 * **조건을 쓰는 방식이 까다롭다** — 안 그러면 청크가 빌드에 남는다. 셋 다 이유가 있다:
 *  - `import.meta.env` 를 여기서 직접 읽는다: Vite 가 빌드 때 문자열 리터럴로 치환하므로
 *    조건이 상수로 접힌다. `hasSupabase`(다른 모듈의 const)는 Rollup 이 못 접는다.
 *  - `Boolean(...)` 을 안 쓴다: 전역 함수 호출이라 Rollup 이 상수로 접지 않는다
 *    (누가 `Boolean` 을 덮어썼을 수도 있으니 — 접으면 틀릴 수 있다).
 *  - 라우트가 아니라 여기서 가른다: 라우트에만 걸면 `lazy(import(...))` 가 그대로 평가된다.
 *
 * 셋 중 하나만 어긋나도 **환경변수 없는 빌드에 편집기 코드가 실려 나간다.** 빌드로 확인했다
 * (`VITE_SUPABASE_URL= npx vite build` → OwnerRoutes 청크가 없어야 한다).
 */
const OwnerRoutes =
  (import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY) ||
  import.meta.env.DEV
    ? lazy(() => import('@/owner/OwnerRoutes'))
    : null

/**
 * 럭키드로우 — **방문자에게 내려가는 코드가 서비스마다 다르다.**
 * 타로 슬롯을 여는 사람이 추첨 화면을 받을 이유가 없다 (그 반대도 마찬가지).
 */
const LuckydrawApp = lazy(() => import('@/luckydraw/LuckydrawApp'))

/** 롤링페이퍼 — 방문자가 자기 폰으로 응원 메시지를 남기는 공개 벽 (별도 청크) */
const RollingApp = lazy(() => import('@/rolling/RollingApp'))

/**
 * 슬롯 사용자 앱 셸 — 서비스별로 갈린다 (`src/data/services.ts`).
 *
 * 럭키드로우는 **셸 자체가 다르다**: 탭바도 카드 도감도 없고 화면이 하나뿐이다.
 * 조작 주체도 반대다 — 타로는 방문자가 자기 폰으로 뽑고, 럭키드로우는 부스 태블릿에서
 * 스태프가 뽑는다. 그래서 `Outlet` 을 안 그린다: 이 슬롯엔 하위 화면이 없다.
 */
function SlotLayout() {
  const navigate = useNavigate()
  const state = useSlotState()

  /**
   * **로딩과 "없는 슬롯"을 구분한다.** 둘을 섞으면 슬롯을 읽어오는 동안
   * "페이지를 찾을 수 없어요" 가 번쩍였다가 사라진다 — QR 을 찍은 사람에게 최악의 첫인상이다.
   * 아직 테마를 모르니 그릴 것도 없다. 빈 화면으로 기다린다.
   */
  if (state.status === 'loading') return <div className="app" aria-busy="true" />
  if (state.status === 'missing') return <NotFound />
  const slot = state.slot

  if (getSlotService(slot) === 'luckydraw') return <LuckydrawApp />
  if (getSlotService(slot) === 'rolling') return <RollingApp />

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

          {OwnerRoutes && <Route path="theme-editor/*" element={<OwnerRoutes />} />}

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
