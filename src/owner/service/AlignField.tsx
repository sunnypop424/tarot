import { CSS } from '../editorUi'

/**
 * **로고·제목·부제 정렬** — 왼쪽 · 가운데 · 오른쪽.
 *
 * 같은 설정이 서비스마다 다른 모양이었다. 롤링페이퍼만 알약 라디오였고 나머지 다섯은
 * `<select>` 였다 — 같은 편집기 안에서 같은 뜻의 칸이 두 모양이면 "이 서비스는 뭔가
 * 다른가" 로 읽힌다. 눌러서 바로 보이는 알약 쪽으로 통일하고 여기 하나로 모은다.
 *
 * 값은 `<Svc>Display.logoAlign` 이고, 화면에서는 `ServiceHeader` 의 `align` 으로 간다 —
 * 로고·제목·부제가 **함께** 움직인다 (`src/components/ServiceHeader.tsx`).
 */
export type Align = 'left' | 'center' | 'right'

const LABEL: Record<Align, string> = { left: '왼쪽', center: '가운데', right: '오른쪽' }

export function AlignField({
  value,
  onChange,
  label = '정렬',
  hint = '로고·제목·부제가 함께 움직여요.',
}: {
  value: Align
  onChange: (next: Align) => void
  label?: string
  hint?: string
}) {
  return (
    <div style={{ ...CSS.fieldCol, minWidth: 0 }}>
      <span style={CSS.label}>{label}</span>
      <div
        role="radiogroup"
        aria-label={label}
        style={{
          display: 'inline-flex',
          background: '#f7f7f7',
          border: '1px solid #eeeeee',
          borderRadius: 9999,
          padding: 3,
          gap: 2,
        }}
      >
        {(['left', 'center', 'right'] as const).map((a) => {
          const on = value === a
          return (
            <button
              key={a}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(a)}
              style={{
                flex: 1,
                height: 28,
                padding: '0 12px',
                border: 'none',
                borderRadius: 9999,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                background: on ? '#fff' : 'transparent',
                color: on ? '#121212' : '#8a8a8a',
                whiteSpace: 'nowrap',
              }}
            >
              {LABEL[a]}
            </button>
          )
        })}
      </div>
      {hint && <span style={CSS.hint}>{hint}</span>}
    </div>
  )
}
