import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Check, Send } from 'lucide-react'

import { useSlotState } from '@/slot/SlotProvider'
import { useLivePreview } from '@/slot/preview'
import { cheerDisplay, type CheerDisplay } from '@/data/cheer'
import { fontStack, loadWebfont } from '@/data/fonts'
import { repo } from '@/lib/repo'
import { cssUrl } from '@/lib/image'
import { readList, appendItem } from '@/lib/locker'
import type { CheerSettings, RollingMessage } from '@/lib/repo/types'
import type { Slot } from '@/types/slot'
import { Stage } from './Stage'
import { ServiceHeader } from '@/components/ServiceHeader'
import styles from './Cheer.module.css'
import { useT } from '@/i18n'
import { useLocalizedDisplay } from '@/i18n/display'

/**
 * 영상회 라이브 응원 — 화면 셋이 한 파일 아래 있다.
 *
 *   `/{slug}`          한마디 입력 (방문자 폰)
 *   `/{slug}/show`     **상영 화면** — 제어판이 시키는 대로 오버레이 ↔ 엔딩크레딧으로 바뀐다
 *   `/{slug}/overlay`  오버레이만 (고정)
 *   `/{slug}/credits`  엔딩크레딧만 (고정)
 *
 * **`/show` 를 쓰는 게 기본이다.** 오버레이와 크레딧이 다른 주소면 상영 중에 OBS 소스나 창을
 * 바꿔야 한다 — 한 주소가 상태에 따라 바뀌면 그 손질이 사라진다. 제어는 주최자 폰
 * (`/{slug}/staff`) 이 하고, 이 화면은 실시간으로 받는다 (0031).
 *
 * **URL 로 가른다** (롤페 `/write` 와 같은 방식). 상영 화면은 노트북에서 주소로 여는 것이고,
 * 방문자 폰의 입력과 섞이면 안 되기 때문이다 — 상태로 가르면 새로고침에 사라진다.
 *
 * 한마디는 **롤링페이퍼 테이블**에 산다 (`repo.rolling`) — 0029 주석.
 */
export default function CheerApp() {
  const state = useSlotState()
  if (state.status === 'loading') return <div className="app" aria-busy="true" />
  if (state.status === 'missing') return null
  return <Cheer slot={state.slot} />
}

/** 이 폰이 남긴 한마디 — 1인 입력 수를 세는 데 쓴다 (서버가 아니라 이 기기 기준이다) */
interface Sent {
  id: string
  at: string
}

function Cheer({ slot }: { slot: Slot }) {
  const { slug } = slot
  const rawDisplay = useMemo(() => cheerDisplay(slot), [slot])
  /** 기본 문구는 사전에서 번역되고, 주최자가 쓴 문구는 원문 그대로 (src/i18n/display.ts) */
  const display = useLocalizedDisplay(rawDisplay)
  const { pathname } = useLocation()
  const preview = useLivePreview()

  const [settings, setSettings] = useState<CheerSettings | null>(null)
  const [messages, setMessages] = useState<RollingMessage[]>([])

  useEffect(() => {
    loadWebfont(display.font)
  }, [display.font])

  const load = useCallback(async () => {
    const [s, list] = await Promise.all([
      repo.cheer.settings(slug).catch(() => null),
      repo.rolling.list(slug).catch(() => []),
    ])
    if (s) setSettings(s)
    setMessages(list)
  }, [slug])

  useEffect(() => {
    void load()
  }, [load])

  /**
   * 상영 화면은 **계속 켜져 있다.** 새 한마디가 오면 그 자리에서 받아야 하므로 실시간을 건다
   * (롤페 벽과 같은 규약 — 무엇이 바뀌었는지는 안 보고 다시 읽는다).
   */
  const showing =
    pathname.endsWith('/overlay') || pathname.endsWith('/credits') || pathname.endsWith('/show')
  useEffect(() => {
    if (!showing) return
    const offMessages = repo.rolling.watch(slug, () => void load())
    const offShow = repo.cheer.watch(slug, () => void load())
    /**
     * 실시간이 끊겨도 상영이 멈추면 안 된다 — 5초마다 한 번 더 읽는다.
     * (행 하나짜리 조회라 부담이 없고, 카페 와이파이에서 실시간은 실제로 끊긴다.)
     */
    const poll = window.setInterval(() => void load(), 5000)
    return () => {
      offMessages()
      offShow()
      clearInterval(poll)
    }
  }, [showing, slug, load])

  const vars = {
    ['--ch-font' as string]: fontStack(display.font),
    ['--ch-bg' as string]: display.bg,
    ['--ch-head' as string]: display.headText,
    ['--ch-sub' as string]: display.subText,
    ['--ch-btn' as string]: display.buttonColor,
    ['--ch-ink' as string]: display.bubbleInk,
    ['--ch-paper' as string]: display.bubblePaper,
    ['--ch-bubble-border' as string]: display.bubbleBorder || display.bubbleInk,
    ['--ch-bubble-border-w' as string]: `${display.bubbleBorderWidth}px`,
    ['--ch-credits-bg' as string]: display.creditsBg,
    ['--ch-credits-text' as string]: display.creditsText,
  }

  /**
   * 지금 그릴 화면.
   *  · `/overlay`·`/credits` — 주소가 곧 화면이다 (고정)
   *  · `/show` — **제어판이 정한다** (idle/live/hidden/credits)
   */
  const at = preview?.state
    ? preview.state
    : pathname.endsWith('/overlay')
      ? 'overlay'
      : pathname.endsWith('/credits')
        ? 'credits'
        : pathname.endsWith('/show')
          ? showScreen(settings)
          : 'write'

  /** 미리보기에서는 한마디가 없을 수 있다 — 그러면 상영 화면에 아무것도 안 뜬다 */
  const shown = preview && messages.length === 0 ? SAMPLE : messages

  /** 상영 전·감춤 — 투명한 빈 화면. OBS 소스를 켜둔 채로 아무것도 안 뜨는 상태다 */
  if (at === 'idle') return <ShowShell slug={slug} settings={settings} live={showing} vars={vars} />

  if (at === 'overlay' || at === 'credits') {
    return (
      <ShowShell slug={slug} settings={settings} live={showing} vars={vars}>
        <Stage kind={at} display={display} settings={settings} messages={shown} vars={vars} />
      </ShowShell>
    )
  }

  return <Write slot={slot} display={display} settings={settings} vars={vars} onSent={() => void load()} />
}

