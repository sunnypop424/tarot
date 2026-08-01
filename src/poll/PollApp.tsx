import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, ChevronLeft, CircleCheck, Crown, Heart, Image as ImageIcon } from 'lucide-react'

import { useSlotState } from '@/slot/SlotProvider'
import { useLivePreview } from '@/slot/preview'
import { pollDisplay, type PollDisplay } from '@/data/poll'
import { fontStack, loadWebfont } from '@/data/fonts'
import { repo } from '@/lib/repo'
import { isLight } from '@/lib/color'
import { cssUrl } from '@/lib/image'
import { visitorId } from '@/lib/visitor'
import type { MyVote, Poll } from '@/lib/repo/types'
import type { Slot } from '@/types/slot'
import { AdminEntry } from '@/components/AdminEntry'
import { ServiceHeader } from '@/components/ServiceHeader'
import styles from './Poll.module.css'
import { useT, useLocale } from '@/i18n'
import { useLocalizedDisplay } from '@/i18n/display'

/**
 * 실시간 투표 — 방문자가 자기 폰으로 찍고 결과가 그 자리에서 차오른다.
 * 화면은 claude.ai/design 시안 '실시간 투표 방문자' 를 옮긴 것이다.
 *
 * **URL 로 안 가른다.** 목록 ↔ 설문을 상태로 오간다 — 투표 도중 뒤로가기가 고른 걸 날리는
 * 게 더 나쁘고, 설문 하나하나에 주소를 주면 방문자가 그 주소를 공유해 마감된 설문으로 들어온다.
 */
export default function PollApp() {
  const state = useSlotState()
  if (state.status === 'loading') return <div className="app" aria-busy="true" />
  if (state.status === 'missing') return null
  return <PollHome slot={state.slot} />
}

/**
 * 편집기 미리보기용 **표본 설문** — 미리보기에서 진짜로 투표할 수는 없다(표가 쌓인다).
 * 설문을 아직 안 만든 슬롯에서도 투표·결과 화면의 색을 볼 수 있어야 한다.
 */
const SAMPLE_POLL: Poll = {
  id: 'preview',
  title: '오늘의 최애 컨셉은?',
  kind: 'single',
  maxPick: 1,
  closed: false,
  hidden: false,
  order: 1,
  options: [
    { id: 'a', order: 1, label: '청량', votes: 42 },
    { id: 'b', order: 2, label: '청순', votes: 31 },
    { id: 'c', order: 3, label: '걸크러시', votes: 27 },
  ],
}

