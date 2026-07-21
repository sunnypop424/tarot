import { useEffect, useRef, useState } from 'react'

import { mix } from '@/lib/color'
import styles from './Luckydraw.module.css'

interface Props {
  /** 커버에 찍히는 글자 (♥ 등) — 슬롯이 정한 coverMark */
  mark: string
  /** 다 긁혔을 때 (또는 접근성 폴백으로 탭했을 때) 부른다 */
  onReveal: () => void
}

/**
 * 스크래치 커버 — 캔버스를 슬롯 primary 그라디언트로 덮고 문지르면 지워진다.
 *
 * 원래 시안은 **직접 드래그**해서 다 긁어야 열렸는데, 부스에선 손님이 한 번 톡 누르고 마는 일이
 * 잦다. 그래서 **누르면(탭/클릭) 나머지가 자동으로 스르륵 긁혀** 열리게 했다 — 문질러 긁는 재미는
 * 그대로 두되(누르고 끄는 동안 실제로 지워진다), 손을 떼는 순간 알아서 마무리한다.
 *
 * 색은 캔버스라 CSS 변수를 못 읽으니 `getComputedStyle` 로 `--color-primary` 를 읽어 슬롯 색을
 * 그대로 입힌다. 움직임을 줄이는 사용자에겐 탭 한 번에 여는 버튼으로 바꾼다(검증도 이걸 누른다).
 */
export function ScratchCover({ mark, onReveal }: Props) {
  const reduce =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
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
    ctxRef.current = ctx

    const primary = getComputedStyle(cv).getPropertyValue('--color-primary').trim() || '#816bff'
    const light = mix(primary, 'white', 0.4)
    const grad = ctx.createLinearGradient(0, 0, w, h)
    grad.addColorStop(0, light)
    grad.addColorStop(1, primary)
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = '700 13px Pretendard, sans-serif'
    ctx.fillText('긁어서 확인', w / 2, h / 2 - 7)
    ctx.font = '700 17px Pretendard, sans-serif'
    ctx.fillText(mark || '✦', w / 2, h / 2 + 13)

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
    // 손을 뗀 순간 나머지를 자동으로 긁어 낸다 (여러 프레임에 걸쳐 스르륵)
    const autoScratch = () => {
      if (done.current) return
      let frame = 0
      const total = 15
      const step = () => {
        for (let k = 0; k < 12; k++) {
          erase(Math.random() * w, Math.random() * h)
        }
        frame += 1
        if (frame >= total) {
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

  // 움직임을 줄이는 사용자: 탭 한 번에 여는 버튼
  if (reduce) {
    return (
      <button
        type="button"
        className={styles.cover}
        data-scratch
        aria-label="긁어서 확인"
        onClick={finish}
      >
        <span aria-hidden="true">{mark || '✦'}</span>
      </button>
    )
  }

  return (
    <canvas
      ref={canvasRef}
      className={styles.scratch}
      data-scratch
      aria-label="긁어서 확인"
    />
  )
}
