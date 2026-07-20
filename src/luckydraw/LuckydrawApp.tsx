import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Minus, Plus } from 'lucide-react'

import { luckydrawDisplay } from '@/data/luckydraw'
import { repo } from '@/lib/repo'
import type { DrawResult, LuckydrawSettings, Prize } from '@/lib/repo'
import { useAdminAuth } from '@/admin/useAdminAuth'
import { useSlot } from '@/slot/SlotProvider'
import { ResultReveal } from './ResultReveal'
import styles from './Luckydraw.module.css'

/** 한 번에 뽑을 수 있는 최대 — 서버도 같은 값으로 막는다 (`draw_prizes`) */
const MAX_DRAW = 100
const QUICK = [1, 5, 10]

/**
 * 럭키드로우 방문자 화면.
 *
 * **누르는 사람이 방문자가 아니다.** 부스에 놓인 태블릿에 스태프가 관리자 로그인을 해 두고,
 * 방문자가 보는 앞에서 스태프가 뽑는다. 그래서 로그인하지 않으면 버튼이 아예 안 산다 —
 * 주소가 새어 나가도 남이 재고를 태울 수 없어야 한다 (원본이 그렇게 설계돼 있었고, 그 이유가 옳다).
 *
 * 타로와 정반대라 셸도 다르다: 탭바도 카드 도감도 없다. 이 슬롯엔 화면이 하나뿐이다.
 */
export default function LuckydrawApp() {
  const slot = useSlot()
  const display = luckydrawDisplay(slot)
  const { status: authStatus } = useAdminAuth(slot.slug)

  const [prizes, setPrizes] = useState<Prize[] | null>(null)
  const [settings, setSettings] = useState<LuckydrawSettings | null>(null)
  const [count, setCount] = useState(1)
  const [drawing, setDrawing] = useState(false)
  const [result, setResult] = useState<DrawResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [p, s] = await Promise.all([
        repo.luckydraw.listPrizes(slot.slug),
        repo.luckydraw.getSettings(slot.slug),
      ])
      setPrizes(p)
      setSettings(s)
    } catch {
      // 못 읽은 것과 상품이 없는 것은 다르다 — 빈 배열로 두면 "마감" 처럼 보인다
      setError('상품 정보를 불러오지 못했어요')
      setPrizes([])
    }
  }, [slot.slug])

  useEffect(() => {
    void load()
  }, [load])

  const remaining = (prizes ?? []).reduce((sum, p) => sum + p.remaining, 0)
  const soldOut = prizes !== null && remaining === 0
  const closed = settings?.closed === true
  const unavailable = soldOut || closed

  async function draw() {
    if (drawing) return
    setDrawing(true)
    setError(null)
    try {
      const next = await repo.luckydraw.draw(slot.slug, count)
      setResult(next)
      // 서버가 최신 재고를 같이 준다 — 다시 읽을 필요가 없다
      setPrizes(next.prizes)
    } catch (e) {
      // 마감·재고 부족·권한 없음 — 서버가 한국어로 답한다
      setError(e instanceof Error ? e.message : '추첨하지 못했어요')
    } finally {
      setDrawing(false)
    }
  }

  function finish() {
    setResult(null)
    setCount(1)
    void load()
  }

  if (prizes === null) return <div className="app" aria-busy="true" />

  return (
    <div className={`app ${styles.app}`}>
      <main className={styles.stage}>
        <div className={`surface ${styles.panel}`}>
          {settings?.rehearsal && !unavailable && (
            <p className={styles.rehearsal} data-rehearsal>
              지금은 리허설이에요. 뽑아도 실제 재고는 줄지 않아요.
            </p>
          )}

          {result ? (
            <ResultReveal
              result={result}
              display={display}
              displayMode={settings?.displayMode ?? 'both'}
              slug={slot.slug}
              onFinish={finish}
            />
          ) : unavailable ? (
            <p className={styles.closed}>{display.closedText}</p>
          ) : (
            <div className={styles.controls}>
              {display.lowStockThreshold !== null && remaining <= display.lowStockThreshold && (
                <p className={styles.lowStock}>{remaining}개 남았어요</p>
              )}

              <div className={styles.counter}>
                <button
                  type="button"
                  className="btn-icon"
                  aria-label="한 개 줄이기"
                  onClick={() => setCount((n) => Math.max(1, n - 1))}
                >
                  <Minus size={18} aria-hidden="true" />
                </button>
                <input
                  className={styles.countInput}
                  type="number"
                  inputMode="numeric"
                  aria-label="뽑을 개수"
                  value={count}
                  min={1}
                  max={MAX_DRAW}
                  onChange={(e) =>
                    setCount(Math.max(1, Math.min(MAX_DRAW, Number(e.target.value) || 1)))
                  }
                />
                <button
                  type="button"
                  className="btn-icon"
                  aria-label="한 개 늘리기"
                  onClick={() => setCount((n) => Math.min(MAX_DRAW, n + 1))}
                >
                  <Plus size={18} aria-hidden="true" />
                </button>
              </div>

              <div className={styles.quick}>
                {QUICK.map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`btn btn--ghost ${count === n ? styles.quickOn : ''}`}
                    onClick={() => setCount(n)}
                  >
                    {n}개
                  </button>
                ))}
              </div>

              {/**
               * 로그인 전에는 버튼 대신 **왜 못 누르는지**를 보여준다.
               * 비활성 버튼만 두면 스태프가 "고장났나" 하고 행사 중에 헤맨다.
               */}
              {authStatus === 'in' ? (
                <button
                  type="button"
                  className="btn btn--primary btn--block"
                  disabled={drawing}
                  onClick={draw}
                  data-draw
                >
                  {drawing ? '뽑는 중…' : display.drawLabel}
                </button>
              ) : (
                <Link to={`/${slot.slug}/admin`} className="btn btn--primary btn--block">
                  {authStatus === 'checking' ? '확인 중…' : '스태프 로그인'}
                </Link>
              )}

              {authStatus === 'out' && (
                <p className="t-text-xs t-muted">
                  추첨은 스태프만 할 수 있어요. 로그인하면 버튼이 열려요.
                </p>
              )}
            </div>
          )}

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </div>
      </main>
    </div>
  )
}
