import { AlphaColor, CSS, Divided, Field } from '../editorUi'

/**
 * 사진 위에 뜨는 **박스** 설정 — 럭키드로우와 포토카드 스태프 화면이 같이 쓴다.
 *
 * 두 화면이 같은 무대(`src/components/DrawStage.module.css`)를 그린다 —
 * 상단 여백·안쪽 여백·테두리·그림자·관리자 링크 색이 그 무대의 전부다.
 * 화면이 하나면 설정도 하나여야 한다(둘로 두면 한쪽에만 항목이 느는 날이 온다).
 *
 * **둥글기는 여기 없다** — 박스 radius 는 슬롯 테마(`shape.radiusLg`)라 위쪽 '모양' 카드에서 정한다.
 */
export interface BoxStyle {
  boxTopMargin: number
  boxPadding: number
  boxBorderWidth: number
  boxBorderColor: string
  boxShadowColor: string
  boxShadowBlur: number
  boxShadowY: number
  adminLinkColor: string
}

export function BoxFields({
  value,
  onChange,
  /** 테두리색을 안 골랐을 때 보여줄 슬롯 테마 색 */
  borderFallback,
  hint,
}: {
  value: BoxStyle
  onChange: (change: Partial<BoxStyle>) => void
  borderFallback: string
  hint: string
}) {
  const num = (label: string, key: keyof BoxStyle, h?: string, max?: number) => (
    <Field label={label} hint={h}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="number"
          min={0}
          max={max}
          value={value[key] as number}
          onChange={(e) =>
            onChange({ [key]: Math.max(0, Math.min(max ?? Infinity, Number(e.target.value) || 0)) } as Partial<BoxStyle>)
          }
          style={{ ...CSS.input, flex: 1, minWidth: 0 }}
          aria-label={label}
          data-box={key}
        />
        <span style={{ fontSize: 11.5, color: '#8a8a8a', flexShrink: 0 }}>px</span>
      </div>
    </Field>
  )

  return (
    <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid #ededf2' }}>
      <span style={CSS.label}>박스</span>
      <p style={{ margin: '6px 0 12px', fontSize: 11, color: '#9a9a9a', lineHeight: 1.6 }}>
        {hint} <b>둥글기는 위쪽 ‘모양’ 에서 정해요</b> — 이벤트 전체와 같은 값이라서요.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,180px),1fr))', gap: 14 }}>
        {num('상단 여백', 'boxTopMargin', '가운데에서 얼마나 내릴지 — 사진 얼굴을 안 가리게')}
        {num('안쪽 여백', 'boxPadding')}
        {num('테두리 두께', 'boxBorderWidth', '0 이면 테두리 없음', 20)}
        {num('그림자 번짐', 'boxShadowBlur', '0 이면 그림자가 사라져요')}
        {num('그림자 내림', 'boxShadowY', '아래로 드리우는 정도')}
      </div>

      <Divided min={230} gap={12}>
        <AlphaColor
          label="테두리색"
          value={value.boxBorderColor || borderFallback}
          onChange={(v) => onChange({ boxBorderColor: v })}
        />
        <AlphaColor
          label="그림자 색"
          value={value.boxShadowColor}
          hint="밝은 사진 위엔 짙게, 어두운 사진 위엔 옅게. 0% 면 그림자 없음"
          onChange={(v) => onChange({ boxShadowColor: v })}
        />
        <AlphaColor
          label="관리자 링크 색"
          value={value.adminLinkColor}
          hint="박스 아래 작은 글씨 — 손님 눈엔 안 띄고 스태프는 찾을 수 있게"
          onChange={(v) => onChange({ adminLinkColor: v })}
        />
      </Divided>
    </div>
  )
}
