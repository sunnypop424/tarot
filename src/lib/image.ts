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
 *
 * ── 예외는 하나뿐이다 ──
 * 방문자가 **획득·합성한 결과물**(포토존 인증샷·뽑은 포토카드·칭호 카드)은 저장되는 게 목적이라
 * `<img>` 로 그린다. 예외는 `src/components/SavableImage.tsx` 한 곳이고, 받는 값이
 * `src/lib/compose.ts` 만 만들 수 있는 `ResultImage` 라 **슬롯 자산 URL 은 넣을 수 없다**
 * (타입 에러가 난다). 여기 `useImageAsset` 이 다루는 대상은 예외가 아니다.
 *
 * ⚠ **`useImageAsset` 이 로드한 이미지를 `drawImage` 하면 안 된다.** 이 프로브는 `crossOrigin`
 * 을 안 걸어서, 그 이미지를 캔버스에 그리면 캔버스가 오염되고 `toBlob` 이 터진다 —
 * 화면엔 멀쩡히 보이다가 저장 순간에만 죽는다. 캔버스에 그릴 이미지는 `compose.loadForCanvas`.
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
