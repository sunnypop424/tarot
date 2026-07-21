import { useCallback, useEffect, useState } from 'react'
import { Info, Lock, Plus, Trash2, TriangleAlert } from 'lucide-react'

import { repo } from '@/lib/repo'
import type { LuckydrawSettings, PrizeReport } from '@/lib/repo'
import { useSlot } from '@/slot/SlotProvider'
import { confirmAction, toast } from '../AdminFeedback'
import styles from './Luckydraw.module.css'

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
 * 럭키드로우 대시보드 — **상품·수량·운영 설정을 한 화면에** 모은다.
 *
 * 원래는 '상품과 수량'과 '운영 설정'이 메뉴로 갈려 있었는데, 주최자가 행사 중에 오가는 두
 * 가지를 굳이 나눌 이유가 없었다. 위에 지표를 얹고, 손이 제일 자주 가는 상품 표를 먼저,
 * 그 아래 운영 설정을 이어 붙여 한눈에 본다.
 *
 * **상품 표도 운영 설정도 저장하기를 눌러야 반영된다** (한 화면, 한 저장 버튼).
 * 토글은 초안일 뿐이고, 하단 저장 버튼이 바뀐 것(상품·설정)을 한 번에 넣는다.
 * 다만 **실제 운영 전환·마감**은 되돌리기 어려우니 저장 직전에 한 번 더 확인한다.
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

  /** 운영 설정 — **초안만 고친다** (저장은 아래 저장 버튼) */
  function patchSettings(next: Partial<LuckydrawSettings>) {
    setSettings((prev) => prev && { ...prev, ...next })
  }

  /** 상품 표 — 초안만 고친다 */
  function patchRow(index: number, next: Partial<PrizeReport>) {
    setRows((prev) => prev && prev.map((r, i) => (i === index ? { ...r, ...next } : r)))
    setDirty(true)
  }
  function addRow() {
    setRows((prev) => prev && [...prev, blankPrize(prev.length + 1)])
    setDirty(true)
  }
  async function removeRow(index: number) {
    const target = rows?.[index]
    if (!target) return
    const ok = await confirmAction({
      title: `${target.rank}등 ${target.name || '(이름 없음)'} 을 지울까요?`,
      okLabel: '삭제',
      danger: true,
    })
    if (!ok) return
    // 등수는 행 순서다 — 지운 뒤 다시 매긴다
    setRows((prev) => prev && prev.filter((_, i) => i !== index).map((r, i) => ({ ...r, rank: i + 1 })))
    setDirty(true)
  }

  /** 저장 — 상품·설정을 함께. 위험 전환(실제 운영·마감)은 넣기 직전에 확인한다 */
  async function saveAll() {
    if (!rows || !settings || !savedSettings) return
    const goingLive = savedSettings.rehearsal && !settings.rehearsal
    const closing = !savedSettings.closed && settings.closed
    if (
      goingLive &&
      !(await confirmAction({
        title: '실제 운영으로 바꿀까요?',
        desc: '지금부터 방문자가 뽑을 때마다 재고가 실제로 줄어들어요. 되돌리면 리허설로 돌아가지만 나간 수량은 유지돼요.',
        okLabel: '실제 운영으로 저장',
      }))
    )
      return
    if (
      closing &&
      !(await confirmAction({
        title: '행사를 마감할까요?',
        desc: '마감하면 방문자가 더 이상 추첨할 수 없어요. 언제든 다시 열 수 있어요.',
        okLabel: '마감으로 저장',
        danger: true,
      }))
    )
      return

    setSaving(true)
    setNote(null)
    try {
      if (settingsDirty) await repo.luckydraw.saveSettings(slug, settings)
      if (dirty) await repo.luckydraw.savePrizes(slug, rows)
      await load()
      toast('저장되었어요')
    } catch (e) {
      setNote(e instanceof Error ? e.message : '저장하지 못했어요')
    } finally {
      setSaving(false)
    }
  }

  if (!rows || !settings) return null

  const totalRemaining = rows.reduce((s, r) => s + (Number(r.remaining) || 0), 0)
  const totalToday = rows.reduce((s, r) => s + r.consumedToday, 0)
  const totalAll = rows.reduce((s, r) => s + r.consumedTotal, 0)
  const locked = settings.locked

  return (
    <div>
      <header className="admin__head">
        <div>
          <h1 className="t-title-l">대시보드</h1>
          <p className="t-text-xs t-muted">상품 수량과 운영 설정을 한 화면에서 관리해요.</p>
        </div>
      </header>

      {/* ── 지표 타일 ─────────────────────────────── */}
      <div className="stat-row">
        <div className="stat-tile">
          <span className="stat-label">남은 수량</span>
          <span className="stat-value">
            {totalRemaining.toLocaleString()}
            <span className="stat-unit">개</span>
          </span>
          <span className="stat-sub">상품 {rows.length}종</span>
        </div>
        <div className="stat-tile">
          <span className="stat-label">오늘 나감</span>
          <span className="stat-value">
            {totalToday.toLocaleString()}
            <span className="stat-unit">개</span>
          </span>
          <span className="stat-sub">누적 {totalAll.toLocaleString()}개</span>
        </div>
        <div className="stat-tile">
          <span className="stat-label">운영 상태</span>
          <span className="stat-value stat-value--state">
            <span
              className="stat-dot"
              data-tone={settings.closed ? 'closed' : settings.rehearsal ? 'rehearsal' : 'live'}
            />
            {settings.closed ? '마감' : settings.rehearsal ? '리허설' : '실제 운영'}
          </span>
          <span className="stat-sub">
            {settings.closed
              ? '방문자 추첨이 막혀 있어요'
              : settings.rehearsal
                ? '뽑아도 재고가 줄지 않아요'
                : '뽑을 때마다 재고가 줄어요'}
          </span>
        </div>
      </div>

      {/* ── 상품과 수량 (명시적 저장) — 손이 제일 자주 가는 표를 먼저 ─── */}
      <section className="admin-section">
        <h2 className={`t-title-s ${styles.sectionTitle}`}>상품과 수량</h2>
        <p className={`t-text-xs t-muted ${styles.sectionDesc}`}>
          <b>남은 수량</b>에 적은 숫자가 곧 뽑을 수 있는 수량이에요. 다음 날 물량을 더할 땐 지금 남은
          수량에 더해서 적어주세요.
        </p>

        {locked && (
          <div className="admin-banner admin-banner--warn">
            <Lock size={16} aria-hidden="true" />
            <span>
              설정이 잠겨 있어요. <b>잠금을 풀어야</b> 아래 운영 설정에서 상품·수량을 고칠 수 있어요.
            </span>
          </div>
        )}
        {settings.rehearsal && (
          <div className="admin-banner admin-banner--info">
            <Info size={16} aria-hidden="true" />
            <span>
              지금은 <b>리허설</b>이에요. 뽑아도 재고가 줄지 않아요. 행사 시작 전에 아래에서{' '}
              <b>실제 운영</b>으로 바꿔주세요.
            </span>
          </div>
        )}

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>등수</th>
                <th className={styles.colName}>상품명</th>
                <th>남은 수량</th>
                <th className={styles.statHead}>오늘 나감</th>
                <th className={styles.statHead}>누적</th>
                <th className={styles.center}>배송</th>
                {settings.batchCapEnabled && <th className={styles.center}>5개당 최대</th>}
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id}>
                  <td className={styles.rank}>
                    <span className={styles.rankBadge}>{r.rank}등</span>
                  </td>
                  <td>
                    <input
                      className="input"
                      value={r.name}
                      disabled={locked}
                      onChange={(e) => patchRow(i, { name: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className={`input ${styles.num}`}
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={r.remaining}
                      disabled={locked}
                      onChange={(e) => patchRow(i, { remaining: Math.max(0, Number(e.target.value) || 0) })}
                    />
                  </td>
                  {/* 읽기 전용 — draw_logs 에서 센 값이라 손으로 못 고친다 */}
                  <td className={styles.stat}>{r.consumedToday}</td>
                  <td className={styles.stat}>{r.consumedTotal}</td>
                  <td className={styles.center}>
                    <input
                      type="checkbox"
                      checked={r.requiresShipping}
                      disabled={locked}
                      aria-label={`${r.rank}등 배송 필요`}
                      onChange={(e) => patchRow(i, { requiresShipping: e.target.checked })}
                    />
                  </td>
                  {settings.batchCapEnabled && (
                    <td className={styles.center}>
                      {/**
                       * 비율이 아니라 **개수로 묻는다** — "5개 뽑을 때 이 상품 최대 몇 개".
                       * 저장은 비율(개수 ÷ 5)로 하고 RPC 가 `ceil(뽑기수 × 비율)` 로 상한을 잡는다.
                       */}
                      <input
                        className={`input ${styles.cap}`}
                        type="number"
                        min={1}
                        max={5}
                        inputMode="numeric"
                        placeholder="제한 없음"
                        value={r.batchCapRatio == null ? '' : Math.round(r.batchCapRatio * 5)}
                        disabled={locked}
                        aria-label={`${r.rank}등 5개당 최대 개수`}
                        onChange={(e) => {
                          const n = Math.floor(Number(e.target.value))
                          patchRow(i, { batchCapRatio: n >= 1 ? Math.min(n, 5) / 5 : null })
                        }}
                      />
                    </td>
                  )}
                  <td className={styles.center}>
                    <button
                      type="button"
                      className="btn-icon"
                      aria-label={`${r.rank}등 삭제`}
                      disabled={locked}
                      onClick={() => void removeRow(i)}
                    >
                      <Trash2 size={18} aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={styles.tableFoot}>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={locked || rows.length >= MAX_PRIZES}
            onClick={addRow}
          >
            <Plus size={16} aria-hidden="true" /> 상품 추가
          </button>

          <p className="t-text-xs t-muted">
            남은 수량 <b>{totalRemaining.toLocaleString()}</b>개 · 오늘 나감 <b>{totalToday.toLocaleString()}</b>개
          </p>
        </div>
      </section>

      {/* ── 운영 설정 (아래 저장 버튼으로 반영) ─────────────────── */}
      <section className="admin-section">
        <h2 className={`t-title-s ${styles.sectionTitle}`}>운영 설정</h2>
        <p className={`t-text-xs t-muted ${styles.sectionDesc}`}>
          바꾼 값은 아래 <b>저장하기</b>를 눌러야 반영돼요.
        </p>

        <div className={styles.toggles}>
          {/**
           * 리허설이 기본값이다 — 전날 시연에서 실수로 재고를 태우는 사고가,
           * 실운영인 줄 알고 리허설로 도는 사고보다 훨씬 비싸다 (후자는 배너가 계속 알려준다).
           */}
          <label className={styles.toggle} data-on={!settings.rehearsal || undefined}>
            <input
              type="checkbox"
              checked={!settings.rehearsal}
              disabled={saving}
              onChange={(e) => patchSettings({ rehearsal: !e.target.checked })}
            />
            <span>
              <b>실제 운영</b>
              <span className="t-text-xs t-muted">
                {settings.rehearsal
                  ? '지금은 리허설이라 뽑아도 재고가 줄지 않아요'
                  : '뽑을 때마다 재고가 실제로 줄어요'}
              </span>
            </span>
          </label>

          <label className={styles.toggle} data-on={settings.closed || undefined}>
            <input
              type="checkbox"
              checked={settings.closed}
              disabled={saving}
              onChange={(e) => patchSettings({ closed: e.target.checked })}
            />
            <span>
              <b>행사 마감</b>
              <span className="t-text-xs t-muted">켜면 아무도 추첨할 수 없어요</span>
            </span>
          </label>

          <label className={styles.toggle} data-on={settings.locked || undefined}>
            <input
              type="checkbox"
              checked={settings.locked}
              disabled={saving}
              onChange={(e) => patchSettings({ locked: e.target.checked })}
            />
            <span>
              <b>설정 잠금</b>
              <span className="t-text-xs t-muted">상품·수량을 못 고치게 잠가요. 추첨은 그대로 됩니다</span>
            </span>
          </label>
        </div>

        <h3 className={styles.subhead}>당첨 결과 표시</h3>
        <div className={styles.toggles}>
          {(
            [
              ['both', '등수와 상품명'],
              ['rank', '등수만'],
              ['prize', '상품명만'],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className={styles.toggle}
              data-on={settings.displayMode === value || undefined}
            >
              <input
                type="radio"
                name="displayMode"
                checked={settings.displayMode === value}
                disabled={saving}
                onChange={() => patchSettings({ displayMode: value })}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>

        <h3 className={styles.subhead}>경품 미리보기</h3>
        <p className="t-text-xs t-muted" style={{ marginBottom: 'var(--space-base)' }}>
          손님이 뽑기 전에 <b>어떤 경품이 있는지</b> 볼 수 있게 해줘요. 상품명이 스포일러가 되는
          행사라면 꺼두세요.
        </p>
        <div className={styles.toggles}>
          <label className={styles.toggle} data-on={settings.showPrizePreview || undefined}>
            <input
              type="checkbox"
              checked={settings.showPrizePreview}
              disabled={saving}
              onChange={(e) => patchSettings({ showPrizePreview: e.target.checked })}
            />
            <span>
              <b>경품 미리보기 사용</b>
              <span className="t-text-xs t-muted">
                {settings.showPrizePreview
                  ? '손님 화면에 경품 목록을 볼 수 있는 버튼이 떠요'
                  : '끄면 미리보기 버튼이 사라져요'}
              </span>
            </span>
          </label>

          <label
            className={styles.toggle}
            data-on={(settings.showPrizePreview && settings.showPrizeCount) || undefined}
            style={settings.showPrizePreview ? undefined : { opacity: 0.5 }}
          >
            <input
              type="checkbox"
              checked={settings.showPrizeCount}
              disabled={saving || !settings.showPrizePreview}
              onChange={(e) => patchSettings({ showPrizeCount: e.target.checked })}
            />
            <span>
              <b>남은 수량 표시</b>
              <span className="t-text-xs t-muted">미리보기에서 상품별 남은 수량까지 보여줘요</span>
            </span>
          </label>
        </div>

        <h3 className={styles.subhead}>묶음 뽑기 제한</h3>
        <p className="t-text-xs t-muted" style={{ marginBottom: 'var(--space-base)' }}>
          여러 개를 한 번에 뽑을 때 같은 상품이 몰려 나오는 걸 줄여요. 켜면 위 표에서 상품마다
          <b> 5개 뽑을 때 최대 몇 개</b>까지 나올지 정할 수 있어요 (비우면 제한 없음).
        </p>
        <label className={styles.toggle} data-on={settings.batchCapEnabled || undefined}>
          <input
            type="checkbox"
            checked={settings.batchCapEnabled}
            disabled={saving}
            onChange={(e) => patchSettings({ batchCapEnabled: e.target.checked })}
          />
          <span>
            <b>제한 사용</b>
            <span className="t-text-xs t-muted">
              {settings.batchCapEnabled
                ? '위 표에서 5개당 최대 개수를 정할 수 있어요'
                : '끄면 제한 없이 뽑혀요'}
            </span>
          </span>
        </label>
        {settings.batchCapEnabled && (
          <div className="admin-banner admin-banner--warn" style={{ marginTop: 12, marginBottom: 0 }}>
            <TriangleAlert size={16} aria-hidden="true" />
            <span>
              흔한 상품이 덜 나오는 만큼, <b>비싼 상품이 더 빨리 소진</b>될 수 있어요.
            </span>
          </div>
        )}
      </section>

      <div className={styles.saveBar}>
        {note && <span className="field__error">{note}</span>}
        {/* 잠금은 상품 편집만 막는다 — 저장 버튼은 막지 않는다 (안 그러면 잠금 해제를 저장할 수 없다) */}
        <button
          type="button"
          className="btn btn--primary"
          disabled={saving || !anyDirty}
          onClick={() => void saveAll()}
          data-save
        >
          {saving ? '저장 중…' : anyDirty ? '저장하기' : '저장됨'}
        </button>
      </div>
    </div>
  )
}
