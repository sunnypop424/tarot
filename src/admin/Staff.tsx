import { useCallback, useEffect, useState } from 'react'

import { repo } from '@/lib/repo'
import type { Organizer } from '@/lib/repo/types'
import { useSlot } from '@/slot/SlotProvider'
import { useAdminAuth } from './useAdminAuth'
import { confirmAction, toast } from './AdminFeedback'
import { useT } from '@/i18n'

/**
 * 스태프 계정 — **주최자가 자기 슬롯에 사람을 더한다.**
 *
 * 지금까지는 계정을 최고관리자(파는 사람)만 만들 수 있었다. 그러면 부스에 사람이 여럿일 때
 * 한 계정을 돌려 쓰게 되고, **누가 무엇을 처리했는지 영영 모르게 된다** — 교환권 수령처럼
 * 되돌릴 수 없는 일을 다루는 화면에서 그건 위험하다. 계정을 나누면 최소한 로그인은 갈린다.
 *
 * 권한은 **이 슬롯 하나뿐**이다. Edge Function 이 `manages_slot` 으로 판정하고,
 * 슬롯 삭제 같은 되돌릴 수 없는 일은 여전히 최고관리자만 한다.
 *
 * **비밀번호는 여기서 정하지 않는다** — 서버가 임시 비번을 만들어 돌려주고, 그건 **이때 한 번만**
 * 보인다(해시로만 저장된다). 받은 사람이 '내 계정' 에서 자기 것으로 바꾼다.
 */
