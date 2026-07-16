import { useEffect, useRef, useState } from 'react'

/**
 * 요소가 화면에 들어왔는지. 한 번 들어오면 계속 true (되감기 없음) —
 * 결과 카드는 스크롤로 모습을 드러낼 때 한 번만 뒤집히면 된다.
 *
 * `rootMargin` 으로 트리거 지점을 옮긴다. 아래쪽에 **음수** 값을 주면(예: `'0px 0px -30% 0px'`)
 * 뷰포트 하단을 그만큼 잘라낸 기준으로 판정해서, 요소가 화면에 살짝 걸친 정도로는 안 열리고
 * **더 스크롤해 올라와야** 열린다 — 열리는 모션이 화면 가운데서 제대로 보이게 된다.
 */
export function useInView<T extends HTMLElement>(threshold = 0.35, rootMargin?: string) {
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // 관찰 지원이 없으면 애니메이션 없이 바로 보여준다
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          observer.disconnect()
        }
      },
      { threshold, rootMargin }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [threshold, rootMargin])

  return [ref, inView] as const
}
