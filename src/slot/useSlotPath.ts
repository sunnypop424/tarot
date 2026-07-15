import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

import { useSlot } from './SlotProvider'

/**
 * 슬롯 경로 헬퍼.
 * 배포 하나에 여러 이벤트가 얹히므로 모든 내부 링크는 `/{slug}/...` 여야 한다 —
 * 루트 절대경로(`/fortune`)를 쓰면 슬롯 밖으로 나가 버린다.
 */
export function useSlotPath() {
  const { slug } = useSlot()
  const navigate = useNavigate()

  /** `/{slug}/fortune` 처럼 조립. to 가 '' 이면 슬롯 홈 */
  const path = useCallback((to = '') => `/${slug}${to ? `/${to}` : ''}`, [slug])

  const go = useCallback((to = '') => navigate(path(to)), [navigate, path])

  return { path, go, slug }
}
