import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ChevronLeft, Lamp } from 'lucide-react'

import { useSlotState } from '@/slot/SlotProvider'
import { wishDisplay, type WishDisplay } from '@/data/wish'
import { fontStack, fontStyle, loadWebfont, HANDWRITING_FONTS, WEBFONTS } from '@/data/fonts'
import { repo } from '@/lib/repo'
import { Pager, usePaged } from '@/components/Pager'
import { isLight } from '@/lib/color'
import { cssUrl } from '@/lib/image'
import type { RollingMessage } from '@/lib/repo/types'
import type { Slot } from '@/types/slot'
import { AdminEntry } from '@/components/AdminEntry'
import { LangPicker } from '@/components/LangPicker'
import { ServiceHeader } from '@/components/ServiceHeader'
import styles from './Wish.module.css'
import { useT } from '@/i18n'
import { useLocalizedDisplay } from '@/i18n/display'

/**
 * 소원 나무 — 방문자가 소원을 적어 **등불**로 나무에 매단다.
 * 화면은 claude.ai/design 시안 '소원 나무 방문자' 를 옮긴 것이다.
 *
 * **데이터는 롤링페이퍼와 공유한다** (`repo.rolling` · `rolling_messages`). 소원 하나는
 * 롤페 메시지 하나와 모양이 정확히 같고, 다른 건 그리는 방법뿐이다. 필드 셋을 재해석해 쓴다:
 * `color`→등불 색 · `font`→손글씨 · `sticker`→매다는 장식 (`src/data/wish.ts` 주석).
 *
 * 화면이 둘이다: **나무**(`/{slug}`)와 **소원 적기**(`/{slug}/write`) — 롤페와 같은 방식이다.
 */
export default function WishApp() {
  const state = useSlotState()
  if (state.status === 'loading') return <div className="app" aria-busy="true" />
  if (state.status === 'missing') return null
  return <Wish slot={state.slot} />
}

/** 슬롯이 정한 색·폰트를 CSS 변수로 — 나무·작성이 같은 값을 쓴다 */
function useWishVars(d: WishDisplay): React.CSSProperties {
  return {
    ['--wt-font' as string]: fontStack(d.font),
    ['--wt-head' as string]: d.headText,
    ['--wt-sub' as string]: d.subText,
    ['--wt-body' as string]: d.wishBody,
    ['--wt-name' as string]: d.wishName,
    ['--wt-sky' as string]: d.skyBg,
    ['--wt-btn' as string]: d.buttonColor,
    // 버튼 글자색은 고르게 하지 않는다 — 버튼색 밝기에서 파생한다 (readableShade 와 같은 결)
    ['--wt-btnFg' as string]: isLight(d.buttonColor) ? '#1f1f1f' : '#ffffff',
  }
}

function Wish({ slot }: { slot: Slot }) {
  const location = useLocation()
  const rawDisplay = useMemo(() => wishDisplay(slot), [slot])
  /** 기본 문구는 사전에서 번역되고, 주최자가 쓴 문구는 원문 그대로 (src/i18n/display.ts) */
  const display = useLocalizedDisplay(rawDisplay)
  const composing = location.pathname.replace(/\/+$/, '').endsWith('/write')

  useEffect(() => {
    loadWebfont(display.font)
  }, [display.font])

  return composing ? <Compose slot={slot} display={display} /> : <Tree slot={slot} display={display} />
}

const idHash = new Map<string, number>()

/** FNV-1a — id 한 번만 접어둔다 (같은 id 로 수백 번 부르므로 캐시한다) */
function hashOf(id: string): number {
  const hit = idHash.get(id)
  if (hit !== undefined) return hit
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const out = h >>> 0
  idHash.set(id, out)
  return out
}

/**
 * id + salt → 0~1. **렌더마다 안 흔들리게** 값을 id 에서 파생한다 (`Math.random()` 을 쓰면
 * 새로고침할 때마다 나무가 재배치된다).
 *
 * 처음엔 롤페처럼 `salt` 를 앞에 곱하고 문자마다 `*31 % 100000` 을 돌렸는데,
 * **salt 를 바꿔도 결과가 촘촘한 등차수열처럼 나와** 자리 후보가 한쪽에 뭉쳤다 —
 * 시도를 200번으로 늘려도 겹침이 안 줄던 이유가 그것이었다(탐색이 아니라 분포 문제).
 * salt 를 **뒤에서** 섞고 murmur3 마무리로 비트를 흩는다.
 */
