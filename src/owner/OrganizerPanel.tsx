import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, KeyRound, Trash2, UserPlus } from 'lucide-react'

import { MIN_PASSWORD, PasswordInput } from '@/components/PasswordInput'
import { repo } from '@/lib/repo'
import type { Organizer } from '@/lib/repo/types'
import type { Slot } from '@/types/slot'
import { buildGuide } from './guide'
import styles from './Owner.module.css'

/**
 * 주최자 계정 — **슬롯을 팔 때 고객에게 줄 계정을 여기서 만든다.**
 *
 * 예전엔 Supabase 대시보드에서 계정을 만들고 SQL 로 `slot_admins` 에 매핑했다
 * (`supabase/seed.sql` 이 그 흔적이다). 두 단계라 한쪽만 하고 잊으면
 * "로그인은 되는데 아무것도 안 보이는" 계정이 됐다 — 그래서 **한 번에** 한다.
 *
 * **이 패널만 초안이 아니다.** 편집기의 다른 값은 저장하기를 눌러야 반영되지만,
 * 계정 생성은 되돌릴 수 없는 서버 작업이라 초안에 담을 수가 없다
 * (초안에 담으면 "저장을 안 눌러서 계정이 안 만들어졌다" 가 생긴다).
 * 그 예외를 화면이 직접 말한다 — 안 말하면 저장하기를 누르러 갔다가 두 번 만든다.
 *
 * **계정을 만들려면 슬롯이 DB 에 있어야 한다** (`slot_admins.slug` 가 FK 다).
 * 그래서 이 패널은 초안 슬러그가 아니라 **저장된 슬러그**로만 일한다.
 */

const message = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback)

