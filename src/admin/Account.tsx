import { useState } from 'react'

import { MIN_PASSWORD } from '@/components/PasswordInput'
import { repo } from '@/lib/repo'
import { useSlot } from '@/slot/SlotProvider'
import { useAdminAuth } from './useAdminAuth'
import { useT } from '@/i18n'

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
  const t = useT()
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
      setError(e instanceof Error ? e.message : t('비밀번호를 바꾸지 못했어요'))
    } finally {
      setBusy(false)
    }
  }

  const initial = (user?.email ?? '?').slice(0, 1).toUpperCase()

  return (
    <>
      <header className="ad-head">
        <div className="ad-head__row">
          <h1 className="ad-head__title">{t('내 계정')}</h1>
        </div>
        <p className="ad-head__desc">{t('이 행사에서 쓰는 내 비밀번호를 바꿔요.')}</p>
      </header>

      <div className="ad-stack">
        {/* 임시 비번을 받아 들어왔을 수 있다 — 바꾸라고 말해주는 게 이 화면의 일이다 */}
        <div className="ad-banner ad-banner--warn ad-banner--pad">
          <div className="ad-banner__title">{t('받은 비밀번호를 그대로 쓰고 있다면 지금 바꿔 주세요')}</div>
          <div className="ad-banner__body">
            현장에서 공유된 비밀번호는 누가 알고 있는지 알 수 없어요.
          </div>
        </div>

        <div className="ad-card ad-card--form">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <span className="ad-avatar" aria-hidden="true">
              {initial}
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 17, fontWeight: 700 }}>{user?.email}</div>
              <div className="ad-fine" style={{ marginTop: 3, fontSize: 13 }}>
                {slot.name} · /{slot.slug}
              </div>
            </div>
            <span className="ad-tag" data-tone="on">
              {user?.owner ? t('최고관리자') : t('주최자')}
            </span>
          </div>
        </div>

        <div className="ad-card ad-card--form">
          <div className="ad-card__title ad-card__title--lg">{t('비밀번호 바꾸기')}</div>
          <p className="ad-card__desc">{t('바꾸면 다음 로그인부터 새 비밀번호를 써요.')}</p>

          <div className="ad-formgrid" style={{ marginTop: 18 }}>
            <div>
              <span className="ad-field__label">{t('새 비밀번호')}</span>
              <input
                type="password"
                className="ad-input ad-input--lg"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={`${MIN_PASSWORD}자 이상`}
                disabled={busy}
                autoComplete="new-password"
                data-new-password
              />
              <div
                className={`ad-field__hint ${
                  !password ? 'ad-field__hint--mute' : tooShort ? 'ad-field__hint--bad' : 'ad-field__hint--good'
                }`}
              >
                {!password
                  ? `${MIN_PASSWORD}자 이상으로 정해 주세요`
                  : tooShort
                    ? `${MIN_PASSWORD}자 이상이어야 해요`
                    : t('조건을 만족해요')}
              </div>
            </div>
            <div>
              <span className="ad-field__label">{t('한 번 더')}</span>
              <input
                type="password"
                className="ad-input ad-input--lg"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder={t('같은 비밀번호')}
                disabled={busy}
                autoComplete="new-password"
                data-confirm-password
              />
              {/* 눈으로 확인할 수 있어도 한 번 더 받는다 — 틀리면 스스로 못 들어온다 */}
              <div
                className={`ad-field__hint ${
                  !confirm ? 'ad-field__hint--mute' : mismatch ? 'ad-field__hint--bad' : 'ad-field__hint--good'
                }`}
              >
                {!confirm ? t('위와 같은 비밀번호를 한 번 더 입력해 주세요') : mismatch ? t('두 값이 서로 달라요') : t('일치해요')}
              </div>
            </div>
          </div>

          {error && <div className="ad-field__hint ad-field__hint--bad">{error}</div>}
          {done && (
            <div className="ad-field__hint ad-field__hint--good" data-changed>
              바꿨어요. 다음 로그인부터 새 비밀번호를 쓰세요.
            </div>
          )}

          <div className="ad-hr" />
          <button
            type="button"
            className="ad-btn ad-btn--primary ad-btn--2xl"
            disabled={!canSubmit}
            onClick={() => void handleSubmit()}
            data-change-password
          >
            {t('비밀번호 바꾸기')}
          </button>
        </div>
      </div>
    </>
  )
}
