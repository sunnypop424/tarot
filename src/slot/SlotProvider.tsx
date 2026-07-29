import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useLocation, useParams } from 'react-router-dom'

import { repo } from '@/lib/repo'
import { onSlotChange } from '@/lib/repo/changed'
import { applyTheme, filledTheme } from '@/lib/theme'
import { isLight } from '@/lib/color'
import { useLivePreview } from './preview'
import { applyPwaHead } from './pwa'
import type { PwaArea } from './pwa'
import type { Slot } from '@/types/slot'

/**
 * 다음 방문 때 **첫 페인트 전에** 깔 배경색을 슬러그별로 캐시한다 (index.html 의 인라인 스크립트가 읽는다).
 * 방문자가 QR 로 들어오는 첫 순간엔 색을 모르지만, 홈 화면에 추가해 다시 열거나 새로고침하면
 * 어두운 기본색이 번쩍이지 않고 처음부터 이 슬롯의 배경으로 뜬다. 키·모양은 그 스크립트와 맞춘다.
 */
const THEME_CACHE_PREFIX = 'tarot-pocket:theme:'
function cacheThemeHint(slug: string, slot: Slot) {
  try {
    localStorage.setItem(
      THEME_CACHE_PREFIX + slug,
      JSON.stringify({ canvas: slot.theme.colors.canvas, light: isLight(slot.theme.colors.canvas) })
    )
  } catch {
    /* 저장 실패는 무시 — 캐시는 최적화지 필수가 아니다 */
  }
}

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
  const { pathname } = useLocation()
  const [loaded, setLoaded] = useState<State>({ status: 'loading' })

  /**
   * 편집기 미리보기가 보낸 **초안** — 있으면 저장본 대신 이걸 그린다.
   * 저장 없이 색·형태를 바꿔보라고 있는 자리다 (`slot/preview.ts`).
   */
  const preview = useLivePreview()
  /**
   * **빠진 테마 키를 여기서 채운다.** 손으로(SQL·API) 만든 슬롯은 `theme: {}` 인 경우가 있고,
   * 그러면 `theme.assets.appIcon` 을 읽는 자리에서 **앱이 통째로 죽는다**(하얀 화면).
   * 화면마다 방어하면 새 화면이 늘 때마다 빠뜨리므로, 슬롯이 들어오는 이 자리에서 한 번 채운다.
   */
  const fill = (s: State): State =>
    s.status === 'ready' ? { status: 'ready', slot: { ...s.slot, theme: filledTheme(s.slot.theme) } } : s
  const state: State = fill(preview ? { status: 'ready', slot: preview.slot } : loaded)
  const setState = setLoaded

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
    if (state.status !== 'ready') return
    applyTheme(state.slot.theme)
    /**
     * 다음 방문의 첫 페인트를 위해 배경색을 남겨둔다.
     * **초안일 땐 남기지 않는다** — 저장하지도 않은 색이 방문자의 첫 페인트 캐시에 박히면,
     * 편집기에서 이것저것 해본 흔적이 실제 방문자 화면의 첫 순간에 나타난다.
     */
    if (slug && !preview) cacheThemeHint(slug, state.slot)
  }, [state, slug, preview])

  /**
   * 브라우저 탭 제목을 **행사명**으로 — 방문자가 홈 화면에 추가하면 이 이름이 앱 이름이 된다.
   * index.html 의 정적 'OLUCKY!' 는 슬롯 밖(배포 루트·편집기)에서만 쓰이고,
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

  /**
   * 웹앱 매니페스트 + iOS 메타 — "홈 화면에 추가" 하면 이 이벤트로 열리는 앱이 된다.
   *
   * **보고 있는 영역이 그대로 앱의 첫 화면이 된다.** 스태프가 뽑기 화면을 붙여 두는 게
   * 이 기능의 실제 쓰임인데(랜딩 FAQ 에서 그렇게 권한다), 예전엔 어디서 붙이든 손님 화면이
   * 떴다. 세 갈래뿐이라 경로 첫 마디만 본다 — 화면이 늘어도 관리/스태프 아래에 붙는다.
   *
   * **미리보기(초안)일 땐 심지 않는다** — 편집기 iframe 이 부모의 매니페스트를 갈아치우면 안 된다.
   */
  const sub = pathname.split('/').filter(Boolean)[1]
  const area: PwaArea = sub === 'admin' ? 'admin' : sub === 'staff' ? 'staff' : 'visitor'
  useEffect(() => {
    if (state.status !== 'ready' || preview) return
    return applyPwaHead(state.slot, area)
  }, [state, preview, area])

  return <SlotContext.Provider value={state}>{children}</SlotContext.Provider>
}

/** 슬롯 안에서만 부른다 — 없으면 라우팅이 잘못된 것 */
// eslint-disable-next-line react-refresh/only-export-components
export function useSlot(): Slot {
  const state = useContext(SlotContext)
  if (state.status !== 'ready') throw new Error('useSlot 은 슬롯이 준비된 뒤에만 쓸 수 있어요')
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
