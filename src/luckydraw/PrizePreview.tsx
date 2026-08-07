import { createPortal } from 'react-dom'
import { Gift } from 'lucide-react'

import styles from './Luckydraw.module.css'
import { useT, useLang } from '@/i18n'
import { pick, type I18nText } from '@/data/multilingual'

interface PreviewPrize {
  rank: number
  name: string
  /** 주최자가 언어별로 적은 이름 — 없으면 `name` (`src/data/multilingual.ts`) */
  nameI18n?: I18nText
  remaining: number
  requiresShipping: boolean
}

interface Props {
  prizes: PreviewPrize[]
  /** 남은 수량을 보여줄지 (주최자 설정 showPrizeCount) */
  showCount: boolean
  /** 골드로 강조할 등수 (긁는 등수) — 시각 강조만, 값은 슬롯 테마색으로 파생 */
  highlightRanks: number[]
  /**
   * '상품명만'(`displayMode`) 슬롯 — **등수 배지를 뺀다.**
   *
   * 당첨 화면에서 감춘 등수가 뽑기 **전** 목록에 그대로 있으면, 방문자는 뽑기도 전에
   * 등수 체계를 다 본다 — 감춘 의미가 없다. 강조(`highlightRanks`)는 그대로 둔다:
   * 그건 등수를 알려주는 게 아니라 "이건 특별한 상품" 이라는 **색 신호**다.
   */
  hideRank?: boolean
  onClose: () => void
}

/**
 * 경품 미리보기 — **뽑기 전에 어떤 상품이 있는지** 보여준다.
 *
 * 방문자가 "뭐가 있는지도 모르고 뽑는" 답답함을 던다. 노출 여부·수량 표기는 주최자가 운영 설정에서
 * 켜고 끈다(스포일러가 싫은 행사, 수량이 민망한 행사가 있다). 색·형태는 전부 슬롯 테마 토큰.
 */
export function PrizePreview({
  prizes,
  showCount,
  highlightRanks,
  hideRank = false,
  onClose,
}: Props) {
  const t = useT()
  const { lang } = useLang()
  return createPortal(
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={t('경품 미리보기')}
      onClick={onClose}
    >
      <div className={styles.previewBody} onClick={(e) => e.stopPropagation()}>
        <div className={styles.previewHead}>
          <span className={styles.previewIcon}>
            <Gift size={18} aria-hidden="true" />
          </span>
          <div>
            <h2 className={styles.previewTitle}>{t('준비된 경품')}</h2>
            <p className={styles.previewSub}>{t('이런 경품들을 준비했어요.')}</p>
          </div>
        </div>

        <ul className={styles.prizeList}>
          {prizes.map((p) => (
            <li
              key={`${p.rank}-${p.name}`}
              className={styles.prizeRow}
              data-high={highlightRanks.includes(p.rank) || undefined}
            >
              {!hideRank && (
                <span
                  className={styles.prizeBadge}
                  data-high={highlightRanks.includes(p.rank) || undefined}
                >
                  {t('{n}등', { n: p.rank })}
                </span>
              )}
              {/* 경품 이름은 주최자가 쓴 말 — 언어별로 적었으면 그걸, 아니면 원문 */}
              <span className={styles.prizeName}>{pick(p.name, p.nameI18n, lang)}</span>
              {showCount && <span className={styles.prizeCount}>{t('{n}개', { n: p.remaining })}</span>}
            </li>
          ))}
        </ul>

        <button type="button" className="btn btn--primary btn--block" onClick={onClose}>
          {t('닫기')}
        </button>
      </div>
    </div>,
    document.body
  )
}
