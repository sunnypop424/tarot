import { useCallback, useEffect, useState } from 'react'

import { repo } from '@/lib/repo'
import type { LuckydrawSettings, PrizeReport } from '@/lib/repo'
import { useSlot } from '@/slot/SlotProvider'
import { confirmAction, toast } from '../AdminFeedback'

const MAX_PRIZES = 100

/** 새 상품 — id 는 화면에서 만든다 (저장 전에도 행을 구분해야 한다) */
function blankPrize(rank: number): PrizeReport {
  return {
    id: crypto.randomUUID(),
    rank,
    name: '',
    remaining: 0,
    requiresShipping: false,
    batchCapRatio: null,
    consumedToday: 0,
    consumedTotal: 0,
  }
}

/**
 * 럭키드로우 상품·운영 — **재고와 운영 설정을 한 화면에** 모은다.
 *
 * 원래는 '상품과 수량'과 '운영 설정'이 메뉴로 갈려 있었는데, 주최자가 행사 중에 오가는 두
 * 가지를 굳이 나눌 이유가 없었다. 위에 지표를 얹고, 손이 제일 자주 가는 상품 표를 먼저,
 * 그 아래 운영 설정을 이어 붙여 한눈에 본다.
 *
 * **이 화면만 저장을 눌러야 반영된다** (한 화면, 한 저장 바). 수량 여러 칸을 고치는 도중에
 * 값이 나가면 안 된다. 다만 **실제 운영 전환·마감**은 되돌리기 어려우니 누르는 그 자리에서
 * 한 번 더 확인한다.
 */
