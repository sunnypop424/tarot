import { useEffect, useState } from 'react'

import type { Slot } from '@/types/slot'

/**
 * 편집기 ↔ 미리보기 iframe 사이의 규약.
 *
 * **왜 iframe 인가:** 편집기(`.owner`)는 고정 라이트고 슬롯 앱은 슬롯 테마를 `:root` 에 주입한다.
 * 한 문서에 같이 그리면 두 테마가 같은 커스텀 프로퍼티를 놓고 싸운다. iframe 이 그 격리를 공짜로 준다.
 *
 * **왜 postMessage 인가:** 예전 미리보기는 `저장된` 슬롯을 띄웠다 — 색을 바꿔도 저장을 눌러야
 * 반영됐고, 화면이 "저장하면 반영돼요" 라고 정직하게 말하고 있었다. 초안을 보려면 저장 없이
 * 건너보내야 하는데, iframe 안은 다른 문서라 props 로 못 준다.
 *
 * 원본 빌더는 이 문제를 **미리보기를 따로 구현**해서 풀었다(순수 JS 로 화면을 재현). 그러면
 * 화면을 고칠 때마다 미리보기도 따로 고쳐야 하고 언젠가 어긋난다. 여기서는 **실제 앱이 그대로**
 * 뜨고 초안만 건너간다.
 */

const CHANNEL = 'tarot-pocket:preview'

/** 럭키드로우는 화면이 하나뿐이라 상태를 골라 봐야 한다 (미리보기에서 진짜로 뽑을 순 없다) */
export type PreviewState = 'draw' | 'result' | 'summary'

export interface PreviewPayload {
  slot: Slot
  state: PreviewState
}

/** 편집기 → iframe. 초안이 바뀔 때마다 부른다 */
export function postPreview(frame: HTMLIFrameElement | null, payload: PreviewPayload): void {
  frame?.contentWindow?.postMessage({ channel: CHANNEL, ...payload }, window.location.origin)
}

/**
 * 편집기 쪽에서 iframe 의 "준비됐다" 를 기다린다.
 *
 * 핸드셰이크가 필요한 이유: iframe 의 `load` 이벤트는 문서가 뜬 시점이지 React 가 리스너를
 * 붙인 시점이 아니다. 그 사이에 보낸 첫 초안은 아무도 안 받고 사라져서, **처음 열면 저장본이
 * 보이다가 뭔가 하나 건드려야 초안으로 바뀌는** 이상한 동작이 된다.
 */
export function onPreviewReady(handler: () => void): () => void {
  const listener = (e: MessageEvent) => {
    if (e.origin !== window.location.origin) return
    if (e.data?.channel === CHANNEL && e.data?.ready === true) handler()
  }
  window.addEventListener('message', listener)
  return () => window.removeEventListener('message', listener)
}

/**
 * 앱 쪽 — 편집기가 보낸 초안이 있으면 그걸 쓴다.
 *
 * **편집기 안에 끼워졌을 때만 듣는다** (`window.parent !== window`). 최상위로 열린 앱이
 * 메시지를 받아들이면, 남의 페이지가 우리 앱을 iframe 없이 열어놓고 테마를 갈아끼울 수 있다.
 * origin 도 같이 본다 — 이 둘이 없으면 아무나 보낸 슬롯 데이터를 그리게 된다.
 */
export function useLivePreview(): PreviewPayload | null {
  const [payload, setPayload] = useState<PreviewPayload | null>(null)

  useEffect(() => {
    if (window.parent === window) return

    const listener = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return
      if (e.data?.channel !== CHANNEL || !e.data?.slot) return
      setPayload({ slot: e.data.slot as Slot, state: (e.data.state as PreviewState) ?? 'draw' })
    }

    window.addEventListener('message', listener)
    window.parent.postMessage({ channel: CHANNEL, ready: true }, window.location.origin)

    return () => window.removeEventListener('message', listener)
  }, [])

  return payload
}
