import { useEffect, useMemo, useRef, useState } from 'react'

import { ratioValue, shapesFor, type BubbleShape, type CheerDisplay } from '@/data/cheer'
import type { CheerSettings, RollingMessage } from '@/lib/repo/types'
import styles from './Cheer.module.css'
import { useT } from '@/i18n'

/**
 * 상영 화면 — **오버레이**(영상 위에 얹는 투명 화면)와 **엔딩크레딧**.
 *
 * 오버레이가 이 서비스의 본체다. 배경을 투명하게 두는 게 핵심이라, OBS·프리즘의 브라우저
 * 소스로 얹으면 영상 위에 그대로 뜬다 — 우리가 영상 파일을 다루지 않아도 된다.
 *
 * 규칙 셋 (사장님 결정):
 *  1. **한꺼번에 안 바꾼다** — 말풍선마다 자기 시계를 갖고 기준 간격 ±30% 로 하나씩 바뀐다.
 *     전체가 동시에 깜빡이면 화면이 번쩍여서 영상이 안 보인다.
 *  2. **자리·모양도 무작위** — 다만 가운데(영상 자리)는 늘 비우고, 서로 많이 겹치지 않게 고른다.
 *  3. **빠지는 한마디가 없게** — 한 바퀴를 다 돌기 전에는 같은 걸 안 띄우고, 다 돌면 그때부터
 *     중복으로 채운다.
 */

interface Slot {
  key: number
  message: RollingMessage | null
  shape: BubbleShape
  color: string
  /** % 단위 위치 (왼쪽 위 기준) */
  x: number
  y: number
  rotate: number
}

/** 가운데 영상 자리 — 이 사각형 안에는 말풍선을 놓지 않는다 */
function videoBox(ratio: string) {
  const r = ratioValue(ratio)
  // 화면(16:9 가정)에서 영상이 차지하는 폭·높이 비율. 세로 영상(9:16)이면 좁고 길다
  const w = r >= 1 ? 0.68 : 0.34
  const h = r >= 1 ? 0.68 / r / (9 / 16) : 0.78
  return { w: Math.min(0.8, w), h: Math.min(0.82, h) }
}

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const pick = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)]

/**
 * 가장자리 안에서 자리 하나 — **가운데를 피하고 이미 뜬 것과 겹치지 않게.**
 * 몇 번 튕기면 그 순번은 건너뛴다(자리를 억지로 만들면 결국 겹친다).
 */
function place(taken: { x: number; y: number }[], ratio: string): { x: number; y: number } | null {
  const box = videoBox(ratio)
  const halfW = (box.w * 100) / 2
  const halfH = (box.h * 100) / 2
  for (let i = 0; i < 24; i++) {
    const x = rand(3, 78)
    const y = rand(4, 86)
    const cx = x + 11
    const cy = y + 5
    const inVideo = Math.abs(cx - 50) < halfW && Math.abs(cy - 50) < halfH
    if (inVideo) continue
    // 이미 뜬 말풍선과 너무 가까우면 다시 (대각 거리 기준)
    if (taken.some((t) => Math.abs(t.x - x) < 22 && Math.abs(t.y - y) < 13)) continue
    return { x, y }
  }
  return null
}

export function Stage({
  kind,
  display,
  settings,
  messages,
  vars,
}: {
  kind: 'overlay' | 'credits'
  display: CheerDisplay
  settings: CheerSettings | null
  messages: RollingMessage[]
  vars: React.CSSProperties
}) {
  if (kind === 'credits') return <Credits display={display} settings={settings} messages={messages} vars={vars} />
  return <Overlay display={display} settings={settings} messages={messages} vars={vars} />
}

/**
 * **문서 배경을 투명하게 만든다.**
 *
 * `body` 는 앱 공통으로 `--color-canvas` 를 칠한다(base.css). 오버레이 컴포넌트만 투명하게
 * 두면 화면에는 여전히 슬롯 배경색이 깔리고, OBS 브라우저 소스는 **그 색까지 그대로 얹어**
 * 영상을 통째로 덮는다 — 투명 오버레이의 존재 이유가 사라진다.
 */
function useTransparentDocument(on: boolean) {
  useEffect(() => {
    if (!on) return
    const html = document.documentElement
    const body = document.body
    const before = [html.style.background, body.style.background] as const
    html.style.background = 'transparent'
    body.style.background = 'transparent'
    return () => {
      html.style.background = before[0]
      body.style.background = before[1]
    }
  }, [on])
}

