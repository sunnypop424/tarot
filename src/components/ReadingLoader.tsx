import { useEffect } from 'react'

import { CrystalBall } from './CrystalBall'
import styles from './ReadingLoader.module.css'
import { useT } from '@/i18n'

/**
 * AI 가 리딩을 쓰는 동안 화면을 통째로 덮는다 — 탭바까지.
 *
 * 결과 화면 한켠에서 돌리지 않고 전면으로 세우는 이유: 이 몇 초가 **리추얼의 절정**이다.
 * 카드를 다 고르고 리더가 그 카드들을 들여다보는 순간이라, 다른 걸 누를 수 있게 두면
 * 그 순간이 로딩으로 격하된다.
 *
 * 흐름: 카드 고르기 → 선택 완료 → **여기** → 뽑은 카드 + 리딩이 함께 등장.
 */
export function ReadingLoader({ label }: { label?: string }) {
  const t = useT()
  // 뒤 화면이 스크롤되면 덮은 의미가 없다
  useEffect(() => {
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = overflow
    }
  }, [])

  return (
    <div className={styles.overlay} data-reading-loader role="dialog" aria-modal="true">
      <CrystalBall label={label} />
      <p className={`t-text-xs ${styles.hint}`}>{t('잠시만요, 카드들을 이어 읽고 있어요')}</p>
    </div>
  )
}
