import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { AlertCircle, ArrowLeft, Check, Download, ExternalLink, Eye, Sparkles } from 'lucide-react'

import defaultThemeJson from '@/data/slot-default.json'
import { getSlotDeck } from '@/data/slots'
import { SERVICES, getSlotService, serviceLabel, type ServiceId } from '@/data/services'
import { PLANS, getPlan, planById, effectiveLimits, type PlanId } from '@/data/plans'
import { CATEGORIES } from '@/data/categories'
import type { DeckRange } from '@/data/cards'
import type { Slot, CategorySetting, EventConfig } from '@/types/slot'
import type { ThemeColors, ThemeShape } from '@/types/theme'
import { isLight } from '@/lib/color'
import { repo } from '@/lib/repo'
import { hasSupabase } from '@/lib/repo/client'
import { AlphaColor, CSS, Card, Field, Swatch, SwatchColor } from './editorUi'
import { PhotozoneCard } from './service/PhotozoneCard'
import { WishCard } from './service/WishCard'
import { PollCard } from './service/PollCard'
import { StampCard } from './service/StampCard'
import { QuizCard } from './service/QuizCard'
import { PhotocardCard } from './service/PhotocardCard'
import { PaletteField } from './service/PaletteField'
import { checkThemeContrast } from './contrast'
import { repairContrast, type GeneratedTheme } from './aiTheme'
import { ImageField } from './ImageField'
import { StickerField } from './StickerField'
import { CardUploader } from './CardUploader'
import { OrganizerPanel } from './OrganizerPanel'
import { PeriodFields } from './PeriodFields'
import { periodLabel, rangeLabel, rangeInvalid } from './period'
import { validateSlug } from './slug'
import { onPreviewReady, postPreview, type PreviewState } from '@/slot/preview'
import { PREVIEW_SCREENS } from './previewScreens'
import { BackgroundField, bgRepeatValues } from './service/BackgroundField'
import {
  LUCKYDRAW_GROUPS,
  LUCKYDRAW_NEUTRALS,
  WEBFONTS,
  luckydrawDisplay,
  type FontId,
} from '@/data/luckydraw'
import { rollingDisplay } from '@/data/rolling'
import { photozoneDisplay, type PhotozoneDisplay } from '@/data/photozone'
import { wishDisplay, type WishDisplay } from '@/data/wish'
import { pollDisplay, type PollDisplay } from '@/data/poll'
import { stampDisplay, type StampDisplay } from '@/data/stamp'
import { quizDisplay, type QuizDisplay } from '@/data/quiz'
import { photocardDisplay, type PhotocardDisplay } from '@/data/photocard'
import { exportSlots } from './slotsFile'

/** radius 슬라이더 (시안) — 라벨 위, [슬라이더 · 숫자칸+px] 아래. 그리드 셀 한 줄 차지. */
function RadiusSlider({ label, value, max = 40, onChange }: { label: string; value: number; max?: number; onChange: (n: number) => void }) {
  return (
    <div style={CSS.fieldCol}>
      <span style={CSS.label}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <input type="range" min={0} max={Math.min(max, 32)} value={value} aria-label={label} onChange={(e) => onChange(Number(e.target.value))} style={CSS.range} />
        <div style={{ display: 'flex', alignItems: 'center', height: 30, border: '1px solid #dddddd', borderRadius: 4, overflow: 'hidden', flexShrink: 0 }}>
          <input value={value} onChange={(e) => onChange(Math.max(0, Math.min(max, Number(e.target.value) || 0)))} style={{ border: 'none', outline: 'none', width: 38, textAlign: 'center', fontSize: 12, background: '#fff', color: '#121212' }} />
          <span style={{ fontSize: 10.5, color: '#8a8a8a', padding: '0 7px', borderLeft: '1px solid #eeeeee' }}>px</span>
        </div>
      </div>
    </div>
  )
}

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
function LuckydrawExtra({
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
            hint="손님 눈엔 안 띄고 스태프는 찾을 정도로"
            onChange={(v) => patchLd({ adminLinkColor: v })}
          />
        </>
      )
    default:
      return null
  }
}

/** 색을 역할별로 묶어 보여준다 — 17개를 한 줄로 늘어놓으면 뭘 고치는지 모른다 */
const COLOR_GROUPS: {
  title: string
  keys: (keyof ThemeColors)[]
  hint?: string
  /**
   * 이 색 그룹을 보여줄 서비스 — 서비스가 늘면 여기 배열만 손댄다.
   * 럭키드로우는 중립색이 붙박이라(LUCKYDRAW_NEUTRALS) 어느 그룹에도 안 낀다.
   * 롤페는 타로 테마 토큰을 그대로 쓰되(배경·표면·CTA·포인트·텍스트), 카드가 없어 뒷면만 뺀다.
   */
  services: ServiceId[]
}[] = [
  { title: '배경 · 표면', keys: ['canvas', 'surface', 'surfaceRaised', 'wash'], services: ['tarot'] },
  {
    title: '인터랙션 (CTA · 활성)',
    keys: ['primary', 'primaryHover', 'onPrimary'],
    hint: '칩 · 보조버튼 글자색은 배경 밝기에 맞춰 자동 계산돼요.',
    services: ['tarot'],
  },
  {
    title: '포인트 (카드 테두리 · 별 문양)',
    keys: ['accent'],
    hint: '어두운 카드 위 장식 기준으로 고르세요. 표면 위 아이콘·글자에 쓰일 색은 표면 밝기에 맞춰 자동 계산돼요.',
    services: ['tarot'],
  },
  { title: '텍스트 · 보더', keys: ['fg1', 'fg2', 'fg3', 'border', 'borderHover'], services: ['tarot'] },
  // 카드 뒷면(그라디언트 색)은 아래 전용 "카드 뒷면" 카드에서 이미지와 함께 조합한다 (시안)
]

// primarySoft·accentSoft 는 자동 파생이라 편집기에 노출하지 않는다 → Partial
const COLOR_LABELS: Partial<Record<keyof ThemeColors, string>> = {
  canvas: '화면 바탕',
  surface: '카드 · 타일',
  surfaceRaised: '떠 있는 표면',
  wash: '보조 버튼 · 칩 배경',
  primary: '주요 CTA',
  primaryHover: 'CTA hover',
  onPrimary: 'CTA 글자',
  high: '당첨 배경',
  onHigh: '당첨 글자',
  accent: '포인트',
  fg1: '기본 텍스트',
  fg2: '보조 텍스트',
  fg3: '흐린 텍스트',
  border: '구분선',
  borderHover: '구분선 hover',
  cardBackFrom: '뒷면 그라디언트 (안)',
  cardBackTo: '뒷면 그라디언트 (바깥)',
}

const SHAPE_LABELS: Record<keyof ThemeShape, string> = {
  radiusSm: '미세 요소 radius',
  radiusMd: '버튼 · 토스트 radius',
  radiusLg: '카드 · 타일 radius',
}

/**
 * radiusLg 만 힌트가 있는 이유: 입력값이 **카드 크기에 따라 달라지기** 때문이다.
 * 안 밝히면 "16 을 넣었는데 덱 카드는 왜 안 둥그냐" 가 된다 (`lib/card.ts`).
 */

/**
 * 바탕 계열 프리셋 — 배경·표면·텍스트 9개만 밝은/어두운 쪽으로 한 번에 스왑한다.
 * 포인트·인터랙션 색(primary/accent/onPrimary)과 카드 뒷면은 슬롯의 브랜드 색이므로 건드리지 않는다.
 * 값은 tokens.css 의 다크 `:root` / `[data-theme='light']` 와 동일 — 자동 그림자 전환은 applyTheme() 이 캔버스 휘도로 처리한다.
 */
const BASE_KEYS = [
  'canvas', 'surface', 'surfaceRaised', 'wash', 'fg1', 'fg2', 'fg3', 'border', 'borderHover',
] as const satisfies readonly (keyof ThemeColors)[]

const BASE_PRESETS: { id: 'dark' | 'light'; label: string; base: Pick<ThemeColors, (typeof BASE_KEYS)[number]> }[] = [
  {
    id: 'dark',
    label: '다크 우선',
    base: {
      canvas: '#0F1020', surface: '#1A1B2E', surfaceRaised: '#242537', wash: '#241F45',
      fg1: '#F2F0FA', fg2: '#C6C3D8', fg3: '#9A97B0', border: '#2E2F45', borderHover: '#3A3B57',
    },
  },
  {
    id: 'light',
    label: '라이트 우선',
    base: {
      canvas: '#FAF8FF', surface: '#FFFFFF', surfaceRaised: '#FFFFFF', wash: '#F0EDFF',
      fg1: '#1A1B2E', fg2: '#4A4860', fg3: '#7A7791', border: '#E8E5F2', borderHover: '#D5D0E8',
    },
  },
]

