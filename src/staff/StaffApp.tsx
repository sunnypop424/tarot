import { lazy, Suspense } from 'react'

import { useSlotState } from '@/slot/SlotProvider'
import { getSlotService, type ServiceId } from '@/data/services'
import { RedeemStaff } from './RedeemStaff'
import { ShowStaff } from './ShowStaff'
import styles from './Staff.module.css'

/**
 * 스태프 기기 — `/{slug}/staff`. **서비스마다 스태프가 하는 일이 다르다.**
 *
 *  · 포토카드 — 뽑는다 (판매 N연차 · 1장 증정은 뽑기권 번호)
 *  · 스탬프 · 모의고사 — 교환권을 확인한다 (같은 화면, `source` 만 다르다)
 *  · 나머지 — 스태프가 기기 앞에서 할 일이 없다
 *
 * **관리 화면 밖에 있는 이유**는 어느 서비스든 같다: 부스에 세워두는 기기에 관리 사이드바가
 * 뜨면 방문자가 누른다. 그리고 방문자가 같이 보는 화면이라 관리 도구의 고정 라이트가 아니라
 * 슬롯 색을 쓴다.
 *
 * `Record<ServiceId, …>` 라 서비스가 늘면 여기가 컴파일 에러로 터진다 — 새 서비스가 조용히
 * "스태프 화면 없음" 으로 떨어지는 게 아니라, 있는지 없는지를 한 번 정하게 만든다.
 */
const PhotocardStaff = lazy(() => import('@/photocard/StaffApp'))

type StaffKind = 'photocard' | 'redeem' | 'show' | null

const STAFF_KIND: Record<ServiceId, StaffKind> = {
  tarot: null,
  // 럭키드로우는 방문자 화면 자체가 스태프 화면이다 (`/{slug}` 에서 뽑는다)
  luckydraw: null,
  rolling: null,
  wish: null,
  photozone: null,
  poll: null,
  stamp: 'redeem',
  quiz: 'redeem',
  photocard: 'photocard',
  // 상영 제어 — 프로젝터 옆에 선 사람이 폰으로 누른다 (0031)
  cheer: 'show',
}

export default function StaffApp() {
  const state = useSlotState()
  if (state.status === 'loading') return <div className="app" aria-busy="true" />
  if (state.status === 'missing') return null

  const kind = STAFF_KIND[getSlotService(state.slot)]

  if (kind === 'photocard') {
    return (
      <Suspense fallback={<div className="app" aria-busy="true" />}>
        <PhotocardStaff />
      </Suspense>
    )
  }
  if (kind === 'redeem') return <RedeemStaff slot={state.slot} />
  if (kind === 'show') return <ShowStaff slot={state.slot} />

  return (
    <div className={`app ${styles.app}`}>
      <main className={styles.stage}>
        <div className={`surface ${styles.panel}`}>
          <div className={styles.center}>
            <div className={styles.centerTitle}>이 이벤트에는 스태프 화면이 없어요</div>
            <p className={styles.centerBody}>
              스태프가 기기 앞에서 할 일이 있는 서비스에서만 쓰는 화면이에요
              (포토카드 뽑기 · 스탬프 · 모의고사).
            </p>
          </div>
        </div>
        <a className={styles.adminLink} href={`/${state.slot.slug}/admin`}>
          관리자 페이지로 이동
        </a>
      </main>
    </div>
  )
}
