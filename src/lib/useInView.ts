import { useEffect, useRef, useState } from 'react'

/**
 * 요소가 화면에 들어왔는지. 한 번 들어오면 계속 true (되감기 없음) —
 * 결과 카드는 스크롤로 모습을 드러낼 때 한 번만 뒤집히면 된다.
 */
export function useInView<T extends HTMLElement>(threshold = 0.35) {
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
      { threshold }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [threshold])

  return [ref, inView] as const
}