function seeded(id: string, salt: number): number {
  let x = (hashOf(id) ^ Math.imul(salt, 0x9e3779b1)) >>> 0
  x ^= x >>> 16
  x = Math.imul(x, 0x7feb352d)
  x ^= x >>> 15
  x = Math.imul(x, 0x846ca68b)
  x ^= x >>> 16
  return (x >>> 0) / 4294967296
}

interface Placed {
  w: RollingMessage
  /** 가지에서 이 등불 중심까지의 가로 위치(px) */
  left: number
  /** 줄 길이(px) — 이게 제각각이라 높낮이가 생긴다 */
  drop: number
  size: { w: number; h: number }
  dur: string
  delay: string
  glowDur: string
}

/**
 * 등불을 **흩뿌린다** — 시안의 손배치를 개수에 상관없이 재현하는 규칙.
 *
 * 행·열로 묶으면 소원이 몇 개든 격자로 보인다(실제로 그렇게 보였다). 시안은 좌표를 손으로
 * 찍어 제각각인데, 그 좌표는 **딱 7개일 때만** 맞는다. 그래서 시안의 *성질* 을 규칙으로 옮긴다:
 *
 *  · 가로·세로 모두 등불마다 따로 뽑는다 (열 중심 같은 건 없다)
 *  · 크기는 두 종류(96×106 / 116×126)를 섞는다 — 시안도 약 40% 가 크다
 *  · **겹치면 다시 뽑는다.** 후보를 24번까지 뽑아보고 안 되면 그 자리 아래로 내린다.
 *    이 한 가지가 "손으로 건 것 같다" 와 "그냥 겹쳐 놨다" 를 가른다.
 *
 * 값은 전부 메시지 id 에서 파생한다 — 새로고침해도 자리가 안 바뀌고, 소원이 하나 늘어도
 * 남의 등불이 안 움직인다 (`Math.random()` 을 쓰면 렌더마다 나무가 재배치된다).
 */
/**
 * 한 화면에 걸 **목표 개수**와 그에 맞는 **등불 크기**를 함께 정한다.
 *
 * 크기를 먼저 정하면(시안의 96~116px) 화면이 짧을 때 개수가 그냥 깎인다 — 카톡 인앱
 * 브라우저는 위아래를 먹어 가지가 380px 밖에 안 되는데, 그러면 서너 개밖에 안 걸린다.
 * 반대로 **개수를 먼저 잡고 크기를 역산**하면 어느 기기에서든 비슷한 밀도가 나온다.
 *
 * 기준은 시안이다: 390×560 가지에 일곱 개. 넓거나 길면 그만큼 더 건다.
 * 크기는 78~132px 로 자른다 — 더 작으면 12px 두 줄이 안 들어가고, 더 크면 우스워진다.
 */
function planSize(canopyW: number, canopyH: number): { target: number; base: number } {
  const target = Math.min(26, Math.max(5, Math.round((canopyW / 390) * (canopyH / 520) * 7)))
  // 화면의 36%(시안 밀도)를 target 개로 나눈 넓이 → 한 등불의 폭 (h = w × 1.09)
  const base = Math.sqrt((canopyW * canopyH * 0.36) / (target * 1.09))
  return { target, base: Math.min(Math.max(base, 78), 132) }
}