export function Staff() {
  const t = useT()
  const slot = useSlot()
  const slug = slot.slug
  const { user } = useAdminAuth(slug)

  const [list, setList] = useState<Organizer[] | null>(null)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** 방금 만든/재발급한 임시 비번 — **이 화면을 벗어나면 다시 못 본다** */
  const [temp, setTemp] = useState<{ email: string; password: string } | null>(null)

  const load = useCallback(async () => {
    if (!repo.organizers.ready()) return setList([])
    try {
      setList(await repo.organizers.list(slug))
    } catch (e) {
      setError(e instanceof Error ? e.message : t('계정을 불러오지 못했어요'))
      setList([])
    }
  }, [slug])

  useEffect(() => {
    void load()
  }, [load])

  const head = (
    <header className="ad-head">
      <div className="ad-head__row">
        <h1 className="ad-head__title">{t('스태프 계정')}</h1>
        {list && list.length > 0 && <span className="ad-head__count tnum">계정 {list.length}개</span>}
      </div>
      <p className="ad-head__desc">{t('현장에서 이 도구를 쓸 계정을 사람마다 따로 만들어요.')}</p>
    </header>
  )

  if (!repo.organizers.ready()) {
    return (
      <>
        {head}
        <div className="ad-card">
          <div className="ad-empty">
            <div className="ad-empty__title">{t('지금 빌드에서는 계정을 만들 수 없어요')}</div>
            <div className="ad-empty__sub">{t('백엔드가 연결된 배포에서만 동작해요.')}</div>
          </div>
        </div>
      </>
    )
  }

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (busy || !email.trim()) return
    setBusy(true)
    setError(null)
    setTemp(null)
    try {
      /**
       * 비밀번호를 화면에서 안 받는다 — 여기서 만든 임시 비번을 그대로 서버에 넘기고,
       * 받은 사람이 바꾼다. (이미 주최자인 이메일이면 서버가 **비번을 안 바꾸고** 이 슬롯에만 잇는다)
       */
      const password = tempPassword()
      const made = await repo.organizers.create(slug, email.trim().toLowerCase(), password)
      await load()
      setEmail('')
      if (made.linked) {
        toast(t('이미 있는 계정을 이 이벤트에 연결했어요 (비밀번호는 그대로예요)'))
      } else {
        setTemp({ email: made.email, password })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('계정을 만들지 못했어요'))
    } finally {
      setBusy(false)
    }
  }

  async function reset(o: Organizer) {
    if (
      !(await confirmAction({
        title: `${o.email} 의 비밀번호를 새로 만들까요?`,
        desc: t('지금 쓰던 비밀번호는 바로 못 쓰게 돼요. 새 비밀번호는 이 화면에 한 번만 보여요.'),
        okLabel: t('재발급'),
        danger: true,
      }))
    )
      return
    setBusy(true)
    try {
      const password = await repo.organizers.resetPassword(o.userId)
      setTemp({ email: o.email, password })
    } catch (e) {
      toast(e instanceof Error ? e.message : t('재발급하지 못했어요'))
    } finally {
      setBusy(false)
    }
  }

  async function remove(o: Organizer) {
    if (
      !(await confirmAction({
        title: `${o.email} 을 이 이벤트에서 뺄까요?`,
        desc: t('이 이벤트 관리 화면에 못 들어오게 돼요. 이 계정이 남긴 처리 기록은 그대로 남아요.'),
        okLabel: t('빼기'),
        danger: true,
      }))
    )
      return
    setBusy(true)
    try {
      await repo.organizers.remove(slug, o.userId)
      await load()
      toast(t('뺐어요'))
    } catch (e) {
      toast(e instanceof Error ? e.message : t('빼지 못했어요'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {head}

      <div className="ad-stack">
        <div className="ad-banner ad-banner--info ad-banner--pad">
          <div className="ad-banner__title">{t('계정은 사람마다 따로 만들어 주세요')}</div>
          <div className="ad-banner__body">
            누가 어떤 처리를 했는지 기록에 남아요. 하나를 돌려 쓰면 문제가 생겼을 때 확인할 수
            없어요.
          </div>
        </div>

        <form className="ad-card ad-card--form" onSubmit={(e) => void add(e)}>
          <div className="ad-card__title ad-card__title--lg" style={{ marginBottom: 16 }}>
            스태프 계정 만들기
          </div>
          <div className="ad-inline">
            <input
              className="ad-input ad-input--grow"
              style={{ height: 52, minWidth: 220 }}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="staff@example.com"
              aria-label={t('스태프 이메일')}
              data-staff-email
            />
            <button
              type="submit"
              className="ad-btn ad-btn--primary"
              style={{ height: 52, padding: '0 22px', fontSize: 15 }}
              disabled={busy}
              data-staff-add
            >
              계정 만들기
            </button>
          </div>

          {error && (
            <div className="ad-field__hint ad-field__hint--bad" style={{ marginTop: 12 }}>
              {error}
            </div>
          )}

          {temp && (
            <div
              className="ad-card ad-card--key"
              style={{ marginTop: 16, background: 'var(--ad-key-wash-2)' }}
              data-temp-password
            >
              <div className="ad-card__title">{t('임시 비밀번호가 만들어졌어요')}</div>
              <div className="ad-banner__body" style={{ color: 'var(--ad-bad)', fontWeight: 700 }}>
                {temp.email} · 이 화면을 벗어나면 다시 볼 수 없어요. 지금 복사해서 전달해 주세요.
              </div>
              <div className="ad-inline" style={{ marginTop: 14 }}>
                <span className="ad-secret tnum">{temp.password}</span>
                <button
                  type="button"
                  className="ad-btn ad-btn--primary ad-btn--xl"
                  onClick={() => {
                    void navigator.clipboard.writeText(temp.password).then(
                      () => toast(t('복사했어요')),
                      () => toast(t('복사하지 못했어요'))
                    )
                  }}
                >
                  {t('복사')}
                </button>
                <button
                  type="button"
                  className="ad-btn ad-btn--line ad-btn--xl"
                  onClick={() => setTemp(null)}
                >
                  확인했어요
                </button>
              </div>
              <p className="ad-fine" style={{ marginTop: 12 }}>
                받은 분은 로그인 뒤 ‘내 계정’ 에서 자기 비밀번호로 바꿔 주세요.
              </p>
            </div>
          )}
        </form>

        <div className="ad-card">
          <div className="ad-card__head">
            <div className="ad-card__titleRow">
              <span className="ad-card__title">{t('계정')}</span>
              <span className="ad-card__num tnum">{list?.length ?? 0}개</span>
            </div>
          </div>

          {list === null ? (
            <div className="ad-skels">
              {[0, 1, 2].map((i) => (
                <div key={i} className="ad-skel ad-skel--row" />
              ))}
            </div>
          ) : list.length === 0 ? (
            <div className="ad-empty">
              <div className="ad-empty__title">{t('아직 계정이 없어요')}</div>
              <div className="ad-empty__sub">
                위에 이메일을 넣으면 계정과 임시 비밀번호가 만들어져요.
              </div>
            </div>
          ) : (
            <div className="ad-rows" data-staff-list>
              {list.map((o) => {
                const me = user?.email?.toLowerCase() === o.email.toLowerCase()
                return (
                  <div key={o.userId} className="ad-row">
                    <div style={{ minWidth: 180, flex: 1 }}>
                      <div className="ad-card__titleRow">
                        <span style={{ fontSize: 14, fontWeight: 700 }}>{o.email}</span>
                        {me && (
                          <span className="ad-tag ad-tag--sm" data-tone="on">
                            나
                          </span>
                        )}
                      </div>
                      <div className="ad-fine tnum" style={{ marginTop: 4 }}>
                        {new Date(o.createdAt).toLocaleDateString('ko-KR')} 부터
                      </div>
                    </div>
                    <div className="ad-btnrow">
                      <button
                        type="button"
                        className="ad-btn ad-btn--line ad-btn--sm"
                        disabled={busy}
                        onClick={() => void reset(o)}
                      >
                        비밀번호 재발급
                      </button>
                      {/* 자기 자신은 못 뺀다 — 스스로 잠기면 아무도 못 들어온다 (서버도 같이 막는다) */}
                      <button
                        type="button"
                        className="ad-btn ad-btn--danger ad-btn--sm"
                        disabled={busy || me}
                        onClick={() => void remove(o)}
                        data-staff-remove
                      >
                        {me ? t('나는 뺄 수 없어요') : t('빼기')}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

/**
 * 임시 비밀번호 — **읽어서 옮겨 적을 값**이라 헷갈리는 글자를 뺀다 (0/O, 1/l/I).
 * Edge Function 의 재발급이 쓰는 알파벳과 같은 규칙이다.
 */
function tempPassword(): string {
  const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
  const values = new Uint32Array(12)
  crypto.getRandomValues(values)
  const chars = Array.from(values, (v) => ALPHABET[v % ALPHABET.length])
  return [chars.slice(0, 4), chars.slice(4, 8), chars.slice(8, 12)].map((g) => g.join('')).join('-')
}
