import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useParams } from 'react-router-dom'

import { repo } from '@/lib/repo'
import { onSlotChange } from '@/lib/repo/changed'
import { applyTheme } from '@/lib/theme'
import type { Slot } from '@/types/slot'

type State =
  /** 아직 못 읽었다 — "없는 슬롯"과 구분해야 한다 (섞으면 로딩 중에 404 가 번쩍인다) */
  | { status: 'loading' }
  | { status: 'ready'; slot: Slot }
  | { status: 'missing' }

const SlotContext = createContext<State>({ status: 'loading' })

/**
 * 슬롯 컨텍스트 — `/:slug` 아래 모든 화면의 뿌리.
 * 슬러그로 슬롯을 찾아 그 테마를 문서에 주입하고, 하위 화면에 슬롯을 내려준다.
 *
 * **읽기가 비동기다.** 슬롯이 DB 에 있어서, 방문자가 QR 을 찍으면 여기서 한 번 왕복한다.
 * 그동안 화면은 비어 있고(테마를 모르니 그릴 수도 없다), 실패하면 번들된 씨앗으로 연다
 * (`repo.slots.get` 의 폴백 — 카페 와이파이가 흔들려도 이미 배포된 이벤트는 열려야 한다).
 */
export function SlotProvider({ children }: { children: ReactNode }) {
  const { slug } = useParams<{ slug: string }>()
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    if (!slug) {
      setState({ status: 'missing' })
      return
    }

    let alive = true
    const load = async () => {
      try {
        const slot = await repo.slots.get(slug)
        if (alive) setState(slot ? { status: 'ready', slot } : { status: 'missing' })
      } catch {
        // get 이 자체 폴백을 갖고 있어 여기까지 오는 건 진짜 없는 경우다
        if (alive) setState({ status: 'missing' })
      }
    }
    void load()

    /**
     * 편집기가 저장하면 다시 읽는다 — 편집기의 미리보기 iframe 이 이걸 받는다.
     * **저장소가 어디든 똑같이 온다** (`repo/changed.ts`) — 여기는 어댑터를 몰라야 한다.
     */
    const off = onSlotChange((changed) => {
      if (changed === slug) void load()
    })
    return () => {
      alive = false
      off()
    }
  }, [slug])

  useEffect(() => {
    if (state.status === 'ready') applyTheme(state.slot.theme)
  }, [state])

  /**
   * 브라우저 탭 제목을 **행사명**으로 — 방문자가 홈 화면에 추가하면 이 이름이 앱 이름이 된다.
   * index.html 의 정적 '타로 포켓' 은 슬롯 밖(배포 루트·편집기)에서만 쓰이고,
   * 슬롯을 벗어나면 되돌린다 (다른 슬롯의 이름이 남아 있으면 안 된다).
   */
  useEffect(() => {
    if (state.status !== 'ready') return
    const before = document.title
    document.title = state.slot.name
    return () => {
      document.title = before
    }
  }, [state])

  return <SlotContext.Provider value={state}>{children}</SlotContext.Provider>
}

/** 슬롯 안에서만 부른다 — 없으면 라우팅이 잘못된 것 */
// eslint-disable-next-line react-refresh/only-export-components
export function useSlot(): Slot {
  const state = useContext(SlotContext)
  if (state.status !== 'ready') throw new Error('useSlot 은 슬롯이 준비된 뒤에만 쓸 수 있습니다')
  return state.slot
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSlotOrNull(): Slot | null {
  const state = useContext(SlotContext)
  return state.status === 'ready' ? state.slot : null
}

/** 로딩과 "없는 슬롯"을 구분해야 하는 곳(라우팅 셸)에서 쓴다 */
// eslint-disable-next-line react-refresh/only-export-components
export function useSlotState(): State {
  return useContext(SlotContext)
}
