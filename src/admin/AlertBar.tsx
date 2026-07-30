import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { loadAlerts, type Alert } from './alerts'
import { useVisibleInterval } from './useVisibleInterval'
import type { ServiceId } from '@/data/services'
import type { Slot } from '@/types/slot'

/**
 * 알림 줄 — **관리 셸 전체에 뜬다** (대시보드가 아니라 `AdminLayout` 이 그린다).
 *
 * 대시보드에만 두면 문항을 고치거나 배송을 보는 동안에는 안 보인다. 재고 소진·리허설처럼
 * "지금 손대야 하는 것" 은 어느 화면에 있든 눈에 들어와야 한다.
 *
 * **주기 갱신은 여기 하나뿐이다.** 대시보드도 자기 숫자를 주기로 다시 읽는데(`useAutoReload`),
 * 알림까지 거기서 세면 같은 조회가 두 벌 돈다 — 셸이 한 번 읽어 컨텍스트로 나눠 준다.
 */

const REFRESH_MS = 60_000

interface AlertState {
  alerts: Alert[]
  /** 처음 한 번은 아직 모른다 — 0건과 구분해야 배지를 안 깜빡인다 */
  loaded: boolean
  reload: () => void
}

const Ctx = createContext<AlertState>({ alerts: [], loaded: false, reload: () => {} })

export const useAlerts = () => useContext(Ctx)

export function AlertProvider({
  slot,
  service,
  children,
}: {
  slot: Slot
  service: ServiceId
  children: React.ReactNode
}) {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loaded, setLoaded] = useState(false)

  const reload = useCallback(() => {
    void loadAlerts(slot, service)
      .then((next) => {
        setAlerts(next)
        setLoaded(true)
      })
      // 알림을 못 읽었다고 관리 화면이 막히면 안 된다 — 조용히 지금 것을 유지한다
      .catch(() => setLoaded(true))
  }, [slot, service])

  useEffect(reload, [reload])
  useVisibleInterval(reload, REFRESH_MS)

  return <Ctx.Provider value={{ alerts, loaded, reload }}>{children}</Ctx.Provider>
}

/** 급한 순서대로 색을 고른다 — `organizer.css` 의 배너 톤을 그대로 쓴다 */
const TONE: Record<Alert['level'], string> = {
  urgent: 'ad-banner--err',
  warn: 'ad-banner--warn',
  info: 'ad-banner--info',
}

export function AlertBar({ slug }: { slug: string }) {
  const { alerts } = useAlerts()
  if (alerts.length === 0) return null

  return (
    <div className="ad-alerts" data-alerts role="status" aria-live="polite">
      {alerts.map((a) => (
        <div key={a.id} className={`ad-banner ${TONE[a.level]} ad-alert`} data-level={a.level}>
          <span className="ad-alert__text">{a.text}</span>
          {/*
            * 링크는 **고칠 수 있는 화면**으로만 건다. 기한 알림처럼 손댈 자리가 없는 건
            * 문장만 남긴다 — 눌러도 아무것도 못 하는 링크는 알림을 못 미덥게 만든다.
            */}
          {a.to && (
            <Link className="ad-alert__go" to={`/${slug}/admin/${a.to}`}>
              고치러 가기 →
            </Link>
          )}
        </div>
      ))}
    </div>
  )
}
