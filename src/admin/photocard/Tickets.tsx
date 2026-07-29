import { useCallback, useEffect, useState } from 'react'

import { repo } from '@/lib/repo'
import { SearchBox } from '../SearchBox'
import { photocardRules, RARITY_LABEL } from '@/data/photocard'
import type { PhotocardSettings, PhotocardTicketRow } from '@/lib/repo/types'
import { cssUrl } from '@/lib/image'
import { useSlot } from '@/slot/SlotProvider'
import { confirmAction, toast } from '../AdminFeedback'
/* 화면 표의 `when` 은 연도 없는 짧은 형식이라 별개다 — CSV 는 전체 표기를 쓴다 */
import { downloadCsv, when as csvWhen } from '../csv'


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

  const head = (extra?: string) => (
    <header className="ad-head">
      <div className="ad-head__row">
        <h1 className="ad-head__title">뽑기권</h1>
        {extra && <span className="ad-head__count tnum">{extra}</span>}
      </div>
      <p className="ad-head__desc">발급된 번호와 뽑힌 카드를 봐요.</p>
    </header>
  )

  if (!repo.photocard.ready()) {
    return (
      <>
        {head()}
        <div className="ad-card">
          <div className="ad-empty">
            <div className="ad-empty__title">지금 빌드에서는 뽑기권을 쓸 수 없어요</div>
          </div>
        </div>
      </>
    )
  }
  if (!rows || !settings) return null

  const usesTicket = photocardRules(settings.mode).usesTicket

  /** 번호·카드 이름으로 찾는다 (손님이 번호를 보여주면 그걸로 바로 짚는다) */
  const q = query.trim().toLowerCase()
  const shown = q
    ? rows.filter((r) => [r.code, r.cardName ?? ''].some((v) => v.toLowerCase().includes(q)))
    : rows

  const drawn = rows.filter((r) => r.status === 'drawn')
  const open = rows.length - drawn.length

  async function remove(row: PhotocardTicketRow) {
    const ok = await confirmAction({
      title: '이 번호를 지울까요?',
      desc:
        row.status === 'drawn'
          ? `${row.code} 는 이미 ${row.cardName || '카드'} 를 뽑은 번호예요. 지우면 그 손님이 한 번 더 뽑게 돼요. 뽑은 기록과 재고는 그대로예요.`
          : `${row.code} 를 지워요. 손님이 이 번호로는 뽑을 수 없게 돼요.`,
      okLabel: '지우기',
      danger: true,
    })
    if (!ok) return
    setBusy(true)
    try {
      await repo.photocard.removeTicket(slug, row.code)
      await load()
      toast('번호를 지웠어요')
    } catch (e) {
      toast(e instanceof Error ? e.message : '지우지 못했어요')
    } finally {
      setBusy(false)
    }
  }

  function download() {
    if (!rows?.length) return
    const header = ['번호', '상태', '뽑힌 카드', '레어도', '발급시각', '뽑은시각']
    const body = rows.map((r) => [
      r.code,
      r.status === 'drawn' ? '뽑음' : '대기',
      r.cardName ?? '',
      r.rarity ? (RARITY_LABEL[r.rarity] ?? String(r.rarity)) : '',
      csvWhen(r.issuedAt),
      csvWhen(r.drawnAt),
    ])
    downloadCsv(`${slug}-뽑기권.csv`, header, body)
  }

  const tableVars = {
    ['--ad-tcols' as string]: '92px 44px minmax(0,1fr) 96px 96px 60px',
    ['--ad-tmin' as string]: '600px',
  }

  return (
    <>
      {head(`발급 ${rows.length}장 · 뽑음 ${drawn.length}장`)}

      <div className="ad-stack">
        {!usesTicket && (
          <div className="ad-banner ad-banner--mute ad-banner--pad" style={{ fontWeight: 400 }}>
            <div className="ad-banner__title">이 운영 방식에서는 뽑기권을 쓰지 않아요</div>
            <div className="ad-banner__body">
              저장용은 손님이 자기 폰에서 바로 뽑아요. 아래 목록은 예전에 발급된 기록이에요.
            </div>
          </div>
        )}

        <div className="ad-stats">
          {[
            { label: '발급', value: rows.length },
            { label: '뽑음', value: drawn.length },
            { label: '대기', value: open },
          ].map((k) => (
            <div key={k.label} className="ad-stat">
              <div className="ad-stat__label">{k.label}</div>
              <div className="ad-stat__row">
                <span className="ad-stat__value tnum">{k.value}</span>
                <span className="ad-stat__unit">장</span>
              </div>
            </div>
          ))}
        </div>

        <div className="ad-card">
          <div className="ad-card__head" style={{ marginBottom: 12 }}>
            <div className="ad-card__titleRow">
              <span className="ad-card__title">발급 목록</span>
              <span className="ad-card__num tnum">
                {shown.length} / {rows.length}건
              </span>
            </div>
            <div className="ad-inline" style={{ flexWrap: 'nowrap' }}>
              <SearchBox value={query} onChange={setQuery} placeholder="번호·카드 이름으로 찾기" />
              <button
                type="button"
                className="ad-btn ad-btn--line ad-btn--md"
                disabled={!rows.length}
                onClick={download}
              >
                CSV
              </button>
              <a
                className="ad-btn ad-btn--soft ad-btn--md"
                href={`/${slug}/staff`}
                target="_blank"
                rel="noreferrer"
              >
                스태프 화면 ↗
              </a>
            </div>
          </div>
          <p className="ad-fine" style={{ marginBottom: 14 }}>
            발급 수가 손님 수보다 훨씬 많다면, 브라우저 기록을 지우고 다시 받은 경우예요. 번호를
            지우면 그 손님이 새로 받을 수 있게 돼요.
          </p>

          {rows.length === 0 ? (
            <div className="ad-empty">
              <div className="ad-empty__title">아직 발급된 뽑기권이 없어요</div>
              <div className="ad-empty__sub">
                손님이 이벤트 페이지에서 ‘뽑기권 받기’ 를 누르면 여기 나와요.
              </div>
            </div>
          ) : shown.length === 0 ? (
            <div className="ad-empty ad-empty--sm">
              <div className="ad-empty__title">찾는 번호가 없어요</div>
              <div className="ad-empty__sub">검색어를 지우고 다시 찾아보세요.</div>
            </div>
          ) : (
            <div className="ad-table" style={tableVars}>
              <div className="ad-table__inner" data-tickets>
                <div className="ad-table__head">
                  <span>번호</span>
                  <span />
                  <span>뽑은 카드</span>
                  <span>발급</span>
                  <span>뽑음</span>
                  <span />
                </div>
                {shown.map((r) => (
                  <div key={r.code} className="ad-table__row ad-table__row--tight">
                    <span className="ad-cell--code tnum" style={{ fontSize: 15, letterSpacing: '.06em' }}>
                      {r.code}
                    </span>
                    {r.status === 'drawn' ? (
                      <div
                        className="ad-thumb"
                        style={r.cardImage ? { backgroundImage: cssUrl(r.cardImage) } : undefined}
                        role={r.cardImage ? 'img' : undefined}
                        aria-label={r.cardName ?? undefined}
                      />
                    ) : (
                      <span />
                    )}
                    <div style={{ minWidth: 0 }}>
                      {r.status === 'drawn' ? (
                        <>
                          <div className="ad-cell--b">{r.cardName || '(이름 없음)'}</div>
                          {r.rarity && (
                            <div className="ad-fine" style={{ marginTop: 3 }}>
                              {RARITY_LABEL[r.rarity] ?? r.rarity}
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="ad-tag">아직 안 뽑음</span>
                      )}
                    </div>
                    <span className="ad-cell--mute tnum">{when(r.issuedAt)}</span>
                    <span className="ad-cell--mute tnum">{r.drawnAt ? when(r.drawnAt) : '—'}</span>
                    <button
                      type="button"
                      className="ad-x"
                      disabled={busy}
                      aria-label={`${r.code} 삭제`}
                      onClick={() => void remove(r)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
