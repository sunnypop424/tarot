import { Sparkles } from 'lucide-react'

import styles from './Synthesis.module.css'

/**
 * 여러 장을 하나의 흐름으로 — "종합" 블록 (M4).
 *
 * 카드가 여러 장일 때 화면은 각 장을 짧게 나열만 한다. 정작 필요한 "그래서 종합하면?"이
 * 이 자리다. 포지션 **순서**(나의 마음 → 상대의 마음 → 관계의 흐름)가 리딩의 흐름이고,
 * 그 사이를 잇는 게 AI 가 하는 일 전부다.
 *
 * 여긴 **보여주기만** 한다 — 생성은 결과 화면에 들어오기 전에 끝나 있다
 * (Draw.tsx: 선택 완료 → 전면 로더 → 카드와 리딩이 함께 등장).
 * 그래서 실패하면 이 블록이 통째로 없다. 카드별 개별 해석은 그대로 남는다 —
 * 카페에서 앱이 멈추면 안 된다.
 */
export function Synthesis({ text }: { text: string }) {
  return (
    <section className={styles.block} data-synthesis>
      <p className={`t-title-s ${styles.head}`}>
        <Sparkles size={16} strokeWidth={2} aria-hidden="true" />
        종합
      </p>
      <p className={`t-body ${styles.text}`}>{text}</p>
    </section>
  )
}
