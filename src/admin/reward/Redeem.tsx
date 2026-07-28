import { useCallback, useEffect, useState } from 'react'
import { CircleCheck, CircleX, Download, ScanLine, TriangleAlert } from 'lucide-react'

import { repo } from '@/lib/repo'
import { SearchBox } from '../SearchBox'
import type { IssuedReward } from '@/lib/repo/types'
import { getSlotService } from '@/data/services'
import { useSlot } from '@/slot/SlotProvider'
import styles from './Reward.module.css'

/** CSV 한 칸 — 쉼표·따옴표·줄바꿈이 들어가면 깨지므로 감싸고 따옴표는 두 번 쓴다 */
const cell = (v: string) => `"${String(v ?? '').replaceAll('"', '""')}"`

const when = (iso: string) =>
  new Date(iso).toLocaleString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

/**
 * 수령 확인 — **스태프가 쓰는 화면. 세 서비스가 공유한다**
 * (스탬프 완성 / 모의고사 커트라인 / 포토카드 실물).
 *
 * **중복 수령을 실제로 막는 게 이 화면 하나다.** 손님 폰의 코드만으로는 "이미 받았는지" 를
 * 아무도 모른다 — 개발자도구로 고쳐도 서버는 모르기 때문이다. 그래서 `reward_redeem` 은
 * `manages_slot` 게이트가 걸려 있고 anon 은 아예 못 부른다.
 *
 * **스캐너 아래에 발급 목록을 항상 둔다.** 입력칸만 있으면 "몇 장 나갔고 몇 장 남았나" 를
 * 알 길이 없어서, 행사 중에 재고를 맞출 수가 없다. 목록은 설정(`rewardMode`)과 무관하게
 * 읽는다 — 모드를 바꿔도 이미 나간 코드는 남기 때문이다.
 *
 * 목록에는 **개인정보를 안 얹는다**: 카운터 화면은 계속 켜져 있어서 남의 닉네임·연락처가
 * 상시 노출된다. 그건 '응모자' 화면에서만 본다.
 */
