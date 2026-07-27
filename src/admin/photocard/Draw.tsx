import { useCallback, useEffect, useState } from 'react'
import { CircleCheck, Image as ImageIcon, Sparkles, TriangleAlert } from 'lucide-react'

import { repo } from '@/lib/repo'
import { photocardRules, RARITY_LABEL } from '@/data/photocard'
import type { PhotocardDrawn, PhotocardSettings } from '@/lib/repo/types'
import { cssUrl } from '@/lib/image'
import { useSlot } from '@/slot/SlotProvider'
import { useAdminAuth } from '../useAdminAuth'
import { toast } from '../AdminFeedback'
import styles from './Photocard.module.css'

/**
 * 스태프 뽑기 — **부스 태블릿에서 손으로 누르는 화면.** 그래서 모든 게 크다.
 *
 * **실물이 걸리면 뽑기는 항상 여기서 일어난다.**
 *   gift : 손님 폰의 뽑기권 번호를 입력해 한 장
 *   sale : 현장 결제 뒤 N연차
 *
 * 게이트가 **두 겹**이다 (럭키드로우와 같다):
 *  ① 화면 — 로그인 안 했으면 버튼이 안 눌린다
 *  ② RPC — `manages_slot` 확인 + 모드 확인. **화면 disabled 만으로는 아무것도 못 막는다.**
 */
