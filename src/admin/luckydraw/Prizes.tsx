import { useCallback, useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'

import { repo } from '@/lib/repo'
import type { LuckydrawSettings, PrizeReport } from '@/lib/repo'
import { useSlot } from '@/slot/SlotProvider'
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
 * 상품 표 — **"남은 수량" 칸에 적은 숫자가 곧 뽑을 수 있는 수량이다.**
 *
 * 옮겨온 원본엔 '전체 수량'과 '남은 수량'이 따로 있었지만, 전체를 고치면 남은 수량이 그 값으로
 * 덮이는 구조라 매일 재입력하는 순간 '전체'가 거짓이 됐다. 칸을 하나로 줄이고 이름을 동작에 맞췄다.
 *
 * 운영은 이렇게 돈다:
 *  1. 행사 전날 — 내일 나갈 수량을 적는다
 *  2. 행사 끝 — 이 표의 '오늘 나감'과 '남음'을 눈으로 확인한다
 *  3. 다음 날 — 남은 수량 + 내일 물량을 **직접 더해서** 적는다
 *
 * 3번의 덧셈을 사람이 하는 건 의도한 것이다. "+내일 수량만 입력" 하는 증분 방식을 검토했다가
 * 현장에서 헷갈린다는 이유로 접었다 (docs/LUCKYDRAW-REVIEW.md §5).
 */
export function Prizes() {
  const slot = useSlot()
  const slug = slot.slug

  const [rows, setRows] = useState<PrizeReport[] | null>(null)
  const [settings, setSettings] = useState<LuckydrawSettings | null>(null)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [report, s] = await Promise.all([
      repo.luckydraw.report(slug),
      repo.luckydraw.getSettings(slug),
    ])
    setRows(report)
    setSettings(s)
    setDirty(false)
  }, [slug])

  useEffect(() => {
    void load()
  }, [load])

  /**
   * 저장하지 않고 나가려 하면 붙잡는다 — 표를 한참 고쳐놓고 날리는 게 이 화면 최악의 사고다.
   * (설정 토글은 즉시 저장이라 이 경고와 무관하다.)
   */
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  function patch(index: number, next: Partial<PrizeReport>) {
    setRows((prev) => prev && prev.map((r, i) => (i === index ? { ...r, ...next } : r)))
    setDirty(true)
  }

  function add() {
    setRows((prev) => prev && [...prev, blankPrize(prev.length + 1)])
    setDirty(true)
  }

  function remove(index: number) {
    const target = rows?.[index]
    if (!target) return
    if (!confirm(`${target.rank}등 ${target.name || '(이름 없음)'} 을 지울까요?`)) return
    // 등수는 행 순서다 — 지운 뒤 다시 매긴다
    setRows((prev) => prev && prev.filter((_, i) => i !== index).map((r, i) => ({ ...r, rank: i + 1 })))
    setDirty(true)
  }

  async function save() {
    if (!rows) return
    setBusy(true)
    setNote(null)
    try {
      await repo.luckydraw.savePrizes(slug, rows)
      await load()
      setNote('저장했어요')
    } catch (e) {
      setNote(e instanceof Error ? e.message : '저장하지 못했어요')
    } finally {
      setBusy(false)
    }
  }

  if (!rows || !settings) return null

  const totalRemaining = rows.reduce((s, r) => s + (Number(r.remaining) || 0), 0)
  const totalToday = rows.reduce((s, r) => s + r.consumedToday, 0)
  const locked = settings.locked

  return (
    <div>
      <header className="admin__head">
        <div>
          <h1 className="t-title-m">상품과 수량</h1>
          <p className="t-text-xs t-muted">
            <b>남은 수량</b>에 적은 숫자가 곧 뽑을 수 있는 수량이에요. 다음 날 물량을 더할 땐 지금
            남은 수량에 더해서 적어주세요.
          </p>
        </div>
      </header>

      {locked && (
        <p className={styles.warn}>
          설정이 잠겨 있어요. 운영 설정에서 잠금을 풀어야 고칠 수 있어요.
        </p>
      )}

      {settings.rehearsal && (
        <p className={styles.warn}>
          리허설 중이라 뽑아도 재고가 줄지 않아요. 행사 시작 전에 <b>실제 운영</b>으로 바꿔주세요.
        </p>
      )}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>등수</th>
              <th className={styles.colName}>상품명</th>
              <th>남은 수량</th>
              <th>오늘 나감</th>
              <th>누적</th>
              <th>배송</th>
              {settings.batchCapEnabled && <th>묶음 제한</th>}
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id}>
                <td className={styles.rank}>{r.rank}등</td>
                <td>
                  <input
                    className="input"
                    value={r.name}
                    disabled={locked}
                    onChange={(e) => patch(i, { name: e.target.value })}
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
                    onChange={(e) =>
                      patch(i, { remaining: Math.max(0, Number(e.target.value) || 0) })
                    }
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
                    onChange={(e) => patch(i, { requiresShipping: e.target.checked })}
                  />
                </td>
                {settings.batchCapEnabled && (
                  <td>
                    {/**
                     * 비율이 아니라 **"5개 뽑을 때 최대 몇 개"** 로 묻는다.
                     * 0.5 라고 적으라 하면 아무도 그게 5개 중 3개라는 걸 모른다.
                     */}
                    <select
                      className="input"
                      value={r.batchCapRatio ?? ''}
                      disabled={locked}
                      onChange={(e) =>
                        patch(i, {
                          batchCapRatio: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                    >
                      <option value="">제한 없음</option>
                      <option value="0.3">5개 중 2개까지</option>
                      <option value="0.5">5개 중 3개까지</option>
                      <option value="0.7">5개 중 4개까지</option>
                    </select>
                  </td>
                )}
                <td className={styles.center}>
                  <button
                    type="button"
                    className="btn-icon"
                    aria-label={`${r.rank}등 삭제`}
                    disabled={locked}
                    onClick={() => remove(i)}
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
          onClick={add}
        >
          <Plus size={16} aria-hidden="true" /> 상품 추가
        </button>

        <p className="t-text-xs t-muted">
          남은 수량 <b>{totalRemaining}</b>개 · 오늘 나감 <b>{totalToday}</b>개
        </p>
      </div>

      <div className={styles.saveBar}>
        {note && <span className="t-text-xs t-muted">{note}</span>}
        <button
          type="button"
          className="btn btn--primary"
          disabled={busy || locked || !dirty}
          onClick={() => void save()}
          data-save
        >
          {busy ? '저장 중…' : dirty ? '변경사항 저장' : '저장됨'}
        </button>
      </div>
    </div>
  )
}
