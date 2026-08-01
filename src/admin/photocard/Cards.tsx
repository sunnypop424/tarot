import { useCallback, useEffect, useState } from 'react'

import { repo } from '@/lib/repo'
import { photocardOdds, photocardRules, RARITY_CURVES, RARITY_LABEL } from '@/data/photocard'
import type { PhotocardReportRow, PhotocardSettings } from '@/lib/repo/types'
import { cssUrl } from '@/lib/image'
import { useSlot } from '@/slot/SlotProvider'
import { confirmAction, toast } from '../AdminFeedback'
import { useT } from '@/i18n'

/**
 * 카드 재고 · 운영 설정 — **주최자의 자리다.**
 *
 * 카드 이미지와 이름은 **편집기(최고관리자)** 가 만든다. 업로드 권한이 owner-only Storage 라
 * (`0002_storage.sql`) 주최자는 이미지를 올릴 수 없고, 그 정책을 안 건드리는 게 곧 설계다.
 * 그래서 여기서는 **행사 중에 바뀌는 값**만 만진다 — 재고·레어도·운영 방식·연습·마감.
 * (이름도 여기서 못 고친다. 카드 이름은 이미지와 한 벌이라 올린 사람이 정한다.)
 *
 * 재고는 행사 도중 실제로 손대는 값이다(실물이 더 왔거나, 상한 카드가 남았거나).
 */