export function OrganizerPanel({ slot, slugPending }: { slot: Slot; slugPending: boolean }) {
  const slug = slot.slug
  /** null = 아직 읽는 중 (빈 목록과 다르다 — "없어요" 를 너무 일찍 말하면 안 된다) */
  const [list, setList] = useState<Organizer[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  /**
   * 방금 만든/재발급한 계정 — 여기 담긴 비밀번호는 **이때만 아는 값**이다
   * (재발급 임시 비번은 해시로만 저장돼 다시 못 꺼낸다). 그래서 이 자리에서 안내문을 만들어
   * 최고관리자가 복사해 전달만 하면 되게 한다. 화면을 떠나면 다시 못 만든다.
   */
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null)
  const [copied, setCopied] = useState(false)
  /**
   * 방금 **기존 주최자를 이 슬롯에 연결**했다 (계정을 만든 게 아니다).
   * 안내문을 안 띄우는 대신 이 사실을 말해 줘야 한다 — 최고관리자가 "비번이 왜 안 나오지?" 하고
   * 헤매거나, 입력했던 비번을 그대로 전달하는 사고를 막는다.
   */
  const [linked, setLinked] = useState(false)

  const load = useCallback(async () => {
    try {
      setList(await repo.organizers.list(slug))
    } catch (e) {
      setError(message(e, '계정을 불러오지 못했어요'))
      // 빈 목록으로 두면 "아직 계정이 없어요" 가 뜬다 — 못 읽은 것과 없는 것은 다르다
      setList([])
    }
  }, [slug])

  useEffect(() => {
    void load()
  }, [load])

  async function run(action: () => Promise<void>, fallback: string) {
    setBusy(true)
    setError(null)
    try {
      await action()
      await load()
    } catch (e) {
      setError(message(e, fallback))
    } finally {
      setBusy(false)
    }
  }

  const handleCreate = () =>
    run(async () => {
      const trimmed = email.trim()
      const pw = password
      const created = await repo.organizers.create(slug, trimmed, pw)
      /**
       * 이미 주최자인 이메일이면 **계정을 새로 만든 게 아니라 이 슬롯에 연결**한 것이다
       * (겸업 주최자 — 타로 슬롯을 쓰던 사람에게 럭키드로우 슬롯을 열어줄 때).
       * 그 경우 비밀번호는 **그 사람이 쓰던 그대로**라 여기서 입력한 값이 아니다 —
       * 안내문에 넣으면 틀린 비번을 전달하게 된다.
       */
      setIssued(created.linked ? null : { email: trimmed, password: pw })
      setLinked(created.linked === true)
      setCopied(false)
      setEmail('')
      setPassword('')
    }, '계정을 만들지 못했어요')

  function handleReset(o: Organizer) {
    if (
      !confirm(
        // 겸업 주최자면 **다른 슬롯 로그인도 같이** 바뀐다 — 계정이 하나이기 때문이다
        `${o.email} 의 비밀번호를 새로 발급할까요?\n지금 쓰던 비밀번호는 그 즉시 못 씁니다.\n그 계정이 맡은 다른 슬롯의 로그인도 같이 바뀝니다.`
      )
    ) {
      return
    }
    void run(async () => {
      const password = await repo.organizers.resetPassword(o.userId)
      setIssued({ email: o.email, password })
      setLinked(false)
      setCopied(false)
    }, '비밀번호를 발급하지 못했어요')
  }

  /**
   * 안내문 전체를 클립보드로 — 복사한 뒤 최고관리자는 전달만 하면 된다.
   *
   * clipboard API 를 **먼저** 쓰고, 막힌 환경이면(권한 거부·비-secure 컨텍스트)
   * 텍스트영역을 골라 `execCommand('copy')` 로 떨어진다. 그것도 안 되면 직접 고르라고 안내한다 —
   * 텍스트영역은 `readOnly` 라도 선택·복사가 된다.
   */
  async function copyGuide() {
    if (!issued) return
    const text = buildGuide(slot, window.location.origin, issued.email, issued.password)
    try {
      /**
       * 타임아웃 레이스: 실제 브라우저는 즉시 resolve 하지만, 권한이 'prompt' 인 일부 환경에선
       * writeText 가 **거부도 resolve 도 안 하고 매달린다** — 그러면 폴백까지 못 가 버튼이 멎는다.
       */
      await Promise.race([
        navigator.clipboard.writeText(text),
        new Promise((_, reject) => setTimeout(reject, 800)),
      ])
      setCopied(true)
      return
    } catch {
      /* 아래 폴백으로 */
    }
    // 폴백 — 화면의 안내문 텍스트영역을 골라 복사
    const area = document.querySelector<HTMLTextAreaElement>('[data-guide]')
    if (area) {
      area.focus()
      area.select()
      try {
        if (document.execCommand('copy')) {
          setCopied(true)
          return
        }
      } catch {
        /* 마지막 안내로 */
      }
    }
    setError('복사가 막혀 있어요. 아래 안내문을 직접 선택해 복사하세요.')
  }

  function handleRemove(o: Organizer) {
    // 되돌릴 수 없다. 다른 슬롯도 맡고 있으면 이 슬롯에서만 빠지고 계정은 남는다 (서버가 판단한다)
    if (!confirm(`${o.email} 을 이 슬롯에서 뺄까요?\n이 슬롯의 관리 화면에 더는 못 들어옵니다.`)) {
      return
    }
    void run(() => repo.organizers.remove(slug, o.userId), '계정을 빼지 못했어요')
  }

  const canCreate =
    !busy && !slugPending && email.trim().length > 0 && password.length >= MIN_PASSWORD

  return (
    <section className="admin-section">
      <h2 className="t-title-s admin-section__title">주최자 계정</h2>
      <p className="t-text-xs t-muted">
        이 슬롯의 <b>/{slug}/admin</b> 에 들어갈 계정이에요. 주최자는 운영 데이터만 만지고 테마는 못
        건드립니다. <b>만들면 그 자리에서 반영돼요</b> — 저장하기를 누르지 않아도 바로 씁니다.
      </p>

      {/**
       * 겸업 주최자를 만드는 방법이 화면 어디에도 안 적혀 있으면 아무도 모른다 —
       * "이미 있는 이메일" 은 보통 **에러**지 기능이 아니기 때문이다.
       * 여기서 말해두지 않으면 같은 사람에게 계정을 두 개 만들어 주게 된다.
       */}
      <p className="t-text-xs t-muted" style={{ marginTop: 'var(--space-xs)' }}>
        타로와 럭키드로우를 함께 하시는 주최자라면, 다른 슬롯에서 쓰던 <b>같은 이메일</b>을 넣어
        주세요. 새로 만들지 않고 그 계정에 이 슬롯을 더해 드려요 (이때 비밀번호 칸은 무시되고
        쓰던 비밀번호가 그대로 유지됩니다).
      </p>

      {slugPending && (
        <p className="field__error" style={{ marginTop: 'var(--space-sm)' }}>
          슬러그를 고쳤어요. 계정은 저장된 슬롯(<b>{slug}</b>)에 매이니 먼저 저장하세요.
        </p>
      )}

      {/**
       * 기존 주최자를 이 슬롯에 **연결**한 경우 — 계정을 만든 게 아니라 슬롯을 하나 더 준 것이다.
       * 비밀번호는 그 사람이 쓰던 그대로라 안내문을 만들 값이 없다 (있다고 착각하면 안 된다).
       */}
      {linked && (
        <p className="t-text-s" data-linked>
          이미 있는 주최자 계정이라 <b>이 슬롯에 연결</b>했어요. 비밀번호는 그 계정이 쓰던 그대로라
          따로 전달할 값이 없어요 — 새 비밀번호가 필요하면 아래 목록에서 재발급하세요.
        </p>
      )}

      {/**
       * 방금 만든/재발급한 계정의 **안내문** — 비밀번호가 담겨 있어 다시 못 만든다
       * (재발급 임시 비번은 해시로만 저장된다). 닫기 전에 복사해 전달해야 한다.
       * 토스트로 안 띄우는 이유가 그거다: 저절로 사라지면 안 된다.
       */}
      {issued && (
        <div className={styles.issued} data-issued>
          <div className={styles.issuedHead}>
            <span className="t-text-s">
              <b>{issued.email}</b> 계정을 만들었어요. 아래 안내문을 복사해 주최자에게 전달하세요.
            </span>
            <span className="t-text-xs t-muted">
              비밀번호(<b className={styles.issuedValue}>{issued.password}</b>)는 지금만 볼 수 있어요 —
              닫으면 다시 못 봅니다.
            </span>
          </div>
          <textarea
            className="textarea"
            readOnly
            value={buildGuide(slot, window.location.origin, issued.email, issued.password)}
            rows={12}
            onFocus={(e) => e.currentTarget.select()}
            data-guide
          />
          <div className={styles.issuedActions}>
            <button
              type="button"
              className="btn btn--sm btn--primary"
              onClick={() => void copyGuide()}
              data-copy-guide
            >
              {copied ? (
                <Check size={16} strokeWidth={2} aria-hidden="true" />
              ) : (
                <Copy size={16} strokeWidth={2} aria-hidden="true" />
              )}
              {copied ? '복사됐어요' : '안내문 복사'}
            </button>
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              onClick={() => setIssued(null)}
            >
              닫기
            </button>
          </div>
        </div>
      )}

      {/* ── 있는 계정 ── */}
      <div style={{ margin: 'var(--space-base) 0' }}>
        {list === null ? (
          <p className="t-text-xs t-muted">불러오는 중…</p>
        ) : list.length === 0 ? (
          <p className="t-text-xs t-muted">아직 계정이 없어요.</p>
        ) : (
          <ul className="row-list">
            {list.map((o) => (
              <li key={o.userId} className="row-item" data-organizer>
                <div className="row-item__grow">
                  {/* 이메일은 만든 뒤 못 고친다 — 계정을 가리키는 이름이라 바꾸면 다른 계정이 된다.
                      잘못 만들었으면 지우고 다시 만드는 게 맞다 */}
                  <b className="t-text-s">{o.email}</b>
                  <span className={`${styles.slotMeta} t-text-xs`}>
                    {new Date(o.createdAt).toLocaleDateString('ko-KR')} 부터
                  </span>
                </div>

                <button
                  type="button"
                  className="btn btn--sm btn--slight"
                  disabled={busy}
                  onClick={() => handleReset(o)}
                  data-organizer-reset
                >
                  <KeyRound size={16} strokeWidth={2} aria-hidden="true" />
                  비밀번호 재발급
                </button>
                <button
                  type="button"
                  className="btn-icon"
                  disabled={busy}
                  onClick={() => handleRemove(o)}
                  aria-label={`${o.email} 계정 지우기`}
                >
                  <Trash2 size={18} strokeWidth={2} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── 새 계정 ── */}
      <div className="form-grid">
        <label className="field">
          <span className="field__label">이메일</span>
          <input
            type="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="dino@example.com"
            disabled={busy || slugPending}
            autoComplete="off"
            data-organizer-email
          />
          <span className="field__hint">이 주소로 로그인해요. 만든 뒤엔 못 바꿔요.</span>
        </label>

        <label className="field">
          <span className="field__label">비밀번호</span>
          <PasswordInput
            value={password}
            onChange={setPassword}
            placeholder={`${MIN_PASSWORD}자 이상`}
            disabled={busy || slugPending}
            // 브라우저가 최고관리자 자신의 비번을 채우면 그게 고객 계정 비번이 된다
            autoComplete="off"
          />
          <span className="field__hint">직접 정해서 주최자에게 전달하세요. 확인 메일은 없어요.</span>
        </label>
      </div>

      {error && (
        <p className="field__error" style={{ marginTop: 'var(--space-sm)' }}>
          {error}
        </p>
      )}

      <button
        type="button"
        className="btn btn--sm btn--primary"
        style={{ marginTop: 'var(--space-base)' }}
        disabled={!canCreate}
        onClick={() => void handleCreate()}
        data-organizer-create
      >
        <UserPlus size={18} strokeWidth={2} aria-hidden="true" />
        계정 만들기
      </button>
    </section>
  )
}
