import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye, EyeOff, ExternalLink, Info, Lock, Play, Square, WifiOff } from 'lucide-react'

import { repo } from '@/lib/repo'
import { fontStack } from '@/data/fonts'
import { useAdminAuth } from '@/admin/useAdminAuth'
import type { CheerSettings } from '@/lib/repo/types'
import type { Slot } from '@/types/slot'
import { useOnline } from './staffLocal'
import styles from './Staff.module.css'

/**
 * 상영 제어 — `/{slug}/staff` (영상회 응원).
 *
 * **영상과 동기화하지 않는다.** 영상 소스가 매번 다르고(파일·유튜브·DVD), 재생 위치를 알려면
 * 영상을 우리 페이지에서 재생해야 한다 — 저작권 있는 파일을 우리 화면에 올리는 일이라
 * 이 플랫폼이 계속 피해온 자리다. 대신 **'상영 시작' 을 누른 시각 하나**를 기준점으로 삼는다.
 *
 * 이 화면은 **폰**이다. 프로젝터 옆에 선 사람이 들고 누른다 — 노트북 앞에 붙어 있지 않아도 된다.
 * (노트북에서 쓸 땐 상영 화면의 단축키: 스페이스=감추기 토글 · C=크레딧.)
 */
export function ShowStaff({ slot }: { slot: Slot }) {
  const { slug } = slot
  const { status } = useAdminAuth(slug)
  const online = useOnline()

  const [s, setS] = useState<CheerSettings | null>(null)
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(async () => {
    setS(await repo.cheer.settings(slug).catch(() => null))
  }, [slug])

  useEffect(() => {
    if (status === 'in') void load()
  }, [load, status])

  /** 다른 기기에서 눌렀을 수도 있다 (제어판이 둘일 수 있다) */
  useEffect(() => {
    if (status !== 'in' || !repo.cheer.ready()) return
    return repo.cheer.watch(slug, () => void load())
  }, [slug, status, load])

  /** 경과 시간을 1초마다 새로 그린다 (상영 중엔 이 숫자가 유일한 기준이다) */
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const vars = {
    ['--ds-font' as string]: fontStack('pretendard'),
    ['--ds-box-top' as string]: '90px',
    ['--ds-box-padding' as string]: '26px',
  }

  const shell = (children: React.ReactNode) => (
    <div className={`app ${styles.app}`}>
      <main className={styles.stage} style={vars}>
        <div className={`surface ${styles.panel}`}>{children}</div>
        <a className={styles.adminLink} href={`/${slug}/admin/cheer`}>
          관리자 페이지로 이동
        </a>
      </main>
    </div>
  )

  if (status === 'checking') return shell(<div className={styles.center} aria-busy="true" />)
  if (status === 'out')
    return shell(
      <div className={styles.center}>
        <Lock size={32} strokeWidth={1.6} aria-hidden="true" />
        <div className={styles.centerTitle}>상영 제어는 주최자만 써요</div>
        <p className={styles.centerBody}>행사 계정으로 한 번만 로그인해 두시면 이 기기에서 계속 쓸 수 있어요.</p>
        <Link className={styles.linkBtn} to={`/${slug}/admin/login`}>
          로그인하러 가기
        </Link>
      </div>
    )
  if (!s) return shell(<div className={styles.center} aria-busy="true" />)

  async function go(state: CheerSettings['showState']) {
    if (busy) return
    setBusy(true)
    try {
      setS(await repo.cheer.setShow(slug, state))
    } catch (e) {
      alert(e instanceof Error ? e.message : '바꾸지 못했어요')
    } finally {
      setBusy(false)
    }
  }

  const started = s.startedAt ? new Date(s.startedAt).getTime() : null
  const elapsed = started ? Math.max(0, Math.floor((now - started) / 1000)) : 0
  const left = s.runtimeSec > 0 && started ? s.runtimeSec - elapsed : null
  const running = s.showState !== 'idle'

  return (
    <div className={`app ${styles.app}`}>
      <main className={styles.stage} style={vars}>
        <div className={`surface ${styles.panel}`}>
          <div className={styles.band}>
            <span className={styles.bandMsg}>상영 제어</span>
          </div>

          {!online && (
            <div className={styles.banner} data-offline>
              <WifiOff size={16} aria-hidden="true" />
              <span>
                <b>연결이 끊겼어요.</b> 지금 누르면 상영 화면에 전달되지 않아요.
              </span>
            </div>
          )}

          {/* 지금 상태 — 큰 글씨. 어두운 상영장에서 힐끗 보고 알아야 한다 */}
          <div className={styles.showState} data-state={s.showState}>
            {s.showState === 'idle'
              ? '상영 전'
              : s.showState === 'live'
                ? '말풍선 뜨는 중'
                : s.showState === 'hidden'
                  ? '잠시 감춤'
                  : '엔딩크레딧'}
          </div>

          {running && (
            <div className={styles.clock}>
              <span className={styles.clockMain}>{hhmmss(elapsed)}</span>
              {left !== null && (
                <span className={styles.clockSub} data-soon={left <= 60 || undefined}>
                  {left > 0 ? `크레딧까지 ${hhmmss(left)}` : '크레딧 시점이 지났어요'}
                </span>
              )}
            </div>
          )}

          <div className={styles.controls}>
            {s.showState === 'idle' ? (
              <button
                type="button"
                className="btn btn--primary btn--block"
                style={{ height: 60 }}
                disabled={busy}
                onClick={() => void go('live')}
                data-show-start
              >
                <Play size={18} strokeWidth={2.2} aria-hidden="true" />
                상영 시작 (영상 재생과 같이)
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn--primary btn--block"
                  style={{ height: 54 }}
                  disabled={busy}
                  onClick={() => void go(s.showState === 'hidden' ? 'live' : 'hidden')}
                  data-show-hide
                >
                  {s.showState === 'hidden' ? (
                    <>
                      <Eye size={17} strokeWidth={2} aria-hidden="true" />
                      다시 띄우기
                    </>
                  ) : (
                    <>
                      <EyeOff size={17} strokeWidth={2} aria-hidden="true" />
                      잠시 감추기
                    </>
                  )}
                </button>
                <button
                  type="button"
                  className="btn btn--slight btn--block"
                  style={{ height: 54 }}
                  disabled={busy || s.showState === 'credits'}
                  onClick={() => void go('credits')}
                  data-show-credits
                >
                  엔딩크레딧 시작
                </button>
                <button
                  type="button"
                  className="btn btn--slight btn--block"
                  style={{ height: 44 }}
                  disabled={busy}
                  onClick={() => void go('idle')}
                  data-show-stop
                >
                  <Square size={15} strokeWidth={2} aria-hidden="true" />
                  상영 끝내기 (화면 비우기)
                </button>
              </>
            )}
          </div>

          <div className={styles.banner}>
            <Info size={16} aria-hidden="true" />
            <span>
              상영 화면은 <b>{`/${slug}/show`}</b> 한 주소예요 — 여기서 누르면 그 화면이 바뀝니다.
              {s.runtimeSec > 0 ? (
                <>
                  {' '}
                  영상 길이를 적어두셔서 <b>끝나면 크레딧이 자동으로</b> 뜹니다 (10초 안에 취소할 수 있어요).
                </>
              ) : (
                <> 관리 화면에서 영상 길이를 적어두시면 크레딧이 자동으로 떠요.</>
              )}
            </span>
          </div>
        </div>

        <div className={styles.footRow}>
          <a className={styles.tally} href={`/${slug}/show`} target="_blank" rel="noreferrer">
            상영 화면 열기
            <ExternalLink size={11} strokeWidth={2} aria-hidden="true" />
          </a>
          <a className={styles.adminLink} href={`/${slug}/admin/cheer`}>
            관리자 페이지로 이동
          </a>
        </div>
      </main>
    </div>
  )
}

/** 1:02:03 — 한 시간이 안 되면 분:초만 (상영장에서 짧을수록 읽기 쉽다) */
function hhmmss(total: number): string {
  const s = Math.max(0, total)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const two = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${two(m)}:${two(sec)}` : `${m}:${two(sec)}`
}