function scatter(items: RollingMessage[], canopyW: number, canopyH: number): Placed[] {
  const { base } = planSize(canopyW, canopyH)
  /**
   * **음수다 — 살짝 겹치는 걸 허용한다.** 시안 모바일도 2·3번 등불이 16px 겹친다.
   * 전혀 안 겹치게 하면 등불 사이가 훤해져 "나무에 걸린" 게 아니라 "칸마다 놓인" 것처럼 보인다.
   * 충돌 상자를 실제 등불보다 이만큼 좁게 잡아 그 정도까지는 붙을 수 있게 둔다.
   */
  const PAD = -6
  const out: Placed[] = []
  const boxes: { l: number; r: number; t: number; b: number }[] = []

  for (const w of items) {
    /**
     * 크기를 **연속으로** 흩는다. 시안은 두 종류(96/116)지만 min-height 라 글 길이에 따라
     * 높이가 또 달라져서 실제로는 다 달라 보인다. 폭까지 두 값만 쓰면 그 인상이 안 나온다.
     * 세로:가로 비율은 시안의 106/96·126/116(≈1.09)을 따른다.
     */
    // 기준 크기에서 ±10% 씩 흩는다 — 시안도 두 종류를 섞어 크기가 제각각으로 보인다
    const sw = Math.round(base * (0.9 + seeded(w.id, 13) * 0.2))
    // 높이는 CSS 에서 `height` 로 못박힌다 — 여기 값이 곧 실제 크기여야 겹침 판정이 맞는다
    const size = { w: sw, h: Math.round(sw * 1.09) }
    const half = size.w / 2 + 10
    /**
     * **등불 아래로 삐져나오는 것들.** 장식(`charm`)은 등불 바닥에서 16px 내려가 22px 이
     * 더 걸리고, 흔들리면 그만큼 더 내려온다. 이걸 안 빼면 등불이 **페이지 번호를 덮는다**
     * (실제로 그랬다) — 좌우 잘림은 `swingOf` 로 고쳤는데 아래쪽은 안 봤던 자리다.
     * 장식이 없는 소원은 덜 잡아 자리를 아낀다.
     */
    const tail = w.sticker ? 42 : 12
    /**
     * **줄 길이는 가지 높이 안으로 자른다.** 안 자르면 아래쪽 등불이 화면 밖으로 나가
     * 잘린 채 보인다 (`.tree` 가 overflow:hidden 이라 스크롤도 안 된다).
     * 한 화면에 안 들어가는 만큼은 다음 페이지로 넘긴다 — 그게 페이지를 나눈 이유다.
     */
    const maxDrop = Math.max(14, canopyH - size.h - tail)

    /**
     * **줄이 길수록 좌우로 더 크게 흔들린다.** 흔들림은 `.hang` 전체를 줄 맨 위를 축으로
     * ±1.8° 돌리는 거라, 축에서 먼 아래쪽일수록 이동량이 커진다 (drop 500px 이면 약 19px).
     * 이걸 안 보고 여백을 고정하면 **긴 줄에 걸린 등불만 가장자리를 넘어 잘린다** — 실제로
     * iPhone 15 Pro Max·iPad mini 에서 그렇게 잘렸다. 시안은 줄이 짧아(≤268px) 안 드러난 문제다.
     * 진짜 등불도 줄이 길면 더 크게 흔들리니 물리적으로도 맞다.
     */
    const swingOf = (dy: number) => (dy + size.h) * Math.sin((1.8 * Math.PI) / 180) + 4

    /**
     * 후보를 여러 번 뽑아 **겹침이 가장 적은 자리**를 고른다.
     *
     * 처음엔 "안 겹치는 자리를 찾으면 즉시 채택, 못 찾으면 아래로 밀어 쌓기" 였는데,
     * 화면이 짧은 폰(브라우저 주소창·하단바가 먹는다)에서는 밀 자리마저 없어
     * **등불이 통째로 포개져 글자가 가렸다.** 최선을 고르는 방식은 그런 파국이 없다 —
     * 자리가 빠듯하면 조금 겹칠 뿐 알아볼 수는 있게 된다.
     */
    let left = half
    let drop = 14
    let bestCost = Infinity
    /**
     * 200번까지 뽑아본다. 전부 id 에서 파생한 결정적 계산이라 비용이 사실상 없고
     * (등불 20개여도 4천 번), 시도가 적으면 넓은 화면에서 빈자리를 못 찾아 겹친다.
     */
    for (let t = 0; t < 200; t++) {
      const dy = 14 + seeded(w.id, 37 + t * 11) * (maxDrop - 14)
      const margin = size.w / 2 + swingOf(dy)
      const lo = margin
      const hi = Math.max(margin, canopyW - margin)
      const cx = lo + seeded(w.id, 21 + t * 7) * (hi - lo)
      const box = { l: cx - size.w / 2 - PAD, r: cx + size.w / 2 + PAD, t: dy, b: dy + size.h + tail + PAD }
      // 겹친 넓이의 합 — 0 이면 완전히 빈 자리다
      let cost = 0
      for (const p of boxes) {
        const ox = Math.min(box.r, p.r) - Math.max(box.l, p.l)
        const oy = Math.min(box.b, p.b) - Math.max(box.t, p.t)
        if (ox > 0 && oy > 0) cost += ox * oy
      }
      if (cost < bestCost) {
        bestCost = cost
        left = cx
        drop = dy
        if (cost === 0) break
      }
    }

    boxes.push({
      l: left - size.w / 2 - PAD,
      r: left + size.w / 2 + PAD,
      t: drop,
      b: drop + size.h + PAD,
    })
    out.push({
      w,
      left,
      drop,
      size,
      dur: `${(5.5 + seeded(w.id, 3) * 3).toFixed(2)}s`,
      delay: `-${(seeded(w.id, 5) * 4).toFixed(2)}s`,
      glowDur: `${(3.4 + seeded(w.id, 17) * 2.6).toFixed(2)}s`,
    })
  }
  return out
}

