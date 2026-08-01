import { useCallback, useEffect, useState } from 'react'

import { repo } from '@/lib/repo'
import type { Poll } from '@/lib/repo/types'
import { useSlot } from '@/slot/SlotProvider'
import { confirmAction, toast } from '../AdminFeedback'
import { BulkPaste, splitCells, toLines, type BulkResult } from '../BulkPaste'
import { useT, useLocale } from '@/i18n'

/**
 * 붙여넣기 → 선택지들.
 *
 * 선택지는 **이름 하나가 전부**라 줄마다 하나면 되는데, 주최자가 한 줄에 쉼표로 죽 적어 오는
 * 경우가 잦다("청량, 청순, 걸크러시"). 그래서 줄 안도 한 번 더 나눈다 — 나눠 놓고 아니면
 * 되돌리는 게, 안 나눠서 선택지 하나에 셋이 들어가는 것보다 낫다(그건 화면에서 바로 보인다).
 *
 * 못 읽는 줄이랄 게 없다 — 빈 줄만 빠진다.
 */
function parseOptions(text: string): BulkResult<string> {
  const items = toLines(text)
    .flatMap((line) => splitCells(line))
    .map((s) => s.trim())
    .filter(Boolean)
  return { items, skipped: [] }
}

/**
 * 설문 관리 — **주최자의 운영 데이터다** (럭드 상품표와 같은 자리).
 * 색·문구 같은 겉모습은 최고관리자가 슬롯 편집기에서 정한다.
 *
 * **저장을 눌러야 반영된다** (질문 편집의 즉시 저장과 반대). 선택지를 여러 줄 고치는 동안
 * 매 글자마다 저장하면 방문자 화면이 그 중간 상태를 본다 — 투표는 진행 중에 고치는 일이 잦다.
 * 지우기도 저장 전까지는 초안이라, 잘못 눌러도 되돌리기로 살아난다.
 */
