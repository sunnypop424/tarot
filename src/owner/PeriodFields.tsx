import type { DateRange, SlotPeriod } from '@/types/slot'
import styles from './Owner.module.css'

/**
 * 기간 입력 — 슬롯 만들기(SlotList)와 슬롯 편집기(SlotEditor)가 같이 쓴다.
 *
 * 두 화면에 같은 폼이 필요한 이유: 슬롯은 **팔면서 만든다** — 만들 때 이미 언제부터
 * 언제까지인지 안다. 그런데 이벤트는 밀리기도 하므로 나중에 고칠 자리도 있어야 한다.
 *
 * `<input type="date">` 를 쓴다: 값이 `'YYYY-MM-DD'` 라 `DateRange` 와 모양이 같고
 * (파싱·포맷이 아예 없다), 모바일에서 네이티브 달력이 뜬다.
 */

const EMPTY: DateRange = { start: null, end: null }

function RangeRow({
  label,
  hint,
  value,
  onChange,
  disabled,
  name,
}: {
  label: string
  hint: string
  value: DateRange | undefined
  onChange: (r: DateRange) => void
  disabled?: boolean
  name: string
}) {
  const r = value ?? EMPTY
  // 빈 입력은 '' 로 오는데, 그걸 그대로 저장하면 "안 정했다"(null)와 구별이 안 된다
  const set = (patch: Partial<DateRange>) =>
    onChange({ start: r.start, end: r.end, ...patch })

  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <div className={styles.rangeRow}>
        <input
          type="date"
          className="input"
          value={r.start ?? ''}
          onChange={(e) => set({ start: e.target.value || null })}
          disabled={disabled}
          aria-label={`${label} 시작일`}
          data-period={`${name}-start`}
        />
        <span className={styles.rangeSep} aria-hidden="true">
          ~
        </span>
        <input
          type="date"
          className="input"
          value={r.end ?? ''}
          // 시작일보다 앞선 종료일은 아예 못 고르게 — 고르고 나서 혼내는 것보다 낫다
          min={r.start ?? undefined}
          onChange={(e) => set({ end: e.target.value || null })}
          disabled={disabled}
          aria-label={`${label} 종료일`}
          data-period={`${name}-end`}
        />
      </div>
      <span className="field__hint">{hint}</span>
    </div>
  )
}

/**
 * **자체 그리드로 감싼다** — 공용 `.form-grid`(220px 칸) 안에 넣으면 안 된다.
 * 한 칸에 날짜 입력이 둘이라 220px 로는 `<input type="date">` 가 잘려서
 * "연도-월-일" 이 "연도-월-" 로 깨진다. 넉넉한 칸이 필요하다.
 */
export function PeriodFields({
  period,
  onChange,
  disabled,
}: {
  period: SlotPeriod | undefined
  onChange: (p: SlotPeriod) => void
  disabled?: boolean
}) {
  return (
    <div className={styles.periodGrid}>
      <RangeRow
        name="test"
        label="테스트 기간"
        hint="주최자가 미리 열어보고 질문·답변을 채우는 기간이에요."
        value={period?.test}
        onChange={(test) => onChange({ ...period, test })}
        disabled={disabled}
      />
      <RangeRow
        name="rent"
        label="대여 기간"
        hint="실제로 여는 기간이에요. 이 날짜가 지나면 주최자도 못 들어옵니다."
        value={period?.rent}
        onChange={(rent) => onChange({ ...period, rent })}
        disabled={disabled}
      />
    </div>
  )
}
