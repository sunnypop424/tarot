import { lazy, Suspense, useEffect } from 'react'
import type { ComponentType } from 'react'
import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom'

import { SlotProvider, useSlotState } from '@/slot/SlotProvider'
import { getSlotService } from '@/data/services'
import type { ServiceId } from '@/data/services'
import { isSlotExpired } from '@/data/slots'
import { LangProvider, useLang } from '@/i18n'
import { QuestionsProvider } from '@/lib/questions'
import { LangBar } from '@/components/LangBar'
import { TabBar } from '@/components/TabBar'
import { TopNav } from '@/components/TopNav'
import { Home } from '@/screens/Home'
import { Fortune } from '@/screens/Fortune'
import { Draw } from '@/screens/Draw'
import { Question } from '@/screens/Question'
import { Cards } from '@/screens/Cards'
import { CardDetail } from '@/screens/CardDetail'
import { Ended } from '@/screens/Ended'
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

/** 포토존 — 카메라·캔버스 합성이 들어가 무겁다. 타로 방문자에게 내릴 이유가 없다 */
const PhotozoneApp = lazy(() => import('@/photozone/PhotozoneApp'))

/** 소원나무 — 롤페와 **데이터는 같고 화면만 다르다** (src/data/wish.ts) */
const WishApp = lazy(() => import('@/wish/WishApp'))

/** 실시간 투표 — 집계가 실시간으로 흐른다 (별도 청크) */
const PollApp = lazy(() => import('@/poll/PollApp'))

/** 방문 스탬프 — 현장 암호로 도장을 모은다 (별도 청크) */
const StampApp = lazy(() => import('@/stamp/StampApp'))

/** 최애 모의고사 — 칭호 카드를 캔버스로 그린다 (compose.ts 를 함께 끌고 온다) */
const QuizApp = lazy(() => import('@/quiz/QuizApp'))

/** 포토카드 뽑기 — 운영 방식 셋이 한 청크에 (src/data/photocard.ts 의 photocardRules) */
const PhotocardApp = lazy(() => import('@/photocard/PhotocardApp'))

/** 영상회 응원 — 입력·오버레이·엔딩크레딧이 한 청크에 (상영 화면은 주소로 가른다) */
const CheerApp = lazy(() => import('@/cheer/CheerApp'))

/**
 * 스태프 기기 — `/{slug}/staff`. **관리 화면 밖이다**: 부스에 세워두는 기기에 사이드바·
 * 로그아웃이 같이 떠 있으면 방문자가 누르고, 방문자가 같이 보는 화면이라 슬롯 색을 써야 한다.
 *
 * 서비스마다 스태프가 하는 일이 달라(뽑기 / 교환 확인) 그 분기는 `staff/StaffApp.tsx` 가 한다.
 */
const StaffApp = lazy(() => import('@/staff/StaffApp'))

/** 배포 루트 랜딩 — 슬롯 밖 화면이라 슬롯 테마를 안 쓴다 (편집기·관리와 같은 판단) */
const Landing = lazy(() => import('@/landing/Landing'))

/**
 * 서비스별 방문자 앱 — **`Record` 라 모든 서비스가 필수다.**
 *
 * 삼항 체인(`if (service === 'luckydraw') …`)이었을 땐 `SERVICES` 에 새 서비스를 넣어도
 * 여기가 아무 말 없이 통과하고 그 슬롯이 **조용히 타로 셸로 떨어졌다.** `ServiceId` 는
 * `as const` 로 자동 확장되는데 소비처가 그 확장을 강제받지 않는 게 원인이다.
 * `Record` 는 키가 전부 필수라, 서비스를 추가하는 순간 여기가 컴파일 에러로 터진다.
 *
 * `tarot: null` = "전용 앱이 없다 — 아래 기본 셸(탭바 + Outlet)을 쓴다".
 * 나머지는 **셸 자체가 다르다**: 탭바도 도감도 없고 `Outlet` 을 안 그린다(하위 화면이 없다).
 * 하위 페이지가 필요하면 각 앱이 `useLocation()` 으로 자체 분기한다 (롤페 `/write`).
 */
const SERVICE_APPS: Record<ServiceId, ComponentType | null> = {
  tarot: null,
  luckydraw: LuckydrawApp,
  rolling: RollingApp,
  photozone: PhotozoneApp,
  wish: WishApp,
  poll: PollApp,
  stamp: StampApp,
  quiz: QuizApp,
  photocard: PhotocardApp,
  cheer: CheerApp,
}

