import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { TriangleAlert } from 'lucide-react'

import { hasSupabase } from '@/lib/repo/client'
import { useOwnerAuth } from './useOwnerAuth'
import styles from '@/styles/auth.module.css'

/**
 * 최고관리자 로그인 — 슬롯 편집기의 문.
 * 슬롯에 매이지 않으므로 주최자 로그인과 달리 slug 가 없다.
 */
export function OwnerLogin() {
  const navigate = useNavigate()
  const { signIn } = useOwnerAuth()
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
      navigate('/theme-editor', { replace: true })
    } catch (e) {
      const message = e instanceof Error ? e.message : ''
      setError(
        /Invalid login credentials/i.test(message)
          ? '이메일이나 비밀번호가 맞지 않아요.'
          : /최고관리자 계정이 아니에요/.test(message)
            ? '최고관리자 계정이 아니에요.'
            : '로그인하지 못했어요. 잠시 후 다시 시도해 주세요.'
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    // 라이트 — 슬롯 편집기와 같은 도구 화면이다
    <div className="owner">
      <div className={styles.wrap}>
        <form className={styles.card} onSubmit={handleSubmit} data-owner-login>
          <div className={styles.head}>
            <h1 className="t-title-l">OLUCKY!</h1>
            <p className="t-text-xs t-muted">최고관리자 · 슬롯 편집기</p>
          </div>

          {/* 인증이 없는 채로 띄웠으면 그 사실을 말한다 — 보안된 것처럼 보이면 안 된다 */}
          {!hasSupabase && (
            <p className={styles.notice}>
              <TriangleAlert size={16} strokeWidth={2} aria-hidden="true" />
              <span className="t-text-xs">
                이 브라우저에만 저장되는 임시 모드예요 (Supabase 미설정). 아무 값이나 들어가고,
                만든 슬롯이 이 브라우저 밖으로 나가지 않아요.
              </span>
            </p>
          )}

          <div className="field">
            <label className="field__label" htmlFor="owner-email">
              이메일
            </label>
            <input
              id="owner-email"
              className="input"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="owner-password">
              비밀번호
            </label>
            <input
              id="owner-password"
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && <p className="field__error">{error}</p>}

          <button type="submit" className="btn btn--md btn--primary btn--block" disabled={busy}>
            로그인
          </button>
        </form>
      </div>
    </div>
  )
}