/** 밤하늘·별·가지 — 슬롯이 배경 이미지를 올리면 그게 대신한다 */
function Sky({ hasImage }: { hasImage: boolean }) {
  if (hasImage) return null
  return (
    <>
      <div className={styles.sky} aria-hidden="true" />
      <div className={styles.stars} aria-hidden="true" />
      <div className={styles.branch} aria-hidden="true" />
    </>
  )
}

/** 등불 한 개 — 줄 · 빛번짐 · 몸통. 위치는 부모가 인라인 변수로 준다 */
function Lantern({
  wish,
  display,
  w = 96,
  h = 106,
}: {
  wish: RollingMessage
  display: WishDisplay
  w?: number
  h?: number
}) {
  const color = wish.color || display.lanterns[0] || '#efe8cd'
  const shaped = !!display.lanternShape
  return (
    <div
      className={styles.lantern}
      data-shaped={shaped || undefined}
      data-wish-lantern
      style={{
        ['--lantern' as string]: color,
        ['--w' as string]: `${w}px`,
        ['--h' as string]: `${h}px`,
        // 마스크는 배경 층(::before)이 쓴다 — 등불 자체에 걸면 글자까지 잘린다 (CSS 주석)
        ...(shaped
          ? {
              ['--shape' as string]: cssUrl(display.lanternShape),
              // 글자 자리는 올린 실루엣마다 달라서 편집기에서 네 면을 직접 잡는다
              ['--padT' as string]: `${display.shapePad.top}%`,
              ['--padR' as string]: `${display.shapePad.right}%`,
              ['--padB' as string]: `${display.shapePad.bottom}%`,
              ['--padL' as string]: `${display.shapePad.left}%`,
              ['--nameT' as string]: `${display.shapeNamePad.top}%`,
              ['--nameR' as string]: `${display.shapeNamePad.right}%`,
              ['--nameB' as string]: `${display.shapeNamePad.bottom}%`,
              ['--nameL' as string]: `${display.shapeNamePad.left}%`,
            }
          : {}),
      }}
    >
      <p className={styles.body} style={fontStyle(wish.font, '12px')}>
        {/* 방문자가 쓴 글 — 번역 대상이 아니다 */}
        <span data-user-text>{wish.body}</span>
      </p>
      {wish.nickname && (
        <div className={styles.name} style={fontStyle(wish.font, '10px')} data-user-text>
          — {wish.nickname}
        </div>
      )}
      {wish.sticker && (
        <span className={styles.charm} style={{ backgroundImage: cssUrl(wish.sticker) }} aria-hidden="true" />
      )}
    </div>
  )
}

