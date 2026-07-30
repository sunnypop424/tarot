import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '@/i18n'

/**
 * 관리자 공용 피드백 — **토스트**(즉시 저장 알림)와 **확인 모달**(되돌리기 어려운 동작).
 *
 * 네이티브 `alert/confirm` 대신 화면 톤에 맞춘 걸 쓴다. 스토어는 모듈 전역의 얇은 리스너 하나 —
 * 관리 셸이 `<AdminFeedbackHost/>` 를 한 번 그리면 어디서든 `toast()`·`confirmAction()` 으로 부른다.
 */
interface ConfirmOpts {
  title: string
  desc?: string
  okLabel?: string
  danger?: boolean
}
type ConfirmReq = ConfirmOpts & { resolve: (ok: boolean) => void }

let onToast: ((m: string | null) => void) | null = null
let onConfirm: ((r: ConfirmReq | null) => void) | null = null

export function toast(message: string) {
  onToast?.(message)
}

/** 확인 모달을 띄우고 사용자의 선택을 기다린다. 호스트가 없으면 네이티브 confirm 으로 폴백 */
export function confirmAction(opts: ConfirmOpts): Promise<boolean> {
  return new Promise((resolve) => {
    if (!onConfirm) {
      resolve(window.confirm(opts.desc ? `${opts.title}\n${opts.desc}` : opts.title))
      return
    }
    onConfirm({ ...opts, resolve })
  })
}

export function AdminFeedbackHost() {
  const t = useT()
  const [message, setMessage] = useState<string | null>(null)
  const [req, setReq] = useState<ConfirmReq | null>(null)

  useEffect(() => {
    onToast = setMessage
    onConfirm = setReq
    return () => {
      onToast = null
      onConfirm = null
    }
  }, [])

  useEffect(() => {
    if (!message) return
    const t = window.setTimeout(() => setMessage(null), 2400)
    return () => window.clearTimeout(t)
  }, [message])

  function close(ok: boolean) {
    req?.resolve(ok)
    setReq(null)
  }

  /**
   * **`.admin-portal` 을 꼭 씌운다.**
   *
   * 포털은 `document.body` 로 나가므로 `.admin` 서브트리 **밖**이다 — 그냥 두면 관리 도구의
   * 모달이 `:root` 의 슬롯 테마 색을 쓰게 되고, 슬롯 테마에 빠진 키가 있으면 버튼 색이
   * `undefined` 라 **버튼이 아예 안 보인다.** 고정 라이트 토큰을 여기서 다시 받는다
   * (`src/styles/admin.css`).
   */
  return createPortal(
    <div className="admin-portal">
      {req && (
        <div className="ad-scrim-modal" onClick={() => close(false)}>
          <div
            className="ad-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ad-modal__title">{req.title}</div>
            {req.desc && <div className="ad-modal__desc">{req.desc}</div>}
            {/* 되돌릴 수 없는 동작은 그 사실을 따로 세워 말한다 — 설명 속에 묻히면 안 읽힌다 */}
            {req.danger && <div className="ad-modal__warn">되돌릴 수 없어요</div>}
            {/*
              * `data-*` 로 짚는다 — 클래스는 상태(`ad-btn--kill`/`--primary`)에 따라 바뀌고
              * 글자는 부르는 쪽이 정해서(`okLabel`) 검증이 붙잡을 손잡이가 없었다.
              * 그래서 `verify-ai` 가 확인 창을 못 누르고 "저장이 안 된다" 로 읽고 있었다.
              */}
            <div className="ad-modal__actions">
              <button
                type="button"
                className="ad-btn ad-btn--line"
                onClick={() => close(false)}
                data-confirm-cancel
              >
                취소
              </button>
              <button
                type="button"
                className={`ad-btn ${req.danger ? 'ad-btn--kill' : 'ad-btn--primary'}`}
                onClick={() => close(true)}
                data-confirm-ok
              >
                {req.okLabel ?? t('확인')}
              </button>
            </div>
          </div>
        </div>
      )}
      {message && (
        <div className="ad-toast" role="status">
          {message}
        </div>
      )}
    </div>,
    document.body
  )
}
