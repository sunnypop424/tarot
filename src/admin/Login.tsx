import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { TriangleAlert } from 'lucide-react'

import { useSlot } from '@/slot/SlotProvider'
import { useAdminAuth } from './useAdminAuth'
import styles from './Login.module.css'

export function Login() {
  const slot = useSlot()
  const navigate = useNavigate()
  const { signIn } = useAdminAuth(slot.slug)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signIn(email, password)
      navigate(`/${slot.slug}/admin/questions`, { replace: true })
    } catch {
      setError('로그인하지 못했어요. 잠시 후 다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin">
      <div className={styles.wrap}>
        <form className={styles.card} onSubmit={handleSubmit}>
          <div className={styles.head}>
            <h1 className="t-title-l">{slot.name}</h1>
            <p className="t-text-xs t-muted">/{slot.slug} 관리자</p>
          </div>

          {/* 인증이 아직 없다 — 보안된 것처럼 보이면 안 된다 */}
          <p className={styles.notice}>
            <TriangleAlert size={16} strokeWidth={2} aria-hidden="true" />
            <span className="t-text-xs">
              아직 실제 인증이 붙지 않았어요. 지금은 아무 값이나 넣어도 들어갑니다.
            </span>
          </p>

          <div className="field">
            <label className="field__label" htmlFor="admin-email">
              이메일
            </label>
            <input
              id="admin-email"
              className="input"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="admin-password">
              비밀번호
            </label>
            <input
              id="admin-password"
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && <p className="field__error">{error}</p>}

          <button
            type="submit"
            className="btn btn--md btn--primary btn--block"
            disabled={busy}
          >
            로그인
          </button>
        </form>
      </div>
    </div>
  )
}
