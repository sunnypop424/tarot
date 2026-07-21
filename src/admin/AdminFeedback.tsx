import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

import styles from './AdminFeedback.module.css'

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

  return createPortal(
    <>
      {req && (
        <div className={styles.backdrop} onClick={() => close(false)}>
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.title}>{req.title}</div>
            {req.desc && <div className={styles.desc}>{req.desc}</div>}
            <div className={styles.actions}>
              <button type="button" className="btn btn--ghost" onClick={() => close(false)}>
                취소
              </button>
              <button
                type="button"
                className={`btn ${req.danger ? styles.danger : 'btn--primary'}`}
                onClick={() => close(true)}
              >
                {req.okLabel ?? '확인'}
              </button>
            </div>
          </div>
        </div>
      )}
      {message && (
        <div className={styles.toast} role="status">
          {message}
        </div>
      )}
    </>,
    document.body
  )
}