/**
 * 슬롯 사용자 앱 셸 — 서비스별로 갈린다 (`src/data/services.ts`).
 *
 * 조작 주체가 서비스마다 다르다 — 타로·롤링페이퍼는 방문자가 자기 폰으로,
 * 럭키드로우는 부스 태블릿에서 스태프가 만진다.
 */
function SlotLayout() {
  const state = useSlotState()

  /**
   * **로딩과 "없는 슬롯"을 구분한다.** 둘을 섞으면 슬롯을 읽어오는 동안
   * "페이지를 찾을 수 없어요" 가 번쩍였다가 사라진다 — QR 을 찍은 사람에게 최악의 첫인상이다.
   * 아직 테마를 모르니 그릴 것도 없다. 빈 화면으로 기다린다.
   */
  if (state.status === 'loading') return <div className="app" aria-busy="true" />
  if (state.status === 'missing') return <NotFound />
  const slot = state.slot

  /**
   * **종료된 행사는 방문자에게 닫는다.**
   *
   * DB 는 종료 뒤에도 14일 더 슬롯을 읽게 해준다 (`slot_grace_days` — 주최자가 자료를 꺼내고
   * 남은 선물을 건네는 시간이다). 쓰기는 `slot_open` 이 막으니 글이 남거나 도장이 찍히진 않는데,
   * **읽기만으로 완전히 도는 서비스가 있다**: 타로 뽑기·포토존 합성은 서버에 아무것도 안 쓴다.
   * 그러면 유예가 그대로 대여 연장이 된다.
   *
   * 그래서 여기서 한 번 더 판정한다. **`SlotLayout` 안이라 방문자 화면에만 걸린다** —
   * 관리(`/admin`)·스태프(`/staff`)는 형제 라우트라 유예 동안 그대로 열려 있다.
   */
  if (isSlotExpired(slot)) return <Ended name={slot.name} />

  const ServiceApp = SERVICE_APPS[getSlotService(slot)]
  if (ServiceApp) return <ServiceApp />

  return (
    <QuestionsProvider>
      <div className="app">
        {/* 데스크톱: 상단 네비 (모바일에선 CSS 로 숨김). 모바일 도감은 하단 탭바에 있다 */}
        <TopNav />

        <main className="app__scroll">
          {/*
            * 타로만 셸이 다르다 — 상단 네비가 **데스크톱 전용**이라 폰에서는 고르개가
            * 안 보였다. 스크롤 안 맨 위에 두면 넓은 화면에서도 네비의 고르개와 안 겹친다
            * (`LangBar` 가 `.topnav` 처럼 숨지 않으므로 CSS 로 하나만 남긴다).
            */}
          <LangBar className="langbar--mobile" />
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
      <SlotDefaultLang />
      <Outlet />
    </SlotProvider>
  )
}

/**
 * 슬롯이 정한 **기본 언어**를 처음 한 번 적용한다 (`slot.defaultLang`).
 *
 * `LangProvider` 는 `SlotProvider` **바깥**에 있어서(앱 전체가 한 언어를 쓴다) 슬롯을 모른다.
 * 그래서 슬롯이 읽힌 뒤에 안쪽에서 알려 준다 — 아무것도 안 그리는 부품이 하나 필요한 이유다.
 *
 * **방문자가 한 번이라도 고르면 그쪽이 이긴다** (`applyDefault` 가 저장된 선택을 먼저 본다).
 */
function SlotDefaultLang() {
  const state = useSlotState()
  const { applyDefault } = useLang()
  const slot = state.status === 'ready' ? state.slot : null

  useEffect(() => {
    if (slot) applyDefault(slot.defaultLang, slot.langs)
  }, [slot, applyDefault])

  return null
}

export function App() {
  return (
    <LangProvider>
      <BrowserRouter>
        <Suspense fallback={null}>
        <Routes>
          {/*
            * 배포 루트는 **랜딩**이다 — 파는 물건을 소개하고 체험 슬롯으로 보낸다.
            * **슬롯 목록은 여기 없다** (CLAUDE.md): 뜨는 주소는 전부 `/demo-*` 체험 슬롯이다.
            */}
          <Route index element={<Landing />} />

          {OwnerRoutes && <Route path="theme-editor/*" element={<OwnerRoutes />} />}

          <Route path=":slug" element={<SlotScope />}>
            {/* 주최자 관리 — 자기 슬롯만 */}
            <Route path="admin/*" element={<AdminRoutes />} />

            {/* 스태프 기기 — 관리 셸(사이드바) 없이 전체화면. 로그인 확인은 화면 안에서 한다 */}
            {StaffApp && <Route path="staff" element={<StaffApp />} />}

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
    </LangProvider>
  )
}
