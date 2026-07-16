import { useState } from 'react'
import { Check, KeyRound } from 'lucide-react'

import { MIN_PASSWORD, PasswordInput } from '@/components/PasswordInput'
import { repo } from '@/lib/repo'
import { useSlot } from '@/slot/SlotProvider'
import { useAdminAuth } from './useAdminAuth'

/**
 * 내 계정 — **비밀번호를 바꾸는 자리**.
 *
 * 계정은 최고관리자가 만들어 준다 (슬롯 편집기). 그래서 주최자는 처음에
 * **남이 아는 비밀번호**로 들어온다 — 최고관리자가 정해줬거나, 잊어버려서 임시 비번을 받았거나.
 * 여기서 자기 것으로 바꾸면 그 상태가 끝난다.
 *
 * **서버 함수를 안 거친다.** 남의 계정을 만들거나 만질 때만 service_role 이 필요하고,
 * 자기 세션으로 자기 비번을 바꾸는 건 anon 키로 된다 (`repo.auth.changePassword`).
 * 그래서 이 화면은 주최자 것이고, 계정 만들기는 최고관리자 것이다.
 */
export function Account() {
  const slot = useSlot()
  const { user } = useAdminAuth(slot.slug)

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD
  const mismatch = confirm.length > 0 && password !== confirm
  const canSubmit = !busy && password.length >= MIN_PASSWORD && password === confirm

  async function handleSubmit() {
    setBusy(true)
    setError(null)
    setDone(false)
    try {
      await repo.auth.changePassword(password)
      setPassword('')
      setConfirm('')
      setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : '비밀번호를 바꾸지 못했어요')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="admin__head">
        <h1 className="t-title-l">내 계정</h1>
      </div>

      <section className="admin-section" style={{ maxWidth: '480px' }}>
        <h2 className="t-title-s admin-section__title">비밀번호 바꾸기</h2>
        <p className="t-text-xs t-muted" style={{ marginBottom: 'var(--space-base)' }}>
          {user?.email} · 이 슬롯(<b>/{slot.slug}</b>)의 관리 계정이에요.
          {/* 임시 비번을 받아 들어왔을 수 있다 — 바꾸라고 말해주는 게 이 화면의 일이다 */}
          <br />
          받은 비밀번호를 그대로 쓰고 있다면 지금 자기 것으로 바꾸세요.
        </p>

        <div className="field" style={{ marginBottom: 'var(--space-base)' }}>
          <span className="field__label">새 비밀번호</span>
          <PasswordInput
            value={password}
            onChange={setPassword}
            placeholder={`${MIN_PASSWORD}자 이상`}
            disabled={busy}
            autoComplete="new-password"
            data-new-password
          />
          {tooShort && <span className="field__error">{MIN_PASSWORD}자 이상이어야 해요</span>}
        </div>

        <div className="field">
          <span className="field__label">한 번 더</span>
          <PasswordInput
            value={confirm}
            onChange={setConfirm}
            placeholder="같은 비밀번호"
            disabled={busy}
            autoComplete="new-password"
            data-confirm-password
          />
          {/* 눈으로 확인할 수 있어도 한 번 더 받는다 — 틀리면 스스로 못 들어온다 */}
          {mismatch && <span className="field__error">두 값이 달라요</span>}
        </div>

        {error && (
          <p className="field__error" style={{ marginTop: 'var(--space-base)' }}>
            {error}
          </p>
        )}

        {done && (
          <p
            className="t-text-xs"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-xs)',
              marginTop: 'var(--space-base)',
              color: 'var(--color-primary-soft)',
            }}
            data-changed
          >
            <Check size={16} strokeWidth={2} aria-hidden="true" />
            바꿨어요. 다음 로그인부터 새 비밀번호를 쓰세요.
          </p>
        )}

        <button
          type="button"
          className="btn btn--sm btn--primary"
          style={{ marginTop: 'var(--space-lg)' }}
          disabled={!canSubmit}
          onClick={() => void handleSubmit()}
          data-change-password
        >
          <KeyRound size={18} strokeWidth={2} aria-hidden="true" />
          비밀번호 바꾸기
        </button>
      </section>
    </>
  )
}
