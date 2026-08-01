import { useCallback, useEffect, useState } from 'react'

import { repo } from '@/lib/repo'
import { SearchBox } from '../SearchBox'
import type { IssuedReward, RewardEntry } from '@/lib/repo/types'
import { getSlotService } from '@/data/services'
import { useSlot } from '@/slot/SlotProvider'
import { downloadCsv, when } from '../csv'
import { useT } from '@/i18n'


/**
 * 응모자 명단 — **개인정보를 다루는 화면.** 럭드 배송 목록과 같은 급으로 다룬다.
 *
 * `reward_entries` 는 anon select 정책이 아예 없어서 주최자·최고관리자만 여기까지 온다.
 * 주최자가 안 켠 항목은 애초에 받지 않았으므로 열 자체가 안 나온다.
 */
export function Entries() {
  const t = useT()
  const slot = useSlot()
  const slug = slot.slug
  const source = getSlotService(slot)
  const [list, setList] = useState<RewardEntry[] | null>(null)
  const [issued, setIssued] = useState<IssuedReward[]>([])
  const [query, setQuery] = useState('')

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

  const head = (
    <header className="ad-head">
      <div className="ad-head__row">
        <h1 className="ad-head__title">{t('응모자 명단')}</h1>
        {list && <span className="ad-head__count tnum">응모 {list.length}명</span>}
      </div>
      <p className="ad-head__desc">{t('보상을 받을 자격을 얻고 응모까지 마친 방문자 명단이에요.')}</p>
    </header>
  )

  if (!repo.rewards.ready()) {
    return (
      <>
        {head}
        <div className="ad-card">
          <div className="ad-empty">
            <div className="ad-empty__title">{t('지금 빌드에서는 응모자 목록을 쓸 수 없어요')}</div>
          </div>
        </div>
      </>
    )
  }
  if (!list) return null

  // 응모 자격을 얻은 사람 = raffle 코드를 받은 사람. 그중 폼을 낸 사람이 `list` 다
  const raffle = issued.filter((r) => r.kind === 'raffle')

  /** 닉네임·트위터·연락처·코드로 찾는다 — 줄 서 있는 방문자 앞에서 스크롤은 느리다 */
  const q = query.trim().toLowerCase()
  const shown = q
    ? list.filter((e) =>
        [e.nickname, e.handle ?? '', e.contact ?? '', e.code].some((v) => v.toLowerCase().includes(q))
      )
    : list

  const cols = {
    handle: list.some((e) => e.handle),
    contact: list.some((e) => e.contact),
    address: list.some((e) => e.address),
    score: list.some((e) => e.score !== null),
  }

  /** 켜진 열만 격자에 넣는다 — 안 받은 정보는 빈 칸으로도 안 보여준다 */
  const template = [
    'minmax(0,1fr)',
    cols.handle ? '150px' : null,
    cols.contact ? '132px' : null,
    cols.address ? 'minmax(0,1.2fr)' : null,
    cols.score ? '72px' : null,
    '92px',
    '110px',
  ]
    .filter(Boolean)
    .join(' ')
  const tableVars = { ['--ad-tcols' as string]: template, ['--ad-tmin' as string]: '620px' }

  function download() {
    if (!list?.length) return
    const header = ['닉네임', '트위터', '연락처', '주소', '점수', '당첨', '응모시각']
    const rows = list.map((r) => [
      r.nickname,
      r.handle ?? '',
      r.contact ?? '',
      r.address ?? '',
      r.score === null ? '' : String(r.score),
      r.won ? 'O' : '',
      when(r.createdAt),
    ])
    downloadCsv(`${slug}-응모자.csv`, header, rows)
  }

  return (
    <>
      {head}

      <div className="ad-stack">
        <div className="ad-card ad-card--tight">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span className="ad-mark" aria-hidden="true">
              !
            </span>
            <div>
              <div className="ad-banner__title">{t('개인정보가 들어 있는 명단이에요')}</div>
              <div className="ad-sub" style={{ marginTop: 5 }}>
                {cols.contact || cols.address
                  ? '연락처·주소가 들어 있어요. 선물을 다 보내고 나면 지워 주세요 — '
                  : ''}
                이벤트가 끝나고 14일이 지나면 이 화면이 잠기고, 슬롯을 지우면 함께 삭제돼요. 화면을
                켜 둔 채 자리를 비우지 말아 주세요.
              </div>
            </div>
          </div>
        </div>

        {raffle.length > 0 && (
          <div className="ad-stats">
            <div className="ad-stat">
              <div className="ad-stat__label">{t('자격을 얻은 분')}</div>
              <div className="ad-stat__row">
                <span className="ad-stat__value tnum">{raffle.length}</span>
                <span className="ad-stat__unit">{t('명')}</span>
              </div>
            </div>
            <div className="ad-stat">
              <div className="ad-stat__label">{t('응모 완료')}</div>
              <div className="ad-stat__row">
                <span className="ad-stat__value tnum">{list.length}</span>
                <span className="ad-stat__unit">{t('명')}</span>
              </div>
            </div>
            <div className="ad-stat" data-hot={raffle.length > list.length || undefined}>
              <div className="ad-stat__label">{t('아직 안 냄')}</div>
              <div className="ad-stat__row">
                <span className="ad-stat__value tnum">{Math.max(0, raffle.length - list.length)}</span>
                <span className="ad-stat__unit">{t('명')}</span>
              </div>
              {raffle.length > list.length && (
                <div className="ad-stat__sub">{t('추첨 후보에 안 들어가요')}</div>
              )}
            </div>
          </div>
        )}

        {raffle.length > list.length && (
          <div className="ad-banner ad-banner--warn ad-banner--pad">
            <div className="ad-banner__title">
              자격은 얻었는데 아직 응모 폼을 안 내신 분이 {raffle.length - list.length}명 있어요
            </div>
            <div className="ad-banner__body">
              그분들은 연락할 방법이 없어서 추첨 후보에도 들어가지 않아요.
            </div>
          </div>
        )}

        <div className="ad-card">
          <div className="ad-card__head">
            <div className="ad-card__titleRow">
              <span className="ad-card__title">{t('응모자')}</span>
              <span className="ad-card__num tnum">
                {shown.length} / {list.length}명
              </span>
            </div>
            <div className="ad-inline" style={{ flexWrap: 'nowrap' }}>
              <SearchBox value={query} onChange={setQuery} placeholder={t('닉네임·트위터로 찾기')} />
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
              {/**
               * **왜 비었는지를 말해준다.** 응모를 안 받는 이벤트인지, 받는데 아직 아무도 안 낸
               * 건지는 전혀 다른 상황이고, 목록을 늘 띄우기로 한 이상 그 구분은 화면이 해야 한다.
               */}
              <div className="ad-empty__title">
                {raffle.length === 0 ? t('지금은 응모를 받지 않아요') : t('아직 응모한 사람이 없어요')}
              </div>
              <div className="ad-empty__sub">
                {raffle.length === 0
                  ? t('보상 방식을 ‘응모’ 로 바꾸시면 방문자가 응모하고 여기 명단이 쌓여요. 지난 응모 기록이 있으면 방식과 상관없이 여기 그대로 남아요.')
                  : t('자격을 얻은 분이 응모 폼을 내면 여기 한 줄씩 쌓여요.')}
              </div>
            </div>
          ) : shown.length === 0 ? (
            <div className="ad-empty ad-empty--sm">
              <div className="ad-empty__title">{t('찾는 응모자가 없어요')}</div>
              <div className="ad-empty__sub">{t('검색어를 지우고 다시 찾아보세요.')}</div>
            </div>
          ) : (
            <div className="ad-table" style={tableVars}>
              <div className="ad-table__inner" data-entries>
                <div className="ad-table__head">
                  <span>{t('닉네임')}</span>
                  {cols.handle && <span>{t('트위터')}</span>}
                  {cols.contact && <span>{t('연락처')}</span>}
                  {cols.address && <span>{t('주소')}</span>}
                  {cols.score && <span>{t('점수')}</span>}
                  <span>{t('당첨')}</span>
                  <span>{t('응모')}</span>
                </div>
                {shown.map((e) => (
                  <div key={e.rewardId} className="ad-table__row">
                    <span className="ad-cell--b">{e.nickname}</span>
                    {cols.handle && (
                      <span className="ad-cell--mute">
                        {e.handle ? `@${e.handle.replace(/^@/, '')}` : '—'}
                      </span>
                    )}
                    {cols.contact && <span className="ad-cell tnum">{e.contact || '—'}</span>}
                    {cols.address && <span className="ad-cell ad-cell--wrap">{e.address || '—'}</span>}
                    {cols.score && <span className="ad-cell--num tnum">{e.score === null ? '—' : `${e.score}점`}</span>}
                    <span>
                      {e.won ? (
                        <span className="ad-tag" data-tone="on">
                          {e.pickedRound}회차
                        </span>
                      ) : (
                        <span className="ad-cell--mute">—</span>
                      )}
                    </span>
                    <span className="ad-cell--mute tnum">
                      {new Date(e.createdAt).toLocaleString('ko-KR', {
                        month: 'numeric',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
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
