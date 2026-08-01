import { I18nField } from '@/admin/I18nField'
import type { DisplayI18n } from '@/data/multilingual'
import type { Lang } from '@/i18n'
import type { Slot } from '@/types/slot'

/**
 * **편집기에서 적는 값의 언어별 칸** — 원문 입력 바로 아래에 붙인다.
 *
 * 편집기 UI 라벨은 한국어 고정이지만(`src/i18n/index.tsx` 머리말 — 쓰는 사람이 우리
 * 하나다), **여기서 적은 값은 방문자가 읽는다.** 제목·부제·안내·버튼 라벨이 전부
 * 그렇다. 그러니 슬롯이 언어를 켰으면 그 값마다 언어별 칸이 떠야 한다.
 *
 * ── 왜 한 줄로 쓸 수 있나 ─────────────────────────
 *
 * 값마다 `titleI18n`·`subtitleI18n` 을 두는 대신 **`display.i18n` 한 묶음**에 키로 넣는다
 * (`src/data/multilingual.ts`). 그래서 이 부품은 "어느 키냐" 만 받으면 되고,
 * 화면 렌더는 아예 안 건드려도 된다 — `useLocalizedDisplay` 가 이미 통로다.
 *
 *     <I18nRow d={d} k="title" patch={patch} slot={draft} />
 *
 * ── `slot` 을 반드시 넘긴다 ────────────────────────
 *
 * 편집기는 저장 전 **초안**을 다룬다. 컨텍스트의 저장된 슬롯은 방금 켠 언어를 아직
 * 모르므로, 초안을 넘겨야 언어를 켠 그 자리에서 칸이 뜬다 (안 넘기면 저장해야 뜬다 —
 * 그건 버그로 보인다).
 */
export function I18nRow<T extends { i18n?: DisplayI18n }>({
  d,
  k,
  patch,
  slot,
  rows,
}: {
  /** 지금 서비스의 표시 설정 — 원문과 기존 번역을 여기서 읽는다 */
  d: T
  /** `d` 안의 필드 이름. 이게 곧 `i18n` 묶음의 키다 */
  k: keyof T & string
  patch: (change: Partial<T>) => void
  slot: Slot
  /** 여러 줄 입력이 필요한 긴 글 (안내문 등) */
  rows?: number
}) {
  const base = typeof d[k] === 'string' ? (d[k] as string) : ''
  return (
    <I18nField
      slot={slot}
      base={base}
      rows={rows}
      value={d.i18n?.[k]}
      onChange={(next) => {
        const i18n: DisplayI18n = { ...(d.i18n ?? {}) }
        if (next) i18n[k] = next as Partial<Record<Lang, string>>
        // 비우면 키째 뺀다 — 빈 객체가 쌓이면 저장된 JSON 이 지저분해진다
        else delete i18n[k]
        patch({ i18n: Object.keys(i18n).length ? i18n : undefined } as Partial<T>)
      }}
    />
  )
}
