import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CircleCheck, CircleX, Clock, Info, Lock, WifiOff } from 'lucide-react'

import { repo } from '@/lib/repo'
import { getSlotService, serviceLabel } from '@/data/services'
import { fontStack } from '@/data/fonts'
import { useAdminAuth } from '@/admin/useAdminAuth'
import type { RedeemResult } from '@/lib/repo/types'
import type { Slot } from '@/types/slot'
import { useOnline, useStaffLog } from './staffLocal'
import styles from './Staff.module.css'

/**
 * 교환 확인 스태프 화면 — `/{slug}/staff` (스탬프 · 모의고사).
 *
 * **관리 화면 안에 있던 걸 밖으로 뺐다.** 카운터에 세워두는 기기에 관리 사이드바가 같이 뜨면
 * 손님이 누른다 — 다른 메뉴로 들어가 설정을 건드릴 수 있는 화면을 부스에 세워둘 수는 없다.
 * (주최자 화면의 '수령 확인' 은 그대로 둔다. 거기엔 발급 목록·CSV 가 같이 있고,
 * 그건 사무 작업이지 카운터 작업이 아니다.)
 *
 * 게이트는 두 겹이다 — 여기서 로그인을 보고 `reward_redeem` 이 `manages_slot` 을 다시 본다.
 * 화면만 막는 건 아무것도 막지 못한다.
 */
