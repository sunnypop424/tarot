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
      let r = 12
      // 천천히 — 반지름을 조금씩만 키운다 (긁히는 결이 눈에 보이게)
      const grow = maxR / 26
      const step = () => {
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.fill()
        r += grow
        if (r >= maxR) {
          finish()
          return
        }
        rafRef.current = requestAnimationFrame(step)
      }
      step()
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
