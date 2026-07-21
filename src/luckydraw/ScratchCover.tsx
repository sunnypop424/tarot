import { useEffect, useRef, useState } from 'react'

import styles from './Luckydraw.module.css'

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
    const wash = cs.getPropertyValue('--color-wash').trim() || '#f0edff'
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
    // 손을 떼면 나머지를 **부드럽게 쓸어** 낸다 — 왼쪽부터 가장자리를 물결지게 지운다
    const autoScratch = () => {
      if (done.current) return
      ctx.globalCompositeOperation = 'destination-out'
      let x = 0
      const speed = Math.max(7, w / 11)
      const step = () => {
        ctx.fillRect(0, 0, x, h)
        // 앞 가장자리를 둥근 붓으로 훑어 긁힌 결을 남긴다
        for (let y = 8; y < h; y += 13) {
          ctx.beginPath()
          ctx.arc(x, y, 15, 0, Math.PI * 2)
          ctx.fill()
        }
        x += speed
        if (x >= w + 18) {
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
      erase(p.x, p.y)
      e.preventDefault()
    }
    const move = (e: PointerEvent) => {
      if (!painting) return
      const p = point(e)
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
        aria-label="긁어서 확인"
        onClick={finish}
      >
        <span aria-hidden="true">{mark || '♥'}</span>
      </button>
    )
  }

  return (
    <canvas ref={canvasRef} className={styles.scratch} data-scratch aria-label="긁어서 확인" />
  )
}
