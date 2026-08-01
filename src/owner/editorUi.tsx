import type { CSSProperties, ReactNode } from 'react'

import { alphaOf, hexOf, withAlphaValue } from '@/lib/color'

/**
 * 슬롯 편집기의 **공용 부품** — 카드·필드·색 스와치와 인라인 스타일 원자들.
 *
 * `SlotEditor.tsx` 안에 있던 것을 뺐다. 서비스가 늘 때마다 설정 카드가 하나씩 붙는데
 * (`src/owner/service/*.tsx`), 그 카드들이 편집기와 **같은 몸으로 보이려면** 같은 원자를 써야
 * 한다. 파일을 나누지 않으면 순환 import 가 되거나 스타일이 갈라진다.
 *
 * 시안('서비스별 설정 화면.dc.html')에서 그대로 옮긴 값이다.
 * (hex 가 여기 있는 건 CLAUDE.md 의 명시적 예외 — 편집기는 어느 슬롯을 열든 같은 고정 라이트
 * 도구라 슬롯 테마 토큰을 쓰지 않는다.)
 */
export const CSS = {
  card: { background: '#fff', border: '1px solid #eeeeee', borderRadius: 8, overflow: 'hidden' },
  head: { padding: '12px 18px', borderBottom: '1px solid #eeeeee', fontSize: 13.5, fontWeight: 700 },
  headFlex: {
    padding: '12px 18px', borderBottom: '1px solid #eeeeee', display: 'flex',
    alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap',
  },
  body: { padding: 18 },
  label: { fontSize: 11.5, fontWeight: 700, color: '#505050' },
  hint: { fontSize: 11, color: '#8a8a8a', lineHeight: 1.5 },
  input: {
    height: 34, border: '1px solid #dddddd', borderRadius: 4, padding: '0 9px',
    fontSize: 12.5, outline: 'none', minWidth: 0, background: '#fff', color: '#121212',
  },
  select: {
    height: 34, border: '1px solid #dddddd', borderRadius: 4, padding: '0 30px 0 9px', fontSize: 12.5,
    backgroundColor: '#fff', color: '#121212', cursor: 'pointer', outline: 'none', minWidth: 0,
    appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
    backgroundImage:
      "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238a8a8a' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\")",
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 9px center',
  },
  fieldCol: { display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 },
  ghostPill: {
    height: 28, padding: '0 11px', border: '1px solid #dddddd', background: '#fff',
    borderRadius: 9999, fontSize: 11.5, fontWeight: 700, color: '#505050', cursor: 'pointer', whiteSpace: 'nowrap',
    // 아이콘을 넣는 자리가 대부분이다 — 이게 없으면 아이콘이 위, 글자가 아래로 접힌다
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, flexShrink: 0,
  },
  primaryPill: {
    height: 34, padding: '0 16px', border: 'none', borderRadius: 9999, background: '#816bff',
    color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
  },
  colorPill: {
    display: 'flex', alignItems: 'center', height: 30, border: '1px solid #dddddd',
    borderRadius: 4, overflow: 'hidden', flexShrink: 0,
  },
  hexInput: { border: 'none', outline: 'none', width: 78, fontSize: 11.5, padding: '0 7px', background: '#fff', color: '#121212' },
  colorRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  range: { flex: 1, minWidth: 0, accentColor: '#816bff' },
  thumb: {
    borderRadius: 4, background: '#f7f7f7', border: '1px solid #eeeeee', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8a8a8a',
    backgroundSize: 'cover', backgroundPosition: 'center',
  },
} satisfies Record<string, CSSProperties>

/**
 * 평평한 색 스와치 — 시안은 색 span 이지만, 색을 고를 수 있어야 하니 투명한 네이티브 색
 * 고르개를 스와치 위에 겹쳐 둔다 (span 을 눌러 고르개가 열린다). 픽커가 준 hex 만 올려보낸다.
 *
 * **모듈 바깥에 둔다.** 안에서 정의하면 렌더마다 새 타입이 만들어져 색을 드래그하는 순간 닫힌다.
 */
export function Swatch({
  value,
  label,
  size = 28,
  onChange,
}: {
  value: string
  label: string
  size?: number
  onChange: (hex: string) => void
}) {
  return (
    <label style={{ width: size, height: size, background: hexOf(value), borderRight: '1px solid #eeeeee', flexShrink: 0, cursor: 'pointer', position: 'relative', display: 'block' }}>
      <input
        type="color"
        value={hexOf(value)}
        aria-label={`${label} 고르기`}
        onChange={(e) => onChange(e.target.value)}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, border: 'none', padding: 0, cursor: 'pointer' }}
      />
    </label>
  )
}

/** 시안 색 행 — 라벨(+힌트) 좌, [스와치 | hex] 우. 서비스 공통. */
export function SwatchColor({
  label,
  value,
  hint,
  id,
  onChange,
}: {
  label: string
  value: string
  hint?: string
  id?: string
  onChange: (v: string) => void
}) {
  return (
    <div style={CSS.colorRow}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, color: '#505050' }}>{label}</div>
        {hint && <div style={CSS.hint}>{hint}</div>}
      </div>
      <div style={CSS.colorPill}>
        <Swatch value={value} label={label} onChange={onChange} />
        <input id={id} value={value} onChange={(e) => onChange(e.target.value)} style={CSS.hexInput} />
      </div>
    </div>
  )
}

