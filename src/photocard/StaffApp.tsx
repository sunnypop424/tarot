import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink, Image as ImageIcon, Lock, Shuffle, Sparkles, TriangleAlert } from 'lucide-react'

import { useSlotState } from '@/slot/SlotProvider'
import { photocardDisplay, photocardRules, RARITY_LABEL, type PhotocardDisplay } from '@/data/photocard'
import { getSlotService } from '@/data/services'
import { fontStack, loadWebfont } from '@/data/fonts'
import { repo } from '@/lib/repo'
import { isLight, mix } from '@/lib/color'
import { cssUrl } from '@/lib/image'
import { useAdminAuth } from '@/admin/useAdminAuth'
import type { PhotocardDrawn, PhotocardSettings } from '@/lib/repo/types'
import type { Slot } from '@/types/slot'
import styles from './Staff.module.css'

/**
 * 스태프 기기 — `/{slug}/staff`. **관리 화면이 아니다.**
 *
 * 카운터에 태블릿을 세워두고 쓰는 화면이라 손님이 같이 본다 — 그래서 `.admin` 의 고정
 * 라이트가 아니라 **슬롯 색을 그대로** 쓴다. 손님 폰과 같은 이벤트 색이어야 한 이벤트로
 * 보인다. (실시간 투표의 전광판이 먼저 만든 자리와 같은 성격이고, **관리 도구의 색은 도구의
 * 것** 이라는 규칙의 두 번째 예외다 — 둘 다 "손님에게 보여주는 화면" 이라서다.)
 *
 * 관리 화면 밖으로 뺀 이유가 하나 더 있다: 부스에 세워두는 기기에 사이드바·로그아웃·계정
 * 메뉴가 같이 떠 있으면 손님이 누른다.
 *
 * 게이트는 그대로 두 겹이다 — 여기서 로그인을 확인하고, RPC 가 `manages_slot` 을 다시 본다.
 */
export default function StaffApp() {
  const state = useSlotState()
  if (state.status === 'loading') return <div className="app" aria-busy="true" />
  if (state.status === 'missing') return null
  return <Staff slot={state.slot} />
}

