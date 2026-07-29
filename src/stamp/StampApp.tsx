import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronLeft,
  CircleCheck,
  Clock,
  Heart,
  Info,
  KeyRound,
  Stamp as StampIcon,
  Star,
  TriangleAlert,
  Check,
} from 'lucide-react'

import { useSlotState } from '@/slot/SlotProvider'
import { useLivePreview } from '@/slot/preview'
import { stampDisplay, type StampCell, type StampDisplay } from '@/data/stamp'
import { fontStack, loadWebfont } from '@/data/fonts'
import { repo } from '@/lib/repo'
import { isLight } from '@/lib/color'
import { cssUrl } from '@/lib/image'
import { visitorId } from '@/lib/visitor'
import type { MyReward, StampSettings } from '@/lib/repo/types'
import type { Slot } from '@/types/slot'
import { AdminEntry } from '@/components/AdminEntry'
import { ServiceHeader } from '@/components/ServiceHeader'
import styles from './Stamp.module.css'

/**
 * 방문 스탬프 — 현장 암호로 도장을 찍고, 다 모으면 보상(공용 인프라)으로 넘어간다.
 * 화면은 claude.ai/design 시안 '방문 스탬프 방문자' 를 옮긴 것이다.
 *
 * **URL 로 안 가른다** — 암호를 치는 중에 뒤로가기가 입력을 날리는 게 더 나쁘다.
 */
export default function StampApp() {
  const state = useSlotState()
  if (state.status === 'loading') return <div className="app" aria-busy="true" />
  if (state.status === 'missing') return null
  return <Board slot={state.slot} />
}

/** 도장 모양 — 칸마다 다른 걸 써서 판이 단조롭지 않게 (시안) */
const MARKS = [StampIcon, Star, Heart]

type View = 'board' | 'code' | 'reward' | 'entered'

/**
 * 편집기 미리보기용 **표본 교환권** — 미리보기에서 도장을 진짜로 찍을 수는 없다
 * (현장 암호가 필요하고, 찍히면 기록이 남는다). 교환권·응모 화면의 색을 보려면 하나는 있어야 한다.
 */
const SAMPLE_REWARD: MyReward = {
  code: 'XK4T-9P2M',
  label: '스페셜 굿즈 1개',
  kind: 'guaranteed',
  redeemedAt: null,
  entered: false,
  createdAt: '2026-01-01T00:00:00.000Z',
}