/**
 * 키 순서에 흔들리지 않는 직렬화 — 객체 키를 재귀적으로 정렬해 문자열로 만든다.
 * "저장 안 됨" 판정에만 쓴다: JSONB 저장소가 키 순서를 바꿔 돌려줘도 값이 같으면 같다고 봐야 한다.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const obj = value as Record<string, unknown>
  const body = Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')
  return `{${body}}`
}

/**
 * 럭키드로우 미리보기용 아이패드 해상도 — 가로 기준. 기본은 가장 큰 프로.
 * 부스마다 세워두는 기기가 달라, 실제로 쓸 기기로 맞춰 봐야 여백·크기가 어긋나지 않는다.
 */
const IPADS = [
  { id: 'pro', w: 1366, h: 1024, label: '아이패드 프로' },
  { id: 'air', w: 1180, h: 820, label: '아이패드 에어' },
  { id: 'mini', w: 1024, h: 768, label: '아이패드 미니' },
] as const

/**
 * 슬롯 하나의 색·형태·이미지·이벤트 설정 — `/theme-editor/:slug`, **최고관리자 전용**
 * (Supabase 가 설정된 빌드에만 존재한다 — App.tsx).
 * 슬롯을 만들고 지우는 건 목록(SlotList)이 맡는다.
 * 주최자에겐 노출되지 않는다 (주최자는 질문/답변만 만진다).
 *
 * **고친 건 저장하기를 눌러야 반영된다.** 편집 중인 값은 초안(draft)에만 있고,
 * 저장할 때 비로소 저장소에 쓰여 미리보기·목록·내보내기에 나타난다.
 * 저장소가 DB 면 **저장이 곧 배포다** — 방문자 화면이 그 순간 바뀐다.
 * (주최자 질문 편집은 반대로 즉시 저장이다 — 거긴 저장을 잊어 날리는 게 더 나쁘다.)
 *
 * **주최자 계정 패널만 초안이 아니다** (`OrganizerPanel`) — 계정 생성은 되돌릴 수 없는
 * 서버 작업이라 초안에 담을 수가 없다. 그 패널이 스스로 그 사실을 말한다.
 */
