import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useParams } from 'react-router-dom'

import { getSlot, SLOTS_DRAFT_KEY } from '@/data/slots'
import { applyTheme } from '@/lib/theme'
import type { Slot } from '@/types/slot'

const SlotContext = createContext<Slot | null>(null)

/**
 * 슬롯 컨텍스트 — `/:slug` 아래 모든 화면의 뿌리.
 * 슬러그로 슬롯을 찾아 그 테마를 문서에 주입하고, 하위 화면에 슬롯을 내려준다.
 * 슬롯을 못 찾으면 null 을 내려 상위(App)가 없는 페이지로 처리한다.
 */
export function SlotProvider({ children }: { children: ReactNode }) {
  const { slug } = useParams<{ slug: string }>()
  const [slot, setSlot] = useState<Slot | null>(() => getSlot(slug) ?? null)

  useEffect(() => {
    setSlot(getSlot(slug) ?? null)
  }, [slug])

  /**
   * 테마 편집기가 편집분을 저장하면 다시 읽는다.
   * storage 이벤트는 **다른 브라우징 컨텍스트**에만 오므로, 편집기의 미리보기 iframe 이
   * 정확히 이걸 받는다 — 색을 바꾸면 미리보기가 바로 따라온다.
   */
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === SLOTS_DRAFT_KEY) setSlot(getSlot(slug) ?? null)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [slug])

  useEffect(() => {
    if (slot) applyTheme(slot.theme)
  }, [slot])

  return <SlotContext.Provider value={slot}>{children}</SlotContext.Provider>
}

/** 슬롯 안에서만 부른다 — 없으면 라우팅이 잘못된 것 */
// eslint-disable-next-line react-refresh/only-export-components
export function useSlot(): Slot {
  const slot = useContext(SlotContext)
  if (!slot) throw new Error('useSlot 은 SlotProvider 안에서만 쓸 수 있습니다')
  return slot
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSlotOrNull(): Slot | null {
  return useContext(SlotContext)
}
