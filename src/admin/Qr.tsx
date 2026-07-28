import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, Info, Link as LinkIcon, QrCode } from 'lucide-react'
import qrcode from 'qrcode-generator'

import { getSlotService } from '@/data/services'
import { useSlot } from '@/slot/SlotProvider'
import { toast } from './AdminFeedback'

/**
 * QR 만들기 — **주최자가 제일 먼저 하는 일이 인쇄물 준비다.**
 *
 * 지금까지는 "외부 생성기에 주소를 넣으세요" 라고 안내만 했다. 그런데 QR 은 인쇄해서
 * 카페 벽에 붙는 물건이라, 해상도가 모자라면 현장에서 안 찍히고 그때는 이미 늦다.
 * 여기서 만들면 **주소를 옮겨 적다 틀릴 일도 없다** (오타 하나면 손님 전원이 404 를 본다).
 *
 * **캔버스로 그린다.** `<img>` 로 그리면 이 레포의 규칙(슬롯 이미지는 전부 background-image,
 * 예외는 `SavableImage` 하나)을 어기게 되고, 캔버스면 인쇄용 큰 PNG 를 그대로 저장할 수 있다.
 *
 * 인코딩은 `qrcode-generator` 를 쓴다 — 의존성 없는 20년 된 구현이다.
 * **직접 짜지 않은 이유:** Reed-Solomon 과 마스크 선택을 손으로 짜면 250줄이고, 미묘하게
 * 틀려도 화면에선 멀쩡해 보인다. 틀린 QR 은 **인쇄한 뒤에** 발견된다.
 */

/** 인쇄용 — 한 모듈을 몇 픽셀로 그릴지. 8px 이면 A4 에 붙일 만한 크기가 나온다 */
const SCALES = [
  { id: 'sm', px: 6, label: '작게' },
  { id: 'md', px: 10, label: '보통' },
  { id: 'lg', px: 16, label: '크게 (인쇄용)' },
] as const

/** 조용한 여백 — QR 규격이 4모듈을 요구한다. 이걸 줄이면 인식률이 떨어진다 */
const QUIET = 4

export function Qr() {
  const slot = useSlot()
  const service = getSlotService(slot)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [scale, setScale] = useState<(typeof SCALES)[number]['id']>('md')
  const [target, setTarget] = useState<'visitor' | 'admin'>('visitor')

  const url = `${window.location.origin}/${slot.slug}${target === 'admin' ? '/admin' : ''}`
  const px = SCALES.find((s) => s.id === scale)?.px ?? 10

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    // 타입 0 = 자동(내용 길이에 맞는 최소 버전) · M = 30% 훼손까지 복구 (인쇄물엔 이 정도가 표준)
    const qr = qrcode(0, 'M')
    qr.addData(url)
    qr.make()
    const count = qr.getModuleCount()
    const size = (count + QUIET * 2) * px
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    // 흰 바탕을 **직접 칠한다** — 투명 PNG 를 어두운 종이에 인쇄하면 아무것도 안 보인다
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, size, size)
    ctx.fillStyle = '#000000'
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (qr.isDark(r, c)) ctx.fillRect((c + QUIET) * px, (r + QUIET) * px, px, px)
      }
    }
  }, [url, px])

  useEffect(() => {
    draw()
  }, [draw])

  function save() {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.toBlob((blob) => {
      if (!blob) return
      const href = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = href
      a.download = `${slot.slug}-qr.png`
      a.click()
      URL.revokeObjectURL(href)
    }, 'image/png')
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      toast('주소를 복사했어요')
    } catch {
      toast('복사하지 못했어요 — 주소를 직접 선택해 주세요')
    }
  }

  return (
    <>
      <header className="admin__head">
        <div>
          <h1 className="t-title-s">QR 만들기</h1>
          <p className="t-text-xs t-muted">인쇄해서 카페에 붙이면 손님이 이 주소로 들어와요.</p>
        </div>
      </header>

      <div className="admin-split">
        <section className="admin-section">
          <h2 className="admin-section__title">
            <QrCode size={15} strokeWidth={2} aria-hidden="true" />
            주소와 크기
          </h2>
          <div className="field">
            <span className="field__label">어느 주소</span>
            <div className="pill-group">
              {(
                [
                  ['visitor', '손님용', `/${slot.slug}`],
                  ['admin', '스태프·관리용', `/${slot.slug}/admin`],
                ] as const
              ).map(([id, label, path]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTarget(id)}
                  data-qr-target={id}
                  className="pill"
                  data-on={target === id || undefined}
                  title={path}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="field__hint">
              손님용은 벽에, 스태프·관리용은 카운터 안쪽에 붙이세요 — <b>같이 붙이면 손님이 관리 화면으로 들어옵니다.</b>
            </span>
          </div>

          <div className="field">
            <span className="field__label">크기</span>
            <div className="pill-group">
              {SCALES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setScale(s.id)}
                  className="pill"
                  data-on={scale === s.id || undefined}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span className="field__label">주소</span>
            <div className="admin-inline-form">
              <code className="admin-url" data-qr-url>
                {url}
              </code>
              <button type="button" className="btn btn--outline btn--sm" onClick={() => void copy()}>
                <LinkIcon size={14} strokeWidth={2} aria-hidden="true" />
                복사
              </button>
            </div>
          </div>

          <div className="admin-banner admin-banner--info" style={{ marginBottom: 0, marginTop: 16 }}>
            <Info size={16} aria-hidden="true" />
            <span>
              인쇄 전에 <b>폰으로 한 번 찍어 보세요.</b> 종이·조명에 따라 인식률이 달라져요.
              A4 에 붙이실 거면 '크게' 를 받으시고, 가로 5cm 아래로는 줄이지 마세요.
              {service === 'photocard' && ' 스태프 기기는 QR 대신 주소를 직접 열어 로그인해 두시는 게 편해요.'}
            </span>
          </div>
        </section>

        <section className="admin-section admin-qr">
          <h2 className="admin-section__title">미리보기</h2>
          {/* QR 은 캔버스다 — `<img>` 를 쓰지 않는다 (이 레포의 규칙) */}
          <canvas ref={canvasRef} data-qr-canvas className="admin-qr__canvas" aria-label="QR 코드" role="img" />
          <button type="button" className="btn btn--primary" onClick={save} data-qr-save>
            <Download size={15} strokeWidth={2} aria-hidden="true" />
            PNG 로 저장
          </button>
        </section>
      </div>
    </>
  )
}