export function SlotEditor() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  /** null = 아직 읽는 중. 다 읽었는데 못 찾으면 빈 배열이 아니라 saved 가 undefined 다 */
  const [slots, setSlots] = useState<Slot[] | null>(null)

  /** 저장된 값 — 초안과 비교해 "저장 안 됨" 을 가린다 */
  const saved = slots?.find((s) => s.slug === slug)
  const [draft, setDraft] = useState<Slot | undefined>(undefined)
  const [slugError, setSlugError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    void repo.slots.list().then(setSlots)
  }, [])

  // ── AI 색 만들기 ──
  const [baseColor, setBaseColor] = useState(saved?.theme.colors.primary ?? '#816BFF')
  const [aiMode, setAiMode] = useState<'light' | 'dark'>('dark')
  const [generating, setGenerating] = useState(false)
  const [themeError, setThemeError] = useState<string | null>(null)
  /** 대비가 모자라 손본 색 이름 — 조용히 바꾸면 "내가 고른 색이 아닌데?" 가 된다 */
  const [repaired, setRepaired] = useState<string[] | null>(null)
  const [aiReady, setAiReady] = useState(false)

  useEffect(() => {
    void repo.ai.ready().then(setAiReady)
  }, [])

  // 다 읽었거나 다른 슬롯으로 옮겨가면 그 슬롯의 저장된 값으로 초안을 새로 뜬다
  useEffect(() => {
    if (!slots) return
    const found = slots.find((s) => s.slug === slug)
    /**
     * **없는 색 키를 기본값으로 채운다.**
     *
     * 테마에 색을 새로 더하면 그 전에 저장된 슬롯엔 그 키가 없다 — `high`·`onHigh` 를
     * 추가했을 때 옛 슬롯을 열자 편집기가 통째로 하얗게 죽었다 (undefined 를 색으로 읽으려다).
     * 저장할 때 채우면 늦다: 화면이 먼저 그려지기 때문이다. 읽어오는 이 자리가 맞다.
     */
    setDraft(
      found && {
        ...found,
        theme: {
          ...found.theme,
          colors: { ...defaultThemeJson.colors, ...found.theme.colors },
        },
      }
    )
    setSlugError(null)
    // slots 는 저장할 때만 바뀐다 — 저장 직후 초안을 되짚는 건 같은 값이라 무해하다
  }, [slug, slots])

  /**
   * "저장 안 됨" 판정 — **키 순서를 무시하고** 비교한다.
   *
   * 저장소가 Supabase(JSONB)면 저장된 `theme`·`luckydraw` 가 **키 순서를 재정렬해서** 돌아온다.
   * 그냥 `JSON.stringify` 로 비교하면 값이 같아도 순서가 달라 문자열이 안 맞아, 저장한 뒤에도
   * 영영 "저장 안 됨"으로 남는다 (실제로 그렇게 새 필드가 늘며 터졌다). 키를 정렬해 비교한다.
   */
  const dirty = useMemo(
    () => Boolean(draft && saved) && stableStringify(draft) !== stableStringify(saved),
    [draft, saved]
  )

  /**
   * 실시간 미리보기 — 초안이 바뀔 때마다 iframe 으로 건너보낸다.
   *
   * 예전엔 저장된 슬롯을 띄우고 "저장하면 반영돼요" 라고 말했다. 색을 고를 때마다 저장을
   * 눌러야 보이니, 마음에 안 들면 되돌릴 방법이 없는 채로 저장이 쌓였다.
   */
  const previewFrame = useRef<HTMLIFrameElement>(null)
  /**
   * 지금 보고 있는 **화면** — 서비스마다 목록이 다르다 (`previewScreens.ts`).
   * 주소가 다른 화면(`/write`·`/staff`)도 여기 같이 들어 있어, 화면 고르기가 한 줄로 끝난다.
   */
  const [previewState, setPreviewState] = useState<PreviewState>('')

  /**
   * 럭키드로우 미리보기 기기 — 부스에 세워둔 아이패드를 **가로로** 쓴다. 모델마다 해상도가
   * 달라 골라볼 수 있게 둔다 (기본은 가장 큰 프로).
   */
  const [ipad, setIpad] = useState<'pro' | 'air' | 'mini'>('pro')
  const ipadSize = IPADS.find((d) => d.id === ipad) ?? IPADS[0]

  /**
   * 미리보기 기기 — **서비스마다 실제로 쓰는 기기가 다르다.**
   * 타로는 방문자가 자기 폰으로 보고, 럭키드로우는 아이패드를 가로로 쓴다.
   * 폰 세로로 보여주면 아이패드에서 어떻게 보일지 알 수 없어 미리보기가 제 일을 못 한다.
   */
  const previewDevice =
    draft && getSlotService(draft) === 'luckydraw'
      ? { w: ipadSize.w, h: ipadSize.h, label: `아이패드 가로 · ${ipadSize.label}` }
      : { w: 390, h: 844, label: '폰 세로' }

  /**
   * 편집기 오른쪽 칸은 아이패드보다 좁다 — 줄여서 통째로 보여준다.
   * **iframe 을 좁게 만들지 않는다**: 그러면 앱이 그 폭을 진짜 기기 폭으로 알고 모바일 배치로
   * 그려서, 아이패드에서 볼 화면과 다른 걸 보게 된다. 기기 크기로 그린 뒤 축소한다.
   */
  const previewBox = useRef<HTMLDivElement>(null)
  const [previewScale, setPreviewScale] = useState(1)
  /** '크게' — 미리보기를 위로 올리고 전체 폭을 준다 (아이패드 가로는 좁은 칸에선 못 읽는다) */
  const [previewBig, setPreviewBig] = useState(false)
  /**
   * 롤페·소원나무 미리보기 — 목록 / 작성 화면 전환.
   * 두 서비스가 같은 상태를 쓴다: 화면 구조가 같고(`/{slug}` 과 `/{slug}/write`),
   * 한 슬롯은 둘 중 하나만 되므로 상태를 나눌 이유가 없다.
   */
  const previewScreens = draft ? PREVIEW_SCREENS[getSlotService(draft)] : []
  /** 저장된 값이 이 서비스에 없는 이름이면(서비스를 바꿨다) 첫 화면으로 되돌린다 */
  const previewScreen =
    previewScreens.find((x) => x.state === previewState) ?? previewScreens[0] ?? { state: '', label: '' }
  /** 지금 만지는 색이 화면의 **어느 자리**인지 — 미리보기가 그 부분을 깜빡인다 */
  const [highlight, setHighlight] = useState<string | null>(null)

  useEffect(() => {
    const el = previewBox.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setPreviewScale(Math.min(1, entry.contentRect.width / previewDevice.w))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [previewDevice.w])

  useEffect(() => {
    if (draft) postPreview(previewFrame.current, { slot: draft, state: previewScreen.state, highlight })
  }, [draft, previewState, highlight])

  /**
   * iframe 이 "리스너 붙였다" 고 알려오면 그때 첫 초안을 보낸다.
   * `load` 이벤트에 맞춰 보내면 React 가 아직 안 붙어 있어 첫 장이 사라진다 —
   * 처음엔 저장본이 보이다가 뭔가 건드려야 초안으로 바뀌는 이상한 동작이 된다.
   */
  useEffect(() => {
    return onPreviewReady(() => {
      if (draft) postPreview(previewFrame.current, { slot: draft, state: previewScreen.state, highlight })
    })
  }, [draft, previewState, highlight])

  /**
   * 초안 고치기 — 이전 값을 딛고 고칠 땐(색·이미지처럼 theme 을 통째로 다시 만드는 경우)
   * 함수형으로 넘긴다. 렌더 시점 값을 펼치면 한 동작이 연달아 부른 patch 끼리 서로를 지운다
   * (앞면 업로드가 확장자·경로를 잇따라 고치다 확장자를 잃고 이미지가 404 났다).
   */
  const patchSlot = useCallback(
    (change: Partial<Slot> | ((prev: Slot) => Partial<Slot>)) => {
      setDraft((prev) =>
        prev ? { ...prev, ...(typeof change === 'function' ? change(prev) : change) } : prev
      )
    },
    []
  )

  const colors = draft?.theme.colors
  const contrast = useMemo(() => (colors ? checkThemeContrast(colors) : []), [colors])

  // 안 저장하고 나가려 하면 브라우저가 되묻는다
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  // 아직 읽는 중 — 여기서 목록으로 튕기면 새로고침할 때마다 편집기가 사라진다
  if (!slots) return <div className="owner" aria-busy="true" />
  // 다 읽었는데 없는 슬러그 — 지워진 슬롯의 편집 화면은 존재하지 않는다
  if (!saved) return <Navigate to="/theme-editor" replace />
  /**
   * 슬롯은 찾았는데 초안이 아직 없다 — 딱 한 프레임이다 (초안은 effect 가 채운다).
   *
   * **여기서 튕기면 안 된다.** `<Navigate>` 는 자식이라 그 effect 가 이 컴포넌트의
   * effect 보다 **먼저** 돈다 — 초안이 채워지기 전에 목록으로 나가버린다.
   * 슬롯을 localStorage 에서 동기로 읽던 시절엔 첫 렌더에 이미 초안이 있어 안 드러났고,
   * 슬롯이 DB 로 오면서 "슬롯 만들면 편집기로" 가 통째로 깨졌다.
   */
  if (!draft) return <div className="owner" aria-busy="true" />

  /**
   * **타로 전용 설정은 럭키드로우 슬롯에서 아예 안 보인다.**
   *
   * 카드 앞면·뒷면·수정구슬·플랜(AI 한도)·카테고리별 뽑기 설정은 럭키드로우에 쓰이는 데가
   * 하나도 없다. 남겨두면 최고관리자가 78장 앞면을 올리거나 AI 플랜을 고르고 있게 되고,
   * 그건 시간 낭비로 끝나지 않는다 — **안 쓰이는 값이 저장돼 있으면 나중에 누가 그걸 보고
   * "이 슬롯은 타로도 되나" 하고 헷갈린다.** 서비스가 정하는 건 화면만이 아니라 설정의 범위다.
   */
  const luckydraw = getSlotService(draft) === 'luckydraw'
  /**
   * 롤링페이퍼는 타로처럼 **테마 색·형태를 그대로 쓴다** (벽 배경·카드 틴트·버튼이 다 테마 토큰).
   * 그래서 색·형태 패널은 럭키드로우와 달리 숨기지 않고, 이미지 섹션만 롤페 전용 패널로 대신한다.
   */
  const rolling = getSlotService(draft) === 'rolling'
  /**
   * **타로 블록은 `!luckydraw && !rolling` 이 아니라 `tarot` 으로 판정한다.**
   *
   * 두 조건은 지금은 같은 값이지만, 서비스가 늘면 갈린다 — 부정 체인은 서비스가 추가될 때마다
   * `&& !photozone && !quiz …` 로 자라고, 한 번 빠뜨리면 **새 서비스 슬롯에 타로 설정
   * (78장 앞면 업로드·카테고리별 뽑기)이 통째로 뜬다.** 블록의 진짜 의미가 "타로일 때만" 이므로
   * 그대로 적는다. 이러면 서비스가 몇 개 늘어도 이 판정은 영영 안 건드린다.
   */
  const tarot = getSlotService(draft) === 'tarot'
  const photozone = getSlotService(draft) === 'photozone'
  const wish = getSlotService(draft) === 'wish'
  const rd = rollingDisplay(draft)
  const patchRolling = (change: Partial<typeof rd>) =>
    patchSlot((prev) => ({ rolling: { ...rollingDisplay(prev), ...change } }))
  const patchPhotozone = (change: Partial<PhotozoneDisplay>) =>
    patchSlot((prev) => ({ photozone: { ...photozoneDisplay(prev), ...change } }))
  const patchWish = (change: Partial<WishDisplay>) =>
    patchSlot((prev) => ({ wish: { ...wishDisplay(prev), ...change } }))
  const poll = getSlotService(draft) === 'poll'
  const patchPoll = (change: Partial<PollDisplay>) =>
    patchSlot((prev) => ({ poll: { ...pollDisplay(prev), ...change } }))
  const stamp = getSlotService(draft) === 'stamp'
  const patchStamp = (change: Partial<StampDisplay>) =>
    patchSlot((prev) => ({ stamp: { ...stampDisplay(prev), ...change } }))
  const quiz = getSlotService(draft) === 'quiz'
  const patchQuiz = (change: Partial<QuizDisplay>) =>
    patchSlot((prev) => ({ quiz: { ...quizDisplay(prev), ...change } }))
  const photocard = getSlotService(draft) === 'photocard'
  const patchPhotocard = (change: Partial<PhotocardDisplay>) =>
    patchSlot((prev) => ({ photocard: { ...photocardDisplay(prev), ...change } }))

  const patchColor = (key: keyof ThemeColors, value: string) =>
    patchSlot((prev) => ({
      theme: { ...prev.theme, colors: { ...prev.theme.colors, [key]: value } },
    }))

  /** 바탕 계열만 한 번에 스왑 — 브랜드 색(primary/accent 등)은 유지 */
  const applyBase = (base: Partial<ThemeColors>) =>
    patchSlot((prev) => ({ theme: { ...prev.theme, colors: { ...prev.theme.colors, ...base } } }))

  /**
   * 대표 색 하나 → 색 한 벌.
   *
   * AI 가 준 색을 **그대로 넣지 않는다.** `repairContrast` 가 안 읽히는 글자색만
   * 대비를 넘게 조정한다 — 모델이 뭘 주든 대비 검사 패널이 초록인 이유가 계산이 된다.
   * 저장은 안 한다. 미리보기로 보고 "저장하기"를 눌러야 반영된다 (다른 편집과 같다).
   */
  async function generateColors() {
    setThemeError(null)
    setRepaired(null)
    setGenerating(true)
    try {
      const raw = await repo.ai.generateTheme({
        baseColor,
        mode: aiMode,
        eventName: draft!.name || undefined,
      })
      const { colors, fixed } = repairContrast(raw as unknown as GeneratedTheme)
      patchSlot((prev) => ({ theme: { ...prev.theme, colors } }))
      setRepaired(fixed)
    } catch (e) {
      setThemeError(e instanceof Error ? e.message : '색을 만들지 못했어요')
    } finally {
      setGenerating(false)
    }
  }

  /** 이 슬롯에 적용된 플랜 — AI 한도가 여기서 나온다 */
  const plan = getPlan(draft)
  /** 실제 적용 한도 — 플랜 값을 슬롯이 덮어쓸 수 있다 */
  const limits = effectiveLimits(draft)

  /** 현재 캔버스 밝기로 어느 계열인지 표시 (일부만 수정했어도 대략 맞춘다) */
  const activeBase = isLight(draft.theme.colors.canvas) ? 'light' : 'dark'

  const patchShape = (key: keyof ThemeShape, value: number) =>
    patchSlot((prev) => ({ theme: { ...prev.theme, shape: { ...prev.theme.shape, [key]: value } } }))

  const patchAsset = (key: string, value: unknown) =>
    patchSlot((prev) => ({
      theme: { ...prev.theme, assets: { ...prev.theme.assets, [key]: value } },
    }))

  const patchEvent = (categoryId: string, change: Partial<CategorySetting>) =>
    patchSlot((prev) => ({
      event: { ...prev.event, [categoryId]: { ...prev.event[categoryId], ...change } },
    }))

  /**
   * 플랜을 바꾼다. 3장을 못 쓰는 플랜으로 내리면 **저장된 3장 설정을 같이 1장으로 내린다** —
   * 화면만 1장으로 보이고 데이터엔 3장이 남아 있으면, 방문자는 3장을 뽑는데 AI 는 한도 0 이라
   * 종합이 없는 3장(=가장 나쁜 화면)이 나간다.
   */
  const changePlan = (next: PlanId) =>
    patchSlot((prev) => {
      const p = planById(next)
      // 한도는 플랜 값으로 되돌린다 — 여기서부터 다시 올릴 수 있다
      const limits = { reading: p.readingLimit, answerGen: p.answerGenLimit }
      if (p.allowSpread) return { plan: next, limits }

      const event: EventConfig = {}
      for (const [id, setting] of Object.entries(prev.event)) {
        event[id] = { ...setting, cardCount: 1 }
      }
      return { plan: next, limits, event }
    })

  const patchLimit = (key: 'reading' | 'answerGen', value: number) =>
    patchSlot((prev) => ({
      limits: { ...effectiveLimits(prev), [key]: Math.max(0, value) },
    }))

  /**
   * 저장 — 여기서 비로소 저장소에 쓰인다 (DB 면 곧 배포다).
   * SlotProvider 가 다시 읽어 미리보기가 따라온다.
   */
  async function handleSave() {
    const reason = validateSlug(draft!.slug, slots!, saved!.slug)
    if (reason) {
      setSlugError(reason)
      return
    }
    setSlugError(null)
    setSaveError(null)

    // 거꾸로 된 기간을 저장하면 slot_open 이 영영 false 라 아무도 못 들어오는 슬롯이 된다
    if (rangeInvalid(draft!)) {
      setSaveError('기간의 종료일이 시작일보다 앞서요.')
      return
    }

    try {
      /**
       * 슬러그가 바뀌었으면 **옮긴다** — 새로 만들고 옛것을 지우는 게 아니다.
       * 지우면 그 슬롯의 질문·주최자 계정이 `on delete cascade` 로 같이 사라졌다
       * (`0004_slug_rename.sql`). 옛 행은 옮겨졌으므로 `/옛슬러그` 도 알아서 닫힌다.
       */
      await repo.slots.save(draft!, saved!.slug)

      setSlots(await repo.slots.list())
      // 슬러그를 바꿔 저장했으면 주소도 따라가야 한다 — 안 그러면 편집 중인 슬롯을 잃는다
      if (draft!.slug !== saved!.slug) navigate(`/theme-editor/${draft!.slug}`, { replace: true })
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : '저장하지 못했어요')
    }
  }

  function handleRevert() {
    if (!confirm('저장하지 않은 수정을 버릴까요?')) return
    setDraft(saved)
    setSlugError(null)
  }

  /** 안 저장한 채 목록으로 나가려 할 때 */
  function guardLeave(e: { preventDefault: () => void }) {
    if (dirty && !confirm('저장하지 않은 수정이 있어요. 그냥 나갈까요?')) e.preventDefault()
  }

  const themeColorKeys = COLOR_GROUPS.filter((g) =>
    g.services.includes(getSlotService(draft))
  ).flatMap((g) => g.keys)

  const radiiGrid = (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,200px),1fr))', gap: 14 }}>
      {(Object.keys(SHAPE_LABELS) as (keyof ThemeShape)[]).map((k) => (
        <RadiusSlider key={k} label={SHAPE_LABELS[k]} value={draft.theme.shape[k]} max={40} onChange={(n) => patchShape(k, n)} />
      ))}
    </div>
  )

  const planFacts: { label: string; value: string }[] = [
    { label: '3장 스프레드 (AI 종합 리딩)', value: plan.allowSpread ? '가능' : '불가 — 전부 1장' },
    {
      label: '질문 답변 AI 생성',
      value: limits.answerGen === 0 ? '없음 — 주최자가 직접 입력' : `${limits.answerGen}회 (재생성 포함)`,
    },
    { label: '한도를 넘으면', value: 'AI 종합만 빠지고 카드별 해석으로 계속' },
  ]

  const contrastPill = (level: string | null): { text: string; bg: string; fg: string } =>
    level === 'pass'
      ? { text: '통과', bg: '#e6f4ec', fg: '#22694a' }
      : level === 'large-only'
        ? { text: '큰 글자만', bg: '#fdf0e3', fg: '#a15c17' }
        : { text: '미달', bg: '#fdecec', fg: '#c0392b' }

  return (
    // 라이트 — 색을 눈으로 고르는 작업이라 도구는 밝게 고정한다 (.owner 가 서브트리를 라이트로 덮는다)
    <div className="owner">
      {/* ── 상단 스티키 바 (시안) ── */}
      <div
        style={{
          minHeight: 54,
          background: '#fff',
          borderBottom: '1px solid #eeeeee',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '8px 20px',
          position: 'sticky',
          top: 0,
          zIndex: 20,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <Link
            to="/theme-editor"
            onClick={guardLeave}
            aria-label="슬롯 목록"
            style={{
              width: 29,
              height: 29,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid #dddddd',
              background: '#fff',
              borderRadius: 4,
              color: '#505050',
              flexShrink: 0,
            }}
          >
            <ArrowLeft size={15} strokeWidth={2} aria-hidden="true" />
          </Link>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {draft.name || '(이름 없음)'}
            </div>
            <div style={{ fontSize: 11.5, color: '#8a8a8a' }}>/{saved.slug}</div>
          </div>
          <span
            data-save-state={saveError ? 'error' : dirty ? 'dirty' : 'saved'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 11.5,
              fontWeight: 700,
              whiteSpace: 'nowrap',
              padding: '4px 9px',
              borderRadius: 9999,
              ...(saveError
                ? { color: '#c0392b', background: '#fdecec' }
                : dirty
                  ? { color: '#a15c17', background: '#fdf0e3' }
                  : { color: '#816bff', background: '#f0edff' }),
            }}
          >
            {saveError ? (
              <>
                <AlertCircle size={12} strokeWidth={2.4} aria-hidden="true" />
                저장 실패
              </>
            ) : dirty ? (
              <>
                <AlertCircle size={12} strokeWidth={2.4} aria-hidden="true" />
                저장 안 됨
              </>
            ) : (
              <>
                <Check size={12} strokeWidth={2.4} aria-hidden="true" />
                저장됨
              </>
            )}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <a
            href={`/${saved.slug}/admin`}
            target="_blank"
            rel="noreferrer"
            style={{ ...CSS.ghostPill, height: 32, gap: 6, padding: '0 12px', fontSize: 12.5, textDecoration: 'none' }}
          >
            <ExternalLink size={14} strokeWidth={2} aria-hidden="true" />
            주최자 콘솔
          </a>
          {dirty && (
            <button type="button" onClick={handleRevert} style={{ ...CSS.ghostPill, height: 32, padding: '0 12px', fontSize: 12.5 }}>
              되돌리기
            </button>
          )}
          <button
            type="button"
            onClick={() => slots && exportSlots(slots)}
            style={{ ...CSS.ghostPill, height: 32, gap: 6, padding: '0 12px', fontSize: 12.5 }}
          >
            <Download size={14} strokeWidth={2} aria-hidden="true" />
            {hasSupabase ? '백업' : 'slots.json'}
          </button>
          <button
            type="button"
            data-save
            disabled={!dirty}
            onClick={() => void handleSave()}
            style={{ height: 32, padding: '0 18px', border: 'none', borderRadius: 9999, background: '#816bff', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: dirty ? 'pointer' : 'default', opacity: dirty ? 1 : 0.55, whiteSpace: 'nowrap' }}
          >
            저장하기
          </button>
        </div>
      </div>

      {/* ── 본문: 폼 컬럼 + 미리보기 컬럼 (시안 2열 그리드) ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: previewBig ? '1fr' : 'repeat(auto-fit,minmax(min(100%,430px),1fr))',
          gap: 20,
          maxWidth: 1440,
          margin: '0 auto',
          padding: '20px 20px 80px',
          alignItems: 'start',
        }}
      >
        {/* ── 폼 컬럼 ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>

          {/* 기본 */}
          <div style={CSS.card}>
            <div style={{ padding: '12px 18px', borderBottom: '1px solid #eeeeee', display: 'flex', alignItems: 'baseline', gap: '4px 9px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13.5, fontWeight: 700 }}>기본</span>
              <span style={{ fontSize: 11.5, color: '#8a8a8a' }}>모든 서비스 공통</span>
            </div>
            <div style={{ ...CSS.body, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,240px),1fr))', gap: 16 }}>
                <div style={CSS.fieldCol}>
                  <span style={CSS.label}>슬러그 (URL 경로)</span>
                  <div style={{ display: 'flex', alignItems: 'center', height: 34, border: '1px solid #dddddd', borderRadius: 4, background: '#fff', overflow: 'hidden' }}>
                    <span style={{ padding: '0 2px 0 10px', fontSize: 12.5, color: '#8a8a8a' }}>/</span>
                    <input
                      value={draft.slug}
                      onChange={(e) => {
                        patchSlot({ slug: e.target.value })
                        setSlugError(null)
                      }}
                      style={{ flex: 1, border: 'none', outline: 'none', height: '100%', fontSize: 13, fontWeight: 600, padding: '0 10px 0 0', minWidth: 0, background: '#fff', color: '#121212' }}
                    />
                  </div>
                  <span style={CSS.hint}>
                    /{saved.slug} 가 이 이벤트의 루트예요. 바꿔 저장하면 이미 올린 이미지는 옛 폴더에 남으니 다시 올려야 해요.
                  </span>
                  {slugError && <span style={{ fontSize: 11, color: '#f16361' }}>{slugError}</span>}
                </div>
                <Field label="이벤트명">
                  <input value={draft.name} onChange={(e) => patchSlot({ name: e.target.value })} style={CSS.input} />
                </Field>
              </div>
              <div>
                <div style={{ ...CSS.label, marginBottom: 7 }}>서비스</div>
                {/*
                  * **알약 한 줄이 아니라 카드 격자다.** 서비스가 아홉이 되면서 알약이 두 줄로
                  * 접히고, 이름만 있어서 "포토존" 과 "포토카드" 를 고를 때 무엇이 다른지
                  * 화면이 말해주지 못했다. 카드에 한 줄 설명을 같이 둔다.
                  */}
                <div
                  role="radiogroup"
                  aria-label="서비스"
                  style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,168px),1fr))', gap: 8 }}
                >
                  {SERVICES.map((s) => {
                    const on = getSlotService(draft) === s.id
                    return (
                      <button
                        key={s.id}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        data-service={s.id}
                        onClick={() => {
                          patchSlot({ service: s.id })
                          if (s.id === 'luckydraw') applyBase(LUCKYDRAW_NEUTRALS)
                        }}
                        style={{
                          textAlign: 'left',
                          padding: '11px 13px',
                          borderRadius: 8,
                          cursor: 'pointer',
                          border: `1px solid ${on ? '#816bff' : '#e4e4ea'}`,
                          background: on ? '#f5f2ff' : '#fff',
                          // 선택된 카드만 한 겹 더 — 테두리 색만으로는 훑을 때 안 잡힌다
                          boxShadow: on ? '0 0 0 1px #816bff inset' : 'none',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: on ? '#5b45d6' : '#121212' }}>
                            {s.label}
                          </span>
                          {on && <Check size={13} strokeWidth={3} color="#816bff" aria-hidden="true" />}
                        </div>
                        <div style={{ marginTop: 3, fontSize: 11, lineHeight: 1.5, color: on ? '#7a6bc4' : '#8a8a8a' }}>
                          {s.hint}
                        </div>
                      </button>
                    )
                  })}
                </div>
                {/* 설명은 **고른 서비스 기준**이다 — 서비스가 아홉인데 삼항으로 갈라 두면
                    새 서비스가 조용히 타로 문장을 받는다 (그 함정을 여기서도 안 만든다) */}
                <div style={{ fontSize: 11.5, color: '#8a8a8a', marginTop: 10, lineHeight: 1.55 }}>
                  이 슬롯이 파는 것 — 아래 <b>{serviceLabel(getSlotService(draft))}</b> 칸에서 그 서비스의
                  문구·색·이미지를 정해요. 색·형태는 위 테마를 따라갑니다.
                </div>
              </div>
            </div>
          </div>

          {/* 공통 설정 — 기본 바로 아래에 기간 · 주최자 계정 · 웹앱 아이콘 (세팅 흐름 순) */}
          <div style={CSS.card}>
            <div style={CSS.headFlex}>
              <span style={{ fontSize: 13.5, fontWeight: 700 }}>기간</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {rangeLabel(draft.period?.test) && (
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: '#505050', background: '#eeeeee', padding: '4px 9px', borderRadius: 9999 }}>
                    테스트 {rangeLabel(draft.period?.test)}
                  </span>
                )}
                <span style={{ fontSize: 11.5, fontWeight: 700, color: '#816bff', background: '#f0edff', padding: '4px 9px', borderRadius: 9999 }}>{periodLabel(draft)}</span>
              </span>
            </div>
            <div style={{ ...CSS.body, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <PeriodFields period={draft.period} onChange={(period) => patchSlot(() => ({ period }))} />
              {rangeInvalid(draft) && <div style={{ fontSize: 11.5, color: '#f16361' }}>종료일이 시작일보다 앞서요.</div>}
              <div style={{ fontSize: 11, color: '#8a8a8a', lineHeight: 1.6, paddingTop: 12, borderTop: '1px solid #eeeeee' }}>
                대여 종료 <b>+15일</b>이 지나면 슬롯이 자동 삭제돼요 (비워 두면 삭제 안 함).
                {luckydraw ? ' 럭키드로우는 종료 +14일까지 배송 정보를 꺼낼 수 있어요.' : ''}
              </div>
            </div>
          </div>

          {repo.organizers.ready() && (
            <OrganizerPanel slot={saved} slugPending={draft.slug !== saved.slug} />
          )}

          <Card title="웹앱 아이콘">
            <p style={{ margin: '0 0 14px', fontSize: 11.5, color: '#8a8a8a', lineHeight: 1.6 }}>
              방문자가 브라우저에서 “홈 화면에 추가” 하면 이 아이콘과 행사명으로 앱처럼 열려요. 정사각형 PNG 를 권장해요 (512×512).
            </p>
            <ImageField slug={saved.slug} label="앱 아이콘" name="app-icon" title="앱 아이콘" value={draft.theme.assets.appIcon} onChange={(v) => patchAsset('appIcon', v)} thumbW={60} thumbH={60} thumbRadius={8} hint="없으면 홈 화면 아이콘이 기본으로 떠요." />
          </Card>

          {/* 공통 → 서비스 설정 구분선 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 2 }}>
            <div style={{ height: 1, background: '#eeeeee', flex: 1 }} />
            <span style={{ fontSize: 11.5, fontWeight: 700, color: '#8a8a8a', whiteSpace: 'nowrap' }}>
              서비스 설정 · {serviceLabel(getSlotService(draft))}
            </span>
            <div style={{ height: 1, background: '#eeeeee', flex: 1 }} />
          </div>

          {/* 색 만들기 — 타로만. 럭드는 색이 몇 개뿐이고, 롤페는 자체 색을 롤페 카드에서 고른다 */}
          {tarot && (
            <Card title="색 만들기">
              <p style={{ margin: '0 0 16px', fontSize: 11.5, color: '#8a8a8a', lineHeight: 1.6 }}>
                대표 색 하나와 밝기만 정하면 나머지 색을 다 만들어요. 마음에 안 드는 색은 아래에서 손으로 고치면 됩니다. 읽히는지는 자동으로 맞춰요 — 안 읽히는 색은 대비를 넘게 조정해서 넣습니다.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,230px),1fr))', gap: 16, alignItems: 'start' }}>
                <Field label="대표 색" hint="팬이 아는 그 색. CTA 버튼에 쓰여요.">
                  <div style={{ ...CSS.colorPill, height: 34 }}>
                    <Swatch value={baseColor} label="대표 색" size={32} onChange={setBaseColor} />
                    <input value={baseColor} onChange={(e) => setBaseColor(e.target.value)} style={{ border: 'none', outline: 'none', flex: 1, minWidth: 0, fontSize: 12.5, padding: '0 9px', background: '#fff', color: '#121212' }} />
                  </div>
                </Field>
                <div style={CSS.fieldCol}>
                  <span style={CSS.label}>밝기</span>
                  <select value={aiMode} onChange={(e) => setAiMode(e.target.value === 'light' ? 'light' : 'dark')} style={CSS.select}>
                    <option value="dark">다크 — 어두운 화면</option>
                    <option value="light">라이트 — 밝은 화면</option>
                  </select>
                  {aiReady && (
                    <button
                      type="button"
                      onClick={() => void generateColors()}
                      disabled={generating}
                      style={{ height: 34, marginTop: 2, border: 'none', borderRadius: 9999, background: '#f0edff', color: '#816bff', fontSize: 12.5, fontWeight: 700, cursor: generating ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, opacity: generating ? 0.6 : 1 }}
                    >
                      <Sparkles size={14} strokeWidth={2} aria-hidden="true" />
                      {generating ? '만드는 중…' : 'AI로 색 만들기'}
                    </button>
                  )}
                </div>
              </div>
              {themeError && <div style={{ marginTop: 12, fontSize: 11.5, color: '#f16361' }}>{themeError}</div>}
              {repaired && repaired.length > 0 && (
                <div style={{ marginTop: 12, fontSize: 11.5, color: '#8a8a8a', lineHeight: 1.5 }}>
                  대비가 모자라 <b style={{ color: '#505050' }}>{repaired.join(', ')}</b> 색을 읽히게 조정했어요.
                </div>
              )}
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #eeeeee', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: '#505050' }}>
                  바탕만 밝기 계열로 바꾸기 <span style={{ color: '#8a8a8a' }}>(브랜드 색은 그대로)</span>
                </span>
                <div style={{ display: 'inline-flex', background: '#f7f7f7', border: '1px solid #eeeeee', borderRadius: 9999, padding: 3, gap: 2 }}>
                  {BASE_PRESETS.map((p) => {
                    const on = activeBase === p.id
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => applyBase(p.base)}
                        style={{ height: 28, padding: '0 15px', border: 'none', borderRadius: 9999, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: on ? '#fff' : 'transparent', color: on ? '#121212' : '#8a8a8a' }}
                      >
                        {p.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </Card>
          )}

          {/* ══ 타로 서비스 설정 ══ */}
          {tarot && (
            <>
              <Card title="테마 색 · 형태">
                {themeColorKeys.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,250px),1fr))', gap: '12px 24px' }}>
                    {themeColorKeys.map((k) => (
                      <SwatchColor key={k} id={`c-${k}`} label={COLOR_LABELS[k] ?? k} value={draft.theme.colors[k]} onChange={(v) => patchColor(k, v)} />
                    ))}
                  </div>
                )}
                <div style={{ marginTop: themeColorKeys.length > 0 ? 16 : 0, paddingTop: themeColorKeys.length > 0 ? 14 : 0, borderTop: themeColorKeys.length > 0 ? '1px solid #eeeeee' : 'none' }}>
                  {radiiGrid}
                </div>
              </Card>

              <Card title="로고 · 배경 이미지">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,240px),1fr))', gap: 16 }}>
                  <Field label="로고">
                    <ImageField slug={saved.slug} label="로고" name="logo" value={draft.theme.assets.logo} onChange={(v) => patchAsset('logo', v)} hint="없으면 이벤트명 텍스트가 나와요." />
                  </Field>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 10, alignItems: 'start' }}>
                    <Field label="로고 대체 텍스트">
                      <input value={draft.theme.assets.logoAlt} onChange={(e) => patchAsset('logoAlt', e.target.value)} style={CSS.input} />
                    </Field>
                    <Field label="로고 높이 (px)">
                      <input type="number" min={16} max={80} value={draft.theme.assets.logoHeight} onChange={(e) => patchAsset('logoHeight', Number(e.target.value))} style={CSS.input} />
                    </Field>
                  </div>
                  <BackgroundField
                    slug={saved.slug}
                    name="background"
                    label="배경 이미지"
                    value={draft.theme.assets.backgroundPattern}
                    repeat={draft.theme.assets.backgroundPatternRepeat === 'repeat'}
                    onImage={(v) => patchAsset('backgroundPattern', v)}
                    onRepeat={(on) =>
                      patchSlot((prev) => ({
                        theme: { ...prev.theme, assets: { ...prev.theme.assets, ...bgRepeatValues(on) } },
                      }))
                    }
                    hint="비우면 배경색을 써요."
                  />
                </div>
              </Card>

              <Card title="카드 뒷면">
                <div style={{ paddingBottom: 14, borderBottom: '1px solid #eeeeee' }}>
                  <ImageField slug={saved.slug} label="뒷면 이미지" name="card-back" title="뒷면 이미지" value={draft.theme.assets.cardBack} onChange={(v) => patchAsset('cardBack', v)} thumbW={52} thumbH={78} hint="78장 공통으로 쓰여요. 없으면 아래 내장 문양을 써요." />
                </div>
                <div style={{ fontSize: 11.5, color: '#8a8a8a', margin: '14px 0 12px' }}>뒷면 이미지가 없을 때 쓰는 내장 문양 그라디언트예요.</div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div aria-hidden="true" style={{ width: 52, height: 78, borderRadius: 4, border: '1px solid #eeeeee', flexShrink: 0, background: `linear-gradient(150deg, ${draft.theme.colors.cardBackFrom}, ${draft.theme.colors.cardBackTo})` }} />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 9, minWidth: 0 }}>
                    {(['cardBackFrom', 'cardBackTo'] as const).map((k) => (
                      <SwatchColor key={k} label={COLOR_LABELS[k] ?? k} value={draft.theme.colors[k]} onChange={(v) => patchColor(k, v)} />
                    ))}
                  </div>
                </div>
              </Card>

              <Card title="카드 앞면">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                  <span style={CSS.label}>사용할 카드 범위</span>
                  <select id="card-deck" value={getSlotDeck(draft)} onChange={(e) => patchSlot({ deck: e.target.value as DeckRange })} style={{ ...CSS.select, width: 'auto', height: 32 }}>
                    <option value="major">메이저 22장</option>
                    <option value="full">메이저 + 마이너 78장</option>
                  </select>
                </div>
                <p style={{ margin: '0 0 14px', fontSize: 11, color: '#8a8a8a', lineHeight: 1.6 }}>
                  이 슬롯 전체의 카드 범위예요 — 도감·뽑기·질문 답변칸이 모두 이 값을 따릅니다. 선택한 범위만큼 앞면을 올리면 되고, 안 올린 카드는 이름 텍스트로 나옵니다.
                </p>
                <CardUploader
                  slug={saved.slug}
                  deck={getSlotDeck(draft)}
                  ext={draft.theme.assets.cardFrontExt}
                  onExtChange={(ext) => patchAsset('cardFrontExt', ext)}
                  onBaseChange={(base) => patchAsset('cardFrontBase', base)}
                  version={draft.theme.assets.cardFrontVersion ?? null}
                  onVersionChange={(v) => patchAsset('cardFrontVersion', v)}
                />
              </Card>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,280px),1fr))', gap: 14 }}>
                <Card title="수정구슬">
                  <ImageField slug={saved.slug} label="수정구슬" name="crystal-ball" title="수정구슬 (AI 리딩 로더)" value={draft.theme.assets.crystalBall} onChange={(v) => patchAsset('crystalBall', v)} thumbW={56} thumbH={56} thumbRadius={9999} hint="3장 리딩을 만드는 동안 뜨는 구슬이에요. 없으면 내장 SVG 구슬을 써요." />
                </Card>
                <Card title="이벤트 설정">
                  <p style={{ margin: '0 0 13px', fontSize: 11, color: '#8a8a8a', lineHeight: 1.6 }}>
                    {plan.allowSpread
                      ? '3장을 고르면 카드들을 순서대로 이어 읽는 AI 종합이 붙어요. 1장은 AI 를 안 씁니다.'
                      : `${plan.label} 플랜은 전부 1장이에요 — 3장 스프레드(AI 종합)는 스탠다드부터입니다.`}
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                    {CATEGORIES.map((c) => {
                      const counts = Object.keys(c.spreads).map(Number)
                      if (counts.length < 2) return null
                      const allowed = plan.allowSpread ? counts : counts.filter((n) => n === 1)
                      const current = plan.allowSpread ? (draft.event[c.id]?.cardCount ?? c.defaultCount) : 1
                      return (
                        <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                          <span style={{ fontSize: 12.5, color: '#505050' }}>{c.label} 뽑는 수</span>
                          <select
                            disabled={!plan.allowSpread}
                            value={current}
                            onChange={(e) => patchEvent(c.id, { cardCount: Number(e.target.value) })}
                            style={{ ...CSS.select, width: 'auto', height: 30 }}
                          >
                            {allowed.map((n) => (
                              <option key={n} value={n}>{n}장</option>
                            ))}
                          </select>
                        </div>
                      )
                    })}
                  </div>
                </Card>
              </div>

              <Card title="플랜">
                <p style={{ margin: '0 0 15px', fontSize: 11.5, color: '#8a8a8a', lineHeight: 1.6 }}>
                  이 슬롯에 적용할 플랜이에요. AI 한도가 여기서 나와요 — 한도를 넘으면 AI 종합만 빠지고 카드별 해석으로 계속 돌아가요 (앱이 멈추지는 않아요).
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,190px),1fr))', gap: 14 }}>
                  <Field label="플랜">
                    <select data-plan value={plan.id} onChange={(e) => changePlan(e.target.value as PlanId)} style={CSS.select}>
                      {PLANS.map((p) => (
                        <option key={p.id} value={p.id}>{p.label}</option>
                      ))}
                    </select>
                  </Field>
                  <Field
                    label="AI 리딩 한도 (회)"
                    hint={plan.allowSpread ? `${plan.label} 기본 ${plan.readingLimit.toLocaleString()}회` : `${plan.label} 플랜은 전부 1장이라 AI 리딩이 없어요.`}
                  >
                    <input data-limit-reading type="number" min={0} step={100} value={limits.reading} disabled={!plan.allowSpread} onChange={(e) => patchLimit('reading', Number(e.target.value))} style={CSS.input} />
                  </Field>
                  <Field label="답변 AI 생성 한도 (회)" hint={`재생성 포함. ${plan.label} 기본 ${plan.answerGenLimit}회`}>
                    <input data-limit-gen type="number" min={0} value={limits.answerGen} onChange={(e) => patchLimit('answerGen', Number(e.target.value))} style={CSS.input} />
                  </Field>
                </div>
                <div data-plan-facts style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #eeeeee', display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {planFacts.map((p) => (
                    <div key={p.label} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, color: '#8a8a8a' }}>{p.label}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#121212', textAlign: 'right' }}>{p.value}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </>
          )}

          {/* ══ 럭키드로우 서비스 설정 ══ */}
          {luckydraw && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,290px),1fr))', gap: 14 }}>
              {LUCKYDRAW_GROUPS.map((g, i) => (
                <div key={g.title} style={{ ...CSS.card, ...(i === 0 ? { gridColumn: '1 / -1' } : null) }}>
                  <div style={CSS.head}>{g.title}</div>
                  <div style={CSS.body}>
                    {g.hint && <p style={{ margin: '0 0 15px', fontSize: 11.5, color: '#8a8a8a', lineHeight: 1.6 }}>{g.hint}</p>}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,220px),1fr))', gap: 14 }}>
                      {(g.colors ?? []).map((f) => {
                        const key = f.key as keyof ThemeColors
                        return (
                          <div
                            key={f.key}
                            onMouseEnter={() => setHighlight(f.part)}
                            onFocusCapture={() => setHighlight(f.part)}
                            onMouseLeave={() => setHighlight(null)}
                          >
                            {f.alpha ? (
                              <AlphaColor label={f.label} value={draft.theme.colors[key]} hint={f.hint} onChange={(v) => patchColor(key, v)} />
                            ) : (
                              <SwatchColor label={f.label} hint={f.hint} value={draft.theme.colors[key]} onChange={(v) => patchColor(key, v)} />
                            )}
                          </div>
                        )
                      })}
                      {(g.extras ?? []).map((x) => (
                        <LuckydrawExtra key={x} kind={x} draft={draft} slug={saved.slug} patchSlot={patchSlot} patchShape={patchShape} patchAsset={patchAsset} />
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ══ 포토존 서비스 설정 ══ (카드가 별도 파일에 있다 — service/PhotozoneCard.tsx 주석) */}
          {photozone && <PhotozoneCard slot={draft} patch={patchPhotozone} />}

          {/* ══ 소원나무 서비스 설정 ══ */}
          {wish && <WishCard slot={draft} patch={patchWish} />}

          {/* ══ 실시간 투표 설정 ══ */}
          {poll && <PollCard slot={draft} patch={patchPoll} />}
          {/*
            * 배경 이미지는 **모든 서비스가 쓸 수 있다** (`.app::before` 가 어느 앱에서든 그린다).
            * 자기 배경 칸이 이미 있는 서비스(타로 테마 카드 · 럭드 · 포토카드 · 소원나무 ·
            * 롤페 · 포토존)엔 두 번 두지 않는다.
            */}
          {(poll || stamp || quiz) && (
            <Card title="배경 이미지">
              <p style={{ margin: '0 0 14px', fontSize: 11.5, color: '#8a8a8a', lineHeight: 1.6 }}>
                올린 그대로 화면 뒤에 깔려요. <b>투명도 같은 건 안 씌웁니다</b> — 크기와 반복만 정해요.
              </p>
              <BackgroundField
                slug={saved.slug}
                name="background"
                value={draft.theme.assets.backgroundPattern}
                repeat={draft.theme.assets.backgroundPatternRepeat === 'repeat'}
                onImage={(v) => patchAsset('backgroundPattern', v)}
                onRepeat={(on) =>
                  patchSlot((prev) => ({
                    theme: { ...prev.theme, assets: { ...prev.theme.assets, ...bgRepeatValues(on) } },
                  }))
                }
              />
            </Card>
          )}

          {/* ══ 방문 스탬프 설정 ══ (칸 정의가 여기 있는 이유는 StampCard.tsx 주석) */}
          {stamp && <StampCard slot={draft} patch={patchStamp} />}

          {/* ══ 최애 모의고사 설정 ══ (칭호가 여기 있는 이유는 QuizCard.tsx 주석) */}
          {quiz && <QuizCard slot={draft} patch={patchQuiz} />}

          {/* ══ 포토카드 뽑기 설정 ══ (카드 목록이 여기 있는 이유는 PhotocardCard.tsx 주석) */}
          {photocard && (
            <PhotocardCard
              slot={draft}
              patch={patchPhotocard}
              patchAsset={(k, v) => patchAsset(k, v)}
              onRepeat={(on) =>
                patchSlot((prev) => ({
                  theme: { ...prev.theme, assets: { ...prev.theme.assets, ...bgRepeatValues(on) } },
                }))
              }
            />
          )}

          {/* ══ 롤링페이퍼 서비스 설정 ══ */}
          {rolling && (
            <>
              <Card title="롤링페이퍼">
                <p style={{ margin: '0 0 16px', fontSize: 11.5, color: '#8a8a8a', lineHeight: 1.6 }}>
                  방문자가 포스트잇으로 메시지를 남기면 벽에 쌓여요. 남긴 즉시 벽에 보이고, 부적절한 건 주최자가 숨겨요. 아래 색·글꼴은 롤페 전용이에요 (위 테마와 별개).
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,240px),1fr))', gap: 14 }}>
                  <div style={CSS.fieldCol}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 19 }}>
                      <span style={CSS.label}>벽 제목</span>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#8a8a8a', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        <input type="checkbox" checked={rd.showTitle} onChange={(e) => patchRolling({ showTitle: e.target.checked })} style={{ width: 14, height: 14, accentColor: '#816bff', cursor: 'pointer' }} />
                        벽에 보이기
                      </label>
                    </div>
                    <input value={rd.wallTitle} onChange={(e) => patchRolling({ wallTitle: e.target.value })} style={CSS.input} />
                  </div>
                  <div style={CSS.fieldCol}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 19 }}>
                      <span style={CSS.label}>벽 부제</span>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#8a8a8a', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        <input type="checkbox" checked={rd.showSubtitle} onChange={(e) => patchRolling({ showSubtitle: e.target.checked })} style={{ width: 14, height: 14, accentColor: '#816bff', cursor: 'pointer' }} />
                        벽에 보이기
                      </label>
                    </div>
                    <input value={rd.wallSubtitle} onChange={(e) => patchRolling({ wallSubtitle: e.target.value })} style={CSS.input} />
                  </div>
                  <Field label="입력 안내" hint="작성 화면 메시지칸에 흐리게 뜨는 문구예요.">
                    <input value={rd.prompt} onChange={(e) => patchRolling({ prompt: e.target.value })} style={CSS.input} />
                  </Field>
                  <Field label="남기기 버튼">
                    <input value={rd.postLabel} onChange={(e) => patchRolling({ postLabel: e.target.value })} style={CSS.input} />
                  </Field>
                </div>
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #eeeeee', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,240px),1fr))', gap: 16 }}>
                  <Field label="기본 글꼴" hint="제목·UI 글꼴이에요. 쪽지 글씨체는 방문자가 골라요.">
                    <select value={rd.font} onChange={(e) => patchRolling({ font: e.target.value as FontId })} style={CSS.select}>
                      {Object.entries(WEBFONTS).map(([id, f]) => (
                        <option key={id} value={id}>{f.label}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="글씨체 예시 텍스트" hint="작성 화면 글씨체 고르기에 이 문구로 미리보기가 떠요 (폰트명 대신).">
                    <input value={rd.fontSample} onChange={(e) => patchRolling({ fontSample: e.target.value })} style={CSS.input} />
                  </Field>
                </div>
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #eeeeee', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,250px),1fr))', gap: '12px 24px' }}>
                  {(
                    [
                      ['headText', '글자색', '제목 · 헤더'],
                      ['subText', '서브 글자색', '부제 · 안내'],
                      ['noteBody', '포스트잇 본문색'],
                      ['noteName', '이름색'],
                      ['boardBg', '벽 배경색', '배경 이미지가 없을 때'],
                      ['buttonColor', '버튼색', '남기기 · 보내기'],
                    ] as ['headText' | 'subText' | 'noteBody' | 'noteName' | 'boardBg' | 'buttonColor', string, string?][]
                  ).map(([key, label, hint]) => (
                    <SwatchColor key={key} label={label} hint={hint} value={rd[key]} onChange={(v) => patchRolling({ [key]: v } as Partial<typeof rd>)} />
                  ))}
                </div>
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #eeeeee' }}>
                  {/* 소원나무도 같은 위젯을 쓴다 (등불색) — service/PaletteField.tsx */}
                  <PaletteField
                    label="포스트잇 종이색"
                    hint="방문자가 쪽지마다 고르는 색이에요. 파스텔 여러 색이 벽을 알록달록하게 해요."
                    value={rd.papers}
                    onChange={(papers) => patchRolling({ papers })}
                  />
                </div>
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #eeeeee', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,230px),1fr))', gap: 16 }}>
                  <div style={CSS.fieldCol}>
                    <span style={{ ...CSS.label, minHeight: 19, display: 'flex', alignItems: 'center' }}>로고</span>
                    <ImageField slug={saved.slug} label="로고" name="rolling-logo" value={rd.logo || null} onChange={(v) => patchRolling({ logo: v ?? '' })} hint="벽 헤더에 떠요. 없으면 제목 텍스트가 나와요." />
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ ...CSS.fieldCol, flex: 1, minWidth: 130 }}>
                        <span style={CSS.label}>위치</span>
                        <div role="radiogroup" aria-label="로고 위치" style={{ display: 'inline-flex', background: '#f7f7f7', border: '1px solid #eeeeee', borderRadius: 9999, padding: 3, gap: 2 }}>
                          {(['left', 'center', 'right'] as const).map((a) => {
                            const on = rd.logoAlign === a
                            return (
                              <button
                                key={a}
                                type="button"
                                role="radio"
                                aria-checked={on}
                                onClick={() => patchRolling({ logoAlign: a })}
                                style={{ flex: 1, height: 28, padding: '0 12px', border: 'none', borderRadius: 9999, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: on ? '#fff' : 'transparent', color: on ? '#121212' : '#8a8a8a' }}
                              >
                                {a === 'left' ? '왼쪽' : a === 'center' ? '가운데' : '오른쪽'}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                      <label style={{ ...CSS.fieldCol, width: 110 }}>
                        <span style={CSS.label}>위 여백 (px)</span>
                        <input type="number" min={0} max={200} value={rd.logoMarginTop} onChange={(e) => patchRolling({ logoMarginTop: Math.max(0, Number(e.target.value) || 0) })} style={CSS.input} />
                      </label>
                    </div>
                  </div>
                  <BackgroundField
                    slug={saved.slug}
                    name="rolling-wallbg"
                    label="벽 배경 이미지"
                    value={rd.wallBg || null}
                    repeat={rd.wallBgRepeat}
                    onImage={(v) => patchRolling({ wallBg: v ?? '' })}
                    onRepeat={(on) => patchRolling({ wallBgRepeat: on })}
                    hint="비우면 벽 배경색을 써요."
                  />
                </div>
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #eeeeee' }}>
                  <div style={{ ...CSS.label, marginBottom: 9 }}>스티커</div>
                  <StickerField slug={saved.slug} label="스티커" value={rd.stickers} onChange={(next) => patchRolling({ stickers: next })} hint="방문자가 쪽지에 붙일 수 있어요. 주최자에게 받은 이미지를 올려 주세요." />
                </div>
              </Card>

              {/* 롤페는 미세 요소(radiusSm)를 쓰는 데가 없어 뺀다 — 버튼·토스트, 카드·타일만 */}
              <Card title="테마 색 · 형태">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,200px),1fr))', gap: 14 }}>
                  {(['radiusMd', 'radiusLg'] as (keyof ThemeShape)[]).map((k) => (
                    <RadiusSlider key={k} label={SHAPE_LABELS[k]} value={draft.theme.shape[k]} max={40} onChange={(n) => patchShape(k, n)} />
                  ))}
                </div>
              </Card>
            </>
          )}

          {/* 대비 검사 */}
          <div style={CSS.card}>
            <div style={CSS.head}>대비 검사</div>
            <div style={{ padding: '8px 18px 14px' }}>
              {contrast.map(({ label, ratio, level }) => {
                const pill = contrastPill(level)
                return (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '9px 0', borderBottom: '1px solid #eeeeee', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: '#505050' }}>{label}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <span style={{ fontSize: 12, fontWeight: 700 }}>{ratio === null ? '색 오류' : `${ratio.toFixed(2)} : 1`}</span>
                      {ratio !== null && (
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 9999, background: pill.bg, color: pill.fg, whiteSpace: 'nowrap' }}>{pill.text}</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* ── 미리보기 컬럼 (시안 프레임 안에 실제 iframe). 크게 누르면 맨 위로(order -1) ── */}
        <div style={{ order: previewBig ? -1 : 0, position: previewBig ? 'static' : 'sticky', top: 74, width: '100%', maxWidth: previewBig ? undefined : 520, marginInline: 'auto', minWidth: 0 }}>
          <div style={CSS.card}>
            <div style={{ padding: '11px 15px', borderBottom: '1px solid #eeeeee', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <Eye size={14} strokeWidth={2} color="#505050" aria-hidden="true" />
                <span style={{ fontSize: 12.5, fontWeight: 700 }}>미리보기</span>
                {dirty && <span style={{ fontSize: 11, color: '#8a8a8a' }}>· 저장 전 초안</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <select
                  value={luckydraw ? ipad : 'phone'}
                  onChange={(e) => luckydraw && setIpad(e.target.value as 'pro' | 'air' | 'mini')}
                  style={{ ...CSS.select, height: 28, padding: '0 28px 0 8px', fontSize: 11.5 }}
                >
                  {luckydraw ? (
                    IPADS.map((d) => (
                      <option key={d.id} value={d.id}>{d.label} ({d.w}×{d.h})</option>
                    ))
                  ) : (
                    <option value="phone">폰 세로 (390×844)</option>
                  )}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    const next = !previewBig
                    setPreviewBig(next)
                    // 크게로 켜면 어디서 눌렀든 맨 위로 올려 큰 미리보기를 바로 보여준다 (즉시)
                    if (next) window.scrollTo(0, 0)
                  }}
                  style={{ ...CSS.ghostPill, height: 28, padding: '0 11px', fontSize: 11.5 }}
                >
                  {previewBig ? '작게' : '크게'}
                </button>
              </div>
            </div>

            {previewScreens.length > 1 && (
              <div style={{ padding: '9px 15px', borderBottom: '1px solid #eeeeee', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {previewScreens.map((screen) => {
                  const on = previewScreen.state === screen.state
                  return (
                    <button
                      key={screen.state}
                      type="button"
                      onClick={() => setPreviewState(screen.state)}
                      style={{ height: 27, padding: '0 12px', border: `1px solid ${on ? '#816bff' : '#dddddd'}`, background: on ? '#f0edff' : '#fff', color: on ? '#816bff' : '#505050', borderRadius: 9999, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                      data-preview-screen={screen.state}
                    >
                      {screen.label}
                    </button>
                  )
                })}
              </div>
            )}

            <div ref={previewBox} style={{ padding: '20px 18px', background: '#f7f7f7', display: 'flex', justifyContent: 'center' }}>
              <div style={{ width: previewDevice.w * previewScale, height: previewDevice.h * previewScale, overflow: 'hidden', borderRadius: 16, background: '#fff', border: '1px solid #dddddd', flexShrink: 0 }}>
                <iframe
                  /* 주소가 바뀌는 화면은 iframe 을 새로 띄운다 (같은 문서에서 라우팅하면 초안이 끊긴다) */
                  key={`${saved.slug}${previewScreen.path ?? ''}`}
                  ref={previewFrame}
                  src={`/${saved.slug}${previewScreen.path ?? ''}`}
                  title="미리보기"
                  style={{ width: previewDevice.w, height: previewDevice.h, border: 0, transformOrigin: 'top left', transform: `scale(${previewScale})`, background: '#fff', display: 'block' }}
                />
              </div>
            </div>

            <div style={{ padding: '11px 15px', borderTop: '1px solid #eeeeee', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: '#8a8a8a' }}>{previewDevice.label} · /{saved.slug}{previewScreen.path ?? ''}</span>
              <a href={`/${saved.slug}`} target="_blank" rel="noreferrer" style={{ height: 26, padding: '0 10px', border: '1px solid #dddddd', background: '#fff', borderRadius: 9999, fontSize: 11, fontWeight: 700, color: '#505050', display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', textDecoration: 'none' }}>
                <ExternalLink size={11} strokeWidth={2} aria-hidden="true" />
                새 창
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
