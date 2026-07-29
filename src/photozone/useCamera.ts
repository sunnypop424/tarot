import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * 카메라 스트림 — 포토존의 유일한 신규 브라우저 API.
 *
 * **실패를 세 가지로 구분해 말한다.** "카메라를 쓸 수 없어요" 하나로 뭉뚱그리면 방문자는 뭘
 * 해야 할지 모른다. 권한을 거부한 사람은 다시 허용하면 되고, 비-secure origin 은 방문자가
 * 할 수 있는 게 없다(주최자에게 알려야 한다). **어느 쪽이든 업로드로 떨어질 수 있어야 한다** —
 * 막다른 골목이 되면 카페에서 그 방문자는 그냥 나간다.
 */
export type CameraError =
  /** `navigator.mediaDevices` 자체가 없다 — 대개 http 로 열었다 (localhost 제외) */
  | 'insecure'
  /** 사용자가 권한을 거부했다 */
  | 'denied'
  /** 카메라가 달려 있지 않다 */
  | 'missing'
  /** 다른 앱이 점유 중이거나 알 수 없는 실패 */
  | 'busy'

export interface CameraState {
  stream: MediaStream | null
  error: CameraError | null
  /** 요청은 했고 아직 답을 못 받은 상태 (권한 팝업이 떠 있는 동안) */
  starting: boolean
}

export const CAMERA_MESSAGE: Record<CameraError, string> = {
  insecure: '이 주소에서는 카메라를 쓸 수 없어요. 사진을 올려서 만들어 주세요.',
  denied: '카메라 권한이 꺼져 있어요. 허용하거나, 사진을 올려서 만들 수 있어요.',
  missing: '이 기기에 쓸 수 있는 카메라가 없어요. 사진을 올려 주세요.',
  busy: '카메라를 열지 못했어요. 다른 앱에서 쓰고 있는지 확인하거나, 사진을 올려 주세요.',
}

function classify(e: unknown): CameraError {
  if (!(e instanceof Error)) return 'busy'
  // DOMException.name 이 표준이다 — message 는 브라우저마다 다르다
  if (e.name === 'NotAllowedError' || e.name === 'SecurityError') return 'denied'
  if (e.name === 'NotFoundError' || e.name === 'OverconstrainedError') return 'missing'
  return 'busy'
}

/**
 * `active` 가 true 인 동안만 스트림을 연다.
 *
 * **끄는 걸 확실히 하는 게 이 훅의 절반이다.** `track.stop()` 을 빠뜨리면 결과 화면으로
 * 넘어가거나 화면을 떠난 뒤에도 **카메라 표시등이 계속 켜져 있다.** 카페에서 그건 즉시
 * 항의로 돌아온다 — 방문자 입장에선 몰래 찍히고 있는 것처럼 보인다.
 */
export function useCamera(active: boolean, facing: 'user' | 'environment'): CameraState {
  const [state, setState] = useState<CameraState>({ stream: null, error: null, starting: false })
  // 정리를 state 가 아니라 ref 로 잡는다 — 언마운트 시점의 최신 스트림을 확실히 잡기 위해
  const current = useRef<MediaStream | null>(null)

  const stop = useCallback(() => {
    current.current?.getTracks().forEach((t) => t.stop())
    current.current = null
  }, [])

  useEffect(() => {
    if (!active) {
      stop()
      setState({ stream: null, error: null, starting: false })
      return
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setState({ stream: null, error: 'insecure', starting: false })
      return
    }

    let alive = true
    setState({ stream: null, error: null, starting: true })

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: facing }, audio: false })
      .then((s) => {
        // 그 사이 화면을 떠났으면 **받자마자 끈다** — 안 그러면 표시등만 켜진 유령 스트림이 남는다
        if (!alive) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        current.current = s
        setState({ stream: s, error: null, starting: false })
      })
      .catch((e) => {
        if (alive) setState({ stream: null, error: classify(e), starting: false })
      })

    return () => {
      alive = false
      stop()
    }
  }, [active, facing, stop])

  // 언마운트 보험 — 위 effect 의 정리와 겹쳐도 stop() 은 여러 번 불러도 안전하다
  useEffect(() => stop, [stop])

  return state
}
