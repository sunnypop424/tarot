import { useCallback, useEffect, useState } from 'react'
import { Download, Info, Trash2, Truck } from 'lucide-react'

import { repo } from '@/lib/repo'
import { SearchBox } from '../SearchBox'
import type { ShippingEntry } from '@/lib/repo'
import { useSlot } from '@/slot/SlotProvider'
import { confirmAction, toast } from '../AdminFeedback'
import styles from './Luckydraw.module.css'

/** CSV 한 칸 — 쉼표·따옴표·줄바꿈이 들어가면 깨지므로 감싸고 따옴표는 두 번 쓴다 */
function cell(value: string): string {
  return `"${String(value ?? '').replaceAll('"', '""')}"`
}

/**
 * 배송 목록 — **개인정보를 다루는 유일한 주최자 화면.**
 *
 * 원본은 xlsx 라이브러리로 엑셀을 만들었다. 여기선 CSV 로 낸다: 엑셀에서 그대로 열리고,
 * 방문자 화면과 같은 번들을 쓰는 앱에 스프레드시트 라이브러리(수백 KB)를 얹을 이유가 없다.
 * **BOM 을 붙인다** — 안 붙이면 엑셀이 한글을 깨진 글자로 연다.
 */
export function Shipping() {
  const slot = useSlot()
  const slug = slot.slug

  const [list, setList] = useState<ShippingEntry[] | null>(null)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setList(await repo.luckydraw.listShipping(slug))
  }, [slug])

  useEffect(() => {
    void load()
  }, [load])

  function download() {
    if (!list?.length) return
    const header = ['이름', '연락처', '주소', '상품', '제출시각']
    const lines = list.map((e) =>
      [
        cell(e.name),
        cell(e.phone),
        cell(e.address),
        cell(e.prizes.map((p) => `${p.rank}등 ${p.name} ${p.count}개`).join(' / ')),
        cell(new Date(e.createdAt).toLocaleString('ko-KR')),
      ].join(',')
    )
    // ﻿ = BOM. 엑셀은 이게 없으면 UTF-8 을 못 알아본다
    const blob = new Blob(['﻿' + [header.map(cell).join(','), ...lines].join('\r\n')], {
      type: 'text/csv;charset=utf-8',
    })

    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${slug}-배송정보.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function clearAll() {
    if (!list?.length) return
    /**
     * 되돌릴 수 없다. 지우기 전에 **내려받았는지** 묻는다 —
     * 이 데이터는 다른 어디에도 사본이 없다 (방문자도 자기가 넣은 걸 못 읽는다).
     */
    const ok = await confirmAction({
      title: `배송 정보 ${list.length}건을 모두 삭제할까요?`,
      desc: '삭제하면 되돌릴 수 없어요. 필요하면 먼저 CSV로 내려받아 두세요.',
      okLabel: '전체 삭제',
      danger: true,
    })
    if (!ok) return
    setBusy(true)
    try {
      await repo.luckydraw.clearShipping(slug)
      await load()
      toast('배송 정보를 모두 삭제했어요')
    } finally {
      setBusy(false)
    }
  }

  if (!list) return null

  /** 이름·연락처·주소·상품으로 찾는다 (배송 준비하며 한 명을 짚는 자리다) */
  const q = query.trim().toLowerCase()
  const shown = q
    ? list.filter((e) =>
        [e.name, e.phone, e.address, e.prizes.map((p) => p.name).join(' ')].some((v) =>
          (v ?? '').toLowerCase().includes(q)
        )
      )
    : list

  return (
    <div>
      <header className="admin__head">
        <div>
          <h1 className="t-title-l">배송 정보</h1>
          <p className="t-text-xs t-muted">
            {list.length}건 · 배송이 끝나면 <b>반드시 지워주세요.</b> 남겨둘 이유가 없는 개인정보예요.
          </p>
        </div>

        <div className={styles.headActions}>
          <button type="button" className="btn btn--ghost" disabled={!list.length} onClick={download}>
            <Download size={16} aria-hidden="true" /> CSV 내려받기
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={!list.length || busy}
            onClick={() => void clearAll()}
          >
            <Trash2 size={16} aria-hidden="true" /> 전체 삭제
          </button>
        </div>
      </header>

      {/**
       * 슬롯이 사라질 때 이 데이터도 같이 사라진다는 걸 미리 말해 둔다 —
       * 마감 +15일 자동 삭제(`0009_slot_lifecycle.sql`)를 모르면 어느 날 통째로 없어진 걸 보게 된다.
       */}
      <div className="admin-banner admin-banner--info">
        <Info size={16} aria-hidden="true" />
        <span>
          개인정보 보호를 위해 <b>마감 +14일까지만</b> 열람할 수 있어요.{' '}
          <b>+15일이 지나면 자동으로 삭제</b>됩니다.
        </span>
      </div>

      {list.length === 0 ? (
        <div className="admin-empty">
          <Truck size={44} strokeWidth={1.6} aria-hidden="true" />
          <div className="admin-empty__title">아직 제출된 배송 정보가 없어요.</div>
        </div>
      ) : (
        <>
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="이름 · 연락처 · 주소 · 상품"
          found={shown.length}
          total={list.length}
        />
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>이름</th>
                <th>연락처</th>
                <th className={styles.colName}>주소</th>
                <th>상품</th>
                <th>제출</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => (
                <tr key={e.id}>
                  <td>{e.name}</td>
                  <td className={styles.nowrap}>{e.phone}</td>
                  <td>{e.address}</td>
                  <td className={styles.nowrap}>
                    {e.prizes.map((p) => `${p.rank}등 ${p.name} ${p.count}개`).join(', ')}
                  </td>
                  <td className={styles.nowrap}>
                    {new Date(e.createdAt).toLocaleDateString('ko-KR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  )
}
