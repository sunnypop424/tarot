import { Minus, Plus } from 'lucide-react'

import { countPresets } from '@/data/countPicker'
import styles from './CountPicker.module.css'
import { useT } from '@/i18n'

/**
 * 수량 고르기 — **럭키드로우와 포토카드가 같이 쓴다.**
 *
 * 두 서비스가 같은 묶음(`− 숫자 +` 스테퍼 · `1·5·10` 프리셋 · 큰 실행 버튼)을 각자 그리고
 * 있었다. 화면도 다루는 값도 같은데 마크업이 두 벌이라, 이미 프리셋 숫자가 갈라져 있었다
 * (럭드 1·5·10 vs 포토카드 1·3·5·10). 여기 하나로 모으고 **프리셋은 1·5·10 으로 통일**한다.
 *
 * **색은 이 파일이 안 정한다.** 전부 `--cp-*` 커스텀 프로퍼티로 들어오고, 부르는 쪽이
 * `pickerVars()` 로 얹는다 (`src/data/countPicker.ts`) — 슬롯마다 색이 갈아끼워지므로.
 */
export function CountPicker({
  count,
  max,
  onCount,
  onGo,
  label,
  goLabel,
  busy,
  disabled,
  className,
  presets: rawPresets,
}: {
  count: number
  /** 상한 — 서비스가 정한다 (럭드 100, 포토카드 슬롯 설정) */
  max: number
  /** 빠른선택 숫자 — 슬롯이 고른 값. 비우면 기본 1·5·10 */
  presets?: number[]
  onCount: (n: number) => void
  onGo: () => void
  /** 스테퍼 위 한 줄. 비우면 안 그린다 */
  label?: string
  goLabel: string
  busy?: boolean
  /** 못 뽑는 상태 (로그인 전·마감) — 숫자는 만질 수 있고 실행만 막힌다 */
  disabled?: boolean
  className?: string
}) {
  const t = useT()
  const clamp = (n: number) => Math.max(1, Math.min(max, n))
  const presets = countPresets(rawPresets).filter((n) => n <= max)

  return (
    <div className={`${styles.root}${className ? ` ${className}` : ''}`} data-count-picker>
      {label && <p className={styles.label}>{label}</p>}

      <div className={styles.counter}>
        <button
          type="button"
          className={styles.step}
          aria-label={t('한 개 줄이기')}
          disabled={count <= 1}
          onClick={() => onCount(clamp(count - 1))}
        >
          <Minus size={22} aria-hidden="true" />
        </button>
        <input
          className={styles.value}
          type="number"
          inputMode="numeric"
          aria-label={t('개수')}
          value={count}
          min={1}
          max={max}
          onChange={(e) => onCount(clamp(Number(e.target.value) || 1))}
          data-count
        />
        <button
          type="button"
          className={styles.step}
          aria-label={t('한 개 늘리기')}
          disabled={count >= max}
          onClick={() => onCount(clamp(count + 1))}
        >
          <Plus size={22} aria-hidden="true" />
        </button>
      </div>

      {/**
       * 누를 게 없으면 안 그린다 — 빈 줄이 남는다.
       *
       * 예전 조건은 `길이 > 1` 이었다. 기본값(1·5·10)에선 "상한이 낮아 1 만 남았다" 를
       * 걸러내는 같은 뜻이지만, 슬롯이 프리셋을 고르게 된 뒤로는 **하나만 고른 슬롯
       * (예: 10개 하나)의 줄까지 지운다.** 지우고 싶은 건 스테퍼가 이미 열어 둔 값(1)뿐인
       * 경우다 — 그걸 그대로 적는다. 상한 3 인 포토카드 슬롯은 예전처럼 안 그려진다.
       */}
      {presets.some((n) => n > 1) && (
        <div className={styles.quick}>
          {presets.map((n) => (
            <button
              key={n}
              type="button"
              className={styles.quickBtn}
              data-on={count === n || undefined}
              onClick={() => onCount(n)}
            >
              {t('{n}개', { n })}
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        className={styles.go}
        disabled={busy || disabled}
        onClick={onGo}
        data-draw
      >
        {busy ? t('뽑는 중…') : goLabel}
      </button>
    </div>
  )
}
