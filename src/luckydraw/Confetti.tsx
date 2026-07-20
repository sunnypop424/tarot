import { useMemo } from 'react'

import styles from './Luckydraw.module.css'

/**
 * 조각 수와 지속 시간.
 *
 * 처음엔 28조각 1.6초였는데 **"터지다 마는" 느낌**이 났다 — 화면 폭에 비해 조각이 성기고,
 * 위에서 시작한 조각이 눈에 들어오기도 전에 사라졌다. 축하는 짧아도 **끝맺음이 보여야** 한다.
 * 조각을 늘리고, 떨어지는 시간을 늘리고, 시작 시차를 벌려 물결처럼 이어지게 했다.
 */
const PIECES = 70

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
        drift: (Math.random() - 0.5) * 320,
        // 시차를 넓게 — 한꺼번에 떨어지면 한 번 번쩍이고 끝난다
        delay: Math.random() * 1.1,
        // 조각마다 낙하 속도가 달라야 뭉치지 않는다
        duration: 2.4 + Math.random() * 1.4,
        spin: Math.random() > 0.5 ? 720 : -540,
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
            animationDuration: `${p.duration}s`,
            ['--drift' as string]: `${p.drift}px`,
            ['--spin' as string]: `${p.spin}deg`,
          }}
        />
      ))}
    </div>
  )
}
