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
import styles from './Cheer.module.css'

/**
 * 영상회 라이브 응원 — 화면 셋이 한 파일 아래 있다.
 *
 *   `/{slug}`          한마디 입력 (손님 폰)
 *   `/{slug}/overlay`  **배경이 투명한** 상영 오버레이 — OBS 브라우저 소스로 영상 위에 얹는다
 *   `/{slug}/credits`  엔딩크레딧
 *
 * **URL 로 가른다** (롤페 `/write` 와 같은 방식). 상영 화면은 노트북에서 주소로 여는 것이고,
 * 손님 폰의 입력과 섞이면 안 되기 때문이다 — 상태로 가르면 새로고침에 사라진다.
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
  const display = useMemo(() => cheerDisplay(slot), [slot])
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
  const showing = pathname.endsWith('/overlay') || pathname.endsWith('/credits')
  useEffect(() => {
    if (!showing) return
    return repo.rolling.watch(slug, () => void load())
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

  const at = preview?.state || (pathname.endsWith('/overlay') ? 'overlay' : pathname.endsWith('/credits') ? 'credits' : 'write')

  /** 미리보기에서는 한마디가 없을 수 있다 — 그러면 상영 화면에 아무것도 안 뜬다 */
  const shown = preview && messages.length === 0 ? SAMPLE : messages

  if (at === 'overlay') {
    return (
      <Stage
        kind="overlay"
        display={display}
        settings={settings}
        messages={shown}
        vars={vars}
      />
    )
  }
  if (at === 'credits') {
    return (
      <Stage
        kind="credits"
        display={display}
        settings={settings}
        messages={shown}
        vars={vars}
      />
    )
  }

  return <Write slot={slot} display={display} settings={settings} vars={vars} onSent={() => void load()} />
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
  nickname: ['디노', '', '민지', '팬1', '', '해린'][i] ?? '',
  body,
  color: '',
  font: '',
  hidden: false,
  createdAt: '2026-01-01T00:00:00.000Z',
}))

/* ── 손님 폰: 한마디 입력 ───────────────────────── */

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
      setError(e instanceof Error ? e.message : '보내지 못했어요')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`app ${styles.root}`} style={vars}>
      <div className={styles.phone}>
        <header className={styles.head}>
          {display.logo && (
            <div
              className={styles.logo}
              style={{ backgroundImage: cssUrl(display.logo) }}
              role="img"
              aria-label={display.title}
            />
          )}
          {display.showTitle && <h1 className={styles.title}>{display.title}</h1>}
          {display.showSubtitle && display.subtitle && <p className={styles.subtitle}>{display.subtitle}</p>}
        </header>

        {done ? (
          <div className={styles.doneBox} data-done>
            <span className={styles.doneMark} aria-hidden="true">
              <Check size={30} strokeWidth={2.4} />
            </span>
            <div className={styles.doneText}>{display.thanks}</div>
            {slot.demo && (
              <p className={styles.demoNote}>체험용 페이지라 남긴 한마디는 저장되지 않아요</p>
            )}
            {left > 0 && !closed && (
              <button type="button" className={styles.again} onClick={() => setDone(false)} data-again>
                한마디 더 남기기 ({left}번 남음)
              </button>
            )}
          </div>
        ) : closed ? (
          <div className={styles.doneBox}>
            <div className={styles.doneText}>지금은 한마디를 받지 않아요</div>
          </div>
        ) : left <= 0 ? (
          <div className={styles.doneBox}>
            <div className={styles.doneText}>이 기기에서 남길 수 있는 만큼 다 남기셨어요</div>
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
              aria-label="한마디"
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
              aria-label="이름"
              data-cheer-name
            />
            <button type="submit" className={styles.send} disabled={busy || !body.trim()} data-cheer-send>
              <Send size={17} strokeWidth={2} aria-hidden="true" />
              {busy ? '보내는 중…' : display.postLabel}
            </button>
            {error && <p className={styles.error}>{error}</p>}
          </form>
        )}
      </div>
    </div>
  )
}
