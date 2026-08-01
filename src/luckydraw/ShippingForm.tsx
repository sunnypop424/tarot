import { useState } from 'react'
import { createPortal } from 'react-dom'

import { repo } from '@/lib/repo'
import styles from './Luckydraw.module.css'
import { useT } from '@/i18n'

interface Props {
  slug: string
  prizes: { rank: number; name: string; count: number }[]
  onClose: () => void
}

/**
 * 배송 정보 — **방문자가 자기 손으로 넣는다.**
 *
 * 넣은 값은 다시 못 읽는다 (RLS 가 select 를 주최자에게만 준다). 본인도 못 읽는 게
 * 과해 보이지만, 읽기를 열면 그 슬롯 당첨자 전원의 이름·연락처·주소가 anon 키로 긁힌다 —
 * 그 위험에 비하면 "제출 후 수정 불가" 는 싸다 (틀리면 스태프에게 말하면 된다).
 */
export function ShippingForm({ slug, prizes, onClose }: Props) {
  const t = useT()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const ready = name.trim() && phone.trim() && address.trim() && agreed && !busy

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    setError(null)
    try {
      await repo.luckydraw.submitShipping(slug, {
        name: name.trim(),
        phone: phone.trim(),
        address: address.trim(),
        prizes,
      })
      setDone(true)
    } catch {
      setError(t('보내지 못했어요. 스태프에게 알려주세요.'))
    } finally {
      setBusy(false)
    }
  }

  /**
   * 폭죽과 같은 이유로 **body 로 뺀다** — 박스의 `backdrop-filter` 가 `position: fixed` 의
   * 기준이 되어, 화면을 덮어야 할 시트가 박스 안에 갇힌다.
   */
  return createPortal(
    <div className={styles.sheet} role="dialog" aria-modal="true" aria-label={t('배송 정보 입력')}>
      <div className={`surface ${styles.sheetBody}`}>
        {done ? (
          <div className={styles.done}>
            <h2 className="t-title-s">{t('보냈어요')}</h2>
            <p className="t-text-s t-muted">{t('배송 정보가 스태프에게 전달됐어요.')}</p>
            <button type="button" className="btn btn--primary btn--block" onClick={onClose}>
              {t('닫기')}
            </button>
          </div>
        ) : (
          <>
            <header className={styles.sheetHead}>
              <h2 className="t-title-s">{t('배송 정보 입력')}</h2>
              <p className="t-text-s t-muted">{t('당첨 상품 수령을 위해 아래 정보를 입력해주세요.')}</p>
            </header>

            <form className={styles.form} onSubmit={submit}>
              {prizes.length > 0 && (
                <div className={styles.field}>
                  <span className="t-text-xs t-muted">{t('배송 대상 상품')}</span>
                  <ul className={styles.shipList}>
                    {prizes.map((p) => (
                      <li key={`${p.rank}-${p.name}`} className={styles.shipItem}>
                        {/* 경품 이름은 주최자가 쓴 말 — 언어별로 적었으면 그걸 (0046) */}
                        <span>{t('{n}등 · {name}', { n: p.rank, name: p.name })}</span>
                        <b className={styles.shipCount}>{t('{n}개', { n: p.count })}</b>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <label className={styles.field}>
              <span className="t-text-xs t-muted">{t('받는 분')}</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </label>

            <label className={styles.field}>
              <span className="t-text-xs t-muted">{t('연락처')}</span>
              <input
                className="input"
                inputMode="tel"
                placeholder="010-0000-0000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </label>

            <label className={styles.field}>
              <span className="t-text-xs t-muted">{t('주소')}</span>
              <textarea
                className="textarea"
                rows={3}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </label>

              <label className={styles.agree}>
                <input
                  className={styles.check}
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                />
                <span className={styles.agreeText}>
                  <b className="t-text-s">{t('개인정보 수집·이용 동의')}</b>
                  <span className="t-text-xs t-muted">
                    {t('목적: 경품 배송 · 이벤트가 끝나면 즉시 폐기돼요.')}
                  </span>
                </span>
              </label>

              {error && (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              )}

              <div className={styles.sheetActions}>
                <button type="button" className="btn btn--ghost" onClick={onClose}>
                  {t('취소')}
                </button>
                <button type="submit" className="btn btn--primary" disabled={!ready}>
                  {busy ? t('보내는 중…') : t('보내기')}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}
