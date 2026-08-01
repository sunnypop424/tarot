import { useCallback, useEffect, useRef, useState } from 'react'
import qrcode from 'qrcode-generator'

import { getSlotService } from '@/data/services'
import { useSlot } from '@/slot/SlotProvider'
import { toast } from './AdminFeedback'
import { useT } from '@/i18n'

/**
 * QR 만들기 — **주최자가 제일 먼저 하는 일이 인쇄물 준비다.**
 *
 * 지금까지는 "외부 생성기에 주소를 넣으세요" 라고 안내만 했다. 그런데 QR 은 인쇄해서
 * 카페 벽에 붙는 물건이라, 해상도가 모자라면 현장에서 안 찍히고 그때는 이미 늦다.
 * 여기서 만들면 **주소를 옮겨 적다 틀릴 일도 없다** (오타 하나면 방문자 전원이 404 를 본다).
 *
 * **캔버스로 그린다.** `<img>` 로 그리면 이 레포의 규칙(슬롯 이미지는 전부 background-image,
 * 예외는 `SavableImage` 하나)을 어기게 되고, 캔버스면 인쇄용 큰 PNG 를 그대로 저장할 수 있다.
 *
 * 인코딩은 `qrcode-generator` 를 쓴다 — 의존성 없는 20년 된 구현이다.
 * **직접 짜지 않은 이유:** Reed-Solomon 과 마스크 선택을 손으로 짜면 250줄이고, 미묘하게
 * 틀려도 화면에선 멀쩡해 보인다. 틀린 QR 은 **인쇄한 뒤에** 발견된다.
 */

/**
 * 인쇄용 — 한 모듈을 몇 픽셀로 그릴지. 8px 이면 A4 에 붙일 만한 크기가 나온다.
 *
 * 라벨은 **한국어 원문 그대로** 둔다 (모듈 상수라 훅을 못 쓴다) — 번역은 렌더에서 `t()` 가 한다.
 */
const SCALES = [
  { id: 'sm', px: 6, label: '작게', note: '스티커·명함 크기' },
  { id: 'md', px: 10, label: '보통', note: 'A5 안내판 정도' },
  { id: 'lg', px: 16, label: '크게 (인쇄용)', note: 'A4 포스터에 붙일 크기' },
] as const

/** 조용한 여백 — QR 규격이 4모듈을 요구한다. 이걸 줄이면 인식률이 떨어진다 */
const QUIET = 4

export function Qr() {
  const t = useT()
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
      toast(t('주소를 복사했어요'))
    } catch {
      toast(t('복사하지 못했어요 — 주소를 직접 선택해 주세요'))
    }
  }

  const TARGETS = [
    { id: 'visitor', name: t('방문자용 주소'), hint: t('포스터·테이블에 붙이는 QR') },
    { id: 'admin', name: t('스태프·관리용 주소'), hint: t('카운터 기기에서만 쓰는 QR') },
  ] as const

  return (
    <>
      <header className="ad-head">
        <div className="ad-head__row">
          <h1 className="ad-head__title">{t('QR 만들기')}</h1>
        </div>
        <p className="ad-head__desc">{t('현장에 붙일 QR을 만들어 내려받아요.')}</p>
      </header>

      <div className="ad-split">
        <div className="ad-stack">
          <div className="ad-card ad-card--form">
            <div className="ad-card__title">{t('어떤 주소의 QR인가요')}</div>
            <div className="ad-checks">
              {/* `t` 로 받지 않는다 — 번역 함수를 가려서 이 안에서 t() 를 못 쓰게 된다 */}
              {TARGETS.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  className="ad-radio"
                  data-on={target === it.id || undefined}
                  data-qr-target={it.id}
                  onClick={() => setTarget(it.id)}
                >
                  <span className="ad-radio__dot" aria-hidden="true" />
                  <span>
                    <span className="ad-check__name">{it.name}</span>
                    <span className="ad-check__hint">{it.hint}</span>
                  </span>
                </button>
              ))}
            </div>

            <div className="ad-hr" />

            <div className="ad-card__title">{t('인쇄 크기')}</div>
            <div className="ad-choices">
              {SCALES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="ad-choice"
                  data-on={scale === s.id || undefined}
                  onClick={() => setScale(s.id)}
                >
                  {t(s.label)}
                </button>
              ))}
            </div>

            <div className="ad-hr" />

            <div className="ad-card__title">{t('주소')}</div>
            <div className="ad-inline">
              <code className="ad-url" data-qr-url>
                {url}
              </code>
              <button type="button" className="ad-btn ad-btn--line ad-btn--xl" onClick={() => void copy()}>
                {t('복사')}
              </button>
            </div>
          </div>

          <div className="ad-card">
            <div className="ad-card__title">{t('인쇄 전에 확인해 주세요')}</div>
            <div className="ad-bullets">
              <div className="ad-bullet">
                {t('인쇄 전에 화면의 QR을 폰으로 한 번 찍어 주소가 맞는지 확인해 주세요.')}
              </div>
              <div className="ad-bullet">{t('가로 5cm보다 작게 인쇄하면 잘 안 읽혀요.')}</div>
              <div className="ad-bullet">
                {t('방문자용과 스태프·관리용을 같이 붙이면 방문자가 관리 화면으로 들어와요.')}
              </div>
              {service === 'photocard' && (
                <div className="ad-bullet">
                  {t('스태프 기기는 QR 대신 주소를 직접 열어 로그인해 두시는 게 편해요.')}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="ad-card ad-card--form ad-qr">
          <div className="ad-card__title">{t('미리보기')}</div>
          <div className="ad-qr__box">
            {/* QR 은 캔버스다 — `<img>` 를 쓰지 않는다 (이 레포의 규칙) */}
            <canvas ref={canvasRef} data-qr-canvas className="ad-qr__canvas" aria-label={t('QR 코드')} role="img" />
          </div>
          <p className="ad-fine" style={{ marginTop: 14 }}>
            {/* 조각내지 않는다 — 앞 조각만 감싸면 "A5 안내판 정도 · 실제 QR은…" 처럼 반만 번역된다 */}
            {t('{note} · 실제 QR은 내려받은 PNG에 들어 있어요', {
              note: t(SCALES.find((s) => s.id === scale)?.note ?? ''),
            })}
          </p>
          <button
            type="button"
            className="ad-btn ad-btn--primary ad-btn--xl ad-btn--block"
            style={{ marginTop: 16 }}
            onClick={save}
            data-qr-save
          >
            {t('PNG 내려받기')}
          </button>
        </div>
      </div>
    </>
  )
}
