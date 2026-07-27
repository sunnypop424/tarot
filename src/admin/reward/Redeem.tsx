import { useState } from 'react'
import { CircleCheck, CircleX, ScanLine, TriangleAlert } from 'lucide-react'

import { db } from '@/lib/repo/client'
import { useSlot } from '@/slot/SlotProvider'

/**
 * 교환코드 수령 확인 — **스태프가 쓰는 화면. 세 서비스가 공유한다**
 * (스탬프 완성 / 모의고사 커트라인 / 포토카드 실물).
 *
 * **중복 수령을 실제로 막는 게 이 화면 하나다.** 손님 폰의 코드만으로는 "이미 받았는지" 를
 * 아무도 모른다 — 개발자도구로 고쳐도 서버는 모르기 때문이다. 그래서 `reward_redeem` 은
 * `manages_slot` 게이트가 걸려 있고 anon 은 아예 못 부른다.
 *
 * 현장에서 한 손으로 쓰는 화면이라 입력칸을 크게 두고, 확인 뒤 **자동으로 비워** 다음 손님을
 * 바로 받게 한다.
 */
export function Redeem() {
  const slot = useSlot()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<
    | { kind: 'ok'; label: string }
    | { kind: 'already'; label: string; at: string }
    | { kind: 'none' }
    | { kind: 'error'; message: string }
    | null
  >(null)

  async function go(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim() || busy) return
    setBusy(true)
    setResult(null)
    try {
      const { data, error } = await (await db()).rpc('reward_redeem', {
        target: slot.slug,
        raw_code: code,
      })
      if (error) throw new Error(error.message)
      const row = (data as { ok: boolean; label: string | null; already: boolean; redeemed_at: string | null }[])?.[0]
      if (!row?.ok) setResult({ kind: 'none' })
      else if (row.already) setResult({ kind: 'already', label: row.label ?? '', at: row.redeemed_at ?? '' })
      else setResult({ kind: 'ok', label: row.label ?? '' })
      setCode('')
    } catch (e) {
      setResult({ kind: 'error', message: e instanceof Error ? e.message : '확인하지 못했어요' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <header className="admin__head">
        <div>
          <h1 className="t-title-l">수령 확인</h1>
          <p className="t-text-xs t-muted">
            손님 폰에 뜬 교환코드를 입력하세요. <b>한 번 처리하면 다시 쓸 수 없습니다.</b>
          </p>
        </div>
      </header>

      <form onSubmit={go} className="card" style={{ padding: 22, maxWidth: 520 }} data-redeem-form>
        <label className="field">
          <span className="field__label">교환코드</span>
          <input
            className="input"
            style={{
              height: 62,
              fontSize: 30,
              fontWeight: 800,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              fontFamily: 'ui-monospace, Menlo, monospace',
              textAlign: 'center',
            }}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="XK4T-9P2M"
            autoFocus
            autoCapitalize="characters"
            autoComplete="off"
            data-redeem-code
          />
          <span className="field__hint">소문자·하이픈·공백은 알아서 맞춰집니다.</span>
        </label>
        <button
          type="submit"
          className="btn btn--primary"
          style={{ width: '100%', height: 52, marginTop: 14 }}
          disabled={!code.trim() || busy}
        >
          <ScanLine size={18} strokeWidth={2} aria-hidden="true" />
          {busy ? '확인 중…' : '수령 처리'}
        </button>
      </form>

      {result && (
        <div className="card" style={{ padding: 20, marginTop: 16, maxWidth: 520 }} data-redeem-result>
          {result.kind === 'ok' && (
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <CircleCheck size={26} strokeWidth={2} aria-hidden="true" style={{ flex: 'none' }} />
              <div>
                <div className="t-title-s" style={{ margin: 0 }}>수령 처리했어요</div>
                <p className="t-text-s t-muted" style={{ margin: '4px 0 0' }}>
                  {result.label} — 손님께 전달해 주세요.
                </p>
              </div>
            </div>
          )}
          {result.kind === 'already' && (
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <TriangleAlert size={26} strokeWidth={2} aria-hidden="true" style={{ flex: 'none' }} />
              <div>
                <div className="t-title-s" style={{ margin: 0 }}>이미 수령한 코드예요</div>
                <p className="t-text-s t-muted" style={{ margin: '4px 0 0' }}>
                  {result.at &&
                    `${new Date(result.at).toLocaleString('ko-KR', {
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}에 처리됨`}
                  {result.label ? ` · ${result.label}` : ''}
                </p>
              </div>
            </div>
          )}
          {result.kind === 'none' && (
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <CircleX size={26} strokeWidth={2} aria-hidden="true" style={{ flex: 'none' }} />
              <div>
                <div className="t-title-s" style={{ margin: 0 }}>없는 코드예요</div>
                <p className="t-text-s t-muted" style={{ margin: '4px 0 0' }}>
                  손님 화면의 코드를 다시 확인해 주세요.
                </p>
              </div>
            </div>
          )}
          {result.kind === 'error' && <p className="field__error" style={{ margin: 0 }}>{result.message}</p>}
        </div>
      )}
    </div>
  )
}
