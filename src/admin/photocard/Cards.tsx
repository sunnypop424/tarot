import { useCallback, useEffect, useState } from 'react'
import { Image as ImageIcon, Sparkles, TriangleAlert } from 'lucide-react'

import { repo } from '@/lib/repo'
import { photocardRules, RARITY_LABEL } from '@/data/photocard'
import type { PhotocardReportRow, PhotocardSettings } from '@/lib/repo/types'
import { cssUrl } from '@/lib/image'
import { useSlot } from '@/slot/SlotProvider'
import { confirmAction, toast } from '../AdminFeedback'
import styles from './Photocard.module.css'

/**
 * 카드 재고 · 운영 설정 — **주최자의 자리다.**
 *
 * 카드 이미지와 이름은 **편집기(최고관리자)** 가 만든다. 업로드 권한이 owner-only Storage 라
 * (`0002_storage.sql`) 주최자는 이미지를 올릴 수 없고, 그 정책을 안 건드리는 게 곧 설계다.
 * 그래서 여기서는 **행사 중에 바뀌는 값**만 만진다 — 재고·운영 방식·연습·마감.
 *
 * 재고는 행사 도중 실제로 손대는 값이다(실물이 더 왔거나, 상한 카드가 남았거나).
 */
export function Cards() {
  const slot = useSlot()
  const slug = slot.slug
  const [rows, setRows] = useState<PhotocardReportRow[] | null>(null)
  const [settings, setSettings] = useState<PhotocardSettings | null>(null)
  const [stock, setStock] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [r, s] = await Promise.all([repo.photocard.report(slug), repo.photocard.settings(slug)])
    setRows(r)
    setSettings(s)
    setStock(Object.fromEntries(r.map((x) => [x.cardId ?? '', x.remaining === null ? '' : String(x.remaining)])))
  }, [slug])

  useEffect(() => {
    void load()
  }, [load])

  if (!repo.photocard.ready()) {
    return (
      <div className="admin-empty">
        <Sparkles size={44} strokeWidth={1.6} aria-hidden="true" />
        <div className="admin-empty__title">지금 빌드에서는 포토카드를 쓸 수 없어요</div>
      </div>
    )
  }
  if (!rows || !settings) return null

  const rules = photocardRules(settings.mode)

  const save = async (next: PhotocardSettings) => {
    setBusy(true)
    try {
      await repo.photocard.saveSettings(slug, next)
      setSettings(next)
      toast('저장했어요')
    } finally {
      setBusy(false)
    }
  }

  const saveStock = async (id: string) => {
    const raw = stock[id] ?? ''
    const cards = await repo.photocard.listCards(slug)
    const card = cards.find((c) => c.id === id)
    if (!card) return
    await repo.photocard.saveCard(slug, { ...card, remaining: raw.trim() === '' ? null : Math.max(0, Number(raw) || 0) })
    await load()
    toast('재고를 고쳤어요')
  }

  const totalLeft = rows.reduce((n, r) => n + (r.remaining ?? 0), 0)
  const anyFinite = rows.some((r) => r.remaining !== null)

  return (
    <div>
      <header className="admin__head">
        <div>
          <h1 className="t-title-l">카드</h1>
          <p className="t-text-xs t-muted">
            {rows.length}종 · {anyFinite ? `남은 수량 ${totalLeft}장` : '수량 무제한'}
          </p>
        </div>
      </header>

      {settings.rehearsal && (
        <div className={`${styles.banner} ${styles.bannerWarn}`}>
          <TriangleAlert size={20} strokeWidth={2} aria-hidden="true" style={{ flex: 'none' }} />
          <p className="t-text-s" style={{ margin: 0 }}>
            <b>연습 모드가 켜져 있어요.</b> 지금 뽑아도 재고가 줄지 않아요 — 전날 시연에서 한정 카드를
            태우는 사고를 막으려고 기본으로 켜 둡니다. <b>행사 시작 전에 꺼 주세요.</b>
          </p>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="admin-empty">
          <Sparkles size={44} strokeWidth={1.6} aria-hidden="true" />
          <div className="admin-empty__title">아직 카드가 없어요</div>
          <div className="t-text-s t-muted">카드 이미지 등록은 담당자가 해요 — 원본을 보내 주세요.</div>
        </div>
      ) : (
        <div className={styles.list} data-cards>
          {rows.map((r) => (
            <div key={r.cardId} className={styles.row} data-out={r.remaining === 0 || undefined}>
              {/* 썸네일도 background-image — 관리 화면도 예외가 아니다 (CLAUDE.md) */}
              <div
                className={styles.thumb}
                style={r.image ? { backgroundImage: cssUrl(r.image) } : undefined}
                role={r.image ? 'img' : undefined}
                aria-label={r.image ? r.name : undefined}
              >
                {!r.image && <ImageIcon size={16} strokeWidth={1.7} aria-hidden="true" />}
              </div>
              <div className={styles.rowMain}>
                <div className={styles.rowTop}>
                  <span className="t-text-m" style={{ fontWeight: 700 }}>{r.name}</span>
                  <span className={styles.tag}>{RARITY_LABEL[r.rarity] ?? `레어도 ${r.rarity}`}</span>
                  {r.remaining === 0 && <span className={styles.warn}>소진</span>}
                </div>
                <div className={styles.rowMeta}>
                  <span>뽑힌 수 {r.drawn}장</span>
                  <span>·</span>
                  <span>{r.remaining === null ? '수량 무제한' : `남은 수량 ${r.remaining}장`}</span>
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 7, flex: 'none' }}>
                <span className="t-text-xs t-muted">재고</span>
                <input
                  className="input"
                  style={{ width: 92 }}
                  type="number"
                  min={0}
                  placeholder="무제한"
                  value={stock[r.cardId ?? ''] ?? ''}
                  onChange={(e) => setStock({ ...stock, [r.cardId ?? '']: e.target.value })}
                  onBlur={() => r.cardId && void saveStock(r.cardId)}
                  aria-label={`${r.name} 재고`}
                />
              </label>
            </div>
          ))}
          <p className="t-text-xs t-muted" style={{ margin: '4px 0 0' }}>
            재고를 비워두면 <b>무제한</b>이에요. 0으로 두면 그 카드는 더 이상 안 나옵니다.
            <br />
            <b>레어도는 재고와 상관없이 지켜져요</b> — 스페셜이 한 장 남아도 스페셜 확률로 나옵니다.
          </p>
        </div>
      )}

      <section className="card" style={{ padding: 18, marginTop: 18 }}>
        <h2 className="t-title-s" style={{ margin: '0 0 14px' }}>운영 설정</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,220px),1fr))', gap: 14 }}>
          <label className="field">
            <span className="field__label">운영 방식</span>
            <select
              className="select"
              value={settings.mode}
              disabled={busy}
              onChange={async (e) => {
                const mode = e.target.value as PhotocardSettings['mode']
                if (
                  !(await confirmAction({
                    title: '운영 방식을 바꿀까요?',
                    desc: '손님 화면이 통째로 달라져요. 행사 중에는 바꾸지 마세요.',
                    okLabel: '바꾸기',
                  }))
                )
                  return
                void save({ ...settings, mode })
              }}
              data-mode
            >
              <option value="save">저장용 — 손님이 폰에서 뽑고 이미지를 가져가요</option>
              <option value="gift">1장 증정 — 손님이 뽑기권을 받고 스태프가 뽑아요</option>
              <option value="sale">판매 — 스태프 기기에서만 뽑아요</option>
            </select>
            <span className="field__hint">
              {rules.physical
                ? '실물이 걸려 있어서 뽑기는 항상 스태프 기기에서 일어나요.'
                : '실물 없이 이미지만 가져가는 방식이에요.'}
            </span>
          </label>

          {rules.visitorDraws && (
            <label className="field">
              <span className="field__label">한 사람이 뽑는 횟수</span>
              <input
                className="input"
                type="number"
                min={1}
                max={20}
                value={settings.drawsPerVisitor}
                disabled={busy}
                onChange={(e) => setSettings({ ...settings, drawsPerVisitor: Math.max(1, Number(e.target.value) || 1) })}
                onBlur={() => void save(settings)}
              />
              <span className="field__hint">
                기기 기준이에요 — 브라우저 기록을 지우면 다시 뽑을 수 있습니다.
              </span>
            </label>
          )}

          {rules.batch && (
            <label className="field">
              <span className="field__label">한 번에 최대</span>
              <input
                className="input"
                type="number"
                min={1}
                max={50}
                value={settings.batchCount}
                disabled={busy}
                onChange={(e) => setSettings({ ...settings, batchCount: Math.max(1, Number(e.target.value) || 1) })}
                onBlur={() => void save(settings)}
              />
              <span className="field__hint">N연차의 상한이에요 (최대 50장).</span>
            </label>
          )}

          {rules.usesTicket && (
            <label className="field">
              <span className="field__label">이미지 저장</span>
              <select
                className="select"
                value={settings.allowSave ? 'on' : 'off'}
                disabled={busy}
                onChange={(e) => void save({ ...settings, allowSave: e.target.value === 'on' })}
              >
                <option value="off">실물만 드려요</option>
                <option value="on">이미지도 저장할 수 있어요</option>
              </select>
            </label>
          )}

          <label className="field">
            <span className="field__label">연습 모드</span>
            <select
              className="select"
              value={settings.rehearsal ? 'on' : 'off'}
              disabled={busy}
              onChange={(e) => void save({ ...settings, rehearsal: e.target.value === 'on' })}
              data-rehearsal
            >
              <option value="on">연습 (재고가 안 줄어요)</option>
              <option value="off">실제 운영</option>
            </select>
          </label>

          <label className="field">
            <span className="field__label">마감</span>
            <select
              className="select"
              value={settings.closed ? 'on' : 'off'}
              disabled={busy}
              onChange={(e) => void save({ ...settings, closed: e.target.value === 'on' })}
            >
              <option value="off">진행 중</option>
              <option value="on">마감</option>
            </select>
          </label>

          {rules.batch && (
            <label className="field">
              <span className="field__label">묶음 상한</span>
              <select
                className="select"
                value={settings.batchCapEnabled ? 'on' : 'off'}
                disabled={busy}
                onChange={(e) => void save({ ...settings, batchCapEnabled: e.target.value === 'on' })}
              >
                <option value="on">켜요 (권장)</option>
                <option value="off">꺼요</option>
              </select>
              <span className="field__hint">
                켜면 한 묶음에 같은 카드가 몰리는 걸 막아요 — "10연차에 스페셜 5장" 같은 사고를 막습니다.
              </span>
            </label>
          )}
        </div>
      </section>
    </div>
  )
}
