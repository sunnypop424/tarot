import { CSS } from '../editorUi'

/**
 * 색 팔레트 — 방문자가 **그중에서 고르는** 색 목록 (롤페 종이색 · 소원나무 등불색).
 *
 * `SwatchColor`(값 하나)와 다르다: 개수가 정해져 있지 않아 더하고 빼야 한다.
 * 롤페 카드 안에 인라인으로 있던 것을 뺐다 — 소원나무가 같은 걸 필요로 해서,
 * 복붙하면 한쪽만 고치는 날이 온다.
 */
export function PaletteField({
  label,
  hint,
  value,
  onChange,
  addDefault = '#f4efe2',
}: {
  label: string
  hint?: string
  value: string[]
  onChange: (next: string[]) => void
  /** '+' 로 새 색을 더할 때의 시작값 */
  addDefault?: string
}) {
  return (
    <div>
      <div style={{ ...CSS.label, marginBottom: 9 }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }} data-palette>
        {value.map((c, idx) => (
          <div
            key={idx}
            style={{
              width: 42,
              height: 42,
              borderRadius: 4,
              background: c,
              border: '1px solid rgba(0,0,0,.09)',
              position: 'relative',
            }}
          >
            {/* 투명한 네이티브 색 고르개를 스와치 위에 겹친다 (Swatch 와 같은 수법) */}
            <label style={{ position: 'absolute', inset: 0, cursor: 'pointer' }}>
              <input
                type="color"
                value={c}
                aria-label={`${label} ${idx + 1}`}
                onChange={(e) => onChange(value.map((p, j) => (j === idx ? e.target.value : p)))}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, border: 'none', padding: 0, cursor: 'pointer' }}
              />
            </label>
            <button
              type="button"
              aria-label={`${label} ${idx + 1} 빼기`}
              onClick={() => onChange(value.filter((_, j) => j !== idx))}
              style={{ position: 'absolute', top: -6, right: -6, width: 17, height: 17, borderRadius: 9999, background: '#fff', border: '1px solid #dddddd', color: '#8a8a8a', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, fontSize: 11, lineHeight: 1 }}
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          aria-label={`${label} 더하기`}
          onClick={() => onChange([...value, addDefault])}
          style={{ width: 42, height: 42, borderRadius: 4, border: '1px dashed #dddddd', background: '#f7f7f7', color: '#8a8a8a', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, lineHeight: 1 }}
        >
          +
        </button>
      </div>
      {hint && <div style={{ ...CSS.hint, marginTop: 8 }}>{hint}</div>}
    </div>
  )
}