/**
 * 상영 화면 껍데기 — **자동 크레딧**과 **단축키**가 여기 산다.
 *
 * 자동 크레딧: 영상 길이를 적어둔 슬롯에서, 시작 시각 + 길이가 지나면 10초 카운트다운 뒤
 * 크레딧으로 넘어간다. **취소할 수 있다** — 무대 인사가 길어지는 날이 있고, 그때 크레딧이
 * 혼자 올라가면 사고다. (기준은 여전히 '시작' 을 누른 시각이라 오차는 그때 한 번뿐이다.)
 *
 * 단축키: 노트북에서 직접 쓸 때를 위한 폴백이다 — 스페이스(감추기 토글) · C(크레딧).
 * 제어판(폰)이 주 경로고 이건 보험이라, 화면에 크게 안내하지 않는다.
 */
function ShowShell({
  slug,
  settings,
  live,
  vars,
  children,
}: {
  slug: string
  settings: CheerSettings | null
  /** `/show` 처럼 제어를 따르는 화면일 때만 자동·단축키가 산다 (고정 주소에선 안 건다) */
  live: boolean
  vars: React.CSSProperties
  children?: React.ReactNode
}) {
  const [countdown, setCountdown] = useState<number | null>(null)
  const [cancelled, setCancelled] = useState(false)

  const state = settings?.showState ?? 'idle'
  const started = settings?.startedAt ? new Date(settings.startedAt).getTime() : null
  const runtime = settings?.runtimeSec ?? 0

  /** 영상이 끝날 때가 되면 카운트다운을 시작한다 (한 번만) */
  useEffect(() => {
    if (!live || cancelled) return
    if (state !== 'live' && state !== 'hidden') return
    if (!started || runtime <= 0) return
    const tick = () => {
      const past = (Date.now() - started) / 1000 - runtime
      if (past >= 0 && countdown === null) setCountdown(10)
    }
    const t = window.setInterval(tick, 1000)
    tick()
    return () => clearInterval(t)
  }, [live, cancelled, state, started, runtime, countdown])

  /** 카운트다운 — 0 이 되면 크레딧으로 (제어판이 아니라 화면이 스스로 바꾼다) */
  useEffect(() => {
    if (countdown === null) return
    if (countdown <= 0) {
      setCountdown(null)
      void repo.cheer.setShow(slug, 'credits').catch(() => {})
      return
    }
    const t = window.setTimeout(() => setCountdown((n) => (n === null ? null : n - 1)), 1000)
    return () => clearTimeout(t)
  }, [countdown, slug])

  useEffect(() => {
    if (!live) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault()
        void repo.cheer.setShow(slug, state === 'hidden' ? 'live' : 'hidden').catch(() => {})
      }
      if (e.key.toLowerCase() === 'c') void repo.cheer.setShow(slug, 'credits').catch(() => {})
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [live, slug, state])

  return (
    <>
      {children ?? <div className={styles.overlay} style={vars} data-idle />}
      {countdown !== null && (
        <div className={styles.countdown} style={vars} data-countdown>
          <span>{countdown}초 뒤 엔딩크레딧</span>
          <button
            type="button"
            onClick={() => {
              setCountdown(null)
              setCancelled(true)
            }}
          >
            취소
          </button>
        </div>
      )}
    </>
  )
}

/**
 * 제어 상태 → 그릴 화면.
 * `hidden` 은 **아무것도 안 그린다** (투명한 빈 화면) — 영상만 보이게 하는 게 목적이다.
 */
function showScreen(s: CheerSettings | null): 'overlay' | 'credits' | 'idle' {
  if (!s || s.showState === 'idle') return 'idle'
  if (s.showState === 'credits') return 'credits'
  if (s.showState === 'hidden') return 'idle'
  return 'overlay'
}

