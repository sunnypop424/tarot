import { useCallback, useEffect, useState } from 'react'
import { Download, ShieldAlert, Users } from 'lucide-react'

import { repo } from '@/lib/repo'
import type { RewardEntry } from '@/lib/repo/types'
import { getSlotService } from '@/data/services'
import { useSlot } from '@/slot/SlotProvider'
import styles from './Reward.module.css'

/** CSV 한 칸 — 쉼표·따옴표·줄바꿈이 들어가면 깨지므로 감싸고 따옴표는 두 번 쓴다 */
const cell = (v: string) => `"${String(v ?? '').replaceAll('"', '""')}"`

/**
 * 응모자 명단 — **개인정보를 다루는 화면.** 럭드 배송 목록과 같은 급으로 다룬다.
 *
 * `reward_entries` 는 anon select 정책이 아예 없어서 주최자·최고관리자만 여기까지 온다.
 * 주최자가 안 켠 항목은 애초에 받지 않았으므로 빈 칸으로 뜬다.
 */
export function Entries() {
  const slot = useSlot()
  const slug = slot.slug
  const source = getSlotService(slot)
  const [list, setList] = useState<RewardEntry[] | null>(null)

  const load = useCallback(async () => {
    setList(await repo.rewards.entries(slug, source))
  }, [slug, source])

  useEffect(() => {
    void load()
  }, [load])

  if (!repo.rewards.ready()) {
    return (
      <div className="admin-empty">
        <Users size={44} strokeWidth={1.6} aria-hidden="true" />
        <div className="admin-empty__title">지금 빌드에서는 응모자 목록을 쓸 수 없어요</div>
      </div>
    )
  }
  if (!list) return null

  const cols = {
    handle: list.some((e) => e.handle),
    contact: list.some((e) => e.contact),
    address: list.some((e) => e.address),
    score: list.some((e) => e.score !== null),
  }

  function download() {
    if (!list?.length) return
    const header = ['닉네임', '트위터', '연락처', '주소', '점수', '당첨', '응모시각']
    const lines = list.map((r) =>
      [
        cell(r.nickname),
        cell(r.handle ?? ''),
        cell(r.contact ?? ''),
        cell(r.address ?? ''),
        cell(r.score === null ? '' : String(r.score)),
        cell(r.won ? 'O' : ''),
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
    a.download = `${slug}-응모자.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <header className="admin__head">
        <div>
          <h1 className="t-title-l">응모자</h1>
          <p className="t-text-xs t-muted">{list.length}명</p>
        </div>
        {list.length > 0 && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={download}>
            <Download size={15} aria-hidden="true" />
            CSV 내려받기
          </button>
        )}
      </header>

      {(cols.contact || cols.address) && (
        <div className="card" style={{ padding: 14, marginBottom: 14, display: 'flex', gap: 10 }}>
          <ShieldAlert size={20} strokeWidth={2} aria-hidden="true" style={{ flex: 'none' }} />
          <p className="t-text-xs t-muted" style={{ margin: 0 }}>
            연락처·주소가 들어 있어요. <b>선물을 다 보내고 나면 지워 주세요</b> — 이벤트가 끝나고 14일이
            지나면 이 화면이 잠기고, 슬롯을 지우면 함께 삭제됩니다.
          </p>
        </div>
      )}

      {list.length === 0 ? (
        <div className="admin-empty">
          <Users size={44} strokeWidth={1.6} aria-hidden="true" />
          <div className="admin-empty__title">아직 응모한 사람이 없어요</div>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table} data-entries>
            <thead>
              <tr>
                <th>닉네임</th>
                {cols.handle && <th>트위터</th>}
                {cols.contact && <th>연락처</th>}
                {cols.address && <th>주소</th>}
                {cols.score && <th>점수</th>}
                <th>당첨</th>
                <th>응모</th>
              </tr>
            </thead>
            <tbody>
              {list.map((e) => (
                <tr key={e.rewardId}>
                  <td>{e.nickname}</td>
                  {cols.handle && <td>{e.handle ? `@${e.handle.replace(/^@/, '')}` : '—'}</td>}
                  {cols.contact && <td>{e.contact || '—'}</td>}
                  {cols.address && <td className={styles.wrap}>{e.address || '—'}</td>}
                  {cols.score && <td>{e.score === null ? '—' : `${e.score}점`}</td>}
                  <td>{e.won ? `${e.pickedRound}회차` : '—'}</td>
                  <td className="t-text-xs t-muted">
                    {new Date(e.createdAt).toLocaleString('ko-KR', {
                      month: 'numeric',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