/**
 * hex + 투명도 → rgba (박스·그림자·관리자 링크 색).
 *
 * `SlotEditor` 안에 있던 것을 뺐다 — **럭키드로우와 포토카드가 같은 무대를 쓰면서**
 * 같은 색 칸이 두 곳에 필요해졌다 (`service/BoxFields.tsx`).
 */
export function AlphaColor({
  label,
  value,
  hint,
  onChange,
}: {
  label: string
  value: string
  hint?: string
  onChange: (v: string) => void
}) {
  const pct = Math.round(alphaOf(value) * 100)
  return (
    /* `data-alpha-color` 는 검증용 손잡이다 — 색 고르개가 리렌더에 다시 만들어지면
       누르는 순간 브라우저 색 창이 닫혀 **드래그로 색을 못 고른다** (verify-preview) */
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} data-alpha-color>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: '#505050' }}>{label}</div>
      {hint && <div style={CSS.hint}>{hint}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={CSS.colorPill}>
          <Swatch value={value} label={label} onChange={(hex) => onChange(withAlphaValue(hex, alphaOf(value)))} />
          <input
            value={hexOf(value)}
            onChange={(e) => onChange(withAlphaValue(e.target.value, alphaOf(value)))}
            style={{ ...CSS.hexInput, width: 76 }}
          />
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={alphaOf(value)}
          aria-label={`${label} 투명도`}
          onChange={(e) => onChange(withAlphaValue(hexOf(value), Number(e.target.value)))}
          style={{ ...CSS.range, minWidth: 50 }}
        />
        <span style={{ fontSize: 11.5, color: '#505050', width: 36, textAlign: 'right', flexShrink: 0 }}>{pct}%</span>
      </div>
    </div>
  )
}

/** 시안 카드 — 흰 박스, 상단 헤더 바(제목 + 선택적 우측 노트/버튼), 본문. */
export function Card({
  title,
  note,
  right,
  children,
  style,
}: {
  title: string
  note?: string
  right?: ReactNode
  children: ReactNode
  style?: CSSProperties
}) {
  return (
    <div style={{ ...CSS.card, ...style }}>
      <div style={CSS.headFlex}>
        <span style={{ fontSize: 13.5, fontWeight: 700 }}>{title}</span>
        {note && <span style={{ fontSize: 11.5, color: '#8a8a8a' }}>{note}</span>}
        {right}
      </div>
      <div style={CSS.body}>{children}</div>
    </div>
  )
}

/** 시안 라벨-위 필드 — 라벨, 자식(입력), 선택적 힌트. */
export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label style={CSS.fieldCol}>
      <span style={CSS.label}>{label}</span>
      {children}
      {hint && <span style={CSS.hint}>{hint}</span>}
    </label>
  )
}

/** 카드 안 구분선 + 그리드 — 설정 카드들이 반복해 쓰는 배치 */
export function Divided({ min = 240, gap = 16, children }: { min?: number; gap?: number; children: ReactNode }) {
  return (
    <div
      style={{
        marginTop: 16,
        paddingTop: 14,
        borderTop: '1px solid #eeeeee',
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fit,minmax(min(100%,${min}px),1fr))`,
        gap,
      }}
    >
      {children}
    </div>
  )
}

/**
 * radius 슬라이더 (시안) — 라벨 위, [슬라이더 · 숫자칸+px] 아래. 그리드 셀 한 줄 차지.
 *
 * **`SlotEditor` 와 럭키드로우 카드가 같이 쓴다.** 원래 `SlotEditor.tsx` 안에 있었는데,
 * 럭드 카드를 `service/LuckydrawCard.tsx` 로 빼면서 둘 다 쓰는 부품이 됐다 — 이 파일이
 * 존재하는 이유가 정확히 그것이다 (파일 머리말).
 */
export function RadiusSlider({
  label,
  value,
  max = 40,
  onChange,
}: {
  label: string
  value: number
  max?: number
  onChange: (n: number) => void
}) {
  return (
    <div style={CSS.fieldCol}>
      <span style={CSS.label}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <input
          type="range"
          min={0}
          max={Math.min(max, 32)}
          value={value}
          aria-label={label}
          onChange={(e) => onChange(Number(e.target.value))}
          style={CSS.range}
        />
        <div style={{ display: 'flex', alignItems: 'center', height: 30, border: '1px solid #dddddd', borderRadius: 4, overflow: 'hidden', flexShrink: 0 }}>
          <input
            value={value}
            onChange={(e) => onChange(Math.max(0, Math.min(max, Number(e.target.value) || 0)))}
            style={{ border: 'none', outline: 'none', width: 38, textAlign: 'center', fontSize: 12, background: '#fff', color: '#121212' }}
          />
          <span style={{ fontSize: 10.5, color: '#8a8a8a', padding: '0 7px', borderLeft: '1px solid #eeeeee' }}>px</span>
        </div>
      </div>
    </div>
  )
}

/**
 * **제목·부제를 화면에 보일지** — 로고를 올린 슬롯은 제목 글자를 끄는 게 보통이다.
 *
 * 서비스 카드 여섯 벌에 같은 코드가 복사돼 있었다. 응원에 이 토글을 붙이려다 일곱 번째
 * 사본을 만들 뻔해서 여기로 올린다 — 모양이 갈리면 "이 서비스만 다르게 생겼네" 가 된다.
 */
export function ShowToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#8a8a8a', cursor: 'pointer', whiteSpace: 'nowrap' }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 14, height: 14, accentColor: '#816bff', cursor: 'pointer' }}
      />
      화면에 보이기
    </label>
  )
}
