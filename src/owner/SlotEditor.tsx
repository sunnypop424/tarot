import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Download, Save, Sparkles } from 'lucide-react'

import defaultThemeJson from '@/data/slot-default.json'
import { getSlotDeck } from '@/data/slots'
import { SERVICES, getSlotService, type ServiceId } from '@/data/services'
import { PLANS, getPlan, planById, effectiveLimits, type PlanId } from '@/data/plans'
import { CATEGORIES } from '@/data/categories'
import type { DeckRange } from '@/data/cards'
import type { Slot, CategorySetting, EventConfig } from '@/types/slot'
import type { ThemeColors, ThemeShape } from '@/types/theme'
import { isLight } from '@/lib/color'
import { repo } from '@/lib/repo'
import { hasSupabase } from '@/lib/repo/client'
import { CrystalBall } from '@/components/CrystalBall'
import { checkThemeContrast } from './contrast'
import { repairContrast, type GeneratedTheme } from './aiTheme'
import { ImageField } from './ImageField'
import { StickerField } from './StickerField'
import { CardUploader } from './CardUploader'
import { OrganizerPanel } from './OrganizerPanel'
import { PeriodFields } from './PeriodFields'
import { periodLabel, rangeInvalid } from './period'
import { validateSlug } from './slug'
import { onPreviewReady, postPreview, type PreviewState } from '@/slot/preview'
import {
  LUCKYDRAW_GROUPS,
  LUCKYDRAW_NEUTRALS,
  WEBFONTS,
  luckydrawDisplay,
  type FontId,
} from '@/data/luckydraw'
import { rollingDisplay } from '@/data/rolling'
import { alphaOf, hexOf, withAlphaValue } from '@/lib/color'
import { exportSlots } from './slotsFile'
import styles from './Owner.module.css'

/**
 * hex 고르개 + 투명도 슬라이더 → rgba 한 값 (원본 빌더와 같은 짝).
 *
 * **모듈 바깥에 둔다.** 처음엔 SlotEditor 안에서 정의했는데, 그러면 렌더마다 **새 컴포넌트
 * 타입**이 만들어져 React 가 input 을 버리고 다시 만든다 — 색을 고르려고 누르는 순간
 * 브라우저 색 고르개가 닫혀서 **드래그로 색을 못 고른다.** 안에서 정의된 컴포넌트는
 * 눈에 잘 안 띄는 이런 방식으로 깨진다.
 */