function Staff({ slot }: { slot: Slot }) {
  const { slug } = slot
  const display = useMemo(() => photocardDisplay(slot), [slot])
  const { status } = useAdminAuth(slug)

  const [settings, setSettings] = useState<PhotocardSettings | null>(null)
  const [count, setCount] = useState(1)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<PhotocardDrawn[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  /**
   * 섞기 — **명목상이다.** 결과는 서버가 뽑기 버튼을 누른 뒤에 정하고, 이 상태는 연출에만 쓴다.
   * 그래도 두는 이유: 카운터에서 손님이 보는 앞이라 뽑기 전 한 박자가 필요하다.
   * 화면에도 "확률은 그대로" 라고 적는다 — 안 적으면 섞으면 잘 나온다고 믿는다.
   */
  const [shuffling, setShuffling] = useState(false)

  useEffect(() => {
    if (!shuffling) return
    const t = setTimeout(() => setShuffling(false), 700)
    return () => clearTimeout(t)
  }, [shuffling])

  useEffect(() => {
    loadWebfont(display.font)
  }, [display.font])

  const load = useCallback(async () => {
    if (!repo.photocard.ready()) return
    setSettings(await repo.photocard.settings(slug))
  }, [slug])

  useEffect(() => {
    if (status === 'in') void load()
  }, [load, status])

  const vars = {
    ['--pc-font' as string]: fontStack(display.font),
    ['--pc-head' as string]: display.headText,
    ['--pc-sub' as string]: display.subText,
    ['--pc-btn' as string]: display.buttonColor,
    ['--pc-btnFg' as string]: isLight(display.buttonColor) ? '#1f1f1f' : '#ffffff',
    ['--pc-bg' as string]: display.bg,
    ['--pc-deckBg' as string]: display.deckBg,
    ['--pc-deckGlow' as string]: display.deckGlow,
    ['--pc-deckDeep' as string]: mix(display.deckBg, 'black', 0.3),
    ['--pc-wash' as string]: mix(display.bg, isLight(display.bg) ? 'black' : 'white', 0.045),
    ['--pc-line' as string]: mix(display.bg, isLight(display.bg) ? 'black' : 'white', 0.1),
  }

  const shell = (children: React.ReactNode) => (
    <div className={styles.root} style={vars}>
      {children}
    </div>
  )

  if (getSlotService(slot) !== 'photocard') {
    return shell(
      <div className={styles.center}>
        <div className={styles.centerTitle}>이 이벤트에는 스태프 화면이 없어요</div>
        <p className={styles.centerBody}>포토카드 뽑기 이벤트에서만 쓰는 화면이에요.</p>
      </div>
    )
  }

  if (status === 'checking') return shell(<div className={styles.center} aria-busy="true" />)

  if (status === 'out') {
    return shell(
      <div className={styles.center}>
        <Lock size={40} strokeWidth={1.6} aria-hidden="true" />
        <div className={styles.centerTitle}>스태프만 쓰는 화면이에요</div>
        <p className={styles.centerBody}>
          행사 계정으로 로그인하면 이 기기에서 계속 쓸 수 있어요.
          <br />
          한 번만 로그인해 두시면 됩니다.
        </p>
        <Link className={styles.linkBtn} to={`/${slug}/admin/login`}>
          로그인하러 가기
        </Link>
      </div>
    )
  }

  if (!repo.photocard.ready() || !settings) return shell(<div className={styles.center} aria-busy="true" />)

  const rules = photocardRules(settings.mode)

  if (rules.visitorDraws) {
    return shell(
      <div className={styles.center}>
        <Sparkles size={40} strokeWidth={1.6} aria-hidden="true" />
        <div className={styles.centerTitle}>이 이벤트는 손님이 직접 뽑아요</div>
        <p className={styles.centerBody}>
          운영 방식이 '저장용' 이라 스태프가 뽑을 일이 없어요.
          <br />
          방식은 관리 화면의 '카드' 에서 바꿀 수 있습니다.
        </p>
        <Link className={styles.linkBtn} to={`/${slug}/admin/photocard`}>
          관리 화면 열기
        </Link>
      </div>
    )
  }

  const max = Math.max(1, Math.min(settings.batchCount, 50))

  async function go() {
    if (busy) return
    setBusy(true)
    setError(null)
    setResult(null)
    // 손님이 같이 보는 화면이라 연출을 최소 1.2초는 보여준다 (손님 폰과 같은 리듬)
    const wait = new Promise((r) => setTimeout(r, 1200))
    try {
      const cards = rules.usesTicket
        ? [await repo.photocard.drawByTicket(slug, code)]
        : await repo.photocard.drawBatch(slug, count)
      await wait
      setResult(cards)
      setCode('')
    } catch (e) {
      await wait
      setError(e instanceof Error ? e.message : '뽑지 못했어요')
    } finally {
      setBusy(false)
    }
  }

  return shell(
    <>
      <header className={styles.bar}>
        <span className={styles.badge}>STAFF</span>
        <div className={styles.barTitle}>{result ? '뽑기 결과' : display.title}</div>
        <div className={styles.barRight}>
          <span>{rules.usesTicket ? '1장 증정' : '판매'}</span>
          <a className={styles.barLink} href={`/${slug}/admin/photocard`}>
            <ExternalLink size={14} strokeWidth={1.8} aria-hidden="true" />
            관리
          </a>
        </div>
      </header>

      {settings.rehearsal && (
        <div className={styles.notice}>
          <TriangleAlert size={18} strokeWidth={2} aria-hidden="true" style={{ flex: 'none', marginTop: 1 }} />
          <span>
            <b>연습 모드예요.</b> 뽑아도 재고가 줄지 않고 기록에 '연습' 으로 남아요 — 행사를
            시작하실 땐 관리 화면에서 꺼 주세요.
          </span>
        </div>
      )}
      {settings.closed && (
        <div className={styles.notice}>
          <TriangleAlert size={18} strokeWidth={2} aria-hidden="true" style={{ flex: 'none', marginTop: 1 }} />
          <span>마감된 이벤트예요 — 지금은 뽑을 수 없습니다.</span>
        </div>
      )}

      {result ? (
        <div className={styles.result} data-drawn>
          <div className={styles.resultTitle}>
            아래 카드 {result.length}장을 손님에게 전달해 주세요
          </div>
          <div className={styles.cards}>
            {result.map((c, i) => (
              <div key={`${c.cardId}-${i}`} className={styles.card}>
                {/* 카드 앞면도 background-image — 길게 눌러 저장되면 안 된다 (CLAUDE.md) */}
                <div
                  className={styles.face}
                  style={c.image ? { backgroundImage: cssUrl(c.image), animationDelay: `${i * 90}ms` } : { animationDelay: `${i * 90}ms` }}
                  role={c.image ? 'img' : undefined}
                  aria-label={c.name}
                >
                  {!c.image && <ImageIcon size={30} strokeWidth={1.6} aria-hidden="true" />}
                </div>
                <div className={styles.cardName}>{c.name}</div>
                <div className={styles.cardRarity}>{RARITY_LABEL[c.rarity] ?? ''}</div>
              </div>
            ))}
          </div>
          <button
            type="button"
            className={styles.doneBtn}
            onClick={() => setResult(null)}
            autoFocus
            data-done
          >
            전달 완료
          </button>
        </div>
      ) : (
        <div className={styles.body}>
          <div className={styles.stage}>
            <div
              className={styles.stageCard}
              data-busy={busy || undefined}
              data-shuffle={shuffling ? '' : undefined}
            >
              <Sparkles size={38} strokeWidth={1.5} aria-hidden="true" />
              {busy && <div className={styles.shine} aria-hidden="true" />}
            </div>
            {(busy || shuffling) && (
              <div className={styles.stageText}>
                {shuffling
                  ? '섞는 중…'
                  : rules.usesTicket
                    ? '카드를 뽑는 중…'
                    : `${count}장을 뽑는 중…`}
              </div>
            )}
          </div>

          <div className={styles.panel}>
            {rules.usesTicket ? (
              <>
                <div className={styles.ask}>뽑기권 번호</div>
                <p className={styles.askSub}>손님 폰에 뜬 네 자리를 그대로 입력해 주세요.</p>
                <input
                  className={styles.codeInput}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && code.trim().length >= 4 && void go()}
                  placeholder="K7QM"
                  maxLength={8}
                  autoCapitalize="characters"
                  autoComplete="off"
                  autoFocus
                  aria-label="뽑기권 번호"
                  data-ticket-code
                />
                <button
                  type="button"
                  className={styles.go}
                  disabled={busy || shuffling || settings.closed || code.trim().length < 4}
                  onClick={() => void go()}
                  data-draw
                >
                  {busy ? '뽑는 중…' : '뽑기'}
                </button>
                <ShuffleRow busy={busy || shuffling} onShuffle={() => setShuffling(true)} />
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
                  disabled={busy || shuffling || settings.closed}
                  onClick={() => void go()}
                  data-draw
                >
                  {busy ? '뽑는 중…' : `${count}장 뽑기`}
                </button>
                <ShuffleRow busy={busy || shuffling} onShuffle={() => setShuffling(true)} />
              </>
            )}

            {error && (
              <p className={styles.error} data-draw-error>
                {error}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  )
}

/**
 * 섞기 줄 — 버튼과 **"확률은 그대로" 한 줄**이 늘 붙어 다닌다.
 * 그 문장이 없으면 스태프도 손님도 섞으면 잘 나온다고 믿게 된다.
 */
function ShuffleRow({ busy, onShuffle }: { busy: boolean; onShuffle: () => void }) {
  return (
    <>
      <button
        type="button"
        className={styles.shuffleBtn}
        disabled={busy}
        onClick={onShuffle}
        data-shuffle-btn
      >
        <Shuffle size={18} strokeWidth={1.9} aria-hidden="true" />
        섞기
      </button>
      <p className={styles.shuffleNote}>섞어도 확률은 그대로예요 — 손님께 보여드리는 연출이에요.</p>
    </>
  )
}

/** 화면이 통째로 다른 규칙을 쓰므로 타입만 다시 노출한다 */
export type { PhotocardDisplay }
