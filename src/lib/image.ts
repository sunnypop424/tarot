import { useEffect, useState } from 'react'

/**
 * 슬롯 이미지는 전부 `background-image` 로 그린다 — `<img>` 는 쓰지 않는다.
 *
 * 모바일에서 `<img>` 는 길게 누르면 "이미지 저장" 이 뜬다. 슬롯에 올라가는 로고·카드 앞면은
 * 주최자가 돈 주고 만든 이벤트 자산이라 그 메뉴가 뜨면 안 된다. 배경 이미지는 그 대상이 아니다.
 * (완전한 보호는 아니다 — 개발자도구로는 언제든 꺼낼 수 있다. 카페에서 손가락으로 저장되는 것만 막는다.)
 *
 * 대신 `<img>` 가 공짜로 주던 두 가지를 여기서 대신한다:
 *  - `onError` 폴백 (이미지 없는 이벤트는 텍스트로 나가야 한다)
 *  - 원본 비율 (로고는 높이만 정하고 폭이 auto 였다)
 */

/** CSS `url()` 로 감싼다. encodeURI 가 따옴표를 %22 로 바꿔 style 주입을 막는다 */
export function cssUrl(src: string): string {
  return `url("${encodeURI(src)}")`
}

export interface ImageAsset {
  status: 'loading' | 'ok' | 'failed'
  /** 가로 / 세로 — 로드 전엔 1 */
  ratio: number
}

/**
 * 이미지 로드 상태와 비율을 미리 재본다.
 * 브라우저가 같은 URL 을 캐시하므로 background-image 가 다시 받아오지는 않는다.
 */
export function useImageAsset(src: string | null): ImageAsset {
  const [asset, setAsset] = useState<ImageAsset>({ status: src ? 'loading' : 'failed', ratio: 1 })

  useEffect(() => {
    if (!src) {
      setAsset({ status: 'failed', ratio: 1 })
      return
    }

    setAsset({ status: 'loading', ratio: 1 })
    let alive = true
    const probe = new Image()
    probe.onload = () => {
      if (!alive) return
      setAsset({
        status: 'ok',
        ratio: probe.naturalHeight ? probe.naturalWidth / probe.naturalHeight : 1,
      })
    }
    probe.onerror = () => alive && setAsset({ status: 'failed', ratio: 1 })
    probe.src = src

    return () => {
      alive = false
    }
  }, [src])

  return asset
}