export function Polls() {
  const t = useT()
  const loc = useLocale()
  const slot = useSlot()
  const slug = slot.slug
  const [saved, setSaved] = useState<Poll[] | null>(null)
  const [drafts, setDrafts] = useState<Poll[]>([])
  const [removed, setRemoved] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const all = await repo.poll.listAll(slug)
    setSaved(all)
    setDrafts(all)
    setRemoved([])
  }, [slug])

  useEffect(() => {
    void load()
  }, [load])

  const dirty =
    removed.length > 0 || (saved !== null && JSON.stringify(saved) !== JSON.stringify(drafts))

  /** 저장 없이 나가려 하면 붙잡는다 */
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  if (!repo.poll.ready()) {
    return (
      <>
        <header className="ad-head">
          <div className="ad-head__row">
            <h1 className="ad-head__title">{t('설문')}</h1>
          </div>
        </header>
        <div className="ad-card">
          <div className="ad-empty">
            <div className="ad-empty__title">{t('지금 빌드에서는 투표를 쓸 수 없어요')}</div>
            <div className="ad-empty__sub">{t('서버가 붙어야 집계가 정확해요. 담당자에게 문의해 주세요.')}</div>
          </div>
        </div>
      </>
    )
  }

  if (!saved) return null

  const patch = (id: string, next: Partial<Poll>) =>
    setDrafts((prev) => prev.map((p) => (p.id === id ? { ...p, ...next } : p)))

  function addPoll() {
    setDrafts((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        title: '',
        kind: 'single',
        maxPick: 1,
        closed: false,
        // **처음엔 숨김이다.** 만들자마자 방문자에게 빈 설문이 보이면 안 된다
        hidden: true,
        order: prev.length + 1,
        options: [],
      },
    ])
    toast(t('새 설문은 준비 중으로 시작해요'))
  }

  async function removePoll(p: Poll) {
    const total = p.options.reduce((n, o) => n + o.votes, 0)
    const ok = await confirmAction({
      title: t('이 설문을 지울까요?'),
      desc:
        total > 0
          ? t('받은 {n}표도 함께 사라져요.', { n: total.toLocaleString(loc) })
          : t('아직 받은 표가 없어요.'),
      okLabel: t('지우기'),
      danger: true,
    })
    if (!ok) return
    setDrafts((prev) => prev.filter((x) => x.id !== p.id))
    // 저장된 적이 있는 설문만 지울 목록에 올린다 (초안만 만든 건 그냥 사라지면 된다)
    if (saved?.some((x) => x.id === p.id)) setRemoved((prev) => [...prev, p.id])
  }

  async function save() {
    if (!dirty || busy) return
    setBusy(true)
    try {
      for (const id of removed) await repo.poll.removePoll(slug, id)
      for (const d of drafts) {
        const before = saved?.find((x) => x.id === d.id)
        if (before && JSON.stringify(before) === JSON.stringify(d)) continue
        await repo.poll.savePoll(slug, { ...d, options: d.options.map((o, i) => ({ ...o, order: i + 1 })) })
      }
      await load()
      toast(t('저장했어요'))
    } catch (e) {
      toast(e instanceof Error ? e.message : t('저장하지 못했어요'))
    } finally {
      setBusy(false)
    }
  }

  async function revert() {
    if (!dirty) return
    const ok = await confirmAction({
      title: t('바꾼 내용을 버릴까요?'),
      desc: t('저장하지 않은 변경이 모두 사라져요.'),
      okLabel: t('버리기'),
      danger: true,
    })
    if (!ok) return
    await load()
    toast(t('되돌렸어요'))
  }

  return (
    <>
      <header className="ad-head">
        <div className="ad-head__row">
          <h1 className="ad-head__title">{t('설문')}</h1>
          <span className="ad-head__count tnum">설문 {drafts.length}개</span>
        </div>
        <p className="ad-head__desc">
          공개하면 방문자 화면에 바로 나오고 표는 실시간으로 쌓이에요.
        </p>
      </header>

      <div className="ad-stack">
        <div className="ad-banner ad-banner--info">
          공개하면 방문자 화면에 바로 나오고 표는 실시간으로 쌓여요. 여러 줄을 고치는 동안 방문자가 중간
          상태를 보지 않도록, 이 화면은 저장을 눌러야 반영돼요.
        </div>

        <div className="ad-card__head" style={{ marginBottom: 0 }}>
          <span className="ad-card__title">설문 {drafts.length}개</span>
          <button type="button" className="ad-btn ad-btn--soft ad-btn--sm" onClick={addPoll} data-add-poll>
            + 설문 추가
          </button>
        </div>

        {drafts.length === 0 ? (
          <div className="ad-card" style={{ borderStyle: 'dashed' }}>
            <div className="ad-empty" style={{ border: 'none', padding: '24px 20px' }}>
              <div className="ad-empty__title">{t('아직 설문이 없어요')}</div>
              <div className="ad-empty__sub">
                새 설문은 준비 중으로 시작해요. 선택지를 채운 뒤 공개해 주세요.
              </div>
            </div>
          </div>
        ) : (
          <div className="ad-stack" data-poll-admin>
            {drafts.map((p) => {
              const total = p.options.reduce((n, o) => n + o.votes, 0)
              return (
                <div key={p.id} className="ad-card">
                  <div className="ad-inline">
                    <input
                      className="ad-input ad-input--grow"
                      style={{ height: 44, fontWeight: 700 }}
                      value={p.title}
                      placeholder={t('설문 제목')}
                      aria-label={t('설문 제목')}
                      onChange={(e) => patch(p.id, { title: e.target.value })}
                    />
                    <button
                      type="button"
                      className="ad-toggle-pill"
                      data-on={!p.hidden || undefined}
                      onClick={() => patch(p.id, { hidden: !p.hidden })}
                    >
                      {p.hidden ? t('준비 중') : t('공개')}
                    </button>
                    <button
                      type="button"
                      className="ad-toggle-pill"
                      data-on={!p.closed || undefined}
                      onClick={() => patch(p.id, { closed: !p.closed })}
                    >
                      {p.closed ? t('마감됨') : t('진행 중')}
                    </button>
                    <button
                      type="button"
                      className="ad-x"
                      aria-label={t('설문 지우기')}
                      onClick={() => void removePoll(p)}
                    >
                      ×
                    </button>
                  </div>

                  <div className="ad-inline" style={{ marginTop: 16 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ad-ink-2)' }}>
                      고르는 방식
                    </span>
                    <div className="ad-seg">
                      {(
                        [
                          ['single', '하나만'],
                          ['multi', '여러 개'],
                        ] as const
                      ).map(([kind, label]) => (
                        <button
                          key={kind}
                          type="button"
                          className="ad-seg__btn"
                          data-on={p.kind === kind || undefined}
                          onClick={() =>
                            patch(p.id, {
                              kind,
                              maxPick: kind === 'single' ? 1 : Math.max(2, p.maxPick),
                            })
                          }
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {p.kind === 'multi' && (
                      <div className="ad-inline">
                        <span className="ad-unit">{t('최대')}</span>
                        <input
                          className="ad-input ad-input--sm ad-input--center"
                          style={{ width: 70 }}
                          inputMode="numeric"
                          value={p.maxPick}
                          aria-label={t('최대 개수')}
                          onChange={(e) =>
                            patch(p.id, {
                              maxPick: Math.max(2, Number(e.target.value.replace(/[^0-9]/g, '')) || 2),
                            })
                          }
                        />
                        <span className="ad-unit">{t('개')}</span>
                      </div>
                    )}
                  </div>

                  <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {p.options.map((o, i) => (
                      <div key={o.id} className="ad-inline" style={{ flexWrap: 'nowrap' }}>
                        <input
                          className="ad-input ad-input--sm"
                          value={o.label}
                          placeholder={t('선택지 문구')}
                          aria-label={`선택지 ${i + 1}`}
                          onChange={(e) =>
                            patch(p.id, {
                              options: p.options.map((x) =>
                                x.id === o.id ? { ...x, label: e.target.value } : x
                              ),
                            })
                          }
                        />
                        <span
                          className="tnum"
                          style={{
                            flexShrink: 0,
                            width: 84,
                            textAlign: 'right',
                            fontSize: 13,
                            fontWeight: 700,
                            color: 'var(--ad-ink-3)',
                          }}
                        >
                          {t('{n}표', { n: o.votes.toLocaleString(loc) })}
                        </span>
                        <button
                          type="button"
                          className="ad-x"
                          aria-label={`선택지 ${i + 1} 지우기`}
                          onClick={() =>
                            patch(p.id, { options: p.options.filter((x) => x.id !== o.id) })
                          }
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      flexWrap: 'wrap',
                      marginTop: 14,
                    }}
                  >
                    <div className="ad-btnrow">
                      {/* 후보 12명을 열두 번 만들지 않는다 — 명단을 그대로 붙여 넣는다 */}
                      <BulkPaste
                        label={t('선택지')}
                        placeholder={'청량\n청순\n걸크러시'}
                        hint={
                          <>
                            한 줄에 하나씩 적어 주세요. 한 줄 안에 쉼표·세로줄로 여러 개를 적어도
                            나눠서 들어가요.
                          </>
                        }
                        parse={parseOptions}
                        preview={(label) => label}
                        onApply={(labels) =>
                          patch(p.id, {
                            options: [
                              ...p.options,
                              ...labels.map((label, i) => ({
                                id: crypto.randomUUID(),
                                order: p.options.length + i + 1,
                                label,
                                votes: 0,
                              })),
                            ],
                          })
                        }
                      />
                      <button
                        type="button"
                        className="ad-btn ad-btn--line ad-btn--sm"
                        onClick={() =>
                          patch(p.id, {
                            options: [
                              ...p.options,
                              { id: crypto.randomUUID(), order: p.options.length + 1, label: '', votes: 0 },
                            ],
                          })
                        }
                      >
                        + 선택지 추가
                      </button>
                    </div>
                    <span className="ad-card__num tnum">
                      {t('지금까지 {n}표', { n: total.toLocaleString(loc) })}
                    </span>
                  </div>

                  {/**
                   * 표가 있는 선택지를 지우면 그 표도 사라진다 — 되돌릴 수 없어서 미리 말해준다.
                   * (어댑터가 선택지를 지울 때 `poll_votes` 가 cascade 로 같이 지워진다.)
                   */}
                  {saved
                    .find((x) => x.id === p.id)
                    ?.options.some((o) => o.votes > 0 && !p.options.some((y) => y.id === o.id)) && (
                    <div className="ad-field__hint ad-field__hint--bad">
                      표가 있는 선택지를 지우면 그 표도 함께 사라져요.
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {dirty && (
        <div className="ad-savebar" data-dirty>
          <span className="ad-savebar__note">{t('아직 저장하지 않은 변경이 있어요')}</span>
          <div className="ad-btnrow">
            <button
              type="button"
              className="ad-btn ad-btn--line ad-btn--xl"
              disabled={busy}
              onClick={() => void revert()}
            >
              {t('되돌리기')}
            </button>
            <button
              type="button"
              className="ad-btn ad-btn--primary ad-btn--xl"
              disabled={busy}
              onClick={() => void save()}
            >
              {busy ? t('저장하는 중…') : t('저장하기')}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