function PollHome({ slot }: { slot: Slot }) {
  const t = useT()
  const { slug } = slot
  const rawDisplay = useMemo(() => pollDisplay(slot), [slot])
  /** 기본 문구는 사전에서 번역되고, 주최자가 쓴 문구는 원문 그대로 (src/i18n/display.ts) */
  const display = useLocalizedDisplay(rawDisplay)
  const [polls, setPolls] = useState<Poll[] | null>(null)
  const [mine, setMine] = useState<MyVote[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const subject = useMemo(() => visitorId(), [])
  /**
   * 편집기 미리보기가 고른 화면 — `list`(목록) · `vote`(투표) · `result`(결과).
   * 있으면 그 화면에 고정한다 (`src/owner/previewScreens.ts`).
   */
  const preview = useLivePreview()
  const pinned = preview?.state ?? null

  useEffect(() => {
    loadWebfont(display.font)
  }, [display.font])

  const load = useCallback(() => {
    void repo.poll
      .list(slug)
      .then(setPolls)
      .catch(() => setPolls([]))
    void repo.poll
      .mine(slug, subject)
      .then(setMine)
      .catch(() => {})
  }, [slug, subject])

  useEffect(() => {
    load()
    // 어댑터가 500ms 로 묶어준다 — 초당 수십 표여도 리로드 폭풍이 안 난다
    const stop = repo.poll.watch(slug, load)
    return stop
  }, [slug, load])

  const vars: React.CSSProperties = {
    ['--pl-font' as string]: fontStack(display.font),
    ['--pl-head' as string]: display.headText,
    ['--pl-sub' as string]: display.subText,
    ['--pl-btn' as string]: display.buttonColor,
    ['--pl-btnFg' as string]: isLight(display.buttonColor) ? '#1f1f1f' : '#ffffff',
    ['--pl-bg' as string]: display.bg,
    ['--pl-bar' as string]: display.barColor,
  }

  /**
   * 미리보기: 투표·결과는 설문 하나를 연 화면이라, 첫 설문(없으면 표본)을 대신 연다.
   * 결과 화면은 "이미 찍은 사람" 이 보는 화면이므로 내 표도 하나 지어 넣는다.
   */
  const previewPoll = pinned === 'vote' || pinned === 'result' ? (polls?.[0] ?? SAMPLE_POLL) : null
  const open = previewPoll ?? polls?.find((p) => p.id === openId) ?? null
  const myVote = (id: string) =>
    pinned === 'result'
      ? { pollId: id, optionIds: [open?.options[0]?.id ?? ''], at: '2026-01-01T00:00:00.000Z' }
      : pinned === 'vote'
        ? undefined
        : mine.find((m) => m.pollId === id)

  async function submit(poll: Poll, picked: string[]) {
    setNotice(null)
    try {
      const next = await repo.poll.vote(slug, poll.id, picked, subject)
      setPolls(next)
      setMine(await repo.poll.mine(slug, subject))
    } catch (e) {
      // 서버가 문장으로 이유를 준다 ('이미 투표하셨어요' 등)
      setNotice(e instanceof Error ? e.message : t('투표하지 못했어요.'))
    }
  }

  return (
    <div className={`app ${styles.root}`} style={vars}>
      <div className={styles.phone}>
        {open ? (
          <PollView
            poll={open}
            display={display}
            mine={myVote(open.id)}
            index={(polls ?? []).findIndex((p) => p.id === open.id) + 1}
            total={(polls ?? []).length}
            onBack={() => {
              setOpenId(null)
              setNotice(null)
            }}
            onSubmit={(picked) => void submit(open, picked)}
            notice={notice}
          />
        ) : (
          <>
            <ServiceHeader
              variant="tile"
              logo={display.logo}
              title={display.title}
              showTitle={display.showTitle}
              align={display.logoAlign}
              classes={{ head: styles.head, logo: styles.logoTile, title: styles.title }}
            />
            {display.showSubtitle && display.subtitle && <p className={styles.intro}>{display.subtitle}</p>}

            {polls === null ? (
              <div className={styles.empty} aria-busy="true" />
            ) : polls.length === 0 ? (
              <div className={styles.empty}>
                아직 열린 설문이 없어요.
                <br />
                조금 뒤에 다시 와 주세요.
              </div>
            ) : (
              <ul className={styles.list} data-poll-list>
                {polls.map((p) => {
                  const voted = !!myVote(p.id)
                  const total = p.options.reduce((n, o) => n + o.votes, 0)
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        className={styles.card}
                        data-closed={p.closed || undefined}
                        data-poll-card
                        onClick={() => !p.closed && setOpenId(p.id)}
                        disabled={p.closed && !voted}
                      >
                        <div className={styles.cardTop}>
                          <span className={styles.badge}>{p.closed ? t('마감') : t('진행 중')}</span>
                          <span className={styles.meta}>
                            {p.kind === 'multi' ? t('최대 {n}개', { n: p.maxPick }) : t('하나만 고르기')}
                          </span>
                        </div>
                        <div className={styles.cardQ}>{p.title}</div>
                        <div className={styles.cardFoot}>
                          <span className={`${styles.cardCount} ${styles.tnum}`}>
                            {display.showCount ? t('{n}표', { n: total.toLocaleString() }) : ''}
                          </span>
                          <span className={styles.cardCta} data-done={voted || undefined}>
                            {p.closed ? t('마감됨') : voted ? t('참여함 · 결과 보기') : display.voteLabel}
                          </span>
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}

            <div className={styles.adminRow}>
              <AdminEntry slug={slug} className={styles.adminLink} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/** 결과를 지금 보여줄지 — 슬롯이 정한 규칙 (`resultMode`) */
function showResult(display: PollDisplay, poll: Poll, voted: boolean): boolean {
  if (poll.closed) return true
  if (display.resultMode === 'live') return true
  if (display.resultMode === 'afterVote') return voted
  return false
}

function PollView({
  poll,
  display,
  mine,
  index,
  total,
  onBack,
  onSubmit,
  notice,
}: {
  poll: Poll
  display: PollDisplay
  mine?: MyVote
  index: number
  total: number
  onBack: () => void
  onSubmit: (picked: string[]) => void
  notice: string | null
}) {
  const t = useT()
  const loc = useLocale()
  const [picked, setPicked] = useState<string[]>([])
  const voted = !!mine
  const result = showResult(display, poll, voted)
  const imageMode = poll.options.some((o) => o.image)

  const toggle = (id: string) => {
    setPicked((prev) => {
      if (poll.kind === 'single') return prev[0] === id ? [] : [id]
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      // 정원을 넘으면 안 고른다 — 조용히 무시하지 않고 개수 표시가 그대로 있어 알아챈다
      return prev.length >= poll.maxPick ? prev : [...prev, id]
    })
  }

  const sum = poll.options.reduce((n, o) => n + o.votes, 0)
  const ranked = [...poll.options].sort((a, b) => b.votes - a.votes)
  const topId = ranked[0]?.votes ? ranked[0].id : null

  return (
    <>
      <div className={styles.topBar}>
        <button type="button" className={styles.backBtn} onClick={onBack} aria-label={t('목록으로')}>
          <ChevronLeft size={18} strokeWidth={1.7} aria-hidden="true" />
        </button>
        {result ? (
          !poll.closed && (
            <span className={styles.livePill}>
              <span className={styles.liveDot} aria-hidden="true" />
              실시간 갱신 중
            </span>
          )
        ) : (
          <span className={styles.step}>
            {index} / {total}번째 설문
          </span>
        )}
      </div>

      {voted && (
        <div className={styles.doneBox} data-already>
          <CircleCheck size={18} strokeWidth={1.7} aria-hidden="true" style={{ flex: 'none', marginTop: 1 }} />
          <div>
            <div className={styles.doneTitle}>{t('이미 참여한 설문이에요')}</div>
            <div className={styles.doneSub}>
              {new Date(mine.at).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}에
              투표했어요 · 결과만 볼 수 있어요
            </div>
          </div>
        </div>
      )}

      <div className={styles.qWrap}>
        <h2 className={styles.q}>{poll.title}</h2>
        {!result && (
          <div className={styles.qHint}>
            <span>
              {poll.kind === 'multi' ? t('{n}개까지 고를 수 있어요', { n: poll.maxPick }) : t('하나만 고를 수 있어요')}
            </span>
            {poll.kind === 'multi' && (
              <span className={`${styles.pickCount} ${styles.tnum}`}>
                {picked.length} / {poll.maxPick}
              </span>
            )}
          </div>
        )}
        {result && (
          <div className={`${styles.total} ${styles.tnum}`}>
            {display.showCount ? t('총 {n}표', { n: sum.toLocaleString() }) : t('표 수는 공개하지 않아요')}
          </div>
        )}
      </div>

      {result ? (
        <ul className={styles.results} data-poll-results>
          {ranked.map((o) => {
            const pct = sum ? Math.round((o.votes / sum) * 100) : 0
            const isMine = mine?.optionIds.includes(o.id)
            return (
              <li
                key={o.id}
                className={styles.resItem}
                data-top={o.id === topId || undefined}
                data-mine={isMine || undefined}
              >
                <div className={styles.resRow} data-mine={isMine || undefined} data-top={o.id === topId || undefined}>
                  {o.id === topId && <Crown size={17} strokeWidth={1.7} aria-hidden="true" />}
                  <span className={styles.resLabel}>{o.label}</span>
                  {isMine && <span className={styles.mineTag}>{t('내 선택')}</span>}
                  <span className={`${styles.pct} ${styles.tnum}`}>{pct}%</span>
                </div>
                {display.chartStyle === 'heart' ? (
                  <div className={styles.hearts} aria-hidden="true">
                    {Array.from({ length: 10 }, (_, i) => (
                      <span key={i} className={styles.heart} data-on={i < Math.round(pct / 10) || undefined}>
                        <Heart size={22} strokeWidth={1.7} fill="currentColor" />
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className={styles.track}>
                    <div className={styles.bar} style={{ width: `${pct}%` }} />
                  </div>
                )}
                {display.showCount && (
                  <div className={`${styles.votes} ${styles.tnum}`}>{t('{n}표', { n: o.votes.toLocaleString(loc) })}</div>
                )}
              </li>
            )
          })}
        </ul>
      ) : imageMode ? (
        <ul className={styles.grid} data-poll-options>
          {poll.options.map((o) => {
            const on = picked.includes(o.id)
            return (
              <li key={o.id}>
                <button
                  type="button"
                  className={styles.imgBtn}
                  data-on={on || undefined}
                  aria-pressed={on}
                  onClick={() => toggle(o.id)}
                >
                  <span
                    className={styles.thumb}
                    style={o.image ? { backgroundImage: cssUrl(o.image) } : undefined}
                  >
                    {!o.image && <ImageIcon size={22} strokeWidth={1.7} aria-hidden="true" />}
                    {on && (
                      <span className={styles.thumbCheck} aria-hidden="true">
                        <Check size={14} strokeWidth={2.2} />
                      </span>
                    )}
                  </span>
                  <span className={styles.imgLabel}>{o.label}</span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <ul className={styles.options} data-poll-options>
          {poll.options.map((o) => {
            const on = picked.includes(o.id)
            return (
              <li key={o.id}>
                <button
                  type="button"
                  className={styles.opt}
                  data-on={on || undefined}
                  aria-pressed={on}
                  onClick={() => toggle(o.id)}
                >
                  <span className={styles.optDot} aria-hidden="true">
                    {on && <Check size={14} strokeWidth={2.4} />}
                  </span>
                  <span className={styles.optLabel}>{o.label}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {notice && (
        <p className={styles.notice} role="status" data-notice>
          {notice}
        </p>
      )}

      {!result && !poll.closed && (
        <div className={styles.submitBar}>
          <button
            type="button"
            className={styles.submit}
            disabled={picked.length === 0}
            onClick={() => onSubmit(picked)}
            data-submit
          >
            {display.voteLabel}
          </button>
        </div>
      )}
    </>
  )
}
