import { useCallback, useEffect, useState } from 'react'

import { repo } from '@/lib/repo'
import type { RewardEntry } from '@/lib/repo/types'
import { getSlotService } from '@/data/services'
import { useSlot } from '@/slot/SlotProvider'
import { confirmAction, toast } from '../AdminFeedback'
import { downloadCsv, when } from '../csv'
import { useT } from '@/i18n'


/**
 * 응모 추첨 — **세 서비스가 같은 화면을 쓴다** (`source` 만 다르다).
 *
 * **발표는 트위터에서 한다.** 방문자에게 당첨을 알리는 화면이 없다 — 그래서 이 화면의
 * 결과가 곧 발표 명단이고, 가장 많이 눌리는 버튼은 추첨이 아니라 **"트위터용 복사"** 다.
 * 손으로 옮겨지는 작업이라 그 한 번을 편하게 만드는 게 이 화면의 실제 값어치다.
 *
 * 점수순은 `score` 가 채워지는 서비스(모의고사)에서만 뜻이 있다 — 후보에 점수가 하나도
 * 없으면 선택지를 숨긴다.
 */
export function Picker() {
  const t = useT()
  const slot = useSlot()
  const slug = slot.slug
  const source = getSlotService(slot)

  const [list, setList] = useState<RewardEntry[] | null>(null)
  const [count, setCount] = useState(1)
  const [method, setMethod] = useState<'random' | 'score'>('random')
  const [busy, setBusy] = useState(false)
  const [picked, setPicked] = useState<RewardEntry[] | null>(null)

  const load = useCallback(async () => {
    setList(await repo.rewards.entries(slug, source))
  }, [slug, source])

  useEffect(() => {
    void load()
  }, [load])

  const head = (
    <header className="ad-head">
      <div className="ad-head__row">
        <h1 className="ad-head__title">{t('추첨')}</h1>
        {list && (
          <span className="ad-head__count tnum">
            응모자 {list.length}명 · 남은 후보 {list.filter((e) => !e.won).length}명
          </span>
        )}
      </div>
      <p className="ad-head__desc">{t('응모자 중에서 당첨자를 뽑고, 회차별로 관리해요.')}</p>
    </header>
  )

  if (!repo.rewards.ready()) {
    return (
      <>
        {head}
        <div className="ad-card">
          <div className="ad-empty">
            <div className="ad-empty__title">{t('지금 빌드에서는 추첨을 쓸 수 없어요')}</div>
          </div>
        </div>
      </>
    )
  }
  if (!list) return null

  const pool = list.filter((e) => !e.won)
  const winners = list.filter((e) => e.won)
  const hasScore = list.some((e) => e.score !== null)
  const rounds = [...new Set(winners.map((w) => w.pickedRound).filter((r): r is number => r !== null))].sort(
    (a, b) => b - a
  )
  const canDraw = pool.length > 0
  const picking = Math.min(Math.max(1, count), Math.max(1, pool.length))

  const copyText = (rows: RewardEntry[]) =>
    rows.map((r) => (r.handle ? `${r.nickname} (@${r.handle.replace(/^@/, '')})` : r.nickname)).join('\n')

  async function draw() {
    if (busy || !canDraw) return
    const ok = await confirmAction({
      title: `지금 ${picking}명을 뽑을까요?`,
      desc: `남은 후보 ${pool.length}명 중에서 ${picking}명을 뽑아요. 뽑힌 사람은 후보에서 빠지고, 회차 단위로만 되돌릴 수 있어요.`,
      okLabel: `${picking}명 뽑기`,
    })
    if (!ok) return
    setBusy(true)
    try {
      const result = await repo.rewards.pick(slug, source, picking, method)
      setPicked(result)
      await load()
      toast(`${result.length}명을 뽑았어요`)
    } catch (e) {
      toast(e instanceof Error ? e.message : t('추첨하지 못했어요'))
    } finally {
      setBusy(false)
    }
  }

  async function undo(round: number, names: string[]) {
    const ok = await confirmAction({
      title: `${round}회차를 되돌릴까요?`,
      desc: `이 회차에서 뽑힌 ${names.length}명이 다시 후보로 돌아가요. 이미 안내를 보냈다면 혼선이 생길 수 있어요.`,
      okLabel: t('되돌리기'),
      danger: true,
    })
    if (!ok) return
    setBusy(true)
    try {
      const n = await repo.rewards.unpick(slug, source, round)
      setPicked(null)
      await load()
      toast(`${n}명을 되돌렸어요`)
    } finally {
      setBusy(false)
    }
  }

  function exportRows(rows: RewardEntry[], name: string) {
    if (!rows.length) return
    const header = ['닉네임', '트위터', '연락처', '주소', '점수', '교환코드', '응모시각']
    downloadCsv(
      `${slug}-${name}.csv`,
      header,
      rows.map((r) => [
        r.nickname,
        r.handle ?? '',
        r.contact ?? '',
        r.address ?? '',
        r.score === null ? '' : String(r.score),
        r.code,
        when(r.createdAt),
      ])
    )
  }

  async function copy(rows: RewardEntry[], msg: string) {
    try {
      await navigator.clipboard.writeText(copyText(rows))
      toast(msg)
    } catch {
      toast(t('복사하지 못했어요'))
    }
  }

  return (
    <>
      {head}

      <div className="ad-stack">
        <div className="ad-stats">
          {[
            { label: t('응모자'), value: list.length },
            { label: t('남은 후보'), value: pool.length },
            { label: t('당첨자'), value: winners.length },
          ].map((k) => (
            <div key={k.label} className="ad-stat">
              <div className="ad-stat__label">{k.label}</div>
              <div className="ad-stat__row">
                <span className="ad-stat__value tnum">{k.value}</span>
                <span className="ad-stat__unit">{t('명')}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="ad-card ad-card--form" data-picker>
          <div className="ad-card__title ad-card__title--lg">{t('추첨하기')}</div>
          <p className="ad-card__desc">
            뽑은 결과는 되돌릴 수 있지만, 회차 단위로만 되돌려요. 후보가 남아 있지 않으면 추첨할 수
            없어요.
          </p>

          <div className="ad-drawform">
            <div>
              <span className="ad-field__label">{t('뽑을 인원')}</span>
              <div className="ad-inline" style={{ flexWrap: 'nowrap' }}>
                <button
                  type="button"
                  className="ad-step"
                  aria-label={t('한 명 줄이기')}
                  onClick={() => setCount((c) => Math.max(1, c - 1))}
                >
                  −
                </button>
                <input
                  className="ad-input ad-input--center"
                  style={{ height: 48, fontSize: 20, fontWeight: 700, flex: 1, minWidth: 60 }}
                  inputMode="numeric"
                  value={count}
                  aria-label={t('뽑을 인원')}
                  onChange={(e) => setCount(Math.max(1, Number(e.target.value.replace(/[^0-9]/g, '')) || 1))}
                  data-pick-count
                />
                <button
                  type="button"
                  className="ad-step"
                  aria-label={t('한 명 늘리기')}
                  onClick={() => setCount((c) => Math.min(50, c + 1))}
                >
                  +
                </button>
              </div>
            </div>
            {hasScore && (
              <div>
                <span className="ad-field__label">{t('방식')}</span>
                <div className="ad-seg">
                  {(
                    [
                      ['random', '무작위'],
                      ['score', '점수순'],
                    ] as const
                  ).map(([m, label]) => (
                    <button
                      key={m}
                      type="button"
                      className="ad-seg__btn"
                      data-on={method === m || undefined}
                      onClick={() => setMethod(m)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="ad-field__hint">
                  {method === 'random'
                    ? t('남은 후보 중에서 무작위로 뽑아요.')
                    : t('점수가 높은 순으로 뽑고, 커트라인 동점자 안에서만 무작위로 갈려요 — 정원은 정확히 맞아요.')}
                </p>
              </div>
            )}
          </div>

          <button
            type="button"
            className="ad-btn ad-btn--primary ad-btn--hero ad-btn--block"
            style={{ marginTop: 20 }}
            disabled={busy || !canDraw}
            onClick={() => void draw()}
            data-pick-go
          >
            {canDraw ? `${picking}명 추첨하기` : t('남은 후보가 없어요')}
          </button>
          {!canDraw && (
            <p className="ad-fine" style={{ marginTop: 12 }}>
              뽑을 후보가 없어요. 응모를 낸 사람만 후보가 돼요.
            </p>
          )}
        </div>

        {picked && picked.length > 0 && (
          <div className="ad-card ad-card--key" data-picked>
            <div className="ad-card__head">
              <div className="ad-card__titleRow">
                <span className="ad-card__title">방금 뽑힌 {picked.length}명</span>
                {picked[0]?.pickedRound !== null && (
                  <span className="ad-tag ad-tag--sm" data-tone="on">
                    {picked[0]?.pickedRound}회차
                  </span>
                )}
              </div>
              <div className="ad-btnrow">
                <button
                  type="button"
                  className="ad-btn ad-btn--primary ad-btn--lg"
                  onClick={() => void copy(picked, '트위터에 붙여넣으세요')}
                >
                  트위터용 텍스트 복사
                </button>
                <button
                  type="button"
                  className="ad-btn ad-btn--line ad-btn--lg"
                  onClick={() => exportRows(picked, '당첨자')}
                >
                  CSV
                </button>
              </div>
            </div>
            <div className="ad-chips">
              {picked.map((w) => (
                <span key={w.rewardId} className="ad-chip">
                  {w.nickname}
                  {w.score !== null && (
                    <span style={{ color: 'var(--ad-ink-3)', marginLeft: 5 }}> {w.score}점</span>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="ad-card">
          <div className="ad-card__head">
            <div className="ad-card__titleRow">
              <span className="ad-card__title">{t('지난 회차')}</span>
              <span className="ad-card__num tnum">{rounds.length}회</span>
            </div>
          </div>

          {rounds.length === 0 ? (
            <div className="ad-empty ad-empty--sm">
              <div className="ad-empty__title">{t('아직 추첨한 회차가 없어요')}</div>
              <div className="ad-empty__sub">
                위에서 인원과 방식을 정하고 추첨하면 회차가 여기에 쌓여요.
              </div>
            </div>
          ) : (
            <div className="ad-rows">
              {rounds.map((r) => {
                const rows = winners.filter((w) => w.pickedRound === r)
                return (
                  <div key={r} className="ad-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                        flexWrap: 'wrap',
                      }}
                    >
                      <div className="ad-card__titleRow">
                        <span style={{ fontSize: 14, fontWeight: 700 }}>{r}회차</span>
                        <span className="ad-card__num tnum">{rows.length}명</span>
                      </div>
                      <div className="ad-btnrow">
                        <button
                          type="button"
                          className="ad-btn ad-btn--line ad-btn--xs"
                          onClick={() => void copy(rows, '복사했어요')}
                        >
                          {t('복사')}
                        </button>
                        <button
                          type="button"
                          className="ad-btn ad-btn--line ad-btn--xs"
                          onClick={() => exportRows(rows, `${r}회차`)}
                        >
                          CSV
                        </button>
                        <button
                          type="button"
                          className="ad-btn ad-btn--danger ad-btn--xs"
                          disabled={busy}
                          onClick={() => void undo(r, rows.map((x) => x.nickname))}
                        >
                          이 회차 되돌리기
                        </button>
                      </div>
                    </div>
                    <div className="ad-chips ad-chips--tight" style={{ marginTop: 12 }}>
                      {rows.map((w) => (
                        <span key={w.rewardId} className="ad-chip ad-chip--plain">
                          {w.nickname}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
