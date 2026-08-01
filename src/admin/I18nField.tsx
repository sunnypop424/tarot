import { useState } from 'react'
import { Languages } from 'lucide-react'

import { LANGS, useT, type Lang } from '@/i18n'
import { askLangs, clean, type I18nText } from '@/data/multilingual'
import { useSlotOrNull } from '@/slot/SlotProvider'
import type { Slot } from '@/types/slot'

/**
 * **주최자가 한 값을 언어별로 적는 칸.**
 *
 * 경품 이름·스탬프 칸·설문 선택지처럼 **방문자가 보는데 우리가 안 쓴 글자**가 대상이다
 * (`src/data/multilingual.ts` 머리말).
 *
 * ── 접어 둔다 ──────────────────────────────────────
 *
 * 언어 칸을 **늘 펼쳐 두지 않는다.** 경품이 열 줄이면 칸이 서른 개가 되고, 한국어로만
 * 여는 행사(대부분이다)의 주최자는 쓰지도 않을 칸 스무 개를 스크롤로 지나야 한다.
 * 지구본을 눌러야 열리고, **이미 적어 둔 게 있으면 눌러보지 않아도 알도록** 개수를 배지로 띄운다.
 *
 * ── 슬롯이 켠 언어만 묻는다 ─────────────────────────
 *
 * 안 켠 언어는 칸이 아예 없다. 나중에 켜면 그때 생기고, 그전에 적어 둔 값은 지워지지 않는다
 * (`askLangs` 는 무엇을 **보여줄지**만 정하고 저장된 값은 안 건드린다).
 *
 * 슬롯이 아무 언어도 안 켰으면 **이 컴포넌트는 통째로 사라진다** — 물을 게 없다.
 */
export function I18nField({
  base,
  value,
  onChange,
  placeholder,
  disabled,
  rows,
  slot: given,
}: {
  /** 한국어 원문 — 비교용으로 보여준다 (이 컴포넌트가 고치지는 않는다) */
  base: string
  value: I18nText
  onChange: (next: Partial<Record<Lang, string>> | null) => void
  placeholder?: string
  disabled?: boolean
  /** 2 이상이면 여러 줄 입력 (질문 답변처럼 긴 글) */
  rows?: number
  /**
   * **슬롯을 직접 넘기는 자리** — 슬롯 편집기.
   *
   * 주최자 화면은 URL 이 슬롯을 정하므로 컨텍스트에서 받으면 되지만, 편집기는 저장 전
   * **초안**을 다룬다. 방금 언어를 켜고 바로 아래 칸을 열면, 컨텍스트의 저장된 슬롯은
   * 아직 그 언어를 모른다 — 초안을 넘겨야 켠 그 자리에서 칸이 뜬다.
   */
  slot?: Slot
}) {
  const t = useT()
  const fromCtx = useSlotOrNull()
  const slot = given ?? fromCtx
  const langs = slot ? askLangs(slot) : []
  const [open, setOpen] = useState(false)

  if (langs.length === 0) return null

  const filled = langs.filter((l) => value?.[l]?.trim()).length

  const set = (lang: Lang, next: string) => onChange(clean({ ...value, [lang]: next }))

  return (
    <div className="ad-i18n" data-i18n-field>
      <button
        type="button"
        className="ad-i18n__toggle"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        data-on={open || undefined}
        data-i18n-toggle
      >
        <Languages size={13} aria-hidden="true" />
        {t('다른 언어')}
        {/* 접혀 있어도 채웠는지 보인다 — 안 그러면 매번 열어봐야 안다 */}
        {filled > 0 && (
          <span className="ad-i18n__count tnum">
            {t('{a}/{b}', { a: filled, b: langs.length })}
          </span>
        )}
      </button>

      {open && (
        <div className="ad-i18n__panel">
          {langs.map((id) => {
            const label = LANGS.find((l) => l.id === id)?.label ?? id
            return (
              <label key={id} className="ad-i18n__row">
                <span className="ad-i18n__lang">{label}</span>
                {rows && rows > 1 ? (
                  <textarea
                    className="ad-textarea"
                    rows={rows}
                    value={value?.[id] ?? ''}
                    placeholder={placeholder ?? base}
                    disabled={disabled}
                    onChange={(e) => set(id, e.target.value)}
                    data-i18n-input={id}
                  />
                ) : (
                  <input
                    className="ad-input ad-input--sm"
                    value={value?.[id] ?? ''}
                    placeholder={placeholder ?? base}
                    disabled={disabled}
                    onChange={(e) => set(id, e.target.value)}
                    data-i18n-input={id}
                  />
                )}
              </label>
            )
          })}
          {/* 비워 두는 게 고장이 아니라는 걸 말해 준다 — 78장을 세 언어로 채우게 만들면 안 된다 */}
          <p className="ad-i18n__note">{t('비워 두면 한국어가 그대로 보여요.')}</p>
        </div>
      )}
    </div>
  )
}
