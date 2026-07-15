import { useCallback, useMemo, useState } from 'react'
import { Download, Upload, RotateCcw } from 'lucide-react'

import { getSlots, saveSlotsDraft, clearSlotsDraft } from '@/data/slots'
import { CATEGORIES } from '@/data/categories'
import type { DeckRange } from '@/data/cards'
import type { Slot, CategorySetting } from '@/types/slot'
import type { ThemeColors, ThemeShape } from '@/types/theme'
import { checkThemeContrast } from './contrast'
import { ImageField } from './ImageField'
import { CardUploader } from './CardUploader'
import styles from './ThemeEditor.module.css'

/** 색을 역할별로 묶어 보여준다 — 17개를 한 줄로 늘어놓으면 뭘 고치는지 모른다 */
const COLOR_GROUPS: { title: string; keys: (keyof ThemeColors)[] }[] = [
  { title: '배경 · 표면', keys: ['canvas', 'surface', 'surfaceRaised', 'wash'] },
  { title: '인터랙션 (CTA · 활성)', keys: ['primary', 'primaryHover', 'primarySoft', 'onPrimary'] },
  { title: '포인트 (카드 테두리 · 아이콘)', keys: ['accent', 'accentSoft'] },
  { title: '텍스트 · 보더', keys: ['fg1', 'fg2', 'fg3', 'border', 'borderHover'] },
  { title: '카드 뒷면 (내장 SVG용)', keys: ['cardBackFrom', 'cardBackTo'] },
]