export function Cards() {
  const t = useT()
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

  const head = (
    <header className="ad-head">
      <div className="ad-head__row">
        <h1 className="ad-head__title">{t('카드')}</h1>
        {rows && <span className="ad-head__count tnum">{rows.length}종</span>}
      </div>
      <p className="ad-head__desc">
        카드마다 레어도와 재고를 정해요. 줄 안에서 바로 고칠 수 있어요.
      </p>
    </header>
  )

  if (!repo.photocard.ready()) {
    return (
      <>
        {head}
        <div className="ad-card">
          <div className="ad-empty">
            <div className="ad-empty__title">{t('지금 빌드에서는 포토카드를 쓸 수 없어요')}</div>
          </div>
        </div>
      </>
    )
  }
  if (!rows || !settings) return null

  const rules = photocardRules(settings.mode)

  const save = async (next: PhotocardSettings) => {
    setBusy(true)
    try {
      await repo.photocard.saveSettings(slug, next)
      setSettings(next)
      toast(t('저장했어요'))
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
    toast(t('재고를 고쳤어요'))
  }

  /** 카드 한 장의 운영값을 고친다 — 목록(report)엔 없는 필드가 있어 원본을 되읽는다 */
  const patchCard = async (id: string, change: { lucky?: boolean; rarity?: number }) => {
    const cards = await repo.photocard.listCards(slug)
    const card = cards.find((c) => c.id === id)
    if (!card) return
    await repo.photocard.saveCard(slug, { ...card, ...change })
    await load()
    toast(t('저장했어요'))
  }

  const totalLeft = rows.reduce((n, r) => n + (r.remaining ?? 0), 0)
  const anyFinite = rows.some((r) => r.remaining !== null)
  /**
   * **레어도를 감으로 정하고 있었다.** 5 를 누르면 그게 몇 퍼센트인지 알 방법이 없었고,
   * 카드가 늘 때마다 다른 카드 확률도 같이 움직이는데 그것도 안 보였다.
   * 규칙은 `photocardOdds` 한 곳에 있다 — 서버(0026)의 가중치를 그대로 옮긴 것이다.
   */
  const odds = photocardOdds(
    rows.map((r) => ({ name: r.name, rarity: r.rarity, remaining: r.remaining })),
    settings.rarityCurve
  )
  const oddsOf = new Map(rows.map((r, i) => [r.cardId ?? String(i), odds[i].p]))
  const tableVars = {
    ['--ad-tcols' as string]: '44px minmax(0,1fr) 168px 76px 84px 76px 76px',
    ['--ad-tmin' as string]: '780px',
  }

  return (
    <>
      {head}

      <div className="ad-stack">
        {settings.rehearsal && (
          <div className="ad-banner ad-banner--warn ad-banner--pad">
            <div className="ad-banner__title">{t('연습 모드가 켜져 있어요')}</div>
            <div className="ad-banner__body">
              지금 뽑아도 재고가 줄지 않아요 — 전날 시연에서 한정 카드를 태우는 사고를 막으려고
              기본으로 켜 둬요. 행사 전에 꼭 꺼 주세요.
            </div>
          </div>
        )}

        <div className="ad-card">
          <div className="ad-card__head" style={{ marginBottom: 6 }}>
            <div className="ad-card__titleRow">
              <span className="ad-card__title">
                {rows.length}종 · {anyFinite ? `남은 수량 ${totalLeft}장` : t('수량 무제한')}
              </span>
            </div>
          </div>
          <p className="ad-sub" style={{ marginBottom: 16 }}>
            줄 안에서 바로 고칠 수 있어요. 고르면 바로 저장돼요. 카드 이름과 이미지는 담당자가
            올려 드려요.
          </p>

          {/**
           * 레어도 간격 — **행사 규모를 아는 사람이 고른다.**
           *
           * 100명 드는 행사에 가파름을 쓰면 전설이 서너 장밖에 안 나와 민원이 되고,
           * 1,000명 행사에 완만을 쓰면 "전설이 흔하다" 가 된다. 그 규모는 주최자만 안다.
           * 오른쪽 확률표가 **누르는 즉시** 바뀌므로 감이 아니라 숫자를 보고 고른다.
           */}
          <div className="ad-btnrow" style={{ marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="ad-field__label" style={{ marginRight: 4 }}>
              레어도 간격
            </span>
            {RARITY_CURVES.map((c) => (
              <button
                key={c.id}
                type="button"
                className="ad-choice ad-choice--sm"
                data-on={settings.rarityCurve === c.id || undefined}
                disabled={busy}
                onClick={() => void save({ ...settings, rarityCurve: c.id })}
                data-curve={c.id}
              >
                {c.label}
              </button>
            ))}
            <span className="ad-fine">
              {RARITY_CURVES.find((c) => c.id === settings.rarityCurve)?.desc}
            </span>
          </div>

          {rows.length === 0 ? (
            <div className="ad-empty">
              <div className="ad-empty__title">{t('아직 카드가 없어요')}</div>
              <div className="ad-empty__sub">
                이미지 등록은 담당자가 해요. 원본을 보내 주시면 올려 드려요.
              </div>
            </div>
          ) : (
            <div className="ad-table" style={tableVars}>
              <div className="ad-table__inner" data-cards>
                <div className="ad-table__head">
                  <span />
                  <span>{t('이름')}</span>
                  <span>{t('레어도')}</span>
                  {/* 레어도 바로 옆에 — 숫자를 누르면 이 값이 바뀌는 걸 그 자리에서 봐야 한다 */}
                  <span style={{ textAlign: 'center' }}>{t('나올 확률')}</span>
                  <span style={{ textAlign: 'center' }}>{t('럭키')}</span>
                  <span style={{ textAlign: 'center' }}>{t('재고')}</span>
                  <span style={{ textAlign: 'center' }}>{t('뽑힌 수')}</span>
                </div>
                {rows.map((r) => (
                  <div key={r.cardId} className="ad-table__row ad-table__row--tight">
                    {/* 썸네일도 background-image — 관리 화면도 예외가 아니다 (CLAUDE.md) */}
                    <div
                      className="ad-thumb"
                      style={r.image ? { backgroundImage: cssUrl(r.image) } : undefined}
                      role={r.image ? 'img' : undefined}
                      aria-label={r.image ? r.name : undefined}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div className="ad-cell--b">{r.name}</div>
                      {r.remaining === 0 && (
                        <span className="ad-tag ad-tag--sm" style={{ marginTop: 6 }}>
                          소진
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 3 }}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          className="ad-mini"
                          data-on={r.rarity === n || undefined}
                          disabled={busy}
                          aria-label={`${r.name} 레어도 ${RARITY_LABEL[n]}`}
                          title={RARITY_LABEL[n]}
                          onClick={() => r.cardId && void patchCard(r.cardId, { rarity: n })}
                          data-rarity
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    {/*
                      * 소진된 카드는 후보에서 빠지므로 확률이 0 이다 — '0%' 라고 적으면
                      * 레어도를 0 으로 만든 것처럼 읽힌다. 왜 0인지를 적는다.
                      */}
                    <span
                      className="ad-cell--num tnum"
                      style={{ color: r.remaining === 0 ? 'var(--ad-ink-4)' : undefined }}
                      data-odds
                    >
                      {r.remaining === 0
                        ? '—'
                        : `${((oddsOf.get(r.cardId ?? '') ?? 0) * 100).toFixed(1)}%`}
                    </span>
                    <button
                      type="button"
                      className="ad-toggle-pill"
                      style={{ width: '100%' }}
                      data-on={r.lucky || undefined}
                      aria-label={`${r.name} 럭키`}
                      onClick={() => r.cardId && void patchCard(r.cardId, { lucky: !r.lucky })}
                      data-lucky
                    >
                      {r.lucky ? t('✓ 럭키') : t('럭키')}
                    </button>
                    <input
                      className="ad-input ad-input--sm ad-input--center"
                      inputMode="numeric"
                      placeholder={t('무제한')}
                      value={stock[r.cardId ?? ''] ?? ''}
                      aria-label={`${r.name} 재고`}
                      onChange={(e) =>
                        setStock({ ...stock, [r.cardId ?? '']: e.target.value.replace(/[^0-9]/g, '') })
                      }
                      onBlur={() => r.cardId && void saveStock(r.cardId)}
                    />
                    <span className="ad-cell--num tnum">{r.drawn}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="ad-rules">
            <div className="ad-rules__title">{t('이 목록에 걸리는 규칙')}</div>
            <div className="ad-bullets">
              <div className="ad-bullet">{t('재고를 비우면 무제한이에요.')}</div>
              <div className="ad-bullet">{t('0이면 그 카드는 더 나오지 않아요.')}</div>
              <div className="ad-bullet">{t('레어도 숫자가')}<b>{t('클수록 덜')}</b>{t('나와요 — 전설(5)이 가장 귀해요.')}</div>
              <div className="ad-bullet">{t('재고는 나올지 말지만 정하고 확률은 건드리지 않아요.')}</div>
              <div className="ad-bullet">
                확률은 <b>{t('한 번 뽑을 때')}</b> 기준이에요. 여러 장 뽑기의 묶음 상한과 뽑는 도중
                재고가 떨어지는 건 안 셈에 넣었어요.
              </div>
              <div className="ad-bullet">
                럭키는 스태프 화면 라인업에 별이 붙는 표시일 뿐, 확률이 아니에요.
              </div>
            </div>
          </div>
        </div>

        <div className="ad-card ad-card--form">
          <div className="ad-card__title">{t('운영 방식')}</div>
          <p className="ad-card__desc">
            바꾸면 방문자 화면이 통째로 달라져요. 행사 중에는 바꾸지 마세요.
          </p>
          <div className="ad-choices" style={{ marginTop: 12 }}>
            {(
              [
                ['save', '저장용'],
                ['gift', '1장 증정'],
                ['sale', '판매'],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                className="ad-choice"
                data-on={settings.mode === mode || undefined}
                disabled={busy}
                onClick={async () => {
                  if (settings.mode === mode) return
                  const ok = await confirmAction({
                    title: t('운영 방식을 바꿀까요?'),
                    desc: `“${label}” 으로 바꾸면 방문자 화면이 통째로 달라져요. 행사 중에는 바꾸지 마세요.`,
                    okLabel: t('바꾸기'),
                    danger: true,
                  })
                  if (!ok) return
                  void save({ ...settings, mode })
                }}
                data-mode
              >
                {label}
              </button>
            ))}
          </div>
          <p className="ad-field__hint">
            {rules.physical
              ? t('실물이 걸려 있어서 뽑기는 항상 스태프 기기에서 일어나요.')
              : t('실물 없이 이미지만 가져가는 방식이에요.')}
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, marginTop: 22 }}>
            {rules.visitorDraws && (
              <div>
                <span className="ad-field__label">{t('한 사람이 뽑는 횟수')}</span>
                <div className="ad-inline">
                  <input
                    className="ad-input ad-input--num"
                    inputMode="numeric"
                    value={settings.drawsPerVisitor}
                    disabled={busy}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        drawsPerVisitor: Math.max(1, Number(e.target.value.replace(/[^0-9]/g, '')) || 1),
                      })
                    }
                    onBlur={() => void save(settings)}
                  />
                  <span className="ad-unit">{t('회')}</span>
                </div>
                <p className="ad-field__hint">
                  기기 기준이에요 — 브라우저 기록을 지우면 다시 뽑을 수 있어요.
                </p>
              </div>
            )}
            {rules.batch && (
              <div>
                <span className="ad-field__label">{t('한 번에 최대')}</span>
                <div className="ad-inline">
                  <input
                    className="ad-input ad-input--num"
                    inputMode="numeric"
                    value={settings.batchCount}
                    disabled={busy}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        batchCount: Math.max(1, Number(e.target.value.replace(/[^0-9]/g, '')) || 1),
                      })
                    }
                    onBlur={() => void save(settings)}
                  />
                  <span className="ad-unit">{t('장')}</span>
                </div>
                <p className="ad-field__hint">{t('N연차의 상한이에요 (최대 50장).')}</p>
              </div>
            )}
          </div>

          {rules.usesTicket && (
            <button
              type="button"
              className="ad-checkbare"
              style={{ marginTop: 22 }}
              disabled={busy}
              onClick={() => void save({ ...settings, allowSave: !settings.allowSave })}
            >
              <span className="ad-check__box" data-on={settings.allowSave || undefined}>
                {settings.allowSave ? '✓' : ''}
              </span>
              <span className="ad-checkbare__label">{t('방문자가 이미지를 저장할 수 있게 하기')}</span>
            </button>
          )}
        </div>

        <div className="ad-card">
          <div className="ad-card__title" style={{ marginBottom: 0 }}>
            운영
          </div>
          <div>
            <div className="ad-switchrow">
              <div className="ad-switchrow__text">
                <div className="ad-switchrow__name">{t('연습 모드')}</div>
                <div className="ad-switchrow__hint">
                  켜져 있으면 뽑아도 재고가 줄지 않아요. 행사 전에 꺼 주세요.
                </div>
              </div>
              <button
                type="button"
                className="ad-switch"
                data-on={settings.rehearsal || undefined}
                aria-label={t('연습 모드')}
                disabled={busy}
                onClick={() => void save({ ...settings, rehearsal: !settings.rehearsal })}
                data-rehearsal
              />
            </div>
            <div className="ad-switchrow">
              <div className="ad-switchrow__text">
                <div className="ad-switchrow__name">{t('마감')}</div>
                <div className="ad-switchrow__hint">{t('켜면 방문자가 더 뽑을 수 없어요.')}</div>
              </div>
              <button
                type="button"
                className="ad-switch"
                data-on={settings.closed || undefined}
                aria-label={t('마감')}
                disabled={busy}
                onClick={() => void save({ ...settings, closed: !settings.closed })}
              />
            </div>
            {rules.batch && (
              <div className="ad-switchrow">
                <div className="ad-switchrow__text">
                  <div className="ad-switchrow__name">{t('묶음 상한')}</div>
                  <div className="ad-switchrow__hint">
                    켜면 한 묶음에 같은 카드가 몰리는 걸 막아요 — “10연차에 스페셜 5장” 같은 사고를
                    막아요.
                  </div>
                </div>
                <button
                  type="button"
                  className="ad-switch"
                  data-on={settings.batchCapEnabled || undefined}
                  aria-label={t('묶음 상한')}
                  disabled={busy}
                  onClick={() => void save({ ...settings, batchCapEnabled: !settings.batchCapEnabled })}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