export function Overview() {
  const slot = useSlot()
  const slug = slot.slug

  const [rows, setRows] = useState<PrizeReport[] | null>(null)
  const [settings, setSettings] = useState<LuckydrawSettings | null>(null)
  /** 저장된 기준값 — 초안(settings·rows)과 비교해 "저장 안 됨"을 가린다 */
  const [savedSettings, setSavedSettings] = useState<LuckydrawSettings | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [report, s] = await Promise.all([
      repo.luckydraw.report(slug),
      repo.luckydraw.getSettings(slug),
    ])
    setRows(report)
    setSettings(s)
    setSavedSettings(s)
    setDirty(false)
  }, [slug])

  useEffect(() => {
    void load()
  }, [load])

  /** 설정을 고쳤는지 — 저장된 기준값과 비교 (평면 객체라 키 순서 걱정 없음) */
  const settingsDirty =
    Boolean(settings && savedSettings) && JSON.stringify(settings) !== JSON.stringify(savedSettings)
  const anyDirty = dirty || settingsDirty

  /** 고쳐놓고 저장 없이 나가려 하면 붙잡는다 (상품·설정 어느 쪽이든) */
  useEffect(() => {
    if (!anyDirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [anyDirty])

  /** 운영 설정 — **초안만 고친다** (저장은 아래 저장 바) */
  function patchSettings(next: Partial<LuckydrawSettings>) {
    setSettings((prev) => prev && { ...prev, ...next })
    setSaved(false)
  }

  /** 상품 표 — 초안만 고친다 */
  function patchRow(index: number, next: Partial<PrizeReport>) {
    setRows((prev) => prev && prev.map((r, i) => (i === index ? { ...r, ...next } : r)))
    setDirty(true)
    setSaved(false)
  }
  function addRow() {
    if (locked) {
      toast('설정 잠금을 먼저 풀어 주세요')
      return
    }
    setRows((prev) => prev && [...prev, blankPrize(prev.length + 1)])
    setDirty(true)
    setSaved(false)
  }
  async function removeRow(index: number) {
    const target = rows?.[index]
    if (!target) return
    if (locked) {
      toast('설정 잠금을 먼저 풀어 주세요')
      return
    }
    const ok = await confirmAction({
      title: '이 상품을 지울까요?',
      desc: `“${target.name || '이름 없는 상품'}” 을 목록에서 빼요. 아래 등수가 하나씩 당겨지며 다시 매겨져요. 이미 뽑힌 기록은 남아요.`,
      okLabel: '지우기',
      danger: true,
    })
    if (!ok) return
    // 등수는 행 순서다 — 지운 뒤 다시 매긴다
    setRows((prev) => prev && prev.filter((_, i) => i !== index).map((r, i) => ({ ...r, rank: i + 1 })))
    setDirty(true)
    setSaved(false)
  }

  /** 되돌릴 수 없는 전환은 **누르는 자리에서** 묻는다 (저장까지 미루면 무엇에 동의했는지 흐려진다) */
  async function toggleOp(key: 'rehearsal' | 'closed' | 'locked') {
    if (!settings) return
    if (key === 'rehearsal' && settings.rehearsal) {
      const ok = await confirmAction({
        title: '실제 운영으로 바꿀까요?',
        desc: '지금부터 뽑을 때마다 재고가 실제로 줄어들어요. 리허설에서 뽑은 기록은 재고에 반영되지 않아요.',
        okLabel: '실제 운영으로',
        danger: true,
      })
      if (!ok) return
      patchSettings({ rehearsal: false })
      return
    }
    if (key === 'closed' && !settings.closed) {
      const ok = await confirmAction({
        title: '행사를 마감할까요?',
        desc: '방문자가 더 이상 뽑을 수 없게 돼요. 다시 열 수 있지만, 마감 안내가 방문자 화면에 바로 떠요.',
        okLabel: '마감하기',
        danger: true,
      })
      if (!ok) return
      patchSettings({ closed: true })
      return
    }
    patchSettings(
      key === 'rehearsal' ? { rehearsal: true } : key === 'closed' ? { closed: false } : { locked: !settings.locked }
    )
  }

  async function toggleCap() {
    if (!settings) return
    if (!settings.batchCapEnabled) {
      const ok = await confirmAction({
        title: '묶음 뽑기 제한을 켤까요?',
        desc: '흔한 상품이 덜 나오는 만큼 비싼 상품이 더 빨리 소진돼요. 상품 표에 “5개당 최대” 열이 생겨요.',
        okLabel: '켜기',
      })
      if (!ok) return
      patchSettings({ batchCapEnabled: true })
      return
    }
    patchSettings({ batchCapEnabled: false })
  }

  /** 저장 — 상품·설정을 함께 */
  async function saveAll() {
    if (!rows || !settings || !anyDirty || saving) return
    setSaving(true)
    setNote(null)
    try {
      if (settingsDirty) await repo.luckydraw.saveSettings(slug, settings)
      if (dirty) await repo.luckydraw.savePrizes(slug, rows)
      await load()
      setSaved(true)
      toast('저장했어요')
    } catch (e) {
      setNote(e instanceof Error ? e.message : '저장하지 못했어요')
    } finally {
      setSaving(false)
    }
  }

  async function discard() {
    if (!anyDirty) return
    const ok = await confirmAction({
      title: '바꾼 내용을 버릴까요?',
      desc: '저장하지 않은 변경이 모두 사라져요.',
      okLabel: '버리기',
      danger: true,
    })
    if (!ok) return
    await load()
    setSaved(false)
    toast('바꾼 내용을 버렸어요')
  }

  const locked = settings?.locked ?? false

  if (!rows || !settings) return null

  const totalRemaining = rows.reduce((s, r) => s + (Number(r.remaining) || 0), 0)
  const totalToday = rows.reduce((s, r) => s + r.consumedToday, 0)
  const totalAll = rows.reduce((s, r) => s + r.consumedTotal, 0)
  const capOn = settings.batchCapEnabled

  /** 표 격자 — 5개당 최대 열은 설정이 켜졌을 때만 생긴다 */
  const cols = `minmax(0,1fr) 96px 78px 78px${capOn ? ' 96px' : ''} 92px 40px`
  const tableVars = { ['--ad-tcols' as string]: cols, ['--ad-tmin' as string]: '660px' }

  const banners: { text: string; tone: 'warn' | 'mute' }[] = []
  if (locked)
    banners.push({ text: '설정이 잠겨 있어요. 상품과 수량을 고치려면 아래에서 잠금을 풀어 주세요.', tone: 'mute' })
  if (settings.rehearsal && !settings.closed)
    banners.push({ text: '지금은 리허설이에요. 행사 시작 전에 실제 운영으로 바꿔 주세요.', tone: 'warn' })
  if (settings.closed)
    banners.push({ text: '행사가 마감됐어요. 다시 열면 방문자가 이어서 뽑을 수 있어요.', tone: 'mute' })

  const stateTone = settings.closed ? 'mute' : settings.rehearsal ? 'warn' : 'key'
  const stateLabel = settings.closed ? '마감' : settings.rehearsal ? '리허설' : '실제 운영'
  const stateHint = settings.closed
    ? '방문자가 더 뽑을 수 없어요'
    : settings.rehearsal
      ? '뽑아도 재고가 줄지 않아요'
      : '뽑을 때마다 재고가 줄어요'

  return (
    <>
      <header className="ad-head">
        <div className="ad-head__row">
          <h1 className="ad-head__title">상품 · 운영</h1>
          <span className="ad-head__count tnum">상품 {rows.length}종</span>
        </div>
        <p className="ad-head__desc">
          재고와 운영 방식을 함께 봐요. 이 화면만 아래 저장을 눌러야 반영돼요.
        </p>
      </header>

      <div className="ad-stack">
        <div className="ad-stats">
          <div className="ad-stat">
            <div className="ad-stat__label">남은 수량</div>
            <div className="ad-stat__row">
              <span className="ad-stat__value tnum">{totalRemaining.toLocaleString()}</span>
              <span className="ad-stat__unit">개</span>
            </div>
            <div className="ad-stat__sub">상품 {rows.length}종</div>
          </div>
          <div className="ad-stat">
            <div className="ad-stat__label">오늘 나간 수량</div>
            <div className="ad-stat__row">
              <span className="ad-stat__value tnum">{totalToday.toLocaleString()}</span>
              <span className="ad-stat__unit">개</span>
            </div>
            <div className="ad-stat__sub">누적 {totalAll.toLocaleString()}개</div>
          </div>
          <div className="ad-stat">
            <div className="ad-stat__label">지금 운영 상태</div>
            <div style={{ marginTop: 10 }}>
              <span className="ad-state" data-tone={stateTone}>
                <span className="ad-state__dot" aria-hidden="true" />
                {stateLabel}
              </span>
            </div>
            <div className="ad-stat__sub">{stateHint}</div>
          </div>
        </div>

        {banners.map((b) => (
          <div key={b.text} className={`ad-banner ad-banner--${b.tone === 'warn' ? 'warn' : 'mute'}`}>
            {b.text}
          </div>
        ))}

        <div className="ad-card">
          <div className="ad-card__head" style={{ marginBottom: 6 }}>
            <div className="ad-card__titleRow">
              <span className="ad-card__title">상품</span>
              <span className="ad-card__num tnum">{rows.length}종</span>
            </div>
            <button
              type="button"
              className="ad-btn ad-btn--soft ad-btn--sm"
              disabled={rows.length >= MAX_PRIZES}
              onClick={addRow}
            >
              + 상품 추가
            </button>
          </div>
          <p className="ad-sub" style={{ marginBottom: 16 }}>
            등수는 줄 순서예요 · 남은 수량에 적은 만큼만 뽑을 수 있어요 · 다음 날 물량을 더할 땐 지금
            남은 수량에 더해서 적어 주세요 · 오늘 나감과 누적은 뽑힌 기록에서 센 값이라 고칠 수 없어요.
          </p>

          <div className="ad-table" style={tableVars}>
            <div className="ad-table__inner">
              <div className="ad-table__head">
                <span>등수 · 상품명</span>
                <span style={{ textAlign: 'center' }}>남은 수량</span>
                <span style={{ textAlign: 'center' }}>오늘 나감</span>
                <span style={{ textAlign: 'center' }}>누적</span>
                {capOn && <span style={{ textAlign: 'center' }}>5개당 최대</span>}
                <span>배송</span>
                <span />
              </div>

              {rows.map((r, i) => (
                <div key={r.id} className="ad-table__row ad-table__row--tight" data-dim={locked || undefined}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                    <span className="ad-rank" data-first={i === 0 || undefined}>
                      {r.rank}등
                    </span>
                    <input
                      className="ad-input ad-input--sm"
                      value={r.name}
                      placeholder="상품 이름"
                      disabled={locked}
                      onChange={(e) => patchRow(i, { name: e.target.value })}
                    />
                  </div>
                  <input
                    className="ad-input ad-input--sm ad-input--center"
                    inputMode="numeric"
                    value={r.remaining}
                    disabled={locked}
                    aria-label={`${r.rank}등 남은 수량`}
                    onChange={(e) =>
                      patchRow(i, { remaining: Math.max(0, Number(e.target.value.replace(/[^0-9]/g, '')) || 0) })
                    }
                  />
                  {/* 읽기 전용 — draw_logs 에서 센 값이라 손으로 못 고친다 */}
                  <span className="ad-cell--num tnum">{r.consumedToday}</span>
                  <span className="ad-cell--num tnum">{r.consumedTotal}</span>
                  {capOn && (
                    /**
                     * 비율이 아니라 **개수로 묻는다** — "5개 뽑을 때 이 상품 최대 몇 개".
                     * 저장은 비율(개수 ÷ 5)로 하고 RPC 가 `ceil(뽑기수 × 비율)` 로 상한을 잡는다.
                     */
                    <input
                      className="ad-input ad-input--sm ad-input--center"
                      inputMode="numeric"
                      placeholder="제한 없음"
                      value={r.batchCapRatio == null ? '' : Math.round(r.batchCapRatio * 5)}
                      disabled={locked}
                      aria-label={`${r.rank}등 5개당 최대 개수`}
                      onChange={(e) => {
                        const n = Math.floor(Number(e.target.value.replace(/[^0-9]/g, '')))
                        patchRow(i, { batchCapRatio: n >= 1 ? Math.min(n, 5) / 5 : null })
                      }}
                    />
                  )}
                  <button
                    type="button"
                    className="ad-toggle-pill"
                    data-on={r.requiresShipping || undefined}
                    disabled={locked}
                    aria-label={`${r.rank}등 배송 필요`}
                    onClick={() => patchRow(i, { requiresShipping: !r.requiresShipping })}
                  >
                    {r.requiresShipping ? '필요' : '아니요'}
                  </button>
                  <button
                    type="button"
                    className="ad-x"
                    aria-label={`${r.rank}등 삭제`}
                    disabled={locked}
                    onClick={() => void removeRow(i)}
                  >
                    ×
                  </button>
                </div>
              ))}

              <div className="ad-table__foot">
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ad-ink-2)' }}>합계</span>
                <span className="tnum" style={{ fontSize: 14, fontWeight: 700, textAlign: 'center' }}>
                  {totalRemaining.toLocaleString()}
                </span>
                <span
                  className="tnum"
                  style={{ fontSize: 14, fontWeight: 700, textAlign: 'center', color: 'var(--ad-ink-3)' }}
                >
                  {totalToday.toLocaleString()}
                </span>
                <span />
                {capOn && <span />}
                <span />
                <span />
              </div>
            </div>
          </div>
        </div>

        <div className="ad-card">
          <div className="ad-card__title" style={{ marginBottom: 0 }}>
            운영
          </div>
          <div>
            {/**
             * 리허설이 기본값이다 — 전날 시연에서 실수로 재고를 태우는 사고가,
             * 실운영인 줄 알고 리허설로 도는 사고보다 훨씬 비싸다 (배너가 계속 알려준다).
             */}
            <div className="ad-switchrow">
              <div className="ad-switchrow__text">
                <div className="ad-switchrow__name">실제 운영</div>
                <div className="ad-switchrow__hint">끄면 리허설이에요. 뽑아도 재고가 줄지 않아요.</div>
              </div>
              <button
                type="button"
                className="ad-switch"
                data-on={!settings.rehearsal || undefined}
                aria-label="실제 운영"
                onClick={() => void toggleOp('rehearsal')}
              />
            </div>
            <div className="ad-switchrow">
              <div className="ad-switchrow__text">
                <div className="ad-switchrow__name">행사 마감</div>
                <div className="ad-switchrow__hint">켜면 방문자가 더 못 뽑아요. 언제든 다시 열 수 있어요.</div>
              </div>
              <button
                type="button"
                className="ad-switch"
                data-on={settings.closed || undefined}
                aria-label="행사 마감"
                onClick={() => void toggleOp('closed')}
              />
            </div>
            <div className="ad-switchrow">
              <div className="ad-switchrow__text">
                <div className="ad-switchrow__name">설정 잠금</div>
                <div className="ad-switchrow__hint">
                  상품과 수량만 못 고치게 잠가요. 뽑기는 그대로 돼요.
                </div>
              </div>
              <button
                type="button"
                className="ad-switch"
                data-on={settings.locked || undefined}
                aria-label="설정 잠금"
                onClick={() => void toggleOp('locked')}
              />
            </div>
          </div>
        </div>

        <div className="ad-card">
          <div className="ad-card__title">당첨 결과 표시</div>
          <p className="ad-card__desc">뽑은 방문자 화면에 무엇으로 보일지 정해요.</p>
          <div className="ad-choices" style={{ marginTop: 12 }}>
            {(
              [
                ['both', '등수와 상품명'],
                ['rank', '등수만'],
                ['prize', '상품명만'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className="ad-choice"
                data-on={settings.displayMode === value || undefined}
                onClick={() => patchSettings({ displayMode: value })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="ad-card">
          <div className="ad-card__title">경품 미리보기</div>
          <div className="ad-checks" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="ad-check"
              data-on={settings.showPrizePreview || undefined}
              onClick={() => patchSettings({ showPrizePreview: !settings.showPrizePreview })}
            >
              <span className="ad-check__box">{settings.showPrizePreview ? '✓' : ''}</span>
              <span>
                <span className="ad-check__name">뽑기 전에 경품 목록 보여주기</span>
                <span className="ad-check__hint">상품명이 스포일러가 되는 행사면 꺼 주세요.</span>
              </span>
            </button>
            <button
              type="button"
              className="ad-check"
              data-on={(settings.showPrizePreview && settings.showPrizeCount) || undefined}
              data-dim={!settings.showPrizePreview || undefined}
              onClick={() => {
                if (!settings.showPrizePreview) {
                  toast('경품 미리보기를 먼저 켜 주세요')
                  return
                }
                patchSettings({ showPrizeCount: !settings.showPrizeCount })
              }}
            >
              <span className="ad-check__box">
                {settings.showPrizePreview && settings.showPrizeCount ? '✓' : ''}
              </span>
              <span>
                <span className="ad-check__name">남은 수량까지 보여주기</span>
                <span className="ad-check__hint">경품 목록을 보여줄 때만 고를 수 있어요.</span>
              </span>
            </button>
          </div>
        </div>

        <div className="ad-card">
          <div className="ad-card__title">묶음 뽑기 제한</div>
          <div style={{ marginTop: 12 }}>
            <button
              type="button"
              className="ad-check"
              data-on={capOn || undefined}
              onClick={() => void toggleCap()}
            >
              <span className="ad-check__box">{capOn ? '✓' : ''}</span>
              <span>
                <span className="ad-check__name">한 번에 5개 뽑을 때 상품마다 최대 개수를 정하기</span>
                <span className="ad-check__hint">
                  켜면 상품 표에 열이 하나 늘어요. 비워 두면 그 상품은 제한이 없어요.
                </span>
              </span>
            </button>
            {capOn && (
              <div className="ad-banner ad-banner--warn" style={{ marginTop: 12, fontWeight: 700 }}>
                흔한 상품이 덜 나오는 만큼 비싼 상품이 더 빨리 소진돼요.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="ad-savebar" data-dirty={anyDirty || undefined}>
        <span className="ad-savebar__note">
          {note
            ? note
            : saving
              ? '저장하는 중이에요'
              : anyDirty
                ? '아직 저장하지 않은 변경이 있어요'
                : saved
                  ? '저장됐어요'
                  : '바꾼 내용이 없어요'}
        </span>
        <div className="ad-btnrow">
          <button
            type="button"
            className="ad-btn ad-btn--line ad-btn--xl"
            disabled={!anyDirty || saving}
            onClick={() => void discard()}
          >
            되돌리기
          </button>
          <button
            type="button"
            className="ad-btn ad-btn--primary ad-btn--xl"
            disabled={!anyDirty || saving}
            onClick={() => void saveAll()}
            data-save
          >
            {saving ? '저장하는 중…' : '저장'}
          </button>
        </div>
      </div>
    </>
  )
}