export function RedeemStaff({ slot }: { slot: Slot }) {
  const { slug } = slot
  const source = getSlotService(slot)
  const { status } = useAdminAuth(slug)
  const online = useOnline()
  /** 오늘 **이 기기에서** 처리한 수 + 직전 결과 (서버 합계가 아니다 — staffLocal.ts 주석) */
  const log = useStaffLog<{ code: string; label: string }>(slug)

  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<(RedeemResult & { code: string }) | null>(null)

  const vars = useMemo(
    () => ({
      ['--ds-font' as string]: fontStack('pretendard'),
      ['--ds-box-top' as string]: '120px',
      ['--ds-box-padding' as string]: '28px',
    }),
    []
  )

  const shell = (children: React.ReactNode) => (
    <div className={`app ${styles.app}`}>
      <main className={styles.stage} style={vars}>
        <div className={`surface ${styles.panel}`}>{children}</div>
        <a className={styles.adminLink} href={`/${slug}/admin/redeem`}>
          관리자 페이지로 이동
        </a>
      </main>
    </div>
  )

  if (status === 'checking') return shell(<div className={styles.center} aria-busy="true" />)

  if (status === 'out') {
    return shell(
      <div className={styles.center}>
        <Lock size={32} strokeWidth={1.6} aria-hidden="true" />
        <div className={styles.centerTitle}>스태프만 쓰는 화면이에요</div>
        <p className={styles.centerBody}>
          행사 계정으로 한 번만 로그인해 두시면 이 기기에서 계속 쓸 수 있어요.
        </p>
        <Link className={styles.linkBtn} to={`/${slug}/admin/login`}>
          로그인하러 가기
        </Link>
      </div>
    )
  }

  if (!repo.rewards.ready()) {
    return shell(
      <div className={styles.center}>
        <div className={styles.centerTitle}>지금은 교환 확인을 쓸 수 없어요</div>
        <p className={styles.centerBody}>백엔드가 연결된 배포에서만 동작해요.</p>
      </div>
    )
  }

  async function go(e: React.FormEvent) {
    e.preventDefault()
    if (busy || !code.trim()) return
    setBusy(true)
    setError(null)
    try {
      const r = await repo.rewards.redeem(slug, code)
      setResult({ ...r, code: code.trim().toUpperCase() })
      // **처음 처리한 것만 센다** — 이미 받은 코드를 다시 찍어보는 건 처리가 아니다
      if (r.ok && !r.already) log.record({ code: code.trim().toUpperCase(), label: r.label ?? '' })
      setCode('')
    } catch (e) {
      setError(
        online
          ? e instanceof Error
            ? e.message
            : '확인하지 못했어요'
          : '연결이 끊겼어요 — 와이파이를 확인하고 다시 눌러 주세요'
      )
    } finally {
      setBusy(false)
    }
  }

  const when = (iso: string) =>
    new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <div className={`app ${styles.app}`}>
      <main className={styles.stage} style={vars}>
        <div className={`surface ${styles.panel}`}>
          <div className={styles.band}>
            <span className={styles.bandMsg}>{serviceLabel(source)} · 교환권 확인</span>
          </div>

          {!online && (
            <div className={styles.banner} data-offline>
              <WifiOff size={16} aria-hidden="true" />
              <span>
                <b>연결이 끊겼어요.</b> 확인을 눌러도 서버에 닿지 않아요 — 와이파이를 확인해 주세요.
              </span>
            </div>
          )}

          {result ? (
            <div className={styles.reveal}>
              <div
                className={styles.verdict}
                data-kind={result.ok && !result.already ? 'ok' : result.already ? 'already' : 'none'}
                data-verdict
              >
                <span className={styles.verdictIcon}>
                  {result.ok && !result.already ? (
                    <CircleCheck size={40} strokeWidth={1.7} aria-hidden="true" />
                  ) : result.already ? (
                    <Clock size={40} strokeWidth={1.7} aria-hidden="true" />
                  ) : (
                    <CircleX size={40} strokeWidth={1.7} aria-hidden="true" />
                  )}
                </span>
                <div className={styles.verdictTitle}>
                  {result.ok && !result.already ? '수령 처리했어요' : result.already ? '이미 받아가셨어요' : '없는 번호예요'}
                </div>
                <p className={styles.verdictBody}>
                  {result.ok ? (
                    <>
                      {result.label}
                      {result.already && result.redeemedAt && (
                        <>
                          <br />
                          {when(result.redeemedAt)} 에 처리됨
                        </>
                      )}
                    </>
                  ) : (
                    '번호를 다시 확인해 주세요. 이 행사에서 발급한 번호가 아니에요.'
                  )}
                </p>
              </div>

              <div className={styles.revealFoot}>
                <button
                  type="button"
                  className="btn btn--primary btn--block"
                  onClick={() => setResult(null)}
                  data-next
                >
                  다음 손님
                </button>
              </div>
            </div>
          ) : (
            <form className={styles.controls} onSubmit={(e) => void go(e)}>
              <p className={styles.label}>교환권 번호</p>
              <p className={styles.hint}>손님 폰에 뜬 번호를 그대로 입력해 주세요.</p>
              <input
                className={styles.codeInput}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="XK4T-9P2M"
                maxLength={12}
                autoCapitalize="characters"
                autoComplete="off"
                autoFocus
                aria-label="교환권 번호"
                data-redeem-code
              />
              <button
                type="submit"
                className="btn btn--primary btn--block"
                style={{ height: 56 }}
                disabled={busy || code.trim().length < 4}
                data-redeem
              >
                {busy ? '확인 중…' : '확인'}
              </button>

              {error && (
                <p className={styles.error} data-error>
                  {error}
                </p>
              )}

              {/* 직전 결과 — 전달 착오가 나면 되짚어야 한다 (누른 뒤 화면이 비면 확인할 길이 없다) */}
              {log.last && (
                <div className={styles.banner} data-last>
                  <Info size={16} aria-hidden="true" />
                  <span>
                    직전: <b>{log.last.code}</b> · {log.last.label}
                    {log.at ? ` (${when(log.at)})` : ''}
                  </span>
                </div>
              )}
            </form>
          )}
        </div>

        {/* 박스 아래는 스태프만 보는 줄이다 — 포토카드 스태프 화면과 같은 자리 */}
        <div className={styles.footRow}>
          <span className={styles.tally} data-tally>
            오늘 이 기기 {log.count}건
          </span>
          <a className={styles.adminLink} href={`/${slug}/admin/redeem`}>
            관리자 페이지로 이동
          </a>
        </div>
      </main>
    </div>
  )
}
