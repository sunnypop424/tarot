import { useEffect, useRef } from 'react'

/**
 * 주기 갱신 — **탭이 숨겨지면 멈춘다.**
 *
 * 부스 태블릿은 관리 화면을 띄운 채 하루를 난다. 뒤로 넘어간 탭에서 계속 도는 조회는
 * 그대로 데이터 요금이고 서버 부하다. 다시 보이면 **그 자리에서 한 번** 읽고 다시 돈다 —
 * 돌아왔을 때 낡은 숫자를 보는 게 안 도는 것보다 나쁘다.
 *
 * `fn` 은 ref 로 든다: 부르는 쪽이 매 렌더 새 함수를 넘겨도 타이머를 다시 걸지 않는다
 * (다시 걸면 주기가 리셋돼 영영 안 도는 화면이 된다).
 */
export function useVisibleInterval(fn: () => void, ms: number) {
  const saved = useRef(fn)
  saved.current = fn

  useEffect(() => {
    let timer = 0
    const stop = () => {
      if (timer) window.clearInterval(timer)
      timer = 0
    }
    const start = () => {
      stop()
      timer = window.setInterval(() => saved.current(), ms)
    }
    const onVisible = () => {
      if (document.hidden) return stop()
      saved.current()
      start()
    }
    if (!document.hidden) start()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [ms])
}