function Overlay({
  display,
  settings,
  messages,
  vars,
}: {
  display: CheerDisplay
  settings: CheerSettings | null
  messages: RollingMessage[]
  vars: React.CSSProperties
}) {
  const t = useT()
  useTransparentDocument(true)

  const count = settings?.bubbles ?? 6
  const ratio = settings?.ratio ?? '16:9'
  const base = (settings?.intervalSec ?? 6) * 1000
  const showName = settings?.showName ?? true

  const [slots, setSlots] = useState<Slot[]>(() =>
    Array.from({ length: count }, (_, i) => ({ key: i, message: null, shape: 'bubble' as BubbleShape, color: '', x: 0, y: 0, rotate: 0 }))
  )

  /**
   * 아직 안 띄운 한마디 — **한 바퀴 큐**다. 비면 다시 채운다(그때부터 중복이 시작된다).
   * ref 로 드는 이유: 타이머 안에서 최신 값을 봐야 하는데 state 면 클로저가 옛 값을 문다.
   */
  const queue = useRef<RollingMessage[]>([])
  const live = useRef<RollingMessage[]>(messages)
  live.current = messages

  /**
   * 다음 한마디 — **지금 떠 있는 것과 겹치지 않게** 고른다.
   *
   * 큐만 보고 꺼내면 한 바퀴가 끝난 직후 같은 글이 화면에 둘 뜬다(실제로 그렇게 보였다).
   * 화면에 있는 건 건너뛰고, 큐가 전부 화면에 있으면(한마디가 자리 수보다 적을 때) 그때는
   * 어쩔 수 없이 중복을 허용한다 — 빈칸을 남기는 것보다 낫다.
   */
  const takeNext = (onScreen: string[]): RollingMessage | null => {
    if (live.current.length === 0) return null
    for (let round = 0; round < 2; round++) {
      if (queue.current.length === 0) {
        // 한 바퀴 끝 — 섞어서 다시 채운다 (순서가 매번 같으면 "돌고 있다" 가 티난다)
        queue.current = [...live.current].sort(() => Math.random() - 0.5)
      }
      const idx = queue.current.findIndex((m) => !onScreen.includes(m.id))
      if (idx >= 0) return queue.current.splice(idx, 1)[0]
      // 큐에 남은 게 전부 화면에 있다 — 다음 바퀴를 채워 다시 본다
      queue.current = []
    }
    return queue.current.shift() ?? live.current[0] ?? null
  }

  /**
   * **검수로 사라진 한마디를 그 자리에서 걷어낸다.**
   *
   * 상영 화면은 5초마다 목록을 다시 읽는데(`CheerApp`), 그건 `messages` 만 갈아끼울 뿐
   * **이미 대기 큐에 들어갔거나 이미 떠 있는 것은 안 건드렸다.** 그래서 주최자가 숨겨도
   * 큐가 한 바퀴 돌 때까지 계속 떴다 — 상영 중 검수가 몇 분씩 늦게 먹는다는 뜻이다.
   * (`repo.rolling.list` 는 숨김을 빼고 주므로, 여기서 사라진 것 = 숨겨졌거나 지워진 것이다.)
   *
   * 지운 자리는 **비워 둔다** — 다음 순번 타이머가 알아서 새 한마디로 채운다.
   * 바뀐 게 없으면 `prev` 를 그대로 돌려줘 리렌더를 안 만든다 (5초마다 도는 자리다).
   */
  useEffect(() => {
    const alive = new Set(messages.map((m) => m.id))
    queue.current = queue.current.filter((m) => alive.has(m.id))
    setSlots((prev) => {
      if (!prev.some((s) => s.message && !alive.has(s.message.id))) return prev
      return prev.map((s) => (s.message && !alive.has(s.message.id) ? { ...s, message: null } : s))
    })
  }, [messages])

  const shapesOf = useMemo(() => shapesFor, [])

  /** 자리 하나를 새 한마디로 채운다 */
  const refill = (key: number) => {
    setSlots((prev) => {
      const others = prev.filter((s) => s.key !== key && s.message)
      const msg = takeNext(others.map((o) => o.message!.id))
      if (!msg) return prev
      const spot = place(others.map((o) => ({ x: o.x, y: o.y })), ratio)
      // 자리를 못 찾으면 이번 순번은 쉰다 — 억지로 놓으면 겹친다
      if (!spot) return prev.map((s) => (s.key === key ? { ...s, message: null } : s))
      const shape = pick(shapesOf(msg.body, Boolean(showName && msg.nickname)))
      return prev.map((s) =>
        s.key === key
          ? { ...s, message: msg, shape, color: pick(display.bubbleColors), x: spot.x, y: spot.y, rotate: rand(-3, 3) }
          : s
      )
    })
  }

  useEffect(() => {
    setSlots(
      Array.from({ length: count }, (_, i) => ({
        key: i,
        message: null,
        shape: 'bubble' as BubbleShape,
        color: '',
        x: 0,
        y: 0,
        rotate: 0,
      }))
    )
    queue.current = []
  }, [count])

  /**
   * 말풍선마다 **자기 타이머**를 돈다 — 처음 등장도 흩어 놓는다(다 같이 나타나면 그것도 번쩍임이다).
   * 간격은 기준 ±30%.
   */
  useEffect(() => {
    const timers: number[] = []
    for (let i = 0; i < count; i++) {
      const start = window.setTimeout(() => {
        refill(i)
        const tick = () => {
          refill(i)
          timers.push(window.setTimeout(tick, base * rand(0.7, 1.3)))
        }
        timers.push(window.setTimeout(tick, base * rand(0.7, 1.3)))
      }, (base / count) * i * rand(0.6, 1.2))
      timers.push(start)
    }
    return () => timers.forEach(clearTimeout)
    // 설정이 바뀌면 전부 다시 건다 (주최자가 상영 중에 조정할 수 있다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, base, ratio, showName, display.bubbleColors.join(',')])

  return (
    <div className={styles.overlay} style={vars} data-overlay>
      {messages.length === 0 && (
        <div className={styles.overlayEmpty}>{t('아직 한마디가 없어요 — QR 로 들어와 남기면 여기에 떠요')}</div>
      )}
      {slots.map((s) =>
        s.message ? (
          <div
            key={`${s.key}-${s.message.id}`}
            className={styles.bubbleWrap}
            style={{ left: `${s.x}%`, top: `${s.y}%`, ['--rot' as string]: `${s.rotate}deg` }}
            data-bubble={s.shape}
          >
            <Bubble shape={s.shape} color={s.color} message={s.message} showName={showName} />
          </div>
        ) : null
      )}
    </div>
  )
}

/** 말풍선 여섯 변형 — 참고 이미지(예능 자막바)의 문법. 전부 CSS 로 그린다 */
function Bubble({
  shape,
  color,
  message,
  showName,
}: {
  shape: BubbleShape
  color: string
  message: RollingMessage
  showName: boolean
}) {
  const t = useT()
  const name = showName ? message.nickname.trim() : ''
  const style = { ['--bubble' as string]: color }

  if (shape === 'chipBar')
    return (
      <div className={styles.chipBar} style={style}>
        <span className={styles.chip}>{name || t('한마디')}</span>
        <span className={styles.chipBody}>{message.body}</span>
      </div>
    )
  if (shape === 'solidBar')
    return (
      <div className={styles.solidBar} style={style}>
        {name && <span className={styles.solidName}>{name}</span>}
        {message.body}
      </div>
    )
  if (shape === 'banner')
    return (
      /**
       * 제비꼬리는 **두 겹**이다 — 바깥이 테두리 색, 안이 말풍선 색.
       * `border` + `clip-path` 로는 잘려 나간 쪽(꼬리)에 선이 안 남는다 (clip 이 테두리째 자른다).
       */
      <div className={styles.banner} style={style}>
        <span className={styles.bannerBody}>{message.body}</span>
      </div>
    )
  if (shape === 'burst')
    return (
      // 별도 리본과 같은 두 겹 — 바깥이 테두리 색, 안이 별 색 (clip-path 는 border 를 잘라낸다)
      <div className={styles.burst} style={style}>
        <span className={styles.burstBody}>{message.body}</span>
      </div>
    )
  if (shape === 'plaque')
    return (
      <div className={styles.plaque} style={style}>
        {name && <span className={styles.plaqueName}>{name}</span>}
        <span className={styles.plaqueBody}>{message.body}</span>
      </div>
    )
  return (
    <div className={styles.bubble} style={style}>
      {name && <span className={styles.bubbleName}>{name}</span>}
      {message.body}
    </div>
  )
}

/**
 * 엔딩크레딧 — 상영이 끝나고 **한 명도 빠짐없이** 올린다.
 * 오버레이가 무작위인 것과 반대로, 여기서는 **전부 한 번씩** 순서대로 지나간다.
 */
function Credits({
  display,
  settings,
  messages,
  vars,
}: {
  display: CheerDisplay
  settings: CheerSettings | null
  messages: RollingMessage[]
  vars: React.CSSProperties
}) {
  const t = useT()
  const showName = settings?.showName ?? true
  // 줄 수에 비례해 시간을 준다 — 30줄이든 300줄이든 읽을 수 있는 속도로 (한 줄 2.2초)
  const seconds = Math.max(20, messages.length * 2.2)

  return (
    <div className={styles.credits} style={{ ...vars, ['--roll' as string]: `${seconds}s` }} data-credits>
      <div className={styles.creditsRoll}>
        <h1 className={styles.creditsTitle}>{t(display.creditsTitle)}</h1>
        {messages.map((m) => (
          <p key={m.id} className={styles.creditsLine}>
            {showName && m.nickname.trim() && <span className={styles.creditsName}>{m.nickname}</span>}
            {m.body}
          </p>
        ))}
        {messages.length === 0 && <p className={styles.creditsLine}>{t('아직 한마디가 없어요')}</p>}
      </div>
    </div>
  )
}
