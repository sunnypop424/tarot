import { useState } from 'react'

import { AlphaColor, CSS, RadiusSlider } from '../editorUi'
import { BackgroundField, bgRepeatValues } from './BackgroundField'
import { luckydrawDisplay, WEBFONTS, type FontId } from '@/data/luckydraw'
import type { Slot } from '@/types/slot'
import type { ThemeShape } from '@/types/theme'

/**
 * 럭키드로우 **색 카드마다 딸려 오는 칸들** — 형태·여백·문구.
 *
 * `SlotEditor.tsx` 안에 있던 것을 뺐다. 그 파일이 1,941줄이 되면서 "럭드 색 카드 하나를
 * 고치려고 편집기 전체를 여는" 상태였고, 서비스별 설정 카드는 이미 `service/*.tsx` 로
 * 나뉘어 있었다 — 럭드만 안 나뉘어 있었을 뿐이다.
 *
 * **동작은 그대로다.** 옮기면서 고친 것은 없다 (`verify-owner`·`verify-preview` 가 그걸 본다).
 */

/**
 * "1, 2" 처럼 **여러 값을 한 칸에** 적는 입력.
 *
 * 값을 곧바로 파싱해 되돌리면 **쉼표를 칠 수가 없다**: "1," 을 치는 순간 파싱이 `[1]` 로
 * 만들고 화면이 "1" 로 되돌아가 방금 친 쉼표가 지워진다. 그래서 **치는 동안은 적은 그대로**
 * 두고(로컬 문자열), 부모에는 파싱한 값을 함께 보낸다.
 *
 * 밖에서 값이 바뀌면(다른 슬롯으로 이동) 그때만 문자열을 다시 맞춘다 —
 * 매번 맞추면 결국 같은 문제로 돌아온다.
 */
function RankListField({
  label,
  value,
  hint,
  onChange,
}: {
  label: string
  value: number[]
  hint?: string
  onChange: (v: number[]) => void
}) {
  const joined = value.join(', ')
  const [text, setText] = useState(joined)
  const [lastSynced, setLastSynced] = useState(joined)

  if (joined !== lastSynced) {
    setLastSynced(joined)
    setText(joined)
  }

  return (
    <label style={CSS.fieldCol}>
      <span style={CSS.label}>{label}</span>
      <input
        value={text}
        inputMode="numeric"
        onChange={(e) => {
          setText(e.target.value)
          onChange(
            e.target.value
              .split(',')
              .map((s) => Number(s.trim()))
              .filter((n) => Number.isFinite(n) && n > 0)
          )
        }}
        style={CSS.input}
      />
      {hint && <span style={CSS.hint}>{hint}</span>}
    </label>
  )
}

/**
 * 카드 안에 색과 **같이 오는** 칸들 — 형태·여백·문구.
 *
 * 색만 카드로 묶고 나머지를 딴 데 두면 묶은 의미가 없다: "박스를 손본다" 는 배경색과
 * 둥글기와 여백을 함께 만지는 일이다.
 */
