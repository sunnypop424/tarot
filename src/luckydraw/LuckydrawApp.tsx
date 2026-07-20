import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Minus, Plus } from 'lucide-react'

import { luckydrawDisplay, type LuckydrawDisplay } from '@/data/luckydraw'
import { repo } from '@/lib/repo'
import type { DrawResult, LuckydrawSettings, Prize } from '@/lib/repo'
import { useAdminAuth } from '@/admin/useAdminAuth'
import { useSlot } from '@/slot/SlotProvider'
import { useLivePreview } from '@/slot/preview'
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
/**
 * 미리보기용 가짜 결과 — **편집기에서 진짜로 뽑을 수는 없다** (재고를 태우게 된다).
 *
 * 하이라이트 등수를 반드시 섞는다: 커버 색·커버 문자·긁는 연출이 이 화면의 핵심인데
 * 샘플에 비싼 등수가 없으면 최고관리자가 그걸 못 보고 색을 고르게 된다.
 */
function sampleResult(display: LuckydrawDisplay): DrawResult {
  const high = display.highlightRanks[0] ?? 1
  const ranks = [high, high, 3, 3, 4]
  return {
    batchId: 'preview',
    rehearsal: true,
    results: ranks.map((rank, i) => ({
      prizeId: `preview-${i}`,
      rank,
      name: `${rank}등 상품`,
      requiresShipping: rank === high,
    })),
    prizes: [],
  }
}

export default function LuckydrawApp() {
  const slot = useSlot()
  const display = luckydrawDisplay(slot)
  const { status: authStatus } = useAdminAuth(slot.slug)
  const preview = useLivePreview()

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

  const realRemaining = (prizes ?? []).reduce((sum, p) => sum + p.remaining, 0)
  const soldOut = prizes !== null && realRemaining === 0
  const closed = settings?.closed === true

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

  /**
   * 편집기 미리보기 — 저장된 상품이 없어도(새 슬롯) 화면이 나와야 하고,
   * 당첨 연출은 가짜 결과로 보여준다. 진짜 추첨은 재고를 태우므로 여기서 못 한다.
   */
  const previewing = preview !== null
  const previewView =
    preview && preview.state !== 'draw'
      ? { result: sampleResult(display), summary: preview.state === 'summary' }
      : null

  /**
   * 미리보기에선 **재고·마감 상태를 무시하고 뽑기 화면을 보여준다.**
   *
   * 상품을 아직 안 넣은 새 슬롯은 재고가 0 이라 "마감되었습니다" 가 뜬다. 색을 고르려고
   * 편집기를 연 최고관리자에게 그 화면은 아무 쓸모가 없고, 마감 문구를 보려면 토글로
   * 볼 수 있어야 할 것을 상태 때문에 강제로 보게 된다.
   * 재고 배지도 그럴듯한 수를 써서 실제 화면과 같은 배치를 보여준다.
   */
  const unavailable = previewing ? false : soldOut || closed
  const remaining = previewing && realRemaining === 0 ? 120 : realRemaining

  if (prizes === null && !previewing) return <div className="app" aria-busy="true" />

  return (
    <div className={`app ${styles.app}`}>
      <main className={styles.stage}>
        <div className={`surface ${styles.panel}`}>
          {previewView ? (
            <ResultReveal
              /** 토글을 옮기면 연출을 처음부터 다시 — 긁은 상태가 남아 있으면 안 본 것처럼 안 보인다 */
              key={previewView.summary ? 'summary' : 'result'}
              result={previewView.result}
              display={display}
              displayMode={settings?.displayMode ?? 'both'}
              slug={slot.slug}
              /** 미리보기에선 되돌아갈 데가 없다 — 상태는 편집기의 토글이 정한다 */
              onFinish={() => {}}
              startAtSummary={previewView.summary}
            />
          ) : (
            <>
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
            </>
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