function Tree({ slot, display }: { slot: Slot; display: WishDisplay }) {
  const t = useT()
  const { slug } = slot
  const navigate = useNavigate()
  const vars = useWishVars(display)
  const [wishes, setWishes] = useState<RollingMessage[]>([])

  useEffect(() => {
    let alive = true
    const load = () =>
      void repo.rolling
        .list(slug)
        .then((m) => {
          if (alive) setWishes(m)
        })
        .catch(() => {})
    load()
    const stop = repo.rolling.watch(slug, load)
    return () => {
      alive = false
      stop()
    }
  }, [slug])

  // 편집기 미리보기(iframe)에선 소원이 없어도 샘플로 등불 색·글씨체를 보여준다 (롤페와 같은 장치)
  const inPreview = typeof window !== 'undefined' && window.parent !== window
  const list = useMemo(
    () => (wishes.length > 0 ? wishes : inPreview ? sampleWishes(display) : []),
    [wishes, inPreview, display]
  )
  useEffect(() => {
    for (const w of list) if (w.font) loadWebfont(w.font)
  }, [list])

  // 가지 폭에 따라 열 수가 는다 — 모바일 확대판이 아니라 넓은 나무가 되게
  const [canopy, setCanopy] = useState({ w: 390, h: 520 })
  const roRef = useRef<ResizeObserver | null>(null)
  /**
   * **콜백 ref 여야 한다.** `useRef` + `useEffect([])` 로 붙이면, 소원을 아직 못 받아온
   * 첫 렌더에는 가지 요소가 없어(빈 상태를 그린다) 관찰이 영영 안 걸린다 —
   * 그 결과 폭이 초기값 390 에 멈춰 태블릿·데스크톱이 모바일 배치를 그대로 쓴다.
   */
  const canopyRef = useCallback((el: HTMLDivElement | null) => {
    roRef.current?.disconnect()
    if (!el) return
    const ro = new ResizeObserver(([e]) =>
      setCanopy({ w: e.contentRect.width, h: e.contentRect.height })
    )
    ro.observe(el)
    roRef.current = ro
  }, [])
  useEffect(() => () => roRef.current?.disconnect(), [])

  /**
   * **격자가 아니라 흩뿌린다.** 열·행으로 자리를 잡되 그 안에서 좌우로 흔들고 줄 길이를
   * 제각각으로 준다 — 시안의 인상이 여기서 나온다. 값은 id 에서 파생해 새로고침해도 안 바뀐다.
   */
  /**
   * 값은 시안의 손배치를 재현하도록 맞췄다 (`lanternsM` 의 x·drop 분포):
   *  · 줄 길이가 한 띠 안에서 **70px 까지 벌어진다** — 이게 높낮이의 정체다.
   *    띠 간격(128)보다 좁게 잡아 띠끼리 살짝 겹치게 두면 줄 맞춘 티가 사라진다.
   *  · 가로도 열 중심에서 좌우로 흔든다.
   *  · 크기는 두 종류(96/116)를 섞는다 — 시안도 약 40% 가 큰 등불이다.
   * 전부 id 에서 파생해 새로고침해도 안 바뀌고, 소원이 하나 늘어도 남의 자리가 안 흔들린다.
   */
  /**
   * **한 화면에 세 줄만 건다.** 소원이 쌓여도 스크롤이 끝없이 길어지지 않고, 등불마다 붙는
   * 흔들림·빛번짐도 그만큼만 돈다. 폭이 넓어지면 열이 늘어 한 페이지에 더 걸린다.
   */
  /**
   * **한 페이지 = 한 화면.** 가지에 실제로 들어가는 만큼만 걸고 나머지는 다음 페이지로 넘긴다.
   * 이렇게 해야 줄이 화면 밖으로 안 나가고(잘려 보인다), 등불마다 붙는 흔들림·빛번짐도
   * 눈에 보이는 것만 돈다. 시안 모바일이 한 화면에 일곱 개다.
   */
  /**
   * 개수를 **면적으로** 정한다. 열·행으로 어림하면 세로가 짧은 기기(카톡 인앱 브라우저처럼
   * 위아래를 브라우저가 먹는 경우)에서 밀도가 확 올라가고, 그러면 아무리 여러 번 자리를
   * 뽑아도 안 겹치는 곳이 없어 결국 포개진다. 0.30 은 "화면의 30%만 등불" 이라는 뜻으로,
   * 시안 모바일(390×약600 에 일곱 개)과 비슷한 여백감이다.
   */
  // 개수와 크기를 함께 정한다 (`planSize`) — 기기가 달라져도 밀도가 비슷하게 유지된다
  const perPage = planSize(canopy.w, canopy.h).target
  const paged = usePaged(list, perPage)

  const placed = useMemo(
    () => scatter(paged.items, canopy.w, canopy.h),
    [paged.items, canopy.w, canopy.h]
  )

  /**
   * **화면에 들어온 등불만 흔든다.** 롤페 벽엔 없던 장치다: 포스트잇은 정적이라 300장이 떠
   * 있어도 그리기만 하면 끝이지만, 등불은 각자 흔들림+빛번짐이라 전부 돌리면 모바일이 죽는다.
   */
  const io = useRef<IntersectionObserver | null>(null)
  const observe = useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    if (!io.current) {
      io.current = new IntersectionObserver(
        (entries) => {
          for (const e of entries) (e.target as HTMLElement).dataset.live = String(e.isIntersecting)
        },
        // 화면 밖 200px 까지 미리 켜둔다 — 스크롤하다 딱 멈추는 게 보이지 않게
        { rootMargin: '200px 0px' }
      )
    }
    io.current.observe(el)
  }, [])
  useEffect(() => () => io.current?.disconnect(), [])

  const hasBg = !!display.treeBg

  return (
    <div
      className={`app ${styles.tree}`}
      /* 슬롯이 흔들림을 끄면 여기서 통째로 멈춘다 (움직임에 민감한 분들을 위한 설정) */
      data-sway={display.sway ? 'on' : 'off'}
      style={{
        ...vars,
        ...(hasBg
          ? {
              backgroundImage: cssUrl(display.treeBg),
              backgroundRepeat: display.treeBgRepeat ? 'repeat' : 'no-repeat',
              backgroundSize: display.treeBgRepeat ? 'auto' : 'cover',
            }
          : {}),
      }}
    >
      <Sky hasImage={hasBg} />

      {/* 헤더 — 롤페와 같은 규칙: 로고가 제목을 대신하고 정렬은 슬롯이 정한다 */}
      <ServiceHeader
        variant="mark"
        logo={display.logo}
        title={display.title}
        showTitle={display.showTitle}
        align={display.logoAlign}
        marginTop={display.logoMarginTop}
        /* 롤페와 같은 규칙 — 로고가 제목을 대신한다 */
        titleWithLogo={false}
        classes={{ head: styles.head, logo: styles.logo, title: styles.title, text: styles.headText }}
        below={
          display.showSubtitle && display.subtitle ? (
            <p className={styles.subtitle}>{display.subtitle}</p>
          ) : null
        }
      >
        {wishes.length > 0 && (
          /**
           * **숫자만 굵게 — 그런데 숫자가 오는 자리는 언어마다 다르다.**
           *
           * "지금까지 걸린 소원 8" 은 뒤, "8 wishes so far" 는 앞이다. 그래서 문장을
           * 토막 내 이어 붙이면 어순이 틀어진다. 자리 표시자가 든 **한 문장**을 옮긴 뒤,
           * 그 자리에서 가른다 (`t()` 는 vars 를 안 주면 `{n}` 을 그대로 남긴다).
           *
           * 넓은 화면에서만 뜨는 줄이라, 폰 폭만 보던 `verify-i18n-leak` 이 오래 못 봤다.
           */
          <span className={styles.count}>
            {t('지금까지 걸린 소원 {n}')
              .split('{n}')
              .flatMap((part, i) =>
                i === 0 ? [part] : [<b key={i}>{wishes.length}</b>, part]
              )}
          </span>
        )}
        <button type="button" className={styles.headCta} onClick={() => navigate(`/${slug}/write`)}>
          <Lamp size={19} strokeWidth={1.6} aria-hidden="true" />
          {display.hangLabel}
        </button>
      </ServiceHeader>

      {list.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyCord} aria-hidden="true" />
          <div className={styles.emptyLantern} aria-hidden="true">
            <Lamp size={26} strokeWidth={1.6} />
          </div>
          <div className={styles.emptyTitle}>{t('아직 걸린 소원이 없어요')}</div>
          <p className={styles.emptyText}>{t('첫 소원을 걸어 보세요.')}</p>
        </div>
      ) : (
        <div
          ref={canopyRef}
          className={styles.canopy}
          data-stage
          data-wish-tree
        >
          {placed.map((p) => (
            <div
              key={p.w.id}
              ref={observe}
              className={styles.hang}
              data-live="false"
              data-wish-item
              style={{
                left: `${Math.round(p.left)}px`,
                /**
                 * **아래에 걸린 등불이 위로 온다.** 살짝 겹칠 때 위쪽 것이 앞으로 나오면
                 * 아래 등불이 가려져 뒤로 물러난 것처럼 보인다 — 나무는 반대다(가까운 게 아래).
                 * 시안 모바일도 그렇게 겹쳐 있다.
                 */
                zIndex: Math.round(p.drop),
                ['--drop' as string]: `${p.drop}px`,
                ['--w' as string]: `${p.size.w}px`,
                ['--h' as string]: `${p.size.h}px`,
                ['--lantern' as string]: p.w.color || display.lanterns[0] || '#efe8cd',
                ['--dur' as string]: p.dur,
                ['--delay' as string]: p.delay,
                ['--glowDur' as string]: p.glowDur,
              }}
            >
              <span className={styles.cord} aria-hidden="true" />
              <span className={styles.glow} aria-hidden="true" />
              <Lantern wish={p.w} display={display} w={p.size.w} h={p.size.h} />
            </div>
          ))}
        </div>
      )}

      <Pager page={paged.page} pages={paged.pages} onPage={paged.setPage} label={t('나무')} />

      <div className={styles.bottom}>
        <button type="button" className={styles.cta} onClick={() => navigate(`/${slug}/write`)}>
          <Lamp size={19} strokeWidth={1.6} aria-hidden="true" />
          {display.hangLabel}
        </button>
        <div className={styles.adminRow}>
          <AdminEntry slug={slug} className={styles.adminLink} />
        </div>
      </div>
    </div>
  )
}

