import { useEffect, useState } from 'react'

import type { CountPickerStyle } from '@/data/countPicker'
import { CSS, Divided, Field, SwatchColor } from '../editorUi'

/** "5, 10, 15" → [5,10,15]. 정리(중복·정렬·기본값)는 화면 쪽 `countPresets` 가 한다 */
const parsePresets = (text: string): number[] =>
  text
    .split(',')
    .map((s) => Math.floor(Number(s.trim())))
    .filter((n) => Number.isFinite(n) && n >= 1)

/**
 * 빠른선택 숫자 — **타이핑 중인 글자를 상태로 들고 있는다.**
 *
 * 숫자 배열을 그대로 되돌려 그리면 `"5, 10,"` 의 마지막 쉼표가 매 글자마다 지워져
 * 다음 숫자를 이어 칠 수가 없다. 그래서 칸은 문자열을 보이고, 부모에는 숫자만 올린다.
 * 밖에서 값이 바뀐 때(슬롯 전환·초안 되돌리기)만 다시 맞춘다 — 내가 친 글자가 같은
 * 숫자로 읽히면 건드리지 않는다.
 */
function PresetsField({
  value,
  onChange,
}: {
  value: number[] | undefined
  onChange: (nums: number[]) => void
}) {
  const incoming = (value ?? []).join(', ')
  const [text, setText] = useState(incoming)

  useEffect(() => {
    setText((cur) => (parsePresets(cur).join(', ') === incoming ? cur : incoming))
  }, [incoming])

  return (
    <Field label="빠른선택 숫자" hint="쉼표로 구분해요. 비우면 1, 5, 10.">
      <input
        type="text"
        inputMode="numeric"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          onChange(parsePresets(e.target.value))
        }}
        placeholder="1, 5, 10"
        style={CSS.input}
        aria-label="빠른선택 숫자"
        data-picker-presets
      />
    </Field>
  )
}

/**
 * 수량 고르기 설정 — **럭키드로우와 포토카드가 같이 쓴다.**
 *
 * 화면이 공용 컴포넌트(`src/components/CountPicker.tsx`)라 설정 칸도 하나여야 한다.
 * 둘로 두면 한쪽에만 항목이 늘어나는 날이 온다.
 *
 * **비워둔 색은 서비스 기본값을 따른다** — 여기서 굳이 안 고르면 슬롯 색이 그대로 온다.
 * 그래서 값이 없을 때 빈 문자열을 넣지 않고 키를 아예 뺀다(`undefined`).
 */
export function PickerFields({
  value,
  onChange,
  hint,
}: {
  value: Partial<CountPickerStyle>
  onChange: (next: Partial<CountPickerStyle>) => void
  /** 이 서비스에서 이 묶음이 어디에 뜨는지 한 줄 */
  hint: string
}) {
  const set = (change: Partial<CountPickerStyle>) => onChange({ ...value, ...change })

  /** 색을 비우면 키를 지운다 — 빈 문자열이 남으면 "검은색" 으로 읽히는 자리가 생긴다 */
  const setColor = (key: keyof CountPickerStyle, v: string) => {
    const next = { ...value }
    if (v) (next as Record<string, unknown>)[key] = v
    else delete (next as Record<string, unknown>)[key]
    onChange(next)
  }

  return (
    <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid #ededf2' }}>
      <span style={CSS.label}>수량 고르기</span>
      <p style={{ margin: '6px 0 12px', fontSize: 11, color: '#9a9a9a', lineHeight: 1.6 }}>
        {hint} <b>비워두면 이 이벤트 색을 그대로 따라가요</b> — 따로 맞추고 싶을 때만 채우세요.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,180px),1fr))', gap: 14 }}>
        <Field label="모서리 둥글기" hint="0 이면 각진 사각형이에요.">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="number"
              min={0}
              max={40}
              value={value.radius ?? 16}
              /*
               * **상한은 손을 뗄 때만 건다.** 타이핑 중에 걸면 "16" 뒤에 한 자를 더 치는 순간
               * 162 가 되어 40 으로 튀고, 화면엔 "고쳐지지 않는다" 로 보인다.
               */
              onChange={(e) => set({ radius: Math.max(0, Number(e.target.value) || 0) })}
              onBlur={(e) => set({ radius: Math.min(40, Math.max(0, Number(e.target.value) || 0)) })}
              style={{ ...CSS.input, flex: 1, minWidth: 0 }}
              aria-label="모서리 둥글기"
              data-picker-radius
            />
            <span style={{ fontSize: 11.5, color: '#8a8a8a', flexShrink: 0 }}>px</span>
          </div>
        </Field>
        <Field label="테두리">
          <select
            value={String(value.borderWidth ?? 1)}
            onChange={(e) => set({ borderWidth: Number(e.target.value) })}
            style={CSS.select}
            data-picker-border
          >
            <option value="0">{'없음'}</option>
            <option value="1">얇게 (1px)</option>
            <option value="2">보통 (2px)</option>
            <option value="3">굵게 (3px)</option>
          </select>
        </Field>
        <PresetsField
          value={value.presets}
          onChange={(nums) => {
            const next = { ...value }
            if (nums.length) next.presets = nums
            else delete next.presets
            onChange(next)
          }}
        />
      </div>

      <Divided min={230} gap={12}>
        {(
          [
            ['bg', '상자 배경', '− 숫자 + 를 감싸는 판'],
            ['borderColor', '테두리색'],
            ['fg', '글자색', '숫자 · 프리셋'],
            ['stepBg', '± 버튼 배경'],
            ['onBg', '고른 프리셋 배경'],
            ['onFg', '고른 프리셋 글자'],
            ['goBg', '뽑기 버튼 배경'],
            ['goFg', '뽑기 버튼 글자'],
          ] as [keyof CountPickerStyle, string, string?][]
        ).map(([key, label, h]) => (
          <SwatchColor
            key={key}
            label={label}
            hint={h}
            value={(value[key] as string) ?? ''}
            onChange={(v) => setColor(key, v)}
          />
        ))}
      </Divided>
    </div>
  )
}