export function LuckydrawExtra({
  kind,
  draft,
  slug,
  patchSlot,
  patchShape,
  patchAsset,
}: {
  kind: string
  draft: Slot
  slug: string
  patchSlot: (c: Partial<Slot> | ((p: Slot) => Partial<Slot>)) => void
  patchShape: (k: keyof ThemeShape, v: number) => void
  patchAsset: (k: 'backgroundPattern', v: string | null) => void
}) {
  const d = luckydrawDisplay(draft)
  const patchLd = (change: Partial<typeof d>) =>
    patchSlot((prev) => ({ luckydraw: { ...luckydrawDisplay(prev), ...change } }))

  const num = (
    label: string,
    value: number,
    onChange: (n: number) => void,
    hint?: string,
    max?: number
  ) => (
    <label style={CSS.fieldCol}>
      <span style={CSS.label}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', height: 31, border: '1px solid #dddddd', borderRadius: 4, overflow: 'hidden' }}>
        <input
          type="number"
          min={0}
          max={max}
          value={value}
          onChange={(e) => onChange(Math.max(0, Math.min(max ?? Infinity, Number(e.target.value) || 0)))}
          style={{ flex: 1, border: 'none', outline: 'none', fontSize: 12.5, padding: '0 9px', minWidth: 0, background: '#fff', color: '#121212' }}
        />
        <span style={{ fontSize: 10.5, color: '#8a8a8a', padding: '0 8px', borderLeft: '1px solid #eeeeee' }}>px</span>
      </div>
      {hint && <span style={CSS.hint}>{hint}</span>}
    </label>
  )

  const text = (label: string, value: string, onChange: (v: string) => void, hint?: string) => (
    <label style={CSS.fieldCol}>
      <span style={CSS.label}>{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} style={CSS.input} />
      {hint && <span style={CSS.hint}>{hint}</span>}
    </label>
  )

  switch (kind) {
    case 'boxRadius':
      return (
        <RadiusSlider
          label="둥글기"
          value={draft.theme.shape.radiusLg}
          max={40}
          onChange={(n) => patchShape('radiusLg', n)}
        />
      )
    case 'boxPadding':
      return num('안쪽 여백 (px)', d.boxPadding, (n) => patchLd({ boxPadding: n }))
    case 'boxBorder':
      return (
        <>
          {num('테두리 두께 (px)', d.boxBorderWidth, (n) => patchLd({ boxBorderWidth: n }), '0 이면 테두리 없음', 20)}
          <AlphaColor
            label="테두리색"
            value={d.boxBorderColor || draft.theme.colors.border}
            onChange={(v) => patchLd({ boxBorderColor: v })}
          />
        </>
      )
    case 'boxTopMargin':
      return num('상단 여백 (px)', d.boxTopMargin, (n) => patchLd({ boxTopMargin: n }), '가운데에서 얼마나 내릴지 — 사진 얼굴을 안 가리게')
    case 'buttonRadius':
      return (
        <RadiusSlider
          label="둥글기"
          value={draft.theme.shape.radiusMd}
          max={40}
          onChange={(n) => patchShape('radiusMd', n)}
        />
      )
    case 'texts':
      return (
        <>
          {text('추첨 버튼 문구', d.drawLabel, (v) => patchLd({ drawLabel: v }))}
          {text('마감 문구', d.closedText, (v) => patchLd({ closedText: v }))}
        </>
      )
    case 'cover':
      return (
        <>
          {text('커버 문자', d.coverMark, (v) => patchLd({ coverMark: v }), '긁기 전 덮인 자리에 찍혀요')}
          <RankListField
            label="긁는 등수"
            value={d.highlightRanks}
            hint="예: 1, 2 — 비우면 전부 바로 보여요"
            onChange={(v) => patchLd({ highlightRanks: v })}
          />
        </>
      )
    case 'font':
      return (
        <div className="field">
          <span className="field__label">본문 폰트</span>
          <select
            className="select"
            value={d.fontFamily}
            onChange={(e) => patchLd({ fontFamily: e.target.value as FontId })}
          >
            {Object.entries(WEBFONTS).map(([id, f]) => (
              <option key={id} value={id}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
      )
    case 'shadow':
      return (
        <>
          <AlphaColor
            label="그림자 색"
            value={d.boxShadowColor}
            hint="밝은 사진 위엔 짙게, 어두운 사진 위엔 옅게. 0% 면 그림자 없음"
            onChange={(v) => patchLd({ boxShadowColor: v })}
          />
          {num(
            '그림자 번짐 (px)',
            d.boxShadowBlur,
            (n) => patchLd({ boxShadowBlur: n }),
            '클수록 은은하게 퍼져요. 0 이면 그림자가 사라져요'
          )}
          {num('그림자 내림 (px)', d.boxShadowY, (n) => patchLd({ boxShadowY: n }), '아래로 드리우는 정도')}
        </>
      )
    case 'modal':
      return (
        <>
          <AlphaColor
            label="배경색"
            value={d.modalBg || draft.theme.colors.surface}
            hint="배송 창 배경. 비워두면 위 테마 '박스 배경색'을 써요"
            onChange={(v) => patchLd({ modalBg: v })}
          />
          <AlphaColor
            label="글자색"
            value={d.modalText || draft.theme.colors.fg1}
            onChange={(v) => patchLd({ modalText: v })}
          />
          <AlphaColor
            label="요소 배경색"
            value={d.modalItemBg || draft.theme.colors.surface}
            hint="입력칸·배송 상품 줄 배경"
            onChange={(v) => patchLd({ modalItemBg: v })}
          />
          {!d.modalNoBorder && (
            <AlphaColor
              label="테두리색"
              value={d.modalBorder || draft.theme.colors.border}
              hint="입력칸·배송 상품 줄·경품 줄 테두리"
              onChange={(v) => patchLd({ modalBorder: v })}
            />
          )}
          <label
            className="field"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, cursor: 'pointer' }}
          >
            <input
              type="checkbox"
              checked={d.modalNoBorder}
              onChange={(e) => patchLd({ modalNoBorder: e.target.checked })}
            />
            <span className="field__label" style={{ margin: 0 }}>
              테두리 없음 (배경색만으로 구분)
            </span>
          </label>
        </>
      )
    case 'noBorder':
      return (
        <label
          className="field"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, cursor: 'pointer' }}
        >
          <input
            type="checkbox"
            checked={d.noBorder}
            onChange={(e) => patchLd({ noBorder: e.target.checked })}
          />
          <span className="field__label" style={{ margin: 0 }}>
            테두리 없음 (배경색만으로 구분)
          </span>
        </label>
      )
    case 'counter': {
      /**
       * 수량 고르기 — **포토카드와 같은 컴포넌트**를 쓴다 (`components/CountPicker.tsx`).
       * 그래서 저장되는 값(`display.picker`)도 같은 모양이다. 화면 스타일이 이 편집기와
       * 서비스 카드가 서로 달라 UI 는 각자 그리지만, **데이터는 한 벌**이라 동작이 안 갈린다.
       */
      const p = d.picker
      const setPicker = (change: Record<string, unknown>) => patchLd({ picker: { ...p, ...change } })
      /** 색을 비우면 키를 지운다 — 빈 문자열이 남으면 "검은색" 으로 읽히는 자리가 생긴다 */
      const setColor = (key: string, v: string) => {
        const next: Record<string, unknown> = { ...p }
        if (v) next[key] = v
        else delete next[key]
        patchLd({ picker: next })
      }
      return (
        <>
          <div className="field">
            <span className="field__label">모서리 둥글기</span>
            <input
              className="input"
              type="number"
              min={0}
              max={40}
              value={p.radius ?? 16}
              /* 상한은 손을 뗄 때만 — 타이핑 중에 걸면 자릿수가 늘 때마다 40 으로 튄다 */
              onChange={(e) => setPicker({ radius: Math.max(0, Number(e.target.value) || 0) })}
              onBlur={(e) => setPicker({ radius: Math.min(40, Math.max(0, Number(e.target.value) || 0)) })}
              data-picker-radius
            />
            <span className="field__hint">0 이면 각진 사각형이에요 (px).</span>
          </div>
          <div className="field">
            <span className="field__label">테두리</span>
            <select
              className="select"
              value={String(p.borderWidth ?? 1)}
              onChange={(e) => setPicker({ borderWidth: Number(e.target.value) })}
              data-picker-border
            >
              <option value="0">없음</option>
              <option value="1">얇게 (1px)</option>
              <option value="2">보통 (2px)</option>
              <option value="3">굵게 (3px)</option>
            </select>
          </div>
          <AlphaColor
            label="배경색"
            value={p.bg || d.counterBg || draft.theme.colors.wash}
            hint="− 숫자 + 를 감싸는 판. 비우면 테마 보조 배경색"
            onChange={(v) => setColor('bg', v)}
          />
          <AlphaColor
            label="테두리색"
            value={p.borderColor || d.counterBorder || draft.theme.colors.border}
            hint="비우면 테마 테두리색"
            onChange={(v) => setColor('borderColor', v)}
          />
          <AlphaColor
            label="글자색"
            value={p.fg || draft.theme.colors.fg1}
            hint="숫자와 프리셋(1·5·10). 비우면 테마 글자색"
            onChange={(v) => setColor('fg', v)}
          />
          <AlphaColor
            label="± 버튼 배경"
            value={p.stepBg || draft.theme.colors.surfaceRaised}
            hint="비우면 테마 표면색"
            onChange={(v) => setColor('stepBg', v)}
          />
          <AlphaColor
            label="고른 프리셋 배경"
            value={p.onBg || draft.theme.colors.primary}
            onChange={(v) => setColor('onBg', v)}
          />
          <AlphaColor
            label="고른 프리셋 글자"
            value={p.onFg || draft.theme.colors.onPrimary}
            onChange={(v) => setColor('onFg', v)}
          />
          <AlphaColor
            label="뽑기 버튼 배경"
            value={p.goBg || draft.theme.colors.primary}
            onChange={(v) => setColor('goBg', v)}
          />
          <AlphaColor
            label="뽑기 버튼 글자"
            value={p.goFg || draft.theme.colors.onPrimary}
            onChange={(v) => setColor('goFg', v)}
          />
          <AlphaColor
            label="그림자색"
            value={d.counterShadow || draft.theme.colors.primary}
            hint="알약 아래 그림자. 번짐·내림은 시안 고정, 색만 골라요"
            onChange={(v) => patchLd({ counterShadow: v })}
          />
        </>
      )
    }
    case 'badgeStyle':
      return (
        <div className="field">
          <span className="field__label">배지 스타일</span>
          <select
            className="select"
            value={d.badgeStyle}
            onChange={(e) => patchLd({ badgeStyle: e.target.value === 'solid' ? 'solid' : 'soft' })}
          >
            <option value="soft">옅게 (글자에 색, 배경은 글자색 따라감)</option>
            <option value="solid">진하게 (배경 solid, 글자 흰색)</option>
          </select>
        </div>
      )
    case 'footer':
      return text(
        '오른쪽 아래 표기',
        d.footerNote,
        (v) => patchLd({ footerNote: v }),
        '제작사 표기 같은 것. 비우면 안 나와요'
      )
    case 'badge':
      return (
        <div className="field">
          <span className="field__label">남은 수량 배지</span>
          <input
            className="input"
            type="number"
            min={0}
            value={d.lowStockThreshold ?? ''}
            placeholder="안 띄움"
            onChange={(e) =>
              // 빈 칸 = 안 띄운다. 0 과 다르다 (0 은 "0개 남았을 때만")
              patchLd({
                lowStockThreshold: e.target.value === '' ? null : Math.max(0, Number(e.target.value)),
              })
            }
          />
          <span className="field__hint">이 수 이하로 내려가면 “N개 남았어요”. 비우면 안 띄워요</span>
        </div>
      )
    case 'background':
      return (
        <>
          <BackgroundField
            slug={slug}
            name="background"
            value={draft.theme.assets.backgroundPattern}
            repeat={draft.theme.assets.backgroundPatternRepeat === 'repeat'}
            onImage={(v) => patchAsset('backgroundPattern', v)}
            onRepeat={(on) => patchSlot((prev) => ({
              theme: { ...prev.theme, assets: { ...prev.theme.assets, ...bgRepeatValues(on) } },
            }))}
            hint="박스가 얹힐 자리를 비워둔 사진이 좋아요."
          />
          <AlphaColor
            label="관리자 링크 색"
            value={d.adminLinkColor}
            hint="방문자 눈엔 안 띄고 스태프는 찾을 정도로"
            onChange={(v) => patchLd({ adminLinkColor: v })}
          />
        </>
      )
    default:
      return null
  }
}