function AlphaColor({
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
  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <div className="color-field">
        <input
          type="color"
          value={hexOf(value)}
          aria-label={`${label} 고르기`}
          onChange={(e) => onChange(withAlphaValue(e.target.value, alphaOf(value)))}
        />
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={alphaOf(value)}
          aria-label={`${label} 투명도`}
          onChange={(e) => onChange(withAlphaValue(hexOf(value), Number(e.target.value)))}
        />
      </div>
      <span className="field__hint">
        {hint ? `${hint} · ` : ''}
        불투명도 {Math.round(alphaOf(value) * 100)}%
      </span>
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
    <div className="field">
      <span className="field__label">{label}</span>
      <input
        className="input"
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
      />
      {hint && <span className="field__hint">{hint}</span>}
    </div>
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
    <div className="field">
      <span className="field__label">{label}</span>
      <input
        className="input"
        type="number"
        min={0}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.max(0, Math.min(max ?? Infinity, Number(e.target.value) || 0)))}
      />
      {hint && <span className="field__hint">{hint}</span>}
    </div>
  )

  const text = (label: string, value: string, onChange: (v: string) => void, hint?: string) => (
    <div className="field">
      <span className="field__label">{label}</span>
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} />
      {hint && <span className="field__hint">{hint}</span>}
    </div>
  )

  switch (kind) {
    case 'boxRadius':
      return num(
        '둥글기 (px)',
        draft.theme.shape.radiusLg,
        (n) => patchShape('radiusLg', n),
        '박스·카드 둥글기 (0~40). 너무 크면 뭉개져요',
        40
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
      return num(
        '둥글기 (px)',
        draft.theme.shape.radiusMd,
        (n) => patchShape('radiusMd', n),
        '버튼·입력칸·개수 선택 둥글기 (0~40). 크게 두면 알약',
        40
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
    case 'counter':
      return (
        <>
          <AlphaColor
            label="배경색"
            value={d.counterBg || draft.theme.colors.wash}
            hint="수량 알약 안쪽 배경. 비우면 테마 보조 배경색"
            onChange={(v) => patchLd({ counterBg: v })}
          />
          <AlphaColor
            label="테두리색"
            value={d.counterBorder || draft.theme.colors.border}
            hint="알약 전체를 감싸는 테두리. 비우면 테마 테두리색"
            onChange={(v) => patchLd({ counterBorder: v })}
          />
          <AlphaColor
            label="그림자색"
            value={d.counterShadow || draft.theme.colors.primary}
            hint="알약 아래 그림자. 번짐·내림은 시안 고정, 색만 골라요"
            onChange={(v) => patchLd({ counterShadow: v })}
          />
        </>
      )
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
          <ImageField
            slug={slug}
            label="배경 이미지"
            name="background"
            value={draft.theme.assets.backgroundPattern}
            onChange={(v) => patchAsset('backgroundPattern', v)}
            hint="화면을 꽉 채워요. 박스가 얹힐 자리를 비워둔 사진이 좋아요."
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
  // 뒷면은 내장 SVG 카드 전용이라 타로에만 — 롤페엔 카드가 없다
  { title: '카드 뒷면 (내장 SVG용)', keys: ['cardBackFrom', 'cardBackTo'], services: ['tarot'] },
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
const SHAPE_HINTS: Partial<Record<keyof ThemeShape, string>> = {
  radiusLg:
    '홈의 오늘·주간·월간 카드 기준이에요 (px). 덱·도감처럼 작은 카드는 크기에 맞춰 자동으로 줄어들어요.',
}

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
  const [previewState, setPreviewState] = useState<PreviewState>('draw')

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
    if (draft) postPreview(previewFrame.current, { slot: draft, state: previewState, highlight })
  }, [draft, previewState, highlight])

  /**
   * iframe 이 "리스너 붙였다" 고 알려오면 그때 첫 초안을 보낸다.
   * `load` 이벤트에 맞춰 보내면 React 가 아직 안 붙어 있어 첫 장이 사라진다 —
   * 처음엔 저장본이 보이다가 뭔가 건드려야 초안으로 바뀌는 이상한 동작이 된다.
   */
  useEffect(() => {
    return onPreviewReady(() => {
      if (draft) postPreview(previewFrame.current, { slot: draft, state: previewState, highlight })
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
  const rd = rollingDisplay(draft)
  const patchRolling = (change: Partial<typeof rd>) =>
    patchSlot((prev) => ({ rolling: { ...rollingDisplay(prev), ...change } }))

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

  return (
    // 라이트 — 색을 눈으로 고르는 작업이라 도구는 밝게 고정한다
    <div className="owner">
      <div className="admin__main">
        <div className={styles.head}>
          <div>
            <Link to="/theme-editor" className={`t-text-xs ${styles.back}`} onClick={guardLeave}>
              <ArrowLeft size={14} strokeWidth={2} aria-hidden="true" />
              슬롯 목록
            </Link>
            <h1 className="t-title-l">{draft.name}</h1>
            {/* 저장이 곧 배포인지는 저장소가 정한다 — 화면이 거짓말하면 안 된다 (SlotList 와 같은 기준) */}
            <p className="t-text-xs t-muted">
              /{saved.slug} ·{' '}
              {hasSupabase
                ? '저장하면 바로 반영돼요 — 방문자가 보는 화면이 곧바로 바뀝니다.'
                : '저장하면 이 브라우저의 편집분에 반영돼요. 내보낸 slots.json 을 레포에 넣어야 실제로 배포됩니다.'}
            </p>
          </div>
        </div>

        {/* 가로 미리보기는 좁은 칸에 넣으면 글자가 안 읽힌다 — 넓은 화면에선 칸을 키운다 */}
        <div
          className={styles.split}
          data-wide-preview={luckydraw || undefined}
          data-preview-big={previewBig || undefined}
        >
          <div>
            <section className="admin-section">
              <h2 className="t-title-s admin-section__title">슬롯</h2>
              <div className="form-grid">
                <div className="field">
                  <label className="field__label" htmlFor="slot-slug">
                    슬러그 (URL 경로)
                  </label>
                  <input
                    id="slot-slug"
                    className="input"
                    value={draft.slug}
                    onChange={(e) => {
                      patchSlot({ slug: e.target.value })
                      setSlugError(null)
                    }}
                  />
                  <span className="field__hint">
                    /{saved.slug} 가 이 이벤트의 루트예요. 바꿔 저장하면 이미 올린 이미지는 옛 폴더에
                    남으니 다시 올려야 해요.
                  </span>
                  {slugError && <span className="field__error">{slugError}</span>}
                </div>
                <div className="field">
                  <label className="field__label" htmlFor="slot-name">
                    이벤트명
                  </label>
                  <input
                    id="slot-name"
                    className="input"
                    value={draft.name}
                    onChange={(e) => patchSlot({ name: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label className="field__label" htmlFor="slot-service">
                    서비스
                  </label>
                  <select
                    id="slot-service"
                    className="select"
                    value={getSlotService(draft)}
                    onChange={(e) => {
                      const next = e.target.value as ServiceId
                      patchSlot({ service: next })
                      /**
                       * 럭키드로우로 바꾸면 **중립색을 base-template 값으로 못박는다.**
                       * 이 색들은 편집기에 없으므로(고를 수 없으므로) 여기서 맞춰두지 않으면
                       * 다크 테마의 글자색이 밝은 박스 안에 남아 아무것도 안 보인다.
                       */
                      if (next === 'luckydraw') applyBase(LUCKYDRAW_NEUTRALS)
                    }}
                  >
                    {SERVICES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  {/* 서비스를 바꾸면 아래 설정 목록 자체가 갈린다 — 그 사실을 여기서 말해준다 */}
                  <span className="field__hint">
                    이 슬롯이 파는 것.{' '}
                    {luckydraw
                      ? '아래 설정은 럭키드로우용이에요 (카드·AI 관련 항목은 안 나와요).'
                      : rolling
                        ? '아래 “롤링페이퍼” 칸에서 벽 문구·카드 색·스티커·배경을 정해요 (색·형태는 테마를 따라가요).'
                        : '아래 카드 · 뽑기 관련 항목은 타로 서비스의 설정이에요.'}
                  </span>
                </div>
              </div>
            </section>

            {/**
             * 색 만들기(AI 생성 + 밝기 프리셋) — **럭키드로우엔 통째로 없다.**
             * 고를 수 있는 색이 넷뿐이라(버튼 2 · 당첨 2) 대표 색에서 한 벌을 만들 것도,
             * 바탕을 밝기 계열로 스왑할 것도 없다. 중립색은 base-template 값으로 붙박이다.
             */}
            {!luckydraw && (
            <section className="admin-section">
              <h2 className="t-title-s admin-section__title">색 만들기</h2>
              {/**
               * 럭키드로우는 **AI 색 생성을 안 쓴다** — 배경이 대개 정해진 사진이고 그 위에
               * 얹는 색이 몇 개뿐이라, 대표 색에서 한 벌을 만들 이유가 없다.
               * 밝기 프리셋(다크·라이트)은 남긴다 — 바탕을 한 번에 맞추는 건 여기서도 쓸모 있다.
               */}
              <p className="t-text-xs t-muted" style={{ marginBottom: 'var(--space-base)' }}>
                대표 색 하나와 밝기만 정하면 나머지 색을 다 만들어요. 마음에 안 드는 색은 아래에서
                손으로 고치면 됩니다. <b>읽히는지는 자동으로 맞춰요</b> — 안 읽히는 색은 대비를
                넘게 조정해서 넣습니다.
              </p>

              <div className="form-grid">
                <div className="field">
                  <label className="field__label" htmlFor="ai-base">
                    대표 색
                  </label>
                  <div className="color-field">
                    <input
                      type="color"
                      value={baseColor}
                      onChange={(e) => setBaseColor(e.target.value)}
                      aria-label="대표 색 고르기"
                    />
                    <input
                      id="ai-base"
                      className="input"
                      value={baseColor}
                      onChange={(e) => setBaseColor(e.target.value)}
                      data-ai-base
                    />
                  </div>
                  <span className="field__hint">팬이 아는 그 색. CTA 버튼에 쓰여요.</span>
                </div>

                <div className="field">
                  <label className="field__label" htmlFor="ai-mode">
                    밝기
                  </label>
                  <select
                    id="ai-mode"
                    className="select"
                    value={aiMode}
                    onChange={(e) => setAiMode(e.target.value as 'light' | 'dark')}
                    data-ai-mode
                  >
                    <option value="dark">다크 — 어두운 화면</option>
                    <option value="light">라이트 — 밝은 화면</option>
                  </select>
                </div>

                <div className="field">
                  <span className="field__label" aria-hidden="true">
                    &nbsp;
                  </span>
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={!aiReady || generating}
                    onClick={() => void generateColors()}
                    data-ai-theme
                  >
                    <Sparkles size={18} strokeWidth={2} aria-hidden="true" />
                    AI로 색 만들기
                  </button>
                </div>
              </div>

              {!aiReady && (
                <p className="t-text-xs t-muted" style={{ marginTop: 'var(--space-base)' }}>
                  AI 가 아직 연결되지 않았어요 — 아래 프리셋으로 바탕만 맞추고 색은 손으로 고르세요.
                </p>
              )}
              {generating && <CrystalBall label="색을 고르고 있어요" />}
              {themeError && (
                <p className="field__error" style={{ marginTop: 'var(--space-base)' }}>
                  {themeError}
                </p>
              )}
              {repaired && repaired.length > 0 && (
                <p className="t-text-xs" style={{ marginTop: 'var(--space-base)', color: 'var(--color-accent-soft)' }}>
                  안 읽히던 {repaired.join(' · ')} 색은 대비를 맞춰 조정했어요.
                </p>
              )}

              <p className="t-text-xs t-muted" style={{ margin: 'var(--space-base) 0 var(--space-sm)' }}>
                바탕만 밝기 계열로 바꾸기 (브랜드 색은 그대로)
              </p>
              <div className={styles.presetRow}>
                {BASE_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`btn btn--sm ${activeBase === p.id ? 'btn--primary' : 'btn--slight'}`}
                    aria-pressed={activeBase === p.id}
                    onClick={() => applyBase(p.base)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </section>
            )}

            {/**
             * 럭키드로우 설정은 **화면 요소별 카드**로 묶는다.
             *
             * 색은 색끼리, 크기는 크기끼리 늘어놓으면 "박스를 손보려면 색 목록에서 하나,
             * 형태 목록에서 하나, 여백 목록에서 하나" 를 오가게 된다. 최고관리자가 실제로
             * 하는 일은 "박스를 손본다" 이지 "색을 손본다" 가 아니다.
             *
             * 색 칸에 손을 올리면 미리보기에서 **그 자리가 깜빡인다** — "커버 배경" 이라는
             * 이름만으로는 어디인지 모른다 (긁기 전에만 보이는 자리라 더 그렇다).
             */}
            {luckydraw &&
              LUCKYDRAW_GROUPS.map((g) => (
                <section key={g.title} className="admin-section">
                  <h2 className="t-title-s admin-section__title">{g.title}</h2>
                  {g.hint && (
                    <p className="t-text-xs t-muted" style={{ marginBottom: 'var(--space-base)' }}>
                      {g.hint}
                    </p>
                  )}
                  <div className={styles.fieldGrid}>
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
                            <AlphaColor
                              label={f.label}
                              value={draft.theme.colors[key]}
                              hint={f.hint}
                              onChange={(v) => patchColor(key, v)}
                            />
                          ) : (
                            <div className="field">
                              <span className="field__label">{f.label}</span>
                              <div className="color-field">
                                <input
                                  type="color"
                                  value={hexOf(draft.theme.colors[key])}
                                  aria-label={`${f.label} 고르기`}
                                  onChange={(e) => patchColor(key, e.target.value)}
                                />
                                <input
                                  className="input"
                                  value={draft.theme.colors[key]}
                                  onChange={(e) => patchColor(key, e.target.value)}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {(g.extras ?? []).map((x) => (
                      <LuckydrawExtra
                        key={x}
                        kind={x}
                        draft={draft}
                        slug={saved.slug}
                        patchSlot={patchSlot}
                        patchShape={patchShape}
                        patchAsset={patchAsset}
                      />
                    ))}
                  </div>
                </section>
              ))}

            {/**
             * 롤링페이퍼 전용 — 벽 문구·방문자가 고를 카드 색·스티커·벽 배경.
             * 색·형태는 위 테마 패널이 이미 정한다 (롤페는 타로처럼 테마를 그대로 쓴다).
             */}
            {rolling && (
              <section className="admin-section">
                <h2 className="t-title-s admin-section__title">롤링페이퍼</h2>
                <p className="t-text-xs t-muted" style={{ marginBottom: 'var(--space-base)' }}>
                  방문자가 포스트잇으로 메시지를 남기면 벽에 쌓여요. 남긴 즉시 벽에 보이고,
                  부적절한 건 주최자가 숨겨요. 아래 색·글꼴은 롤페 전용이에요 (위 테마와 별개).
                </p>

                {/* 문구 */}
                <div className="form-grid">
                  <div className="field">
                    <span className="field__label">벽 제목</span>
                    <input
                      className="input"
                      value={rd.wallTitle}
                      onChange={(e) => patchRolling({ wallTitle: e.target.value })}
                    />
                    <label
                      className="field__hint"
                      style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                    >
                      <input
                        type="checkbox"
                        checked={rd.showTitle}
                        onChange={(e) => patchRolling({ showTitle: e.target.checked })}
                      />
                      벽에 제목 보이기
                    </label>
                  </div>
                  <div className="field">
                    <span className="field__label">벽 부제</span>
                    <input
                      className="input"
                      value={rd.wallSubtitle}
                      onChange={(e) => patchRolling({ wallSubtitle: e.target.value })}
                    />
                    <label
                      className="field__hint"
                      style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                    >
                      <input
                        type="checkbox"
                        checked={rd.showSubtitle}
                        onChange={(e) => patchRolling({ showSubtitle: e.target.checked })}
                      />
                      벽에 부제 보이기
                    </label>
                  </div>
                  <div className="field">
                    <span className="field__label">입력 안내</span>
                    <input
                      className="input"
                      value={rd.prompt}
                      onChange={(e) => patchRolling({ prompt: e.target.value })}
                    />
                    <span className="field__hint">작성 화면 메시지칸에 흐리게 뜨는 문구예요.</span>
                  </div>
                  <div className="field">
                    <span className="field__label">남기기 버튼</span>
                    <input
                      className="input"
                      value={rd.postLabel}
                      onChange={(e) => patchRolling({ postLabel: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <span className="field__label">기본 글꼴</span>
                    <select
                      className="select"
                      value={rd.font}
                      onChange={(e) => patchRolling({ font: e.target.value as FontId })}
                    >
                      {Object.entries(WEBFONTS).map(([id, f]) => (
                        <option key={id} value={id}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                    <span className="field__hint">제목·UI 글꼴이에요. 쪽지 글씨체는 방문자가 골라요.</span>
                  </div>
                </div>

                {/* 색 */}
                <div className="form-grid">
                  {(
                    [
                      ['headText', '글자색', '제목·헤더'],
                      ['subText', '서브 글자색', '부제·안내'],
                      ['noteBody', '포스트잇 본문색'],
                      ['noteName', '이름색'],
                      ['boardBg', '벽 배경색', '배경 이미지가 없을 때'],
                      ['buttonColor', '버튼색', '남기기·보내기'],
                    ] as [
                      'headText' | 'subText' | 'noteBody' | 'noteName' | 'boardBg' | 'buttonColor',
                      string,
                      string?,
                    ][]
                  ).map(([key, label, hint]) => (
                    <div key={key} className="field">
                      <label className="field__label" htmlFor={`rp-${key}`}>
                        {label}
                      </label>
                      <div className="color-field">
                        <input
                          type="color"
                          value={rd[key]}
                          aria-label={`${label} 고르기`}
                          onChange={(e) => patchRolling({ [key]: e.target.value } as Partial<typeof rd>)}
                        />
                        <input
                          id={`rp-${key}`}
                          className="input"
                          value={rd[key]}
                          onChange={(e) => patchRolling({ [key]: e.target.value } as Partial<typeof rd>)}
                        />
                      </div>
                      {hint && <span className="field__hint">{hint}</span>}
                    </div>
                  ))}
                </div>

                {/* 종이색 팔레트 */}
                <div className="field" style={{ marginTop: 'var(--space-lg)' }}>
                  <span className="field__label">포스트잇 종이색</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-md)', alignItems: 'center' }}>
                    {rd.papers.map((c, i) => (
                      <div key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <input
                          type="color"
                          value={c}
                          aria-label={`종이색 ${i + 1}`}
                          style={{
                            width: 40,
                            height: 40,
                            padding: 0,
                            border: '1px solid var(--color-border)',
                            borderRadius: 'var(--radius-sm)',
                            cursor: 'pointer',
                          }}
                          onChange={(e) =>
                            patchRolling({ papers: rd.papers.map((p, j) => (j === i ? e.target.value : p)) })
                          }
                        />
                        <button
                          type="button"
                          className="btn btn--slight btn--sm"
                          aria-label={`종이색 ${i + 1} 빼기`}
                          onClick={() => patchRolling({ papers: rd.papers.filter((_, j) => j !== i) })}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="btn btn--slight btn--sm"
                      onClick={() => patchRolling({ papers: [...rd.papers, '#f4efe2'] })}
                    >
                      + 색 추가
                    </button>
                  </div>
                  <span className="field__hint">방문자가 쪽지마다 고르는 색이에요. 파스텔 여러 색이 벽을 알록달록하게 해요.</span>
                </div>

                {/* 이미지 */}
                <div className="form-grid">
                  <ImageField
                    slug={saved.slug}
                    label="로고"
                    name="rolling-logo"
                    value={rd.logo || null}
                    onChange={(v) => patchRolling({ logo: v ?? '' })}
                    hint="벽 헤더에 떠요. 없으면 제목 텍스트가 나와요."
                  />
                  <ImageField
                    slug={saved.slug}
                    label="벽 배경 이미지"
                    name="rolling-wallbg"
                    value={rd.wallBg || null}
                    onChange={(v) => patchRolling({ wallBg: v ?? '' })}
                    hint="비우면 벽 배경색을 써요. 화면을 꽉 채워요."
                  />
                  <StickerField
                    slug={saved.slug}
                    label="스티커"
                    value={rd.stickers}
                    onChange={(next) => patchRolling({ stickers: next })}
                    hint="방문자가 쪽지에 붙일 수 있어요. 주최자에게 받은 이미지를 올려 주세요."
                  />
                </div>
              </section>
            )}

            {/* 웹앱 아이콘 — 모든 서비스 공통. "홈 화면에 추가" 하면 이 아이콘·행사명으로 앱이 된다 */}
            <section className="admin-section">
              <h2 className="t-title-s admin-section__title">웹앱 아이콘</h2>
              <p className="t-text-xs t-muted" style={{ marginBottom: 'var(--space-base)' }}>
                방문자가 브라우저에서 "홈 화면에 추가" 하면 이 아이콘과 행사명으로 앱처럼 열려요.
                정사각형 PNG 를 권장해요 (512×512).
              </p>
              <div className="form-grid">
                <ImageField
                  slug={saved.slug}
                  label="앱 아이콘"
                  name="app-icon"
                  value={draft.theme.assets.appIcon}
                  onChange={(v) => patchAsset('appIcon', v)}
                  hint="없으면 홈 화면 아이콘이 기본으로 떠요."
                />
              </div>
            </section>

            {COLOR_GROUPS.filter((g) =>
              g.services.includes(getSlotService(draft))
            ).map(({ title, keys, hint }) => (
              <section key={title} className="admin-section">
                <h2 className="t-title-s admin-section__title">{title}</h2>
                {hint && (
                  <p className="t-text-xs t-muted" style={{ marginBottom: 'var(--space-base)' }}>
                    {hint}
                  </p>
                )}
                <div className="form-grid">
                  {keys.map((key) => (
                    <div key={key} className="field">
                      <label className="field__label" htmlFor={`c-${key}`}>
                        {COLOR_LABELS[key]}
                      </label>
                      <div className="color-field">
                        <input
                          type="color"
                          value={draft.theme.colors[key]}
                          onChange={(e) => patchColor(key, e.target.value)}
                          aria-label={`${COLOR_LABELS[key]} 색 고르기`}
                        />
                        <input
                          id={`c-${key}`}
                          className="input"
                          value={draft.theme.colors[key]}
                          onChange={(e) => patchColor(key, e.target.value)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}

            {/* 럭키드로우는 박스·버튼 카드 안에서 각각 고친다 — 여기 두면 같은 값이 두 군데 뜬다 */}
            {!luckydraw && (
            <section className="admin-section">
              <h2 className="t-title-s admin-section__title">형태 (radius)</h2>
              <div className="form-grid">
                {(Object.keys(SHAPE_LABELS) as (keyof ThemeShape)[]).map((key) => (
                  <div key={key} className="field">
                    <label className="field__label" htmlFor={`s-${key}`}>
                      {SHAPE_LABELS[key]}
                    </label>
                    <input
                      id={`s-${key}`}
                      className="input"
                      type="number"
                      min={0}
                      max={40}
                      value={draft.theme.shape[key]}
                      onChange={(e) => patchShape(key, Number(e.target.value))}
                    />
                    {SHAPE_HINTS[key] && <span className="field__hint">{SHAPE_HINTS[key]}</span>}
                  </div>
                ))}
              </div>
            </section>
            )}

            {/**
             * 럭키드로우는 '배경' 카드가 이미지를 받고(로고·카드 이미지는 애초에 없다),
             * 롤링페이퍼는 위 '롤링페이퍼' 카드가 벽 배경·스티커를 받는다 — 그래서 둘 다 여기선 뺀다.
             */}
            {!luckydraw && !rolling && (
            <section className="admin-section">
              <h2 className="t-title-s admin-section__title">이미지</h2>
              {/* 이미지가 어디로 가는지는 저장소가 정한다 — 화면이 거짓말하면 안 된다 */}
              <p className="t-text-xs t-muted" style={{ marginBottom: 'var(--space-base)' }}>
                {hasSupabase ? (
                  <>올리는 즉시 이미지가 올라가요.</>
                ) : (
                  <>
                    업로드하면 파일이 바로 <code>public/slots/{saved.slug}/</code> 에 저장돼요 (그
                    폴더를 커밋하면 배포에 함께 올라갑니다).
                  </>
                )}{' '}
                다만 슬롯이 그 이미지를 쓰게 하려면 저장하기를 눌러야 해요. 앱에서는 전부 배경
                이미지로 깔립니다 — 모바일에서 길게 눌러 저장되지 않게.
              </p>
              <div className="form-grid">
                {/**
                 * 로고는 **타로 전용**이다 — 럭키드로우 화면엔 로고 자리가 없다
                 * (원본 base-template 도 배경 이미지 하나만 받았다).
                 */}
                {!luckydraw && (
                <ImageField
                  slug={saved.slug}
                  label="로고"
                  name="logo"
                  value={draft.theme.assets.logo}
                  onChange={(v) => patchAsset('logo', v)}
                  hint="없으면 이벤트명 텍스트가 나와요."
                />
                )}
                {!luckydraw && (
                <>
                <div className="field">
                  <label className="field__label" htmlFor="a-logoalt">
                    로고 대체 텍스트
                  </label>
                  <input
                    id="a-logoalt"
                    className="input"
                    value={draft.theme.assets.logoAlt}
                    onChange={(e) => patchAsset('logoAlt', e.target.value)}
                  />
                </div>
                <div className="field">
                  <label className="field__label" htmlFor="a-logoh">
                    로고 높이 (px)
                  </label>
                  <input
                    id="a-logoh"
                    className="input"
                    type="number"
                    min={16}
                    max={80}
                    value={draft.theme.assets.logoHeight}
                    onChange={(e) => patchAsset('logoHeight', Number(e.target.value))}
                  />
                </div>
                </>
                )}
                <ImageField
                  slug={saved.slug}
                  label={luckydraw ? '배경 이미지' : '배경 패턴'}
                  name="background"
                  value={draft.theme.assets.backgroundPattern}
                  onChange={(v) =>
                    /**
                     * 럭키드로우는 배경이 **패턴이 아니라 사진**이다 — 화면을 꽉 채우는 한 장.
                     * 그래서 올리는 순간 cover·안 반복·불투명 1 로 못박는다.
                     * 원본 빌더도 파일 하나만 받았다: 사진을 올리는 사람에게 CSS
                     * background-size 를 물어볼 이유가 없다.
                     */
                    luckydraw
                      ? patchSlot((prev) => ({
                          theme: {
                            ...prev.theme,
                            assets: {
                              ...prev.theme.assets,
                              backgroundPattern: v,
                              backgroundPatternSize: 'cover',
                              backgroundPatternRepeat: 'no-repeat',
                              backgroundPatternOpacity: 1,
                            },
                          },
                        }))
                      : patchAsset('backgroundPattern', v)
                  }
                  hint={luckydraw ? '화면을 꽉 채워요. 박스가 얹힐 자리를 비워둔 사진이 좋아요.' : undefined}
                />
                {/* 패턴 세부(크기·반복·불투명도)는 타로 전용 — 사진 배경엔 물어볼 게 없다 */}
                {!luckydraw && (
                <>
                <div className="field">
                  <label className="field__label" htmlFor="a-bgo">
                    배경 패턴 불투명도 (0~1)
                  </label>
                  <input
                    id="a-bgo"
                    className="input"
                    type="number"
                    min={0}
                    max={1}
                    step={0.01}
                    value={draft.theme.assets.backgroundPatternOpacity}
                    onChange={(e) =>
                      patchAsset('backgroundPatternOpacity', Number(e.target.value))
                    }
                  />
                  <span className="field__hint">카드를 가리지 않게 낮게.</span>
                </div>
                <div className="field">
                  <label className="field__label" htmlFor="a-bgs">
                    배경 패턴 크기
                  </label>
                  <input
                    id="a-bgs"
                    className="input"
                    value={draft.theme.assets.backgroundPatternSize}
                    onChange={(e) => patchAsset('backgroundPatternSize', e.target.value)}
                  />
                  <span className="field__hint">CSS background-size (cover, 200px auto …)</span>
                </div>
                <div className="field">
                  <label className="field__label" htmlFor="a-bgr">
                    배경 패턴 반복
                  </label>
                  <input
                    id="a-bgr"
                    className="input"
                    value={draft.theme.assets.backgroundPatternRepeat}
                    onChange={(e) => patchAsset('backgroundPatternRepeat', e.target.value)}
                  />
                </div>
                </>
                )}
                {/* 카드도 AI 리딩도 럭키드로우엔 없다 — 로고·배경 이미지만 남긴다 */}
                {!luckydraw && (
                  <>
                    <ImageField
                      slug={saved.slug}
                      label="카드 뒷면"
                      name="card-back"
                      value={draft.theme.assets.cardBack}
                      onChange={(v) => patchAsset('cardBack', v)}
                      hint="없으면 내장 SVG 뒷면을 써요."
                    />
                    <ImageField
                      slug={saved.slug}
                      label="수정구슬 (AI 리딩 로더)"
                      name="crystal-ball"
                      value={draft.theme.assets.crystalBall}
                      onChange={(v) => patchAsset('crystalBall', v)}
                      hint="3장 리딩을 만드는 동안 뜨는 구슬이에요. 없으면 내장 SVG 구슬을 써요."
                    />
                  </>
                )}
              </div>
            </section>
            )}

            {!luckydraw && !rolling && (
            <section className="admin-section">
              <div className="admin-section__title">
                <h2 className="t-title-s">카드 앞면</h2>
              </div>
              <div className="field" style={{ maxWidth: 240, marginBottom: 'var(--space-base)' }}>
                <label className="field__label" htmlFor="card-deck">
                  사용할 카드 범위
                </label>
                <select
                  id="card-deck"
                  className="select"
                  value={getSlotDeck(draft)}
                  onChange={(e) => patchSlot({ deck: e.target.value as DeckRange })}
                >
                  <option value="major">메이저 22장</option>
                  <option value="full">전체 78장</option>
                </select>
                <span className="field__hint">
                  이 슬롯 전체의 카드 범위예요 — 도감·뽑기·질문 답변칸이 모두 이 값을 따릅니다.
                  선택한 범위만큼 앞면을 올리면 되고, 안 올린 카드는 이름 텍스트로 나옵니다.
                </span>
              </div>
              <CardUploader
                slug={saved.slug}
                deck={getSlotDeck(draft)}
                ext={draft.theme.assets.cardFrontExt}
                onExtChange={(ext) => patchAsset('cardFrontExt', ext)}
                onBaseChange={(base) => patchAsset('cardFrontBase', base)}
                version={draft.theme.assets.cardFrontVersion ?? null}
                onVersionChange={(v) => patchAsset('cardFrontVersion', v)}
              />
            </section>
            )}

            {/* 플랜은 AI 한도다 — 럭키드로우·롤링페이퍼는 AI 를 안 쓴다 */}
            {!luckydraw && !rolling && (
            <section className="admin-section">
              <h2 className="t-title-s admin-section__title">플랜</h2>
              <p className="t-text-xs t-muted" style={{ marginBottom: 'var(--space-base)' }}>
                이 슬롯에 적용할 플랜이에요. <b>AI 한도가 여기서 나와요</b> — 한도를 넘으면 AI 종합만
                빠지고 카드별 해석으로 계속 돌아가요 (앱이 멈추지는 않아요).
              </p>
              <div className="form-grid">
                <div className="field">
                  <label className="field__label" htmlFor="slot-plan">
                    플랜
                  </label>
                  <select
                    id="slot-plan"
                    className="select"
                    value={plan.id}
                    onChange={(e) => changePlan(e.target.value as PlanId)}
                    data-plan
                  >
                    {PLANS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 한도는 플랜 값에서 시작해 **더 줄 수 있다** — 추가 결제를 받았을 때 */}
                <div className="field">
                  <label className="field__label" htmlFor="limit-reading">
                    AI 리딩 한도 (회)
                  </label>
                  <input
                    id="limit-reading"
                    className="input"
                    type="number"
                    min={0}
                    step={100}
                    value={limits.reading}
                    disabled={!plan.allowSpread}
                    onChange={(e) => patchLimit('reading', Number(e.target.value))}
                    data-limit-reading
                  />
                  <span className="field__hint">
                    {plan.allowSpread ? (
                      <>
                        {plan.label} 기본 {plan.readingLimit.toLocaleString()}회
                        {limits.reading !== plan.readingLimit && (
                          <b> · 기본값에서 {(limits.reading - plan.readingLimit).toLocaleString()}회 조정됨</b>
                        )}
                      </>
                    ) : (
                      `${plan.label} 플랜은 전부 1장이라 AI 리딩이 없어요.`
                    )}
                  </span>
                </div>

                <div className="field">
                  <label className="field__label" htmlFor="limit-gen">
                    답변 AI 생성 한도 (회)
                  </label>
                  <input
                    id="limit-gen"
                    className="input"
                    type="number"
                    min={0}
                    value={limits.answerGen}
                    onChange={(e) => patchLimit('answerGen', Number(e.target.value))}
                    data-limit-gen
                  />
                  <span className="field__hint">
                    재생성 포함. {plan.label} 기본 {plan.answerGenLimit}회
                    {limits.answerGen !== plan.answerGenLimit && (
                      <b> · 기본값에서 {limits.answerGen - plan.answerGenLimit}회 조정됨</b>
                    )}
                  </span>
                </div>
              </div>

              <ul className={styles.planFacts} data-plan-facts>
                <li>
                  <span>3장 스프레드 (AI 종합 리딩)</span>
                  <b>{plan.allowSpread ? '가능' : '불가 — 전부 1장'}</b>
                </li>
                <li>
                  <span>질문 답변 AI 생성</span>
                  <b>
                    {limits.answerGen === 0
                      ? '없음 — 주최자가 직접 입력'
                      : `${limits.answerGen}회 (재생성 포함)`}
                  </b>
                </li>
                <li>
                  <span>한도를 넘으면</span>
                  <b>AI 종합만 빠지고 카드별 해석으로 계속</b>
                </li>
              </ul>
            </section>
            )}


            <section className="admin-section">
              <h2 className="t-title-s admin-section__title">기간</h2>
              <p className="t-text-xs t-muted" style={{ marginBottom: 'var(--space-base)' }}>
                {/* 지금 상태를 먼저 말한다 — 날짜만 보고 오늘이 그 안인지 세게 하지 않는다 */}
                지금 이 슬롯은 <b>{periodLabel(draft)}</b> 상태예요. 두 기간 중 하나라도 오늘을 품으면
                열려요. 대여가 끝나면 <b>주최자도</b> 못 들어옵니다 (최고관리자만 볼 수 있어요).
              </p>

              {/**
               * 럭키드로우만 유예가 있다 — 행사가 끝나도 **배송을 보내야** 하기 때문이다
               * (`0009_slot_lifecycle.sql`). 타로엔 남는 방문자 데이터가 없어서 유예가 없다.
               * 삭제는 되돌릴 수 없으므로 편집기에서 미리 말해 둔다.
               */}
              <p className="t-text-xs t-muted" style={{ marginBottom: 'var(--space-base)' }}>
                {getSlotService(draft) === 'luckydraw' ? (
                  <>
                    럭키드로우는 대여 종료 <b>+14일</b>까지 배송 정보를 꺼낼 수 있어요. 추첨은 그
                    전에 닫힙니다.
                  </>
                ) : null}{' '}
                대여 종료 <b>+15일</b>이 지나면 이 슬롯은 주최자 계정·질문·이미지까지{' '}
                <b>자동으로 삭제</b>돼요. 종료일을 비워 두면 삭제하지 않아요.
              </p>
              <PeriodFields
                period={draft.period}
                onChange={(period) => patchSlot(() => ({ period }))}
              />
              {rangeInvalid(draft) && (
                <p className="field__error" style={{ marginTop: 'var(--space-sm)' }}>
                  종료일이 시작일보다 앞서요.
                </p>
              )}
            </section>

            {/**
             * 계정은 **저장된 슬러그**에 매인다 (slot_admins.slug 가 FK 다) — 초안 슬러그가 아니다.
             * ready() 가 false 인 어댑터(local)에선 만들 계정이 없으므로 패널을 아예 안 띄운다:
             * localStorage 로 흉내 내면 "만들었다" 고 해놓고 아무도 로그인하지 못한다.
             */}
            {repo.organizers.ready() && (
              <OrganizerPanel slot={saved} slugPending={draft.slug !== saved.slug} />
            )}

            {/* 카테고리별 뽑기 설정 — 럭키드로우·롤링페이퍼엔 카테고리도 카드도 없다 */}
            {!luckydraw && !rolling && (
            <section className="admin-section">
              <h2 className="t-title-s admin-section__title">이벤트 설정</h2>
              <p className="t-text-xs t-muted" style={{ marginBottom: 'var(--space-base)' }}>
                {plan.allowSpread
                  ? '3장을 고르면 카드들을 순서대로 이어 읽는 AI 종합이 붙어요. 1장은 AI 를 안 씁니다.'
                  : `${plan.label} 플랜은 전부 1장이에요 — 3장 스프레드(AI 종합)는 스탠다드부터입니다.`}
              </p>
              <div className="form-grid">
                {CATEGORIES.map((c) => {
                  const counts = Object.keys(c.spreads).map(Number)
                  if (counts.length < 2) return null
                  // 3장이 곧 AI 리딩이다 — 플랜이 안 되면 고를 수조차 없어야 한다
                  const allowed = plan.allowSpread ? counts : counts.filter((n) => n === 1)
                  const current = plan.allowSpread
                    ? (draft.event[c.id]?.cardCount ?? c.defaultCount)
                    : 1
                  return (
                    <div key={c.id} className="field">
                      <label className="field__label" htmlFor={`e-${c.id}`}>
                        {c.label} 뽑는 수
                      </label>
                      <select
                        disabled={!plan.allowSpread}
                        id={`e-${c.id}`}
                        className="select"
                        value={current}
                        onChange={(e) => patchEvent(c.id, { cardCount: Number(e.target.value) })}
                      >
                        {allowed.map((n) => (
                          <option key={n} value={n}>
                            {n}장
                          </option>
                        ))}
                      </select>
                    </div>
                  )
                })}
              </div>
            </section>
            )}

            {/* 저장은 편집이 다 끝나는 자리에 — 위에 있으면 뭘 저장하는지 안 보인다 */}
            <div className={styles.saveBar} data-save-bar>
              <span
                className={`save-state ${dirty ? 'save-state--dirty' : ''}`}
                data-save-state={dirty ? 'dirty' : 'saved'}
              >
                {saveError ? (
                  // 저장이 실패했는데 "저장됨" 이 뜨면 안 된다 — 고친 게 날아간 줄도 모른다
                  <span className="field__error">{saveError}</span>
                ) : dirty ? (
                  '저장하지 않은 수정이 있어요'
                ) : (
                  '저장됨'
                )}
              </span>
              <div className={styles.saveBarActions}>
                {dirty && (
                  <button type="button" className="btn btn--sm btn--slight" onClick={handleRevert}>
                    되돌리기
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn--sm btn--slight"
                  onClick={() => slots && exportSlots(slots)}
                >
                  <Download size={18} strokeWidth={2} aria-hidden="true" />
                  {hasSupabase ? '백업 내보내기' : 'slots.json 내보내기'}
                </button>
                <button
                  type="button"
                  className="btn btn--sm btn--primary"
                  disabled={!dirty}
                  onClick={() => void handleSave()}
                  data-save
                >
                  <Save size={18} strokeWidth={2} aria-hidden="true" />
                  저장하기
                </button>
              </div>
            </div>
          </div>

          <div className={styles.previewCol}>
            <section className="admin-section">
              <h2 className="t-title-s admin-section__title">대비 검사</h2>
              <div className={styles.contrast}>
                {contrast.map(({ label, ratio, level }) => (
                  <div key={label} className={styles.contrastRow}>
                    <span className="t-text-xs">{label}</span>
                    <span className={`t-text-xs ${styles.contrastRatio} ${level ? styles[`level--${level}`] : ''}`}>
                      {ratio === null
                        ? '색 오류'
                        : `${ratio.toFixed(2)} : 1 ${level === 'pass' ? '통과' : level === 'large-only' ? '큰 글자만' : '미달'}`}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="admin-section">
              <div className={styles.previewHead}>
                <h2 className="t-title-s">미리보기</h2>
                <div className={styles.previewMeta}>
                  <span className="t-text-xs t-muted">
                    {previewDevice.label}
                    {previewScale < 0.95 && ` · ${Math.round(previewScale * 100)}%`}
                    {dirty && ' · 저장 전 초안'}
                  </span>
                  {getSlotService(draft) === 'luckydraw' && (
                    <select
                      className="select"
                      style={{ width: 'auto', height: 32, padding: '0 28px 0 10px', fontSize: 12 }}
                      value={ipad}
                      aria-label="아이패드 해상도"
                      onChange={(e) => setIpad(e.target.value as 'pro' | 'air' | 'mini')}
                    >
                      {IPADS.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.label} ({d.w}×{d.h})
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    type="button"
                    className="btn btn--sm btn--ghost"
                    onClick={() => setPreviewBig((v) => !v)}
                  >
                    {previewBig ? '작게' : '크게'}
                  </button>
                </div>
              </div>

              {/**
               * 럭키드로우는 화면이 하나뿐이라 **상태를 골라 봐야** 한다 —
               * 커버 색·커버 문자·하이라이트는 당첨 화면에서만 보이는데, 미리보기에서
               * 진짜로 뽑을 수는 없다(재고를 태운다). 가짜 결과로 그 순간을 보여준다.
               */}
              {getSlotService(draft) === 'luckydraw' && (
                <div className={styles.previewTabs}>
                  {(
                    [
                      ['draw', '뽑기'],
                      ['result', '당첨'],
                      ['summary', '전체 결과'],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={`btn btn--sm ${previewState === value ? 'btn--slight' : 'btn--ghost'}`}
                      onClick={() => setPreviewState(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {/**
               * 실제 앱을 그대로 띄운다 — **미리보기를 따로 구현하지 않는다.**
               * 원본 빌더는 순수 JS 로 화면을 재현했는데, 그러면 화면을 고칠 때마다 미리보기도
               * 따로 고쳐야 하고 언젠가 어긋난다. 초안은 postMessage 로 건너간다 (`slot/preview.ts`).
               */}
              <div className={styles.previewStage} ref={previewBox}>
                <div
                  className={styles.previewViewport}
                  style={{
                    width: previewDevice.w * previewScale,
                    height: previewDevice.h * previewScale,
                  }}
                >
                  <iframe
                    key={saved.slug}
                    ref={previewFrame}
                    className={styles.preview}
                    src={`/${saved.slug}`}
                    title="미리보기"
                    style={{
                      width: previewDevice.w,
                      height: previewDevice.h,
                      transform: `scale(${previewScale})`,
                    }}
                  />
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