/** 미리보기 표본 — 편집기에서 색을 고를 때 빈 화면을 보지 않게 */
const SAMPLE: RollingMessage[] = [
  '오늘 너무 기다렸어요',
  '최고의 무대!',
  '행복한 하루 되세요',
  '우리 계속 함께해요',
  '사랑해요',
  '영상회 최고',
].map((body, i) => ({
  id: `preview-${i}`,
  nickname: ['리안', '', '별하나', '팬1', '', '노을'][i] ?? '',
  body,
  color: '',
  font: '',
  hidden: false,
  createdAt: '2026-01-01T00:00:00.000Z',
}))

/* ── 방문자 폰: 한마디 입력 ───────────────────────── */

function Write({
  slot,
  display,
  settings,
  vars,
  onSent,
}: {
  slot: Slot
  display: CheerDisplay
  settings: CheerSettings | null
  vars: React.CSSProperties
  onSent: () => void
}) {
  const t = useT()
  const { slug } = slot
  const [body, setBody] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [sent, setSent] = useState<Sent[]>(() => readList<Sent>('cheer', slug))

  const max = settings?.maxLength ?? 40
  const left = (settings?.perPerson ?? 3) - sent.length
  const closed = settings?.closed ?? false

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (busy || !body.trim()) return
    setBusy(true)
    setError(null)
    try {
      /**
       * **체험용 슬롯은 서버로 안 보낸다** (`slot.demo` — 0030).
       * 랜딩에서 링크하는 공개 주소라 남긴 글이 그대로 남으면 다음 사람이 남의 낙서를 본다.
       * 대신 보낸 것처럼 보여주고, 화면에 체험용이라고 적는다.
       */
      if (!slot.demo) {
        await repo.rolling.add(slug, {
          nickname: name.trim(),
          body: body.trim().slice(0, max),
          color: '',
          font: '',
        })
      }
      /**
       * **이 폰에만 센다.** 서버는 누가 몇 개를 남겼는지 모른다(익명이다) — 지우면 초기화되는
       * 완화 장치일 뿐이라, 화면에도 "이 기기 기준" 이라고 적지 않고 조용히 센다.
       */
      appendItem('cheer', slug, { id: crypto.randomUUID(), at: new Date().toISOString() }, 50)
      setSent(readList<Sent>('cheer', slug))
      setBody('')
      setDone(true)
      onSent()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('보내지 못했어요'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className={`app ${styles.root}`}
      style={{
        ...vars,
        // 배경 이미지는 **올린 그대로** 그린다 (다른 서비스와 같은 규칙 — BackgroundField)
        ...(display.bgImage
          ? {
              backgroundImage: cssUrl(display.bgImage),
              backgroundRepeat: display.bgRepeat ? 'repeat' : 'no-repeat',
              backgroundSize: display.bgRepeat ? 'auto' : 'cover',
              backgroundPosition: 'center',
            }
          : {}),
      }}
    >
      <div className={styles.phone}>
        <ServiceHeader
          variant="mark"
          logo={display.logo}
          title={display.title}
          showTitle={display.showTitle}
          classes={{ head: styles.head, logo: styles.logo, title: styles.title }}
          below={
            display.showSubtitle && display.subtitle ? (
              <p className={styles.subtitle}>{display.subtitle}</p>
            ) : null
          }
        />

        {done ? (
          <div className={styles.doneBox} data-done>
            <span className={styles.doneMark} aria-hidden="true">
              <Check size={30} strokeWidth={2.4} />
            </span>
            <div className={styles.doneText}>{t(display.thanks)}</div>
            {slot.demo && (
              <p className={styles.demoNote}>{t('체험용 페이지라 남긴 한마디는 저장되지 않아요')}</p>
            )}
            {left > 0 && !closed && (
              <button type="button" className={styles.again} onClick={() => setDone(false)} data-again>
                한마디 더 남기기 ({left}회 남음)
              </button>
            )}
          </div>
        ) : closed ? (
          <div className={styles.doneBox}>
            <div className={styles.doneText}>{t('지금은 한마디를 받지 않아요')}</div>
          </div>
        ) : left <= 0 ? (
          <div className={styles.doneBox}>
            <div className={styles.doneText}>{t('이 기기에서 남길 수 있는 만큼 다 남기셨어요')}</div>
          </div>
        ) : (
          <form className={styles.form} onSubmit={(e) => void send(e)}>
            <textarea
              className={styles.body}
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, max))}
              placeholder={display.prompt}
              rows={3}
              maxLength={max}
              aria-label={t('한마디')}
              data-cheer-body
            />
            <div className={styles.count}>
              {body.length} / {max}
            </div>
            <input
              className={styles.name}
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 12))}
              placeholder={display.namePrompt}
              aria-label={t('이름')}
              data-cheer-name
            />
            <button type="submit" className={styles.send} disabled={busy || !body.trim()} data-cheer-send>
              <Send size={17} strokeWidth={2} aria-hidden="true" />
              {busy ? t('보내는 중…') : t(display.postLabel)}
            </button>
            {error && <p className={styles.error}>{error}</p>}
          </form>
        )}
      </div>
    </div>
  )
}
