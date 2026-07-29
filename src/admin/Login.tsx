import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, TriangleAlert } from 'lucide-react'

import { useSlot } from '@/slot/SlotProvider'
import { hasSupabase } from '@/lib/repo/client'
import { useAdminAuth } from './useAdminAuth'
import styles from '@/styles/auth.module.css'

/**
 * Supabase 에러를 사람 말로. 원문은 영어인 데다 사용자가 할 수 있는 게 뭔지 안 알려준다.
 * "이 슬롯 관리자가 아니다"는 우리가 던진 말이라 그대로 쓴다.
 */
function reasonOf(message: string): string {
  if (/Invalid login credentials/i.test(message)) return '이메일이나 비밀번호가 맞지 않아요.'
  if (/Email not confirmed/i.test(message)) return '아직 확인되지 않은 계정이에요.'
  if (/관리자 계정이 아니에요/.test(message)) return '이 슬롯의 관리자 계정이 아니에요.'
  return '로그인하지 못했어요. 잠시 후 다시 시도해 주세요.'
}

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
      /**
       * **첫 화면을 여기서 정하지 않는다.** 예전엔 `/admin/questions` 로 박아 뒀는데,
       * 럭키드로우 슬롯엔 그 경로가 없어서 catch-all 로 떨어지고 무한 리다이렉트가 났다
       * (`/admin/questions/prizes/prizes/prizes/…` 로 URL 이 끝없이 자란다).
       * `/admin` 으로만 보내고 어느 화면이 첫 화면인지는 AdminRoutes 의 index 가 정한다 —
       * 서비스가 늘어도 이 줄은 안 바뀐다.
       */
      navigate(`/${slot.slug}/admin`, { replace: true })
    } catch (e) {
      // 왜 안 되는지 말한다 — "이 슬롯 관리자가 아니에요" 와 "비번이 틀렸어요"는 다른 문제다
      setError(e instanceof Error ? reasonOf(e.message) : '로그인하지 못했어요.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin">
      <div className={styles.wrap}>
        <form className={styles.card} onSubmit={handleSubmit}>
          <div className={styles.head}>
            <div className={styles.logo}>
              <Sparkles size={22} aria-hidden="true" />
            </div>
            <h1 className="t-title-l">{slot.name}</h1>
            <p className="t-text-xs t-muted">/{slot.slug} 관리자</p>
          </div>

          {/* 인증이 없는 채로 띄웠으면 그 사실을 말한다 — 보안된 것처럼 보이면 안 된다 */}
          {!hasSupabase && (
            <p className={styles.notice}>
              <TriangleAlert size={16} strokeWidth={2} aria-hidden="true" />
              <span className="t-text-xs">
                이 브라우저에만 저장되는 임시 모드예요 (Supabase 미설정). 아무 값이나 들어가고,
                고친 답변이 방문자에게 가지 않아요.
              </span>
            </p>
          )}

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
