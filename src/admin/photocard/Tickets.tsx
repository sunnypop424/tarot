import { useCallback, useEffect, useState } from 'react'
import { ExternalLink, Image as ImageIcon, Ticket, Trash2 } from 'lucide-react'

import { repo } from '@/lib/repo'
import { SearchBox } from '../SearchBox'
import { photocardRules, RARITY_LABEL } from '@/data/photocard'
import type { PhotocardSettings, PhotocardTicketRow } from '@/lib/repo/types'
import { cssUrl } from '@/lib/image'
import { useSlot } from '@/slot/SlotProvider'
import { confirmAction, toast } from '../AdminFeedback'
import styles from './Photocard.module.css'

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
 * 뽑기권 목록 — **발급된 번호와 그 번호로 뽑힌 카드를 한 줄씩** 본다.
 *
 * 실제로 쓰는 자리는 둘이다:
 *  - 손님이 "제 번호로 뽑은 게 뭐였죠?" 라고 물을 때
 *  - 발급 수가 손님 수보다 훨씬 많을 때 (브라우저를 지우고 다시 받은 경우)
 *
 * **`subject` 는 안 보여준다** — 그건 그 폰을 가리키는 값이고, 번호와 짝지어 뿌릴 이유가 없다.
 */
export function Tickets() {
  const slot = useSlot()
  const slug = slot.slug
  const [rows, setRows] = useState<PhotocardTicketRow[] | null>(null)
  const [settings, setSettings] = useState<PhotocardSettings | null>(null)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [t, s] = await Promise.all([repo.photocard.listTickets(slug), repo.photocard.settings(slug)])
    setRows(t)
    setSettings(s)
  }, [slug])

  useEffect(() => {
    void load()
  }, [load])

  if (!repo.photocard.ready()) {
    return (
      <div className="admin-empty">
        <Ticket size={44} strokeWidth={1.6} aria-hidden="true" />
        <div className="admin-empty__title">지금 빌드에서는 뽑기권을 쓸 수 없어요</div>
      </div>
    )
  }
  if (!rows || !settings) return null

  if (!photocardRules(settings.mode).usesTicket) {
    return (
      <div>
        <header className="admin__head">
          <div>
            <h1 className="t-title-l">뽑기권</h1>
          </div>
        </header>
        <div className="admin-empty">
          <Ticket size={44} strokeWidth={1.6} aria-hidden="true" />
          <div className="admin-empty__title">이 이벤트는 뽑기권을 쓰지 않아요</div>
          <div className="t-text-s t-muted">
            '1장 증정' 방식에서만 손님이 뽑기권을 받습니다. 방식은 '카드' 화면에서 바꿀 수 있어요.
          </div>
        </div>
      </div>
    )
  }

  /** 번호·카드 이름으로 찾는다 (손님이 번호를 보여주면 그걸로 바로 짚는다) */
  const q = query.trim().toLowerCase()
  const shown = q
    ? rows.filter((r) => [r.code, r.cardName ?? ''].some((v) => v.toLowerCase().includes(q)))
    : rows

  const drawn = rows.filter((r) => r.status === 'drawn')
  const open = rows.length - drawn.length

  async function remove(row: PhotocardTicketRow) {
    if (
      !(await confirmAction({
        title: `${row.code} 번호를 지울까요?`,
        desc:
          row.status === 'drawn'
            ? '이미 뽑은 번호예요. 지우면 그 손님이 뽑기권을 새로 받아 한 번 더 뽑을 수 있게 됩니다. 뽑은 기록과 재고는 그대로예요.'
            : '지우면 그 손님이 뽑기권을 새로 받을 수 있어요.',
        okLabel: '삭제',
        danger: true,
      }))
    )
      return
    setBusy(true)
    try {
      await repo.photocard.removeTicket(slug, row.code)
      await load()
      toast('지웠어요')
    } catch (e) {
      toast(e instanceof Error ? e.message : '지우지 못했어요')
    } finally {
      setBusy(false)
    }
  }

  function download() {
    if (!rows?.length) return
    const header = ['번호', '상태', '뽑힌 카드', '레어도', '발급시각', '뽑은시각']
    const lines = rows.map((r) =>
      [
        cell(r.code),
        cell(r.status === 'drawn' ? '뽑음' : '대기'),
        cell(r.cardName ?? ''),
        cell(r.rarity ? (RARITY_LABEL[r.rarity] ?? String(r.rarity)) : ''),
        cell(new Date(r.issuedAt).toLocaleString('ko-KR')),
        cell(r.drawnAt ? new Date(r.drawnAt).toLocaleString('ko-KR') : ''),
      ].join(',')
    )
    // ﻿ = BOM. 엑셀은 이게 없으면 UTF-8 을 못 알아본다
    const blob = new Blob(['﻿' + [header.map(cell).join(','), ...lines].join('\r\n')], {
      type: 'text/csv;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${slug}-뽑기권.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <header className="admin__head">
        <div>
          <h1 className="t-title-l">뽑기권</h1>
          <p className="t-text-xs t-muted">
            발급 {rows.length}장 · 뽑음 {drawn.length}장 · 대기 {open}장
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a
            className="btn btn--ghost btn--sm"
            href={`/${slug}/staff`}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={15} aria-hidden="true" />
            스태프 화면
          </a>
          {rows.length > 0 && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={download}>
              CSV
            </button>
          )}
        </div>
      </header>

      <p className="t-text-xs t-muted" style={{ margin: '0 0 14px' }}>
        <b>발급 수가 손님 수보다 훨씬 많으면</b> 브라우저 기록을 지우고 다시 받은 경우일 수 있어요.
        번호를 지우면 그 손님이 새로 받을 수 있게 됩니다 — 잘못 발급했거나 손님이 못 받았을 때
        쓰세요.
      </p>

      {rows.length === 0 ? (
        <div className="admin-empty">
          <Ticket size={44} strokeWidth={1.6} aria-hidden="true" />
          <div className="admin-empty__title">아직 발급된 뽑기권이 없어요</div>
          <div className="t-text-s t-muted">손님이 이벤트 페이지에서 '뽑기권 받기' 를 누르면 여기 나와요.</div>
        </div>
      ) : (
        <>
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="번호 · 카드 이름"
          found={shown.length}
          total={rows.length}
        />
        <div className={styles.list} data-tickets>
          {shown.map((r) => (
            <div key={r.code} className={styles.row} data-out={r.status === 'drawn' || undefined}>
              <div className={styles.ticketCode}>{r.code}</div>
              {r.status === 'drawn' ? (
                <>
                  {/* 썸네일도 background-image — 관리 화면도 예외가 아니다 (CLAUDE.md) */}
                  <div
                    className={styles.thumb}
                    style={r.cardImage ? { backgroundImage: cssUrl(r.cardImage) } : undefined}
                    role={r.cardImage ? 'img' : undefined}
                    aria-label={r.cardName ?? undefined}
                  >
                    {!r.cardImage && <ImageIcon size={16} strokeWidth={1.7} aria-hidden="true" />}
                  </div>
                  <div className={styles.rowMain}>
                    <div className={styles.rowTop}>
                      <span className="t-text-m" style={{ fontWeight: 700 }}>{r.cardName || '(이름 없음)'}</span>
                      {r.rarity && <span className={styles.tag}>{RARITY_LABEL[r.rarity] ?? r.rarity}</span>}
                    </div>
                    <div className={styles.rowMeta}>
                      <span>발급 {when(r.issuedAt)}</span>
                      {r.drawnAt && (
                        <>
                          <span>·</span>
                          <span>뽑음 {when(r.drawnAt)}</span>
                        </>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className={styles.rowMain}>
                  <div className={styles.rowTop}>
                    <span className={styles.tag}>아직 안 뽑음</span>
                  </div>
                  <div className={styles.rowMeta}>
                    <span>발급 {when(r.issuedAt)}</span>
                  </div>
                </div>
              )}
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                disabled={busy}
                onClick={() => void remove(r)}
                aria-label={`${r.code} 삭제`}
                style={{ flex: 'none' }}
              >
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
        </>
      )}
    </div>
  )
}
