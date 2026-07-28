import { useCallback, useEffect, useState } from 'react'
import { Copy, KeyRound, TriangleAlert, UserMinus, UserPlus } from 'lucide-react'

import { repo } from '@/lib/repo'
import type { Organizer } from '@/lib/repo/types'
import { useSlot } from '@/slot/SlotProvider'
import { useAdminAuth } from './useAdminAuth'
import { confirmAction, toast } from './AdminFeedback'

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
      setError(e instanceof Error ? e.message : '계정을 불러오지 못했어요')
      setList([])
    }
  }, [slug])

  useEffect(() => {
    void load()
  }, [load])

  if (!repo.organizers.ready()) {
    return (
      <>
        <header className="admin__head">
          <div>
            <h1 className="t-title-s">스태프 계정</h1>
          </div>
        </header>
        <div className="admin-empty">
          <div className="admin-empty__title">지금 빌드에서는 계정을 만들 수 없어요</div>
          <div className="t-text-s t-muted">백엔드가 연결된 배포에서만 동작해요.</div>
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
        toast('이미 있는 계정을 이 이벤트에 연결했어요 (비밀번호는 그대로예요)')
      } else {
        setTemp({ email: made.email, password })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '계정을 만들지 못했어요')
    } finally {
      setBusy(false)
    }
  }

  async function reset(o: Organizer) {
    if (
      !(await confirmAction({
        title: `${o.email} 의 비밀번호를 새로 만들까요?`,
        desc: '지금 쓰던 비밀번호는 바로 못 쓰게 돼요. 새 비밀번호는 이 화면에 한 번만 보입니다.',
        okLabel: '재발급',
      }))
    )
      return
    setBusy(true)
    try {
      const password = await repo.organizers.resetPassword(o.userId)
      setTemp({ email: o.email, password })
    } catch (e) {
      toast(e instanceof Error ? e.message : '재발급하지 못했어요')
    } finally {
      setBusy(false)
    }
  }

  async function remove(o: Organizer) {
    if (
      !(await confirmAction({
        title: `${o.email} 을 이 이벤트에서 뺄까요?`,
        desc: '이 이벤트 관리 화면에 못 들어오게 됩니다. 다른 이벤트가 없으면 계정째 지워져요.',
        okLabel: '빼기',
        danger: true,
      }))
    )
      return
    setBusy(true)
    try {
      await repo.organizers.remove(slug, o.userId)
      await load()
      toast('뺐어요')
    } catch (e) {
      toast(e instanceof Error ? e.message : '빼지 못했어요')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <header className="admin__head">
        <div>
          <h1 className="t-title-s">스태프 계정</h1>
          <p className="t-text-xs t-muted">
            이 이벤트 관리 화면에 들어올 사람을 더해요. <b>이 이벤트에만</b> 권한이 생깁니다.
          </p>
        </div>
      </header>

      <div className="admin-banner admin-banner--info">
        <TriangleAlert size={16} aria-hidden="true" />
        <span>
          계정을 나눠 주세요 — <b>한 계정을 여럿이 돌려 쓰면 누가 처리했는지 알 수 없습니다.</b>
          교환권 수령처럼 되돌릴 수 없는 일을 다루는 화면이 있어요.
        </span>
      </div>

      <form onSubmit={(e) => void add(e)} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="staff@example.com"
          aria-label="스태프 이메일"
          data-staff-email
          style={{
            flex: 1,
            minWidth: 220,
            height: 36,
            padding: '0 11px',
            border: '1px solid #dddddd',
            borderRadius: 4,
            fontSize: 13,
            background: '#fff',
            color: '#121212',
          }}
        />
        <button type="submit" className="btn btn--primary" disabled={busy} data-staff-add style={{ height: 36 }}>
          <UserPlus size={15} strokeWidth={2} aria-hidden="true" />
          계정 만들기
        </button>
      </form>

      {error && (
        <div className="admin-banner admin-banner--err">
          <TriangleAlert size={16} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {temp && (
        <div className="admin-banner admin-banner--warn" data-temp-password>
          <KeyRound size={16} aria-hidden="true" />
          <span>
            <b>{temp.email}</b> 의 임시 비밀번호예요 — <b>이 화면을 벗어나면 다시 못 봅니다.</b>
            <br />
            <code style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.04em' }}>{temp.password}</code>{' '}
            <button
              type="button"
              className="btn btn--slight"
              style={{ height: 26, marginLeft: 6 }}
              onClick={() => {
                void navigator.clipboard.writeText(temp.password).then(
                  () => toast('복사했어요'),
                  () => toast('복사하지 못했어요')
                )
              }}
            >
              <Copy size={13} strokeWidth={2} aria-hidden="true" />
              복사
            </button>
            <br />
            받은 분은 로그인 뒤 <b>'내 계정'</b> 에서 자기 비밀번호로 바꿔 주세요.
          </span>
        </div>
      )}

      {list === null ? null : list.length === 0 ? (
        <div className="admin-empty">
          <div className="admin-empty__title">아직 계정이 없어요</div>
          <div className="t-text-s t-muted">위에 이메일을 넣으면 계정과 임시 비밀번호가 만들어져요.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} data-staff-list>
          {list.map((o) => {
            const me = user?.email?.toLowerCase() === o.email.toLowerCase()
            return (
              <div
                key={o.userId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  flexWrap: 'wrap',
                  padding: '11px 14px',
                  border: '1px solid #eeeeee',
                  borderRadius: 8,
                  background: '#fff',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {o.email}
                    {me && <span style={{ marginLeft: 6, fontSize: 11, color: '#816bff' }}>나</span>}
                  </div>
                  <div style={{ fontSize: 11, color: '#8a8a8a' }}>
                    {new Date(o.createdAt).toLocaleDateString('ko-KR')} 부터
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn--slight"
                  style={{ height: 30 }}
                  disabled={busy}
                  onClick={() => void reset(o)}
                >
                  <KeyRound size={13} strokeWidth={2} aria-hidden="true" />
                  비밀번호 재발급
                </button>
                {/* 자기 자신은 못 뺀다 — 스스로 잠기면 아무도 못 들어온다 (서버도 같이 막는다) */}
                {!me && (
                  <button
                    type="button"
                    className="btn btn--slight"
                    style={{ height: 30, color: '#b23b3a' }}
                    disabled={busy}
                    onClick={() => void remove(o)}
                    data-staff-remove
                  >
                    <UserMinus size={13} strokeWidth={2} aria-hidden="true" />
                    빼기
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
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