const COLOR_LABELS: Record<keyof ThemeColors, string> = {
  canvas: '화면 바탕',
  surface: '카드 · 타일',
  surfaceRaised: '떠 있는 표면',
  wash: '보조 버튼 · 칩 배경',
  primary: '주요 CTA',
  primaryHover: 'CTA hover',
  primarySoft: '칩 · 보조버튼 글자',
  onPrimary: 'CTA 글자',
  accent: '포인트',
  accentSoft: '포인트 (옅게)',
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
 * 소유자 전용 테마 편집기 — `/theme-editor`, **개발 모드에서만 라우트가 존재한다**.
 * 슬롯별로 색·radius·이미지를 맞춰보고 slots.json 으로 내보내 배포한다.
 * 주최자에겐 노출되지 않는다 (주최자는 질문/답변만 만진다).
 */
export default function ThemeEditor() {
  const [slots, setSlots] = useState<Slot[]>(() => getSlots())
  const [index, setIndex] = useState(0)
  const [cardDeck, setCardDeck] = useState<DeckRange>('major')
  const slot = slots[index]

  /** 편집분을 localStorage 에 저장 — SlotProvider 가 이걸 우선 읽어 미리보기가 살아난다 */
  const commit = useCallback((next: Slot[]) => {
    setSlots(next)
    saveSlotsDraft(next)
  }, [])

  const patchSlot = useCallback(
    (change: Partial<Slot>) => {
      commit(slots.map((s, i) => (i === index ? { ...s, ...change } : s)))
    },
    [slots, index, commit]
  )

  const patchColor = (key: keyof ThemeColors, value: string) =>
    patchSlot({ theme: { ...slot.theme, colors: { ...slot.theme.colors, [key]: value } } })

  const patchShape = (key: keyof ThemeShape, value: number) =>
    patchSlot({ theme: { ...slot.theme, shape: { ...slot.theme.shape, [key]: value } } })

  const patchAsset = (key: string, value: unknown) =>
    patchSlot({ theme: { ...slot.theme, assets: { ...slot.theme.assets, [key]: value } } })

  const patchEvent = (categoryId: string, change: Partial<CategorySetting>) =>
    patchSlot({
      event: { ...slot.event, [categoryId]: { ...slot.event[categoryId], ...change } },
    })

  const contrast = useMemo(() => checkThemeContrast(slot.theme.colors), [slot.theme.colors])

  function handleExport() {
    const blob = new Blob([JSON.stringify(slots, null, 2) + '\n'], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'slots.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleImport(file: File) {
    try {
      commit(JSON.parse(await file.text()) as Slot[])
      setIndex(0)
    } catch {
      alert('JSON 을 읽지 못했어요.')
    }
  }

  function handleReset() {
    if (!confirm('편집분을 버리고 배포된 slots.json 으로 되돌릴까요?')) return
    clearSlotsDraft()
    setSlots(getSlots())
  }

  return (
    // 라이트 — 색을 눈으로 고르는 작업이라 도구는 밝게 고정한다
    <div className="owner">
      <div className="admin__main">
        <div className={styles.head}>
          <div>
            <h1 className="t-title-l">테마 편집기</h1>
            <p className="t-text-xs t-muted">
              소유자 전용 · 개발 모드에서만 열려요. 편집분은 이 브라우저에만 저장되고,
              내보낸 slots.json 을 레포에 넣어야 실제로 배포됩니다.
            </p>
          </div>
          <div className={styles.actions}>
            <button type="button" className="btn btn--sm btn--slight" onClick={handleReset}>
              <RotateCcw size={18} strokeWidth={2} aria-hidden="true" />
              되돌리기
            </button>
            <label className="btn btn--sm btn--slight">
              <Upload size={18} strokeWidth={2} aria-hidden="true" />
              가져오기
              <input
                type="file"
                accept="application/json"
                className="sr-only"
                onChange={(e) => e.target.files?.[0] && void handleImport(e.target.files[0])}
              />
            </label>
            <button type="button" className="btn btn--sm btn--primary" onClick={handleExport}>
              <Download size={18} strokeWidth={2} aria-hidden="true" />
              slots.json 내보내기
            </button>
          </div>
        </div>

        <div className={styles.split}>
          <div>
            <section className="admin-section">
              <h2 className="t-title-s admin-section__title">슬롯</h2>
              <div className="form-grid">
                <div className="field">
                  <label className="field__label" htmlFor="slot-pick">
                    편집할 슬롯
                  </label>
                  <select
                    id="slot-pick"
                    className="select"
                    value={index}
                    onChange={(e) => setIndex(Number(e.target.value))}
                  >
                    {slots.map((s, i) => (
                      <option key={s.slug} value={i}>
                        {s.name} (/{s.slug})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label className="field__label" htmlFor="slot-slug">
                    슬러그 (URL 경로)
                  </label>
                  <input
                    id="slot-slug"
                    className="input"
                    value={slot.slug}
                    onChange={(e) => patchSlot({ slug: e.target.value })}
                  />
                  <span className="field__hint">/{slot.slug} 가 이 이벤트의 루트가 돼요.</span>
                </div>
                <div className="field">
                  <label className="field__label" htmlFor="slot-name">
                    이벤트명
                  </label>
                  <input
                    id="slot-name"
                    className="input"
                    value={slot.name}
                    onChange={(e) => patchSlot({ name: e.target.value })}
                  />
                </div>
              </div>
            </section>

            {COLOR_GROUPS.map(({ title, keys }) => (
              <section key={title} className="admin-section">
                <h2 className="t-title-s admin-section__title">{title}</h2>
                <div className="form-grid">
                  {keys.map((key) => (
                    <div key={key} className="field">
                      <label className="field__label" htmlFor={`c-${key}`}>
                        {COLOR_LABELS[key]}
                      </label>
                      <div className="color-field">
                        <input
                          type="color"
                          value={slot.theme.colors[key]}
                          onChange={(e) => patchColor(key, e.target.value)}
                          aria-label={`${COLOR_LABELS[key]} 색 고르기`}
                        />
                        <input
                          id={`c-${key}`}
                          className="input"
                          value={slot.theme.colors[key]}
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
                      value={slot.theme.shape[key]}
                      onChange={(e) => patchShape(key, Number(e.target.value))}
                    />
                  </div>
                ))}
              </div>
            </section>

            <section className="admin-section">
              <h2 className="t-title-s admin-section__title">이미지</h2>
              <p className="t-text-xs t-muted" style={{ marginBottom: 'var(--space-base)' }}>
                업로드하면 <code>public/slots/{slot.slug}/</code> 에 저장돼요. 그 폴더를 커밋하면
                배포에 함께 올라갑니다.
              </p>
              <div className="form-grid">
                <ImageField
                  slug={slot.slug}
                  label="로고"
                  name="logo"
                  value={slot.theme.assets.logo}
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
                    value={slot.theme.assets.logoAlt}
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
                    value={slot.theme.assets.logoHeight}
                    onChange={(e) => patchAsset('logoHeight', Number(e.target.value))}
                  />
                </div>
                <ImageField
                  slug={slot.slug}
                  label="배경 패턴"
                  name="background"
                  value={slot.theme.assets.backgroundPattern}
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
                    value={slot.theme.assets.backgroundPatternOpacity}
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
                    value={slot.theme.assets.backgroundPatternSize}
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
                    value={slot.theme.assets.backgroundPatternRepeat}
                    onChange={(e) => patchAsset('backgroundPatternRepeat', e.target.value)}
                  />
                </div>
                <ImageField
                  slug={slot.slug}
                  label="카드 뒷면"
                  name="card-back"
                  value={slot.theme.assets.cardBack}
                  onChange={(v) => patchAsset('cardBack', v)}
                  hint="없으면 내장 SVG 뒷면을 써요."
                />
              </div>
            </section>

            <section className="admin-section">
              <div className="admin-section__title">
                <h2 className="t-title-s">카드 앞면</h2>
              </div>
              <div className="field" style={{ maxWidth: 240, marginBottom: 'var(--space-base)' }}>
                <label className="field__label" htmlFor="card-deck">
                  올릴 카드 범위
                </label>
                <select
                  id="card-deck"
                  className="select"
                  value={cardDeck}
                  onChange={(e) => setCardDeck(e.target.value as DeckRange)}
                >
                  <option value="major">메이저 22장</option>
                  <option value="full">전체 78장</option>
                </select>
                <span className="field__hint">
                  이벤트·질문이 전체 덱을 쓰면 78장을 다 올려야 해요. 안 올린 카드는 이름 텍스트로
                  나옵니다.
                </span>
              </div>
              <CardUploader
                slug={slot.slug}
                deck={cardDeck}
                ext={slot.theme.assets.cardFrontExt}
                onExtChange={(ext) => patchAsset('cardFrontExt', ext)}
                onBaseChange={(base) => patchAsset('cardFrontBase', base)}
              />
            </section>

            <section className="admin-section">
              <h2 className="t-title-s admin-section__title">이벤트 설정</h2>
              <p className="t-text-xs t-muted" style={{ marginBottom: 'var(--space-base)' }}>
                3장 스프레드는 각 카드를 짧게만 보여줘요 — 종합 해석은 AI 연동 후에 붙습니다.
              </p>
              <div className="form-grid">
                {CATEGORIES.map((c) => {
                  const counts = Object.keys(c.spreads).map(Number)
                  if (counts.length < 2) return null
                  const current = slot.event[c.id]?.cardCount ?? c.defaultCount
                  return (
                    <div key={c.id} className="field">
                      <label className="field__label" htmlFor={`e-${c.id}`}>
                        {c.label} 뽑는 수
                      </label>
                      <select
                        id={`e-${c.id}`}
                        className="select"
                        value={current}
                        onChange={(e) => patchEvent(c.id, { cardCount: Number(e.target.value) })}
                      >
                        {counts.map((n) => (
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
              <h2 className="t-title-s admin-section__title">미리보기</h2>
              {/* 실제 앱을 그대로 띄운다 — SlotProvider 가 편집분을 읽으므로 색이 바로 반영된다 */}
              <iframe
                key={slot.slug}
                className={styles.preview}
                src={`/${slot.slug}`}
                title="미리보기"
              />
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}

