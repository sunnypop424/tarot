import { useCallback, useEffect, useState } from 'react'
import { Copy, Download, Dices, Undo2 } from 'lucide-react'

import { repo } from '@/lib/repo'
import type { RewardEntry } from '@/lib/repo/types'
import { getSlotService } from '@/data/services'
import { useSlot } from '@/slot/SlotProvider'
import { confirmAction, toast } from '../AdminFeedback'

/** CSV 한 칸 — 쉼표·따옴표·줄바꿈이 들어가면 깨지므로 감싸고 따옴표는 두 번 쓴다 */
const cell = (v: string) => `"${String(v ?? '').replaceAll('"', '""')}"`

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

  if (!repo.rewards.ready()) {
    return (
      <div className="admin-empty">
        <Dices size={44} strokeWidth={1.6} aria-hidden="true" />
        <div className="admin-empty__title">지금 빌드에서는 추첨을 쓸 수 없어요</div>
      </div>
    )
  }
  if (!list) return null

  const pool = list.filter((e) => !e.won)
  const winners = list.filter((e) => e.won)
  const hasScore = list.some((e) => e.score !== null)
  const rounds = [...new Set(winners.map((w) => w.pickedRound).filter((r): r is number => r !== null))].sort(
    (a, b) => b - a
  )

  const copyText = (rows: RewardEntry[]) =>
    rows.map((r) => (r.handle ? `${r.nickname} (@${r.handle.replace(/^@/, '')})` : r.nickname)).join('\n')

  async function draw() {
    if (busy || pool.length === 0) return
    const n = Math.min(count, pool.length)
    if (
      !(await confirmAction({
        title: `${n}명을 뽑을까요?`,
        desc: '뽑힌 사람은 다음 추첨 후보에서 빠져요. 잘못 뽑으면 되돌리기로 그 회차만 취소할 수 있어요.',
        okLabel: '추첨',
      }))
    )
      return
    setBusy(true)
    try {
      const result = await repo.rewards.pick(slug, source, n, method)
      setPicked(result)
      await load()
      toast(`${result.length}명을 뽑았어요`)
    } catch (e) {
      toast(e instanceof Error ? e.message : '추첨하지 못했어요')
    } finally {
      setBusy(false)
    }
  }

  async function undo(round: number) {
    if (
      !(await confirmAction({
        title: `${round}회차를 되돌릴까요?`,
        desc: '그 회차에 뽑힌 사람이 다시 후보로 돌아가요.',
        okLabel: '되돌리기',
        danger: true,
      }))
    )
      return
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

  function downloadCsv(rows: RewardEntry[], name: string) {
    if (!rows.length) return
    const header = ['닉네임', '트위터', '연락처', '주소', '점수', '교환코드', '응모시각']
    const lines = rows.map((r) =>
      [
        cell(r.nickname),
        cell(r.handle ?? ''),
        cell(r.contact ?? ''),
        cell(r.address ?? ''),
        cell(r.score === null ? '' : String(r.score)),
        cell(r.code),
        cell(new Date(r.createdAt).toLocaleString('ko-KR')),
      ].join(',')
    )
    // ﻿ = BOM. 엑셀은 이게 없으면 UTF-8 을 못 알아본다
    const blob = new Blob(['﻿' + [header.map(cell).join(','), ...lines].join('\r\n')], {
      type: 'text/csv;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${slug}-${name}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <header className="admin__head">
        <div>
          <h1 className="t-title-l">추첨</h1>
          <p className="t-text-xs t-muted">
            응모자 {list.length}명 · 남은 후보 {pool.length}명 · 당첨 {winners.length}명
          </p>
        </div>
      </header>

      <section className="admin-section admin-section--do admin-section--narrow" data-picker>
        <h2 className="admin-section__title">
          <Dices size={15} strokeWidth={2} aria-hidden="true" />
          응모자 중에서 뽑기
        </h2>
        <div className="admin-inline-form">
          <label className="field field--xs">
            <span className="field__label">인원</span>
            <input
              className="input"
              type="number"
              min={1}
              max={Math.max(1, pool.length)}
              value={count}
              onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))}
              data-pick-count
            />
          </label>
          {hasScore && (
            <label className="field field--sm">
              <span className="field__label">방식</span>
              <select
                className="select"
                value={method}
                onChange={(e) => setMethod(e.target.value as 'random' | 'score')}
              >
                <option value="random">랜덤</option>
                <option value="score">점수순</option>
              </select>
            </label>
          )}
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy || pool.length === 0}
            onClick={() => void draw()}
            data-pick-go
          >
            <Dices size={15} aria-hidden="true" />
            추첨하기
          </button>
        </div>
        {method === 'score' && (
          <p className="admin-note" style={{ margin: '12px 0 0' }}>
            점수가 높은 순으로 뽑고, <b>커트라인 동점자 안에서만 무작위</b>로 갈려요 — 정원은 정확히 맞습니다.
          </p>
        )}
        {pool.length === 0 && (
          <p className="admin-note" style={{ margin: '12px 0 0' }}>
            뽑을 후보가 없어요. 응모를 낸 사람만 후보가 됩니다.
          </p>
        )}
      </section>

      {picked && picked.length > 0 && (
        <section className="admin-section" data-picked>
          <h2 className="admin-section__title">
            이번 회차 당첨 {picked.length}명
            <span className="admin-section__actions">
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={async () => {
                  await navigator.clipboard.writeText(copyText(picked))
                  toast('트위터에 붙여넣으세요')
                }}
              >
                <Copy size={14} aria-hidden="true" />
                트위터용 복사
              </button>
              <button type="button" className="btn btn--outline btn--sm" onClick={() => downloadCsv(picked, '당첨자')}>
                <Download size={14} aria-hidden="true" />
                CSV
              </button>
            </span>
          </h2>
          <ol className="admin-oList">
            {picked.map((w) => (
              <li key={w.rewardId} className="t-text-m">
                {w.nickname}
                {w.handle && <span className="t-muted"> @{w.handle.replace(/^@/, '')}</span>}
                {w.score !== null && <span className="t-muted"> · {w.score}점</span>}
              </li>
            ))}
          </ol>
        </section>
      )}

      {rounds.length > 0 && (
        <section className="admin-section">
          <h2 className="admin-section__title">지난 회차</h2>
          <div className="row-list">
            {rounds.map((r) => {
              const rows = winners.filter((w) => w.pickedRound === r)
              return (
                <div key={r} className="row-item">
                  <span className="row-item__grow t-text-m">
                    {r}회차 · {rows.length}명
                    <span className="t-muted t-text-xs"> — {rows.map((x) => x.nickname).join(', ')}</span>
                  </span>
                  <div className="row-actions">
                    <button
                      type="button"
                      className="btn btn--quiet btn--sm"
                      onClick={async () => {
                        await navigator.clipboard.writeText(copyText(rows))
                        toast('복사했어요')
                      }}
                    >
                      <Copy size={13} aria-hidden="true" />
                      복사
                    </button>
                    <button type="button" className="btn btn--quiet btn--sm" disabled={busy} onClick={() => void undo(r)}>
                      <Undo2 size={13} aria-hidden="true" />
                      되돌리기
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