const SAMPLE: [string, string][] = [
  ['별하나', '오래오래 건강하게 노래해 줘'],
  ['', '올해도 무대에서 만나요'],
  ['해달', '생일 축하해 진심으로'],
  ['', '늘 웃는 하루만 가득하길'],
  ['우주', '다음 앨범도 대박나자'],
  ['시월', '언제나 응원할게요'],
  ['', '좋은 사람들만 곁에 있길'],
]
function sampleWishes(display: WishDisplay): RollingMessage[] {
  const colors = display.lanterns.length ? display.lanterns : ['#efe8cd']
  const fonts = ['', ...HANDWRITING_FONTS]
  return SAMPLE.map(([nickname, body], i) => ({
    id: `sample-${i}`,
    nickname,
    body,
    color: colors[i % colors.length],
    font: fonts[i % fonts.length],
    hidden: false,
    createdAt: '',
  }))
}

const MAX_BODY = 100

function Compose({ slot, display }: { slot: Slot; display: WishDisplay }) {
  const t = useT()
  const { slug } = slot
  const navigate = useNavigate()
  const vars = useWishVars(display)

  const [nickname, setNickname] = useState('')
  const [body, setBody] = useState('')
  const [color, setColor] = useState(display.lanterns[0] ?? '')
  const [font, setFont] = useState('') // '' = 기본 폰트
  const [charm, setCharm] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    for (const id of HANDWRITING_FONTS) loadWebfont(id)
  }, [])

  const canPost = body.trim().length > 0 && !busy

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!canPost) return
    setBusy(true)
    setError(null)
    try {
      // 롤페와 **같은 repo·같은 테이블** — 필드 의미만 소원나무로 읽는다
      /** **체험용 슬롯은 서버로 안 보낸다** (`slot.demo` — 0030) */
      if (!slot.demo) {
        await repo.rolling.add(slug, {
          nickname: nickname.trim(),
          body: body.trim(),
          color,
          font,
          sticker: charm,
        })
      }
      navigate(`/${slug}`)
    } catch (e) {
      // 금칙어(0041)·네트워크 — 서버가 한국어로 답한다. 삼키면 안 걸린 줄 알고 나무로 돌아간다
      setError(e instanceof Error ? e.message : t('걸지 못했어요. 잠시 뒤 다시 시도해 주세요.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className={`app ${styles.compose}`} style={vars} onSubmit={submit} data-wish-composer>
      <div className={styles.composeSky} aria-hidden="true" />

      <div className={styles.composeTop}>
        <button
          type="button"
          className={styles.backBtn}
          onClick={() => navigate(`/${slug}`)}
          aria-label={t('돌아가기')}
        >
          <ChevronLeft size={18} strokeWidth={1.6} aria-hidden="true" />
        </button>
        <span className={styles.backLabel}>{t('돌아가기')}</span>
        {/*
          * 소원 적기 화면에도 고르개를 둔다 — `/write` 로 바로 들어온 사람은
          * 나무(헤더가 있는 화면)를 안 거쳐서 언어를 바꿀 자리가 없었다.
          * 뒤로가기 줄 오른쪽 끝이라 새 줄을 안 만든다.
          */}
        <span style={{ marginLeft: 'auto' }}>
          <LangPicker only={slot.langs ?? []} />
        </span>
      </div>

      <div className={`app__scroll ${styles.composeScroll}`}>
        <div className={styles.composeCard}>
          {/* 내 등불 미리보기 — 고른 색·글씨가 실제 등불 모양으로 보인다 (시안 ②⑤) */}
          <div className={styles.previewCol}>
            <span className={styles.previewCord} aria-hidden="true" />
            <div className={styles.previewHolder}>
              <Lantern
                wish={{
                  id: 'preview',
                  nickname: nickname.trim(),
                  body: body.trim() || t('적은 소원이 여기에 보여요'),
                  color,
                  font,
                  sticker: charm,
                  hidden: false,
                  createdAt: '',
                }}
                display={display}
                w={118}
                h={126}
              />
            </div>
            <div className={styles.previewLabel}>{t('내 등불 미리보기')}</div>
          </div>

          <div className={styles.fields}>
            <div>
              <label className={styles.label} htmlFor="wish-name">
                {t('이름')} <span className={styles.optional}>{t('(선택)')}</span>
              </label>
              <input
                id="wish-name"
                className={styles.input}
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder={t('남길 이름')}
                maxLength={20}
              />
            </div>

            <div>
              <label className={styles.label} htmlFor="wish-body">
                {t('소원')}
              </label>
              <textarea
                id="wish-body"
                className={styles.textarea}
                value={body}
                onChange={(e) => setBody(e.target.value.slice(0, MAX_BODY))}
                placeholder={display.wishPrompt}
                style={fontStyle(font, '15px')}
              />
              <div className={styles.counter}>
                {body.length} / {MAX_BODY}
              </div>
            </div>

            {display.lanterns.length > 0 && (
              <div>
                <span className={styles.label}>{t('등불 색')}</span>
                <div className={styles.swatches} role="radiogroup" aria-label={t('등불 색')}>
                  {display.lanterns.map((c) => (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={color === c}
                      className={styles.swatch}
                      data-active={color === c}
                      style={{ background: c }}
                      onClick={() => setColor(c)}
                      aria-label={`색 ${c}`}
                    />
                  ))}
                </div>
              </div>
            )}

            <div>
              <span className={styles.label}>{t('글씨체')}</span>
              <div className={styles.fontList} role="radiogroup" aria-label={t('글씨체')}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={font === ''}
                  className={styles.fontBtn}
                  data-active={font === ''}
                  style={fontStyle(display.font, '15px')}
                  onClick={() => setFont('')}
                  title={t('기본 글씨체')}
                >
                  {/* 글씨체를 보여주는 게 목적인 견본 — 번역하면 그 글씨체의 한글 모양을 못 본다 */}
                  <span data-user-text>{display.fontSample}</span>
                </button>
                {HANDWRITING_FONTS.map((id) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={font === id}
                    className={styles.fontBtn}
                    data-active={font === id}
                    style={fontStyle(id, '15px')}
                    onClick={() => setFont(id)}
                    title={WEBFONTS[id].label}
                  >
                    <span data-user-text>{display.fontSample}</span>
                  </button>
                ))}
              </div>
            </div>

            {display.charms.length > 0 && (
              <div>
                <span className={styles.label}>
                  {t('장식')} <span className={styles.optional}>{t('(선택)')}</span>
                </span>
                <div className={styles.charms} role="radiogroup" aria-label={t('장식')}>
                  {display.charms.map((c) => (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={charm === c}
                      className={styles.charmBtn}
                      data-active={charm === c}
                      style={{ backgroundImage: cssUrl(c) }}
                      onClick={() => setCharm(charm === c ? undefined : c)}
                      aria-label={t('장식')}
                    />
                  ))}
                  <button
                    type="button"
                    role="radio"
                    aria-checked={charm === undefined}
                    className={styles.charmBtn}
                    data-active={charm === undefined}
                    onClick={() => setCharm(undefined)}
                  >
                    {t('없음')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={styles.submitBar}>
        {error && (
          <p className={styles.error} role="alert" data-post-error>
            {error}
          </p>
        )}
        <button type="submit" className={styles.submit} disabled={!canPost}>
          {busy ? t('거는 중…') : display.hangLabel}
        </button>
      </div>
    </form>
  )
}
