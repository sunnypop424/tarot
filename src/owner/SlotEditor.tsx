import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Download, Save, Sparkles } from 'lucide-react'

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
import { CardUploader } from './CardUploader'
import { validateSlug } from './slug'
import { exportSlots } from './slotsFile'
import styles from './Owner.module.css'

/** 색을 역할별로 묶어 보여준다 — 17개를 한 줄로 늘어놓으면 뭘 고치는지 모른다 */
const COLOR_GROUPS: { title: string; keys: (keyof ThemeColors)[]; hint?: string }[] = [
  { title: '배경 · 표면', keys: ['canvas', 'surface', 'surfaceRaised', 'wash'] },
  {
    title: '인터랙션 (CTA · 활성)',
    keys: ['primary', 'primaryHover', 'onPrimary'],
    hint: '칩 · 보조버튼 글자색은 배경 밝기에 맞춰 자동 계산돼요.',
  },
  {
    title: '포인트 (카드 테두리 · 별 문양)',
    keys: ['accent'],
    hint: '어두운 카드 위 장식 기준으로 고르세요. 표면 위 아이콘·글자에 쓰일 색은 표면 밝기에 맞춰 자동 계산돼요.',
  },
  { title: '텍스트 · 보더', keys: ['fg1', 'fg2', 'fg3', 'border', 'borderHover'] },
  { title: '카드 뒷면 (내장 SVG용)', keys: ['cardBackFrom', 'cardBackTo'] },
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
 * 슬롯 하나의 색·형태·이미지·이벤트 설정 — `/theme-editor/:slug`, **개발 모드에서만 열린다**.
 * 슬롯을 만들고 지우는 건 목록(SlotList)이 맡는다.
 * 주최자에겐 노출되지 않는다 (주최자는 질문/답변만 만진다).
 *
 * **고친 건 저장하기를 눌러야 반영된다.** 편집 중인 값은 초안(draft)에만 있고,
 * 저장할 때 비로소 저장소에 쓰여 미리보기·목록·내보내기에 나타난다.
 * 저장소가 DB 면 **저장이 곧 배포다** — 방문자 화면이 그 순간 바뀐다.
 * (주최자 질문 편집은 반대로 즉시 저장이다 — 거긴 저장을 잊어 날리는 게 더 나쁘다.)
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
    setDraft(slots.find((s) => s.slug === slug))
    setSlugError(null)
    // slots 는 저장할 때만 바뀐다 — 저장 직후 초안을 되짚는 건 같은 값이라 무해하다
  }, [slug, slots])

  const dirty = useMemo(
    () => Boolean(draft && saved) && JSON.stringify(draft) !== JSON.stringify(saved),
    [draft, saved]
  )

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

    try {
      await repo.slots.save(draft!)
      // 슬러그를 바꿨으면 옛 행이 남는다 — 지워야 /옛슬러그 가 계속 열리지 않는다
      if (draft!.slug !== saved!.slug) await repo.slots.remove(saved!.slug)

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

        <div className={styles.split}>
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
                    onChange={(e) => patchSlot({ service: e.target.value as ServiceId })}
                  >
                    {SERVICES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <span className="field__hint">
                    이 슬롯이 파는 것. 아래 카드 · 이벤트 설정은 타로 서비스의 설정이에요.
                  </span>
                </div>
              </div>
            </section>

            <section className="admin-section">
              <h2 className="t-title-s admin-section__title">색 만들기</h2>
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

            {COLOR_GROUPS.map(({ title, keys, hint }) => (
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
                <ImageField
                  slug={saved.slug}
                  label="로고"
                  name="logo"
                  value={draft.theme.assets.logo}
                  onChange={(v) => patchAsset('logo', v)}
                  hint="없으면 이벤트명 텍스트가 나와요."
                />
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
                <ImageField
                  slug={saved.slug}
                  label="배경 패턴"
                  name="background"
                  value={draft.theme.assets.backgroundPattern}
                  onChange={(v) => patchAsset('backgroundPattern', v)}
                />
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
              </div>
            </section>

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
                {dirty && <span className="t-text-xs t-muted">저장하면 반영돼요</span>}
              </div>
              {/* 실제 앱을 그대로 띄운다 — SlotProvider 가 저장된 편집분을 읽는다 */}
              <iframe
                key={saved.slug}
                className={styles.preview}
                src={`/${saved.slug}`}
                title="미리보기"
              />
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