function Board({ slot }: { slot: Slot }) {
  const { slug } = slot
  const display = useMemo(() => stampDisplay(slot), [slot])
  const subject = useMemo(() => visitorId(), [])

  const [settings, setSettings] = useState<StampSettings | null>(null)
  const [mine, setMine] = useState<string[]>([])
  const [reward, setReward] = useState<MyReward | null>(null)
  const [view, setView] = useState<View>('board')
  const [fresh, setFresh] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  /**
   * 편집기 미리보기가 고른 화면 — 있으면 **그 화면에 고정한다** (`src/owner/previewScreens.ts`).
   */
  const preview = useLivePreview()
  const pinned = (preview?.state as View | undefined) ?? null

  useEffect(() => {
    loadWebfont(display.font)
  }, [display.font])

  const load = useCallback(async () => {
    if (!repo.stamp.ready()) return
    const [s, m, r] = await Promise.all([
      repo.stamp.settings(slug).catch(() => null),
      repo.stamp.mine(slug, subject).catch(() => ({ stampIds: [], day: null })),
      repo.stamp.myReward(slug, subject).catch(() => null),
    ])
    if (s) setSettings(s)
    setMine(m.stampIds)
    setReward(r)
  }, [slug, subject])

  useEffect(() => {
    void load()
  }, [load])

  const cells = display.stamps
  const got = cells.filter((c) => mine.includes(c.id)).length
  const complete = cells.length > 0 && got >= cells.length

  const vars: React.CSSProperties = {
    ['--st-font' as string]: fontStack(display.font),
    ['--st-head' as string]: display.headText,
    ['--st-sub' as string]: display.subText,
    ['--st-btn' as string]: display.buttonColor,
    ['--st-btnFg' as string]: isLight(display.buttonColor) ? '#1f1f1f' : '#ffffff',
    ['--st-bg' as string]: display.bg,
    ['--st-stamp' as string]: display.stampColor,
  }

  async function submitCode(code: string) {
    setNotice(null)
    try {
      const r = await repo.stamp.checkin(slug, subject, code)
      // 틀린 암호·이미 찍은 칸은 예외가 아니라 값으로 온다 (0023 주석) — 입력칸에 그대로 머문다
      if (!r.ok || !r.stampId) {
        setNotice(r.message ?? '암호가 맞지 않아요')
        return false
      }
      const hit = r.stampId
      setFresh(hit)
      setMine((prev) => (prev.includes(hit) ? prev : [...prev, hit]))
      setView('board')
      if (r.complete) {
        await load()
        // 보상이 있으면 교환권/응모로, 없으면 완성 화면
        setTimeout(() => setView('reward'), 1100)
      }
      // 도장 애니메이션이 끝나면 표시를 뗀다 (다시 찍을 때 또 튀어야 하므로)
      setTimeout(() => setFresh(null), 1200)
      return true
    } catch (e) {
      setNotice(e instanceof Error ? e.message : '확인하지 못했어요')
      return false
    }
  }

  if (!repo.stamp.ready()) {
    return (
      <div className={`app ${styles.root}`} style={vars}>
        <div className={styles.empty}>지금은 스탬프를 쓸 수 없어요.</div>
      </div>
    )
  }

  const at = pinned ?? view
  /** 미리보기에서 보상 화면을 고르면 표본으로 그린다 (응모 폼은 kind='raffle' 로) */
  const shownReward =
    pinned === 'reward' && !reward
      ? { ...SAMPLE_REWARD, kind: settings?.rewardMode === 'raffle' ? ('raffle' as const) : ('guaranteed' as const) }
      : reward

  return (
    <div className={`app ${styles.root}`} style={vars}>
      <div className={styles.phone}>
        {at === 'code' ? (
          <CodeEntry
            display={display}
            onBack={() => {
              setNotice(null)
              setView('board')
            }}
            onSubmit={submitCode}
            notice={notice}
          />
        ) : at === 'reward' && shownReward ? (
          shownReward.kind === 'guaranteed' ? (
            <Ticket reward={shownReward} onBack={() => setView('board')} />
          ) : shownReward.entered ? (
            <Entered onBack={() => setView('board')} />
          ) : (
            <EntryForm
              settings={settings}
              reward={shownReward}
              onBack={() => setView('board')}
              onDone={async () => {
                await load()
                setView('entered')
              }}
            />
          )
        ) : at === 'entered' ? (
          <Entered onBack={() => setView('board')} />
        ) : complete && !reward ? (
          <Complete display={display} cells={cells} onBack={() => setView('board')} />
        ) : (
          <>
            {/**
              * 헤더는 롤페·소원나무와 같은 규칙이다 — 로고가 있으면 로고, 없으면 제목 텍스트.
              * **없는데도 타일을 그리면 "이미지가 깨졌다" 로 읽힌다** (실제로 그렇게 보였다).
              */}
            <ServiceHeader
              variant="tile"
              logo={display.logo}
              title={display.title}
              showTitle={display.showTitle}
              align={display.logoAlign}
              classes={{ head: styles.head, logo: styles.logoTile, title: styles.title }}
            />
            {display.showSubtitle && display.subtitle && <p className={styles.intro}>{display.subtitle}</p>}

            {cells.length === 0 ? (
              <div className={styles.empty}>
                아직 스탬프 칸이 준비되지 않았어요.
                <br />
                조금 뒤에 다시 와 주세요.
              </div>
            ) : (
              <div className={styles.boardWrap}>
                <div className={styles.boardTop}>
                  <div className={styles.boardLabel}>모은 도장</div>
                  <div className={`${styles.boardCount} ${styles.tnum}`}>
                    {got} / {cells.length}
                  </div>
                </div>
                <StampBoard cells={cells} mine={mine} fresh={fresh} />
              </div>
            )}

            <div className={styles.bottom}>
              {fresh ? (
                <div className={styles.toast} data-stamped>
                  <StampIcon size={24} strokeWidth={1.7} aria-hidden="true" />
                  <div>
                    <div className={styles.toastTitle}>도장을 찍었어요</div>
                    <div className={styles.toastSub}>
                      {complete
                        ? '판을 다 채웠어요!'
                        : `${cells.length - got}개만 더 모으면 완성이에요`}
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className={styles.notes}>
                    <div className={styles.note}>
                      <Info size={16} strokeWidth={1.7} aria-hidden="true" style={{ flex: 'none', marginTop: 1 }} />
                      <span>이 기기에만 저장돼요.</span>
                    </div>
                    {settings?.dailyReset && (
                      <div className={styles.note}>
                        <Clock size={16} strokeWidth={1.7} aria-hidden="true" style={{ flex: 'none', marginTop: 1 }} />
                        <span>오늘의 판이에요 · 자정에 초기화돼요.</span>
                      </div>
                    )}
                  </div>
                  {/*
                    * **막힌 이유를 버튼이 말한다.** 예전엔 `disabled` 만 걸어 둬서 방문자가
                    * 왜 안 눌리는지 모른 채 카페에서 계속 눌렀고, 그 문의는 주최자에게 갔다.
                    * 모의고사·포카와 같은 표현을 쓴다 — 버튼 글자를 "마감됐어요" 로 바꾼다.
                    * 칸이 아직 없을 때는 바로 위 빈 상태가 이미 이유를 말하고 있다.
                    */}
                  <button
                    type="button"
                    className={styles.cta}
                    onClick={() => (complete && reward ? setView('reward') : setView('code'))}
                    disabled={settings?.closed || cells.length === 0}
                    data-open-code
                  >
                    {!settings?.closed && <KeyRound size={19} strokeWidth={1.7} aria-hidden="true" />}
                    {settings?.closed
                      ? '마감됐어요'
                      : complete && reward
                        ? '내 선물 보기'
                        : display.codeLabel}
                  </button>
                </>
              )}
              <div className={styles.adminRow}>
                <AdminEntry slug={slug} className={styles.adminLink} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function StampBoard({
  cells,
  mine,
  fresh,
}: {
  cells: StampCell[]
  mine: string[]
  fresh: string | null
}) {
  // 4칸은 2열, 나머지는 3열 — 시안의 모양 (칸이 적을 때 휑하지 않게)
  const cols = cells.length <= 4 ? 2 : 3
  const big = cells.length <= 4
  const small = cells.length >= 9
  return (
    <ul
      className={styles.board}
      data-stamp-board
      style={{
        ['--cols' as string]: String(cols),
        ['--gap' as string]: `${small ? 8 : big ? 12 : 10}px`,
        ['--numSize' as string]: `${small ? 22 : big ? 34 : 28}px`,
        ['--numFont' as string]: small ? '12px' : '15px',
        ['--nameFont' as string]: small ? '9px' : '11px',
      }}
    >
      {cells.map((c, i) => {
        const done = mine.includes(c.id)
        const Mark = MARKS[i % MARKS.length]
        const tilt = [-8, 6, -5, 9, -7, 4, -9, 5, -6][i % 9]
        return (
          <li
            key={c.id}
            className={styles.cell}
            data-done={done || undefined}
            data-fresh={fresh === c.id || undefined}
            data-stamp-cell
            style={{ ['--tilt' as string]: `${tilt}deg` }}
          >
            {fresh === c.id && <span className={styles.ring} aria-hidden="true" />}
            {done ? (
              /**
                * 슬롯이 올린 도장 그림이 있으면 그걸, 없으면 내장 아이콘.
                * **`background-image` 다** — 슬롯 자산이라 길게 눌러 저장되면 안 된다 (CLAUDE.md).
                */
              <span
                className={styles.stamp}
                data-image={c.icon ? '' : undefined}
                style={c.icon ? { backgroundImage: cssUrl(c.icon) } : undefined}
                aria-hidden="true"
              >
                {!c.icon && <Mark size={small ? 34 : big ? 52 : 42} strokeWidth={1.5} />}
              </span>
            ) : (
              <span className={styles.num} aria-hidden="true">
                {i + 1}
              </span>
            )}
            <span className={styles.cellName}>{c.name}</span>
          </li>
        )
      })}
    </ul>
  )
}

const CODE_LEN = 4

function CodeEntry({
  display,
  onBack,
  onSubmit,
  notice,
}: {
  display: StampDisplay
  onBack: () => void
  onSubmit: (code: string) => Promise<boolean>
  notice: string | null
}) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [shake, setShake] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // 틀리면 흔들고 다시 칠 수 있게 비운다
  useEffect(() => {
    if (!notice) return
    setShake(true)
    const t = setTimeout(() => {
      setShake(false)
      setCode('')
    }, 500)
    return () => clearTimeout(t)
  }, [notice])

  async function go() {
    if (code.length < CODE_LEN || busy) return
    setBusy(true)
    try {
      await onSubmit(code)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className={styles.topBar}>
        <button type="button" className={styles.backBtn} onClick={onBack} aria-label="돌아가기">
          <ChevronLeft size={18} strokeWidth={1.7} aria-hidden="true" />
        </button>
      </div>

      <div className={styles.codeWrap}>
        <div className={styles.codeTitle}>참여하고 받은 암호를 입력해 주세요</div>
        {display.codeHint && <p className={styles.codeHint}>{display.codeHint}</p>}

        {/**
         * 칸은 보여주기용이고 **진짜 입력은 뒤에 숨은 `<input>` 하나**다.
         * 칸마다 input 을 두면 포커스가 튀고 붙여넣기·자동완성이 깨진다.
         */}
        <div className={styles.otp} data-error={shake || undefined} onClick={() => inputRef.current?.focus()}>
          <input
            ref={inputRef}
            className={styles.otpInput}
            value={code}
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="one-time-code"
            maxLength={CODE_LEN}
            aria-label="암호"
            data-code-input
            onChange={(e) => setCode(e.target.value.replace(/[^0-9A-Za-z]/g, '').toUpperCase().slice(0, CODE_LEN))}
            onKeyDown={(e) => e.key === 'Enter' && void go()}
          />
          {Array.from({ length: CODE_LEN }, (_, i) => (
            <div key={i} className={styles.otpCell} data-filled={!!code[i] || undefined} aria-hidden="true">
              {code[i] ?? ''}
            </div>
          ))}
        </div>

        {notice ? (
          <>
            <div className={styles.codeError}>
              <TriangleAlert size={17} strokeWidth={1.7} aria-hidden="true" />
              {notice}
            </div>
          </>
        ) : (
          <div className={styles.codeSmall}>대소문자는 구분하지 않아요</div>
        )}
      </div>

      <div className={styles.submitBar}>
        <button
          type="button"
          className={styles.cta}
          disabled={code.length < CODE_LEN || busy}
          onClick={() => void go()}
          data-code-submit
        >
          {busy ? '확인 중…' : notice ? '다시 확인' : '확인'}
        </button>
      </div>
    </>
  )
}

function Complete({
  display,
  cells,
  onBack,
}: {
  display: StampDisplay
  cells: StampCell[]
  onBack: () => void
}) {
  return (
    <>
      <div className={styles.topBar}>
        <button type="button" className={styles.backBtn} onClick={onBack} aria-label="돌아가기">
          <ChevronLeft size={18} strokeWidth={1.7} aria-hidden="true" />
        </button>
      </div>
      <div className={styles.doneWrap} data-complete>
        <div className={styles.doneKicker}>STAMP COMPLETE</div>
        <div className={styles.doneTitle}>판을 다 채웠어요</div>
        <div style={{ width: '100%', marginTop: 26 }}>
          <StampBoard cells={cells} mine={cells.map((c) => c.id)} fresh={null} />
        </div>
        <p className={styles.doneText}>
          끝까지 함께해 주셔서 고마워요.
          <br />
          오늘 하루 즐겁게 보내세요.
        </p>
      </div>
      <div style={{ height: 30 }} />
      {display.showTitle && <span className="sr-only">{display.title}</span>}
    </>
  )
}

function Ticket({ reward, onBack }: { reward: MyReward; onBack: () => void }) {
  const redeemed = !!reward.redeemedAt
  return (
    <>
      <div className={styles.topBar}>
        <button type="button" className={styles.backBtn} onClick={onBack} aria-label="돌아가기">
          <ChevronLeft size={18} strokeWidth={1.7} aria-hidden="true" />
        </button>
      </div>
      <div style={{ padding: '16px 22px 0', textAlign: 'center' }}>
        <div className={styles.doneKicker}>판을 다 채웠어요</div>
        <div style={{ marginTop: 6, fontSize: 20, fontWeight: 800 }}>{reward.label} 교환권</div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 22px' }}>
        <div className={styles.ticket} data-ticket>
          <div className={redeemed ? styles.ticketFaded : undefined}>
            <div className={styles.ticketLabel}>카운터에서 이 코드를 보여 주세요</div>
            <div className={styles.code} data-code>
              {reward.code}
            </div>
          </div>
          {redeemed && <div className={styles.redeemedMark}>수령 완료</div>}
          {!redeemed && (
            <>
              <div className={styles.ticketDivider} />
              <div className={styles.prize}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.6 }}>받는 선물</div>
                  <div className={styles.prizeName}>{reward.label}</div>
                </div>
              </div>
            </>
          )}
        </div>

        {redeemed && (
          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>
              {new Date(reward.redeemedAt!).toLocaleString('ko-KR', {
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
              에 수령했어요
            </div>
            <div className={styles.codeSmall}>이미 사용한 코드예요</div>
          </div>
        )}

        <div className={styles.note} style={{ marginTop: 16 }}>
          <Info size={16} strokeWidth={1.7} aria-hidden="true" style={{ flex: 'none', marginTop: 1 }} />
          <span>이 기기에만 저장돼요. 브라우저 기록을 지우면 교환권도 사라져요.</span>
        </div>
      </div>
      <div style={{ padding: '0 22px 30px' }} />
    </>
  )
}

function EntryForm({
  settings,
  reward,
  onBack,
  onDone,
}: {
  settings: StampSettings | null
  reward: MyReward
  onBack: () => void
  onDone: () => void | Promise<void>
}) {
  const f = settings?.entryFields ?? { handle: true, contact: false, address: false }
  const [nickname, setNickname] = useState('')
  const [handle, setHandle] = useState('')
  const [contact, setContact] = useState('')
  const [address, setAddress] = useState('')
  const [agree, setAgree] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const items = ['닉네임', f.handle && '트위터 아이디', f.contact && '연락처', f.address && '주소']
    .filter(Boolean)
    .join(', ')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!nickname.trim() || !agree || busy) return
    setBusy(true)
    setErr(null)
    try {
      await repo.stamp.enter(location.pathname.split('/')[1], reward.code, {
        nickname: nickname.trim(),
        handle: f.handle ? handle.trim().replace(/^@/, '') : undefined,
        contact: f.contact ? contact.trim() : undefined,
        address: f.address ? address.trim() : undefined,
      })
      await onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : '응모하지 못했어요')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'contents' }} data-entry-form>
      <div className={styles.topBar}>
        <button type="button" className={styles.backBtn} onClick={onBack} aria-label="돌아가기">
          <ChevronLeft size={18} strokeWidth={1.7} aria-hidden="true" />
        </button>
      </div>
      <div style={{ padding: '16px 22px 0' }}>
        <div className={styles.doneKicker}>판을 다 채웠어요</div>
        <h2 style={{ margin: '8px 0 0', fontSize: 24, fontWeight: 800, lineHeight: 1.35 }}>
          {reward.label} 응모하기
        </h2>
        <p className={styles.doneText} style={{ marginTop: 10 }}>
          당첨자는 이벤트가 끝난 뒤 주최자가 따로 발표해요.
        </p>
      </div>

      <div className={styles.form}>
        <div>
          <label className={styles.label} htmlFor="st-nick">
            닉네임 <span className={styles.req}>*</span>
          </label>
          <input
            id="st-nick"
            className={styles.input}
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="발표 때 쓸 닉네임"
            maxLength={30}
          />
        </div>

        {f.handle && (
          <div>
            <label className={styles.label} htmlFor="st-handle">
              트위터 아이디
            </label>
            <div className={styles.handleRow}>
              <span className={styles.at}>@</span>
              <input
                id="st-handle"
                className={styles.handleInput}
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="아이디"
                maxLength={30}
              />
            </div>
          </div>
        )}

        {f.contact && (
          <div>
            <label className={styles.label} htmlFor="st-contact">
              연락처
            </label>
            <input
              id="st-contact"
              className={styles.input}
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="연락 받으실 번호"
              inputMode="tel"
            />
          </div>
        )}

        {f.address && (
          <div>
            <label className={styles.label} htmlFor="st-addr">
              주소
            </label>
            <input
              id="st-addr"
              className={styles.input}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="받으실 주소"
            />
          </div>
        )}

        <div className={styles.privacy}>
          <div className={styles.privacyTitle}>개인정보 수집·이용 안내</div>
          <div className={styles.privacyBody}>
            수집 항목: {items} · 수집 목적: 당첨자 확인 및 안내 · 보관 기간: 이벤트 종료 후 14일 ·
            파기 시점: 보관 기간 만료 즉시 파기.
          </div>
          <label className={styles.agree} data-on={agree || undefined}>
            <input
              type="checkbox"
              className="sr-only"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
            />
            <span className={styles.agreeBox} aria-hidden="true">
              {agree && <Check size={13} strokeWidth={2.4} />}
            </span>
            위 내용에 동의해요
          </label>
        </div>

        {err && <p className={styles.notice}>{err}</p>}
      </div>

      <div className={styles.submitBar}>
        <button type="submit" className={styles.cta} disabled={!nickname.trim() || !agree || busy} data-entry-submit>
          {busy ? '보내는 중…' : '응모하기'}
        </button>
      </div>
    </form>
  )
}

function Entered({ onBack }: { onBack: () => void }) {
  return (
    <div className={styles.doneWrap} data-entered>
      <div className={styles.logoTile} style={{ width: 66, height: 66, borderRadius: 9999 }}>
        <CircleCheck size={30} strokeWidth={1.7} aria-hidden="true" />
      </div>
      <div style={{ marginTop: 20, fontSize: 22, fontWeight: 800 }}>응모했어요</div>
      <p className={styles.doneText} style={{ marginTop: 10 }}>
        당첨자는 이벤트가 끝난 뒤 주최자가 따로 발표해요.
        <br />
        응모는 한 번만 할 수 있어요.
      </p>
      <button type="button" className={styles.ghostBtn} onClick={onBack}>
        스탬프판 다시 보기
      </button>
    </div>
  )
}
