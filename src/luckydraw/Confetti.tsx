import { useMemo } from 'react'

import styles from './Luckydraw.module.css'

const PIECES = 28

/**
 * 컨페티 — **의존성을 더하지 않는다.**
 *
 * 원본은 `react-confetti`(캔버스)를 썼지만, 이 앱은 초기 번들 예산이 150KB 고
 * (PLANNING.md §7) 카페 대기줄에서 그만큼 더 기다리게 된다. 조각 28개를 CSS 로 떨어뜨리는
 * 것으로 같은 순간을 만들 수 있다 — 정확한 물리가 필요한 화면이 아니다.
 *
 * 색은 테마에서 가져온다 (hex 를 tokens.css 밖에 두지 않는다).
 */
export function Confetti() {
  /**
   * 조각의 위치·기울기는 **한 번만** 뽑는다. 렌더마다 새로 뽑으면 부모가 리렌더될 때
   * (긁는 중에도 상태가 바뀐다) 조각들이 순간이동한다.
   */
  const pieces = useMemo(
    () =>
      Array.from({ length: PIECES }, (_, i) => ({
        left: Math.random() * 100,
        drift: (Math.random() - 0.5) * 280,
        delay: Math.random() * 0.2,
        tone: i % 3,
      })),
    []
  )

  return (
    <div className={styles.confetti} aria-hidden="true">
      {pieces.map((p, i) => (
        <span
          key={i}
          className={styles.confettiPiece}
          data-tone={p.tone}
          style={{
            left: `${p.left}%`,
            animationDelay: `${p.delay}s`,
            ['--drift' as string]: `${p.drift}px`,
          }}
        />
      ))}
    </div>
  )
}