export function Draw() {
  const slot = useSlot()
  const slug = slot.slug
  const { status } = useAdminAuth(slug)
  const [settings, setSettings] = useState<PhotocardSettings | null>(null)
  const [stats, setStats] = useState<{ issued: number; drawn: number } | null>(null)
  const [count, setCount] = useState(1)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<PhotocardDrawn[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const st = await repo.photocard.settings(slug)
    setSettings(st)
    if (photocardRules(st.mode).usesTicket) setStats(await repo.photocard.ticketStats(slug).catch(() => null))
  }, [slug])

  useEffect(() => {
    void load()
  }, [load])

  if (!repo.photocard.ready()) {
    return (
      <div className="admin-empty">
        <Sparkles size={44} strokeWidth={1.6} aria-hidden="true" />
        <div className="admin-empty__title">지금 빌드에서는 뽑기를 쓸 수 없어요</div>
      </div>
    )
  }
  if (!settings) return null

  const rules = photocardRules(settings.mode)
  const locked = status !== 'in'

  if (rules.visitorDraws) {
    return (
      <div>
        <header className="admin__head">
          <div>
            <h1 className="t-title-l">뽑기</h1>
          </div>
        </header>
        <div className="admin-empty">
          <Sparkles size={44} strokeWidth={1.6} aria-hidden="true" />
          <div className="admin-empty__title">이 이벤트는 손님이 직접 뽑아요</div>
          <div className="t-text-s t-muted">
            운영 방식이 '저장용' 이라 스태프가 뽑을 일이 없어요. '카드' 화면에서 방식을 바꿀 수 있습니다.
          </div>
        </div>
      </div>
    )
  }

  async function go() {
    if (busy || locked) return
    setBusy(true)
    setError(null)
    setResult(null)
    const wait = new Promise((r) => setTimeout(r, 1200))
    try {
      const cards = rules.usesTicket
        ? [await repo.photocard.drawByTicket(slug, code)]
        : await repo.photocard.drawBatch(slug, count)
      await wait
      setResult(cards)
      setCode('')
      await load()
    } catch (e) {
      await wait
      setError(e instanceof Error ? e.message : '뽑지 못했어요')
    } finally {
      setBusy(false)
    }
  }

  const max = Math.max(1, Math.min(settings.batchCount, 50))

  return (
    <div>
      <header className="admin__head">
        <div>
          <h1 className="t-title-l">{rules.usesTicket ? '뽑기권으로 뽑기' : '포토카드 뽑기'}</h1>
          <p className="t-text-xs t-muted">
            {rules.usesTicket
              ? '손님 폰에 뜬 네 자리 번호를 입력하세요. 한 번 뽑은 번호는 다시 쓸 수 없습니다.'
              : '현장 결제를 확인한 뒤 장수를 정해 뽑아 주세요.'}
          </p>
        </div>
      </header>

      {settings.rehearsal && (
        <div className={`${styles.banner} ${styles.bannerWarn}`}>
          <TriangleAlert size={20} strokeWidth={2} aria-hidden="true" style={{ flex: 'none' }} />
          <p className="t-text-s" style={{ margin: 0 }}>
            <b>지금은 연습 모드예요.</b> 뽑아도 재고가 줄지 않고 기록에도 '연습' 으로 남습니다.
            행사를 시작하실 땐 '카드' 화면에서 꺼 주세요.
          </p>
        </div>
      )}
      {settings.closed && (
        <div className={styles.banner}>
          <TriangleAlert size={20} strokeWidth={2} aria-hidden="true" style={{ flex: 'none' }} />
          <p className="t-text-s" style={{ margin: 0 }}>마감된 이벤트예요 — 지금은 뽑을 수 없습니다.</p>
        </div>
      )}
      {stats && (
        <div className={styles.banner}>
          <CircleCheck size={20} strokeWidth={2} aria-hidden="true" style={{ flex: 'none' }} />
          <p className="t-text-s" style={{ margin: 0 }}>
            뽑기권 발급 <b>{stats.issued}</b>장 · 뽑음 <b>{stats.drawn}</b>장 · 대기{' '}
            <b>{stats.issued - stats.drawn}</b>장
            <br />
            <span className="t-muted t-text-xs">
              발급 수가 손님 수보다 훨씬 많으면 알려 주세요 — 브라우저를 지우고 다시 받은 경우일 수 있어요.
            </span>
          </p>
        </div>
      )}

      <section className={`card ${styles.staff}`} style={{ padding: 24 }}>
        <div className={styles.stage}>
          <div className={styles.bigCard} data-busy={busy || undefined}>
            {result?.length === 1 && result[0].image ? (
              <div
                style={{ position: 'absolute', inset: 0, backgroundImage: cssUrl(result[0].image), backgroundSize: 'cover', backgroundPosition: 'center' }}
                role="img"
                aria-label={result[0].name}
              />
            ) : (
              <Sparkles size={34} strokeWidth={1.6} aria-hidden="true" />
            )}
            {busy && <div className={styles.shine} aria-hidden="true" />}
          </div>
        </div>

        <div className={styles.panel}>
          {rules.usesTicket ? (
            <>
              <div className={styles.ask}>뽑기권 번호</div>
              <input
                className={`input ${styles.codeInput}`}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="K7QM"
                maxLength={8}
                autoCapitalize="characters"
                autoComplete="off"
                aria-label="뽑기권 번호"
                data-ticket-code
              />
              <button
                type="button"
                className={styles.go}
                disabled={busy || locked || settings.closed || code.trim().length < 4}
                onClick={() => void go()}
                data-draw
              >
                {busy ? '뽑는 중…' : '뽑기'}
              </button>
            </>
          ) : (
            <>
              <div className={styles.ask}>몇 장을 뽑을까요?</div>
              <div className={styles.stepper}>
                <button
                  type="button"
                  className={styles.stepBtn}
                  disabled={count <= 1}
                  onClick={() => setCount((n) => Math.max(1, n - 1))}
                  aria-label="한 장 줄이기"
                >
                  −
                </button>
                <div className={styles.stepValue} data-count>{count}</div>
                <button
                  type="button"
                  className={styles.stepBtn}
                  disabled={count >= max}
                  onClick={() => setCount((n) => Math.min(max, n + 1))}
                  aria-label="한 장 늘리기"
                >
                  +
                </button>
              </div>
              <div className={styles.quick}>
                {[1, 3, 5, 10].filter((n) => n <= max).map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={styles.quickBtn}
                    data-on={count === n || undefined}
                    onClick={() => setCount(n)}
                  >
                    {n}장
                  </button>
                ))}
              </div>
              <button
                type="button"
                className={styles.go}
                disabled={busy || locked || settings.closed}
                onClick={() => void go()}
                data-draw
              >
                {busy ? '뽑는 중…' : `${count}장 뽑기`}
              </button>
            </>
          )}

          {locked && <p className="field__error" style={{ margin: 0 }}>로그인이 필요해요.</p>}
          {error && <p className="field__error" style={{ margin: 0 }} data-draw-error>{error}</p>}
        </div>
      </section>

      {result && result.length > 0 && (
        <section className="card" style={{ padding: 24, marginTop: 16, textAlign: 'center' }} data-drawn>
          <div className="t-title-s" style={{ margin: 0 }}>
            아래 카드 {result.length}장을 손님에게 전달해 주세요
          </div>
          <div className={styles.drawnRow}>
            {result.map((c, i) => (
              <div key={`${c.cardId}-${i}`} className={styles.drawnCard}>
                <div
                  className={styles.drawnFace}
                  style={c.image ? { backgroundImage: cssUrl(c.image) } : undefined}
                  role={c.image ? 'img' : undefined}
                  aria-label={c.name}
                >
                  {!c.image && <ImageIcon size={30} strokeWidth={1.6} aria-hidden="true" />}
                </div>
                <div className={styles.drawnName}>{c.name}</div>
                <div className={styles.drawnRarity}>{RARITY_LABEL[c.rarity] ?? ''}</div>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn btn--primary"
            style={{ marginTop: 22, height: 56, paddingInline: 48, fontSize: 17 }}
            onClick={() => {
              setResult(null)
              toast('다음 손님을 받아 주세요')
            }}
            data-done
          >
            전달 완료
          </button>
        </section>
      )}
    </div>
  )
}
