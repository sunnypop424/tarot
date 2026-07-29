import { useCallback, useEffect, useState } from 'react'

import { repo } from '@/lib/repo'
import { SearchBox } from '../SearchBox'
import type { IssuedReward } from '@/lib/repo/types'
import { getSlotService } from '@/data/services'
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
 * 수령 확인 — **스태프가 쓰는 화면. 세 서비스가 공유한다**
 * (스탬프 완성 / 모의고사 커트라인 / 포토카드 실물).
 *
 * **중복 수령을 실제로 막는 게 이 화면 하나다.** 손님 폰의 코드만으로는 "이미 받았는지" 를
 * 아무도 모른다 — 개발자도구로 고쳐도 서버는 모르기 때문이다. 그래서 `reward_redeem` 은
 * `manages_slot` 게이트가 걸려 있고 anon 은 아예 못 부른다.
 *
 * **입력칸 아래에 발급 목록을 항상 둔다.** 입력칸만 있으면 "몇 장 나갔고 몇 장 남았나" 를
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
    | { kind: 'ok'; label: string; code: string }
    | { kind: 'already'; label: string; at: string; code: string }
    | { kind: 'none'; code: string }
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

  async function ask(e: React.FormEvent) {
    e.preventDefault()
    const v = code.trim()
    if (!v || busy) return
    const ok = await confirmAction({
      title: '이 코드를 수령 처리할까요?',
      desc: `${v.toUpperCase()} · 처리하면 이 코드는 다시 쓸 수 없어요. 실물을 손님에게 건넨 뒤 눌러 주세요.`,
      okLabel: '수령 처리',
      danger: true,
    })
    if (!ok) return
    await go(v)
  }

  async function go(value: string) {
    setBusy(true)
    setResult(null)
    try {
      // RPC 는 어댑터가 안다 — 스태프 화면(`/staff`)도 같은 걸 부른다
      const row = await repo.rewards.redeem(slug, value)
      const shownCode = value.trim().toUpperCase()
      if (!row.ok) setResult({ kind: 'none', code: shownCode })
      else if (row.already)
        setResult({ kind: 'already', label: row.label ?? '', at: row.redeemedAt ?? '', code: shownCode })
      else setResult({ kind: 'ok', label: row.label ?? '', code: shownCode })
      // 목록에서 방금 처리한 줄을 잠깐 강조한다 — 어디가 바뀌었는지 눈으로 따라가게
      if (row.ok && !row.already) {
        setFresh(shownCode.replace(/[^0-9A-Z]/g, ''))
        toast(`수령 처리했어요 · ${shownCode}`)
      }
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
    const rows = guaranteed.map((r) => [
      r.code,
      r.label,
      r.redeemedAt ? 'O' : '',
      csvWhen(r.createdAt),
      csvWhen(r.redeemedAt),
    ])
    downloadCsv(`${slug}-교환권.csv`, header, rows)
  }

  const tableVars = {
    ['--ad-tcols' as string]: '130px minmax(0,1fr) 110px 96px 96px',
    ['--ad-tmin' as string]: '560px',
  }

  const RESULT_MARK = { ok: '✓', already: '!', none: '?', error: '×' } as const
  const RESULT_TONE = { ok: undefined, already: 'warn', none: 'mute', error: 'bad' } as const
  const RESULT_TITLE = {
    ok: '수령 처리했어요',
    already: '이미 수령한 코드예요',
    none: '없는 코드예요',
    error: '처리하지 못했어요',
  } as const

  return (
    <>
      <header className="ad-head">
        <div className="ad-head__row">
          <h1 className="ad-head__title">교환권 수령 확인</h1>
          <span className="ad-head__count tnum">
            발급 {guaranteed.length}건 · 수령 {done.length}건
          </span>
        </div>
        <p className="ad-head__desc">손님이 보여준 코드를 입력해 실물 수령을 처리해요.</p>
      </header>

      <div className="ad-stack">
        <div className="ad-stats">
          {[
            { label: '발급', value: guaranteed.length, attr: 'data-issued' },
            { label: '수령 완료', value: done.length, attr: 'data-redeemed' },
            { label: '아직 안 받음', value: left, attr: 'data-left' },
          ].map((k) => (
            <div key={k.label} className="ad-stat">
              <div className="ad-stat__label">{k.label}</div>
              <div className="ad-stat__row">
                <span className="ad-stat__value tnum" {...{ [k.attr]: '' }}>
                  {k.value}
                </span>
                <span className="ad-stat__unit">건</span>
              </div>
            </div>
          ))}
        </div>

        <form className="ad-card ad-card--form" onSubmit={(e) => void ask(e)} data-redeem-form>
          <div className="ad-card__title ad-card__title--lg">코드 확인하고 수령 처리</div>
          <p className="ad-card__desc">
            손님 폰에 뜬 코드를 그대로 입력하세요. 소문자·하이픈·공백은 알아서 맞춰져요.
          </p>

          <div className="ad-inline" style={{ marginTop: 16 }}>
            <input
              className="ad-input ad-input--entry"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="예: XK4T-9P2M"
              autoFocus
              autoCapitalize="characters"
              autoComplete="off"
              aria-label="교환코드"
              data-redeem-code
            />
            <button
              type="submit"
              className="ad-btn ad-btn--primary ad-btn--hero"
              disabled={!code.trim() || busy}
            >
              {busy ? '확인 중…' : '수령 처리'}
            </button>
          </div>
          <p className="ad-fine" style={{ marginTop: 10 }}>
            한 번 처리한 코드는 다시 쓸 수 없어요.
          </p>

          {result && (
            <div className="ad-result" data-kind={result.kind} data-redeem-result>
              <span className="ad-mark ad-mark--lg" data-tone={RESULT_TONE[result.kind]}>
                {RESULT_MARK[result.kind]}
              </span>
              <div style={{ minWidth: 0 }}>
                <div className="ad-result__title">{RESULT_TITLE[result.kind]}</div>
                <p className="ad-result__body">
                  {result.kind === 'ok' &&
                    `${result.code}${result.label ? ` · ${result.label}` : ''} 을 전달한 것으로 기록했어요. 아래 목록에서 표시를 확인할 수 있어요.`}
                  {result.kind === 'already' &&
                    `${result.code} 는 ${
                      result.at
                        ? new Date(result.at).toLocaleString('ko-KR', {
                            month: 'long',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '이전'
                    } 에 이미 처리됐어요. 같은 코드를 두 번 쓸 수 없어요.`}
                  {result.kind === 'none' &&
                    `“${result.code}” 로 발급된 교환권이 없어요. 손님 화면의 코드를 다시 확인해 주세요.`}
                  {result.kind === 'error' && result.message}
                </p>
              </div>
            </div>
          )}
        </form>

        <div className="ad-card">
          <div className="ad-card__head">
            <div className="ad-card__titleRow">
              <span className="ad-card__title">발급된 교환권</span>
              <span className="ad-card__num tnum">
                {shown.length} / {guaranteed.length}건
              </span>
            </div>
            <div className="ad-inline" style={{ flexWrap: 'nowrap' }}>
              <SearchBox value={query} onChange={setQuery} placeholder="코드·내용으로 찾기" />
              <button
                type="button"
                className="ad-btn ad-btn--line ad-btn--md"
                disabled={!guaranteed.length}
                onClick={download}
              >
                CSV 내려받기
              </button>
            </div>
          </div>
          <p className="ad-fine" style={{ marginBottom: 14 }}>
            손님 이름은 여기 안 나와요 — 카운터 화면은 계속 켜져 있으니까요. 응모하신 분들의 정보는
            ‘응모자’ 화면에서 보실 수 있어요.
          </p>

          {!rows ? (
            <div className="ad-skels">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="ad-skel ad-skel--row" />
              ))}
            </div>
          ) : guaranteed.length === 0 ? (
            <div className="ad-empty">
              <div className="ad-empty__title">아직 발급된 교환권이 없어요</div>
              <div className="ad-empty__sub">
                손님이 조건을 채우면 교환코드가 발급되고 여기 한 줄씩 쌓여요.
              </div>
            </div>
          ) : shown.length === 0 ? (
            <div className="ad-empty ad-empty--sm">
              <div className="ad-empty__title">찾는 교환권이 없어요</div>
              <div className="ad-empty__sub">검색어를 지우거나 다른 코드로 찾아보세요.</div>
            </div>
          ) : (
            <div className="ad-table" style={tableVars}>
              <div className="ad-table__inner" data-issued-list>
                <div className="ad-table__head">
                  <span>코드</span>
                  <span>내용</span>
                  <span>상태</span>
                  <span>발급</span>
                  <span>수령</span>
                </div>
                {shown.map((r) => (
                  <div
                    key={r.code}
                    className="ad-table__row"
                    data-done={r.redeemedAt ? '' : undefined}
                    data-fresh={fresh && r.code.replace(/-/g, '') === fresh ? '' : undefined}
                  >
                    <span className="ad-cell--code tnum">{r.code}</span>
                    <span className="ad-cell">{r.label}</span>
                    <span>
                      <span className="ad-tag" data-tone={r.redeemedAt ? 'on' : undefined}>
                        {r.redeemedAt ? '수령 완료' : '아직 안 받음'}
                      </span>
                    </span>
                    <span className="ad-cell--mute tnum">{when(r.createdAt)}</span>
                    <span className="ad-cell--mute tnum">{r.redeemedAt ? when(r.redeemedAt) : '—'}</span>
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
