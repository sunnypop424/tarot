import { useEffect, useRef, useState } from 'react'

import styles from './Luckydraw.module.css'
import { useT } from '@/i18n'

interface Props {
  /** 커버에 찍히는 글자 (♥ 등) — 슬롯이 정한 coverMark */
  mark: string
  /** 다 긁혔을 때 (또는 접근성 폴백으로 탭했을 때) 부른다 */
  onReveal: () => void
}

/**
 * 손을 뗀 뒤 나머지가 **쓸려 나가는 시간** (ms).
 *
 * 예전엔 시간이 아니라 **프레임 수**로 셌다(반지름을 26번에 나눠 키웠다). 그러면 화면
 * 주사율에 따라 속도가 달라진다 — 60Hz 폰에서 0.43초짜리가 **120Hz 아이패드에서는
 * 0.21초**로 후딱 지나간다. 부스 기기가 대개 아이패드라, "긁는 맛" 이 제일 필요한
 * 자리에서 제일 빨리 끝나고 있었다.
 *
 * 지금은 흐른 시간으로 센다 — 어느 기기에서도 같은 속도다.
 * `ResultReveal` 이 커버를 걷어내는 시점도 이 값에서 파생한다(따로 적으면 어긋난다).
 *
 * **값은 두 번 만졌다.** 옛 프레임 방식이 60Hz 에서 0.43초였는데, 시간으로 바꾸며 0.9초로
 * 뒀더니 이번엔 굼떴다 — 부스에서는 뒤에 줄이 서 있다. 0.6초가 "긁히는 결이 보이면서
 * 기다리지는 않는" 자리다. 폴백(clip-path)도 같은 값으로 맞춰 둔다.
 */
export const SCRATCH_SWEEP_MS = 600

/**
 * 스크래치 커버 — 문지르면 지워지고, **누르면(탭) 나머지가 부드럽게 쓸려** 열린다.
 *
 * 색은 슬롯 테마를 그대로 입는다: 커버 배경은 `--color-wash`(편집기 '커버 배경'), 문자는
 * `--color-accent`(편집기 '커버 문자색'). 캔버스라 CSS 변수를 직접 못 읽으니 computed style 로
 * 읽어 채운다 — 편집기에서 이 색을 바꾸면 커버도 바뀐다.
 *
 * 움직임을 줄이는 사용자에겐 탭 한 번에 여는 버튼으로 바꾼다(.cover 는 CSS 로 같은 색을 입는다).
 */
export function ScratchCover({ mark, onReveal }: Props) {
  const t = useT()
  const reduce =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sizeRef = useRef({ w: 0, h: 0 })
  const done = useRef(false)
  const rafRef = useRef(0)
  const [gone, setGone] = useState(false)

  const finish = () => {
    if (done.current) return
    done.current = true
    setGone(true)
    onReveal()
  }

  useEffect(() => {
    if (reduce) return
    const cv = canvasRef.current
    if (!cv) return
    const rect = cv.getBoundingClientRect()
    const w = Math.round(rect.width)
    const h = Math.round(rect.height)
    if (!w || !h) return
    cv.width = w
    cv.height = h
    sizeRef.current = { w, h }
    const ctx = cv.getContext('2d')
    if (!ctx) {
      finish()
      return
    }

    const cs = getComputedStyle(cv)
    /**
     * **저장값 그대로**(`--color-wash-raw`)를 쓴다 — 이 칸의 편집기 이름이 '커버 배경' 이다.
     * `--color-wash` 는 칩·배너용으로 옅게 파생된 값이라, 그걸 쓰면 커버가 거의 안 보인다
     * (`lib/theme.ts` 의 wash 두 벌 설명).
     */
    const wash =
      cs.getPropertyValue('--color-wash-raw').trim() ||
      cs.getPropertyValue('--color-wash').trim() ||
      '#f0edff'
    const accent = cs.getPropertyValue('--color-accent').trim() || '#c99700'
    ctx.fillStyle = wash
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = accent
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = '700 22px Pretendard, sans-serif'
    ctx.fillText(mark || '♥', w / 2, h / 2)

    let painting = false
    const point = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const erase = (x: number, y: number) => {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.beginPath()
      ctx.arc(x, y, 20, 0, Math.PI * 2)
      ctx.fill()
    }
    // 마지막으로 누른/문지른 자리 — 여기서부터 번진다
    let cx = w / 2
    let cy = h / 2
    // 손을 떼면 **누른 곳에서부터 원이 커지며** 나머지를 부드럽게 긁어 낸다
    const autoScratch = () => {
      if (done.current) return
      ctx.globalCompositeOperation = 'destination-out'
      // 네 모서리 중 가장 먼 곳까지 닿아야 다 지워진다
      const maxR =
        Math.max(
          Math.hypot(cx, cy),
          Math.hypot(w - cx, cy),
          Math.hypot(cx, h - cy),
          Math.hypot(w - cx, h - cy)
        ) + 6
      /**
       * **시간으로 센다** (프레임 수가 아니라 — `SCRATCH_SWEEP_MS` 머리말 참고).
       *
       * 반지름은 시작 12px 에서 `maxR` 까지 정해진 시간 동안 자란다. 프레임이 몇 번
       * 돌든 걸리는 시간은 같다 — 120Hz 기기에서 절반으로 짧아지던 게 이 계산으로 사라진다.
       */
      const start = performance.now()
      const from = 12
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / SCRATCH_SWEEP_MS)
        ctx.beginPath()
        ctx.arc(cx, cy, from + (maxR - from) * t, 0, Math.PI * 2)
        ctx.fill()
        if (t >= 1) {
          finish()
          return
        }
        rafRef.current = requestAnimationFrame(step)
      }
      rafRef.current = requestAnimationFrame(step)
    }
    const down = (e: PointerEvent) => {
      painting = true
      cv.setPointerCapture?.(e.pointerId)
      const p = point(e)
      cx = p.x
      cy = p.y
      erase(p.x, p.y)
      e.preventDefault()
    }
    const move = (e: PointerEvent) => {
      if (!painting) return
      const p = point(e)
      cx = p.x
      cy = p.y
      erase(p.x, p.y)
      e.preventDefault()
    }
    const up = () => {
      if (!painting) return
      painting = false
      autoScratch()
    }
    cv.addEventListener('pointerdown', down)
    cv.addEventListener('pointermove', move)
    cv.addEventListener('pointerup', up)
    cv.addEventListener('pointercancel', up)
    return () => {
      cancelAnimationFrame(rafRef.current)
      cv.removeEventListener('pointerdown', down)
      cv.removeEventListener('pointermove', move)
      cv.removeEventListener('pointerup', up)
      cv.removeEventListener('pointercancel', up)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce, mark])

  if (gone) return null

  // 움직임을 줄이는 사용자: 탭 한 번에 여는 버튼 (.cover 가 wash·accent 를 CSS 로 입는다)
  if (reduce) {
    return (
      <button
        type="button"
        className={styles.cover}
        data-scratch
        aria-label={t('긁어서 확인')}
        onClick={finish}
      >
        <span aria-hidden="true">{mark || '♥'}</span>
      </button>
    )
  }

  return (
    <canvas ref={canvasRef} className={styles.scratch} data-scratch aria-label={t('긁어서 확인')} />
  )
}
