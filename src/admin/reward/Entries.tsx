import { useCallback, useEffect, useState } from 'react'
import { Download, ShieldAlert, Users } from 'lucide-react'

import { repo } from '@/lib/repo'
import type { IssuedReward, RewardEntry } from '@/lib/repo/types'
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
  const [issued, setIssued] = useState<IssuedReward[]>([])

  const load = useCallback(async () => {
    const [entries, all] = await Promise.all([
      repo.rewards.entries(slug, source),
      repo.rewards.issued(slug, source).catch(() => []),
    ])
    setList(entries)
    setIssued(all)
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

  // 응모 자격을 얻은 사람 = raffle 코드를 받은 사람. 그중 폼을 낸 사람이 `list` 다
  const raffle = issued.filter((r) => r.kind === 'raffle')

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
          <p className="t-text-xs t-muted">
            응모 완료 {list.length}명 · 자격을 얻은 분 {raffle.length}명
          </p>
        </div>
        {list.length > 0 && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={download}>
            <Download size={15} aria-hidden="true" />
            CSV 내려받기
          </button>
        )}
      </header>

      {raffle.length > 0 && (
        <div className={styles.kpis}>
          <div className={styles.kpi}>
            <div className={styles.kpiLabel}>자격을 얻은 분</div>
            <div className={styles.kpiValue}>{raffle.length}명</div>
          </div>
          <div className={styles.kpi}>
            <div className={styles.kpiLabel}>응모 완료</div>
            <div className={styles.kpiValue}>{list.length}명</div>
          </div>
          <div className={styles.kpi}>
            <div className={styles.kpiLabel}>아직 안 냄</div>
            <div className={styles.kpiValue}>{Math.max(0, raffle.length - list.length)}명</div>
          </div>
        </div>
      )}

      {raffle.length > list.length && (
        <p className="t-text-xs t-muted" style={{ margin: '0 0 14px' }}>
          <b>자격은 얻었는데 아직 응모 폼을 안 내신 분</b>이 {raffle.length - list.length}명 있어요 —
          그분들은 연락할 방법이 없어서 <b>추첨 후보에도 안 들어갑니다.</b>
        </p>
      )}

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
          {/**
            * **왜 비었는지를 말해준다.** 응모를 안 받는 이벤트인지, 받는데 아직 아무도 안 낸
            * 건지는 전혀 다른 상황이고, 목록을 늘 띄우기로 한 이상 그 구분은 화면이 해야 한다.
            */}
          <div className="admin-empty__title">
            {raffle.length === 0 ? '지금은 응모를 받지 않아요' : '아직 응모한 사람이 없어요'}
          </div>
          <div className="t-text-s t-muted">
            {raffle.length === 0
              ? "보상 방식을 '응모' 로 바꾸시면 손님이 응모하고 여기 명단이 쌓여요. 지난 응모 기록이 있으면 방식과 상관없이 여기 그대로 남습니다."
              : '자격을 얻은 분이 응모 폼을 내면 여기 한 줄씩 쌓여요.'}
          </div>
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
