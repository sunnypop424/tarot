import { useCallback, useEffect, useState } from 'react'

import { repo } from '@/lib/repo'
import { SearchBox } from '../SearchBox'
import type { ShippingEntry } from '@/lib/repo'
import { useSlot } from '@/slot/SlotProvider'
import { confirmAction, toast } from '../AdminFeedback'
import { downloadCsv, when } from '../csv'
import { useT } from '@/i18n'


/**
 * 배송 목록 — **개인정보를 다루는 유일한 주최자 화면.**
 *
 * 원본은 xlsx 라이브러리로 엑셀을 만들었다. 여기선 CSV 로 낸다: 엑셀에서 그대로 열리고,
 * 방문자 화면과 같은 번들을 쓰는 앱에 스프레드시트 라이브러리(수백 KB)를 얹을 이유가 없다.
 * **BOM 을 붙인다** — 안 붙이면 엑셀이 한글을 깨진 글자로 연다.
 */
export function Shipping() {
  const t = useT()
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
    const rows = list.map((e) => [
      e.name,
      e.phone,
      e.address,
      e.prizes.map((p) => `${p.rank}등 ${p.name} ${p.count}개`).join(' / '),
      when(e.createdAt),
    ])
    downloadCsv(`${slug}-배송정보.csv`, header, rows)
  }

  async function clearAll() {
    if (!list?.length) return
    /**
     * 되돌릴 수 없다. 지우기 전에 **내려받았는지** 묻는다 —
     * 이 데이터는 다른 어디에도 사본이 없다 (방문자도 자기가 넣은 걸 못 읽는다).
     */
    const ok = await confirmAction({
      title: t('배송 정보 {n}건을 전부 지울까요?', { n: list.length }),
      desc: t('다른 곳에 사본이 없어요. 방문자도 자기가 넣은 내용을 다시 볼 수 없어요. 먼저 CSV로 내려받으셨나요?'),
      okLabel: t('전부 지우기'),
      danger: true,
    })
    if (!ok) return
    setBusy(true)
    try {
      await repo.luckydraw.clearShipping(slug)
      await load()
      toast(t('배송 정보를 모두 지웠어요'))
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

  const tableVars = {
    ['--ad-tcols' as string]: '92px 132px minmax(0,1fr) 168px 96px',
    ['--ad-tmin' as string]: '700px',
  }

  return (
    <>
      <header className="ad-head">
        <div className="ad-head__row">
          <h1 className="ad-head__title">{t('배송 정보')}</h1>
          <span className="ad-head__count tnum">{t('배송 {n}건', { n: list.length })}</span>
        </div>
        <p className="ad-head__desc">
          당첨자가 직접 남긴 배송지예요. 방문자 개인정보가 나오는 유일한 화면이에요.
        </p>
      </header>

      <div className="ad-stack">
        {/**
         * 슬롯이 사라질 때 이 데이터도 같이 사라진다는 걸 미리 말해 둔다 —
         * 마감 +15일 자동 삭제(`0009_slot_lifecycle.sql`)를 모르면 어느 날 통째로 없어진 걸 보게 된다.
         */}
        <div className="ad-banner ad-banner--warn ad-banner--pad">
          <div className="ad-banner__title">{t('배송이 끝나면 반드시 지워 주세요')}</div>
          <div className="ad-banner__body">
            이름·연락처·주소가 그대로 들어 있는 화면이에요. 마감 +14일까지만 열람할 수 있고, +15일이
            지나면 저절로 지워져요.
          </div>
        </div>

        <div className="ad-card">
          <div className="ad-card__head">
            <div className="ad-card__titleRow">
              <span className="ad-card__title">{t('배송 정보')}</span>
              <span className="ad-card__num tnum">
                {t('{a} / {b}건', { a: shown.length, b: list.length })}
              </span>
            </div>
            <div className="ad-inline" style={{ flexWrap: 'nowrap' }}>
              <SearchBox value={query} onChange={setQuery} placeholder={t('이름·연락처·주소로 찾기')} />
              <button
                type="button"
                className="ad-btn ad-btn--line ad-btn--md"
                disabled={!list.length}
                onClick={download}
              >
                CSV 내려받기
              </button>
            </div>
          </div>

          {list.length === 0 ? (
            <div className="ad-empty">
              <div className="ad-empty__title">{t('아직 배송 정보를 낸 사람이 없어요')}</div>
              <div className="ad-empty__sub">
                배송이 필요한 상품에 당첨된 방문자가 주소를 넣으면 여기에 쌓여요.
              </div>
            </div>
          ) : shown.length === 0 ? (
            <div className="ad-empty ad-empty--sm">
              <div className="ad-empty__title">{t('찾는 배송 정보가 없어요')}</div>
              <div className="ad-empty__sub">{t('검색어를 지우고 다시 찾아보세요.')}</div>
            </div>
          ) : (
            <>
              <div className="ad-table" style={tableVars}>
                <div className="ad-table__inner">
                  <div className="ad-table__head">
                    <span>{t('이름')}</span>
                    <span>{t('연락처')}</span>
                    <span>{t('주소')}</span>
                    <span>{t('당첨 상품')}</span>
                    <span>{t('제출')}</span>
                  </div>
                  {shown.map((e) => (
                    <div key={e.id} className="ad-table__row">
                      <span className="ad-cell--b">{e.name}</span>
                      <span className="ad-cell tnum">{e.phone}</span>
                      <span className="ad-cell ad-cell--wrap">{e.address}</span>
                      <span className="ad-cell ad-cell--wrap">
                        {e.prizes.map((p) => `${p.rank}등 ${p.name} ${p.count}개`).join(', ')}
                      </span>
                      <span className="ad-cell--mute tnum">
                        {new Date(e.createdAt).toLocaleDateString('ko-KR')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div
                style={{
                  marginTop: 20,
                  paddingTop: 20,
                  borderTop: '1px solid var(--ad-line)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div className="ad-sub" style={{ maxWidth: '38em' }}>
                  지우면 되돌릴 수 없어요. 다른 곳에 사본이 없고, 방문자도 자기가 넣은 내용을 다시 볼 수
                  없어요.
                </div>
                <button
                  type="button"
                  className="ad-btn ad-btn--danger ad-btn--lg"
                  disabled={busy}
                  onClick={() => void clearAll()}
                >
                  전체 지우기
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