export function Redeem() {
  const slot = useSlot()
  const slug = slot.slug
  const source = getSlotService(slot)

  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [rows, setRows] = useState<IssuedReward[] | null>(null)
  const [fresh, setFresh] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<
    | { kind: 'ok'; label: string }
    | { kind: 'already'; label: string; at: string }
    | { kind: 'none' }
    | { kind: 'error'; message: string }
    | null
  >(null)

  const load = useCallback(async () => {
    if (!repo.rewards.ready()) return
    setRows(await repo.rewards.issued(slug, source).catch(() => []))
  }, [slug, source])

  useEffect(() => {
    void load()
  }, [load])

  async function go(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim() || busy) return
    setBusy(true)
    setResult(null)
    try {
      // RPC 는 어댑터가 안다 — 스태프 화면(`/staff`)도 같은 걸 부른다
      const row = await repo.rewards.redeem(slug, code)
      if (!row.ok) setResult({ kind: 'none' })
      else if (row.already) setResult({ kind: 'already', label: row.label ?? '', at: row.redeemedAt ?? '' })
      else setResult({ kind: 'ok', label: row.label ?? '' })
      // 목록에서 방금 처리한 줄을 잠깐 강조한다 — 어디가 바뀌었는지 눈으로 따라가게
      if (row.ok) setFresh(code.trim().toUpperCase().replace(/[^0-9A-Z]/g, ''))
      setCode('')
      await load()
    } catch (e) {
      setResult({ kind: 'error', message: e instanceof Error ? e.message : '확인하지 못했어요' })
    } finally {
      setBusy(false)
    }
  }

  const guaranteed = (rows ?? []).filter((r) => r.kind === 'guaranteed')
  /** 코드·내용으로 찾는다 — 손님이 보여준 번호를 목록에서 바로 짚는 자리다 */
  const q = query.trim().toLowerCase()
  const shown = q ? guaranteed.filter((r) => [r.code, r.label].some((v) => v.toLowerCase().includes(q))) : guaranteed
  const done = guaranteed.filter((r) => r.redeemedAt)
  const left = guaranteed.length - done.length

  function download() {
    if (!guaranteed.length) return
    const header = ['교환코드', '내용', '수령', '발급시각', '수령시각']
    const lines = guaranteed.map((r) =>
      [
        cell(r.code),
        cell(r.label),
        cell(r.redeemedAt ? 'O' : ''),
        cell(new Date(r.createdAt).toLocaleString('ko-KR')),
        cell(r.redeemedAt ? new Date(r.redeemedAt).toLocaleString('ko-KR') : ''),
      ].join(',')
    )
    // ﻿ = BOM. 엑셀은 이게 없으면 UTF-8 을 못 알아본다
    const blob = new Blob(['﻿' + [header.map(cell).join(','), ...lines].join('\r\n')], {
      type: 'text/csv;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${slug}-교환권.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <header className="admin__head">
        <div>
          <h1 className="t-title-l">수령 확인</h1>
          <p className="t-text-xs t-muted">
            손님 폰에 뜬 교환코드를 입력하세요. <b>한 번 처리하면 다시 쓸 수 없습니다.</b>
          </p>
        </div>
        {guaranteed.length > 0 && (
          <button type="button" className="btn btn--outline btn--sm" onClick={download}>
            <Download size={15} aria-hidden="true" />
            CSV
          </button>
        )}
      </header>

      <div className="stat-row">
        <div className="stat-tile">
          <span className="stat-label">발급</span>
          <span className="stat-value" data-issued>
            {guaranteed.length}
            <span className="stat-unit">장</span>
          </span>
        </div>
        <div className="stat-tile">
          <span className="stat-label">수령 완료</span>
          <span className="stat-value" data-redeemed>
            {done.length}
            <span className="stat-unit">장</span>
          </span>
        </div>
        <div className="stat-tile">
          <span className="stat-label">아직 안 받음</span>
          <span className="stat-value" data-left>
            {left}
            <span className="stat-unit">장</span>
          </span>
        </div>
      </div>

      <form onSubmit={go} className="admin-section" data-redeem-form>
        <h2 className="admin-section__title">
          <ScanLine size={15} strokeWidth={2} aria-hidden="true" />
          교환코드 확인
        </h2>
        <div className="admin-inline-form">
          <label className="field field--md">
            <span className="field__label">교환코드</span>
            <input
              className="input input--entry"
              value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="XK4T-9P2M"
            autoFocus
              autoCapitalize="characters"
              autoComplete="off"
              data-redeem-code
            />
          </label>
          <button type="submit" className="btn btn--primary btn--tall" disabled={!code.trim() || busy}>
            <ScanLine size={16} strokeWidth={2} aria-hidden="true" />
            {busy ? '확인 중…' : '수령 처리'}
          </button>
        </div>
        <p className="admin-note" style={{ margin: '10px 0 0' }}>
          소문자·하이픈·공백은 알아서 맞춰집니다. 한 번 처리한 코드는 다시 쓸 수 없어요.
        </p>
      </form>

      {result && (
        <div className="admin-section" data-redeem-result>
          {result.kind === 'ok' && (
            <div className="admin-result">
              <CircleCheck size={26} strokeWidth={2} aria-hidden="true" />
              <div>
                <div className="admin-result__title">수령 처리했어요</div>
                <p className="admin-result__body">
                  {result.label} — 손님께 전달해 주세요.
                </p>
              </div>
            </div>
          )}
          {result.kind === 'already' && (
            <div className="admin-result">
              <TriangleAlert size={26} strokeWidth={2} aria-hidden="true" />
              <div>
                <div className="admin-result__title">이미 수령한 코드예요</div>
                <p className="admin-result__body">
                  {result.at &&
                    `${new Date(result.at).toLocaleString('ko-KR', {
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}에 처리됨`}
                  {result.label ? ` · ${result.label}` : ''}
                </p>
              </div>
            </div>
          )}
          {result.kind === 'none' && (
            <div className="admin-result">
              <CircleX size={26} strokeWidth={2} aria-hidden="true" />
              <div>
                <div className="admin-result__title">없는 코드예요</div>
                <p className="admin-result__body">
                  손님 화면의 코드를 다시 확인해 주세요.
                </p>
              </div>
            </div>
          )}
          {result.kind === 'error' && <p className="field__error">{result.message}</p>}
        </div>
      )}

      <section className="admin-section">
        <h2 className="admin-section__title">발급 목록</h2>
        <p className="admin-note">
          손님 이름은 여기 안 나와요 — 카운터 화면은 계속 켜져 있으니까요. 응모하신 분들의
          정보는 '응모자' 화면에서 보실 수 있어요.
        </p>

        {!rows ? null : guaranteed.length === 0 ? (
          <div className="admin-empty">
            <ScanLine size={44} strokeWidth={1.6} aria-hidden="true" />
            <div className="admin-empty__title">아직 발급된 교환권이 없어요</div>
            <div className="t-text-s t-muted">
              손님이 조건을 채우면 교환코드가 발급되고 여기 한 줄씩 쌓여요.
            </div>
          </div>
        ) : (
          <>
          <SearchBox
            value={query}
            onChange={setQuery}
            placeholder="교환코드 · 내용"
            found={shown.length}
            total={guaranteed.length}
          />
          <div className={styles.tableWrap}>
            <table className={styles.table} data-issued-list>
              <thead>
                <tr>
                  <th>교환코드</th>
                  <th>내용</th>
                  <th>상태</th>
                  <th>발급</th>
                  <th>수령</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr
                    key={r.code}
                    data-done={r.redeemedAt ? '' : undefined}
                    data-fresh={fresh && r.code.replace(/-/g, '') === fresh ? '' : undefined}
                  >
                    <td className={styles.code}>{r.code}</td>
                    <td>{r.label}</td>
                    <td>
                      <span className={styles.pill}>{r.redeemedAt ? '수령 완료' : '아직 안 받음'}</span>
                    </td>
                    <td className="t-text-xs t-muted">{when(r.createdAt)}</td>
                    <td className="t-text-xs t-muted">{r.redeemedAt ? when(r.redeemedAt) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>
    </div>
  )
}
