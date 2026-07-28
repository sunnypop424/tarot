import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink, Image as ImageIcon, Layers, Lock, Shuffle, Sparkles, Star, TriangleAlert, X } from 'lucide-react'

import { CountPicker } from '@/components/CountPicker'
import { countPicker, pickerVars } from '@/data/countPicker'

import { useSlotState } from '@/slot/SlotProvider'
import { photocardDisplay, photocardRules, RARITY_LABEL, type PhotocardDisplay } from '@/data/photocard'
import { getSlotService } from '@/data/services'
import { fontStack, loadWebfont } from '@/data/fonts'
import { repo } from '@/lib/repo'
import { isLight, mix } from '@/lib/color'
import { cssUrl } from '@/lib/image'
import { useAdminAuth } from '@/admin/useAdminAuth'
import type { PhotocardDrawn, PhotocardLineupRow, PhotocardSettings } from '@/lib/repo/types'
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
  const [lineup, setLineup] = useState<PhotocardLineupRow[]>([])
  const [sheet, setSheet] = useState(false)
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
  // 같은 클래스를 다시 붙이는 것만으론 애니메이션이 안 돈다 — key 를 올려 다시 마운트한다
  const [shuffleKey, setShuffleKey] = useState(0)

  useEffect(() => {
    if (!shuffling) return
    const t = setTimeout(() => setShuffling(false), 760 + DECK * 18)
    return () => clearTimeout(t)
  }, [shuffling, shuffleKey])

  useEffect(() => {
    loadWebfont(display.font)
  }, [display.font])

  const load = useCallback(async () => {
    if (!repo.photocard.ready()) return
    const [st, cards] = await Promise.all([
      repo.photocard.settings(slug),
      repo.photocard.lineup(slug).catch(() => []),
    ])
    setSettings(st)
    setLineup(cards)
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
    /*
     * 수량 고르기는 럭드와 **같은 컴포넌트**다. 안 고른 색은 이 서비스의 팔레트에서
     * 물려받는다 — 따로 만지지 않아도 한 이벤트처럼 보여야 한다.
     */
    ...pickerVars(
      countPicker(display.picker, {
        bg: mix(display.bg, isLight(display.bg) ? 'black' : 'white', 0.045),
        borderColor: mix(display.bg, isLight(display.bg) ? 'black' : 'white', 0.1),
        fg: display.headText,
        stepBg: display.bg,
        onBg: display.buttonColor,
        onFg: isLight(display.buttonColor) ? '#1f1f1f' : '#ffffff',
        goBg: display.buttonColor,
        goFg: isLight(display.buttonColor) ? '#1f1f1f' : '#ffffff',
      })
    ),
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
      // 재고가 떨어졌으면 라인업의 소진 표시가 바뀐다
      void load()
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
          {/**
            * 왼쪽 무대 — **뒷면 덱**. 뽑기 시작하면 카드 한 장으로 바뀐다.
            *
            * 앞면 라인업을 여기 깔았다가 뺐다: **보이는 카드를 섞는 건 말이 안 된다.**
            * 손님이 이미 다 보고 있으니 섞어도 아무 신호가 아니고, 섞기가 섞기로 읽히려면
            * 뒷면이 똑같은 뭉치여야 한다. "뭐가 있나요" 는 아래 모달이 맡는다 —
            * 스태프가 손님에게 **의도적으로** 보여주는 순간이 되기도 한다.
            */}
          <div className={styles.stage}>
            {busy ? (
              <>
                <div className={styles.stageCard} data-busy>
                  <Sparkles size={38} strokeWidth={1.5} aria-hidden="true" />
                  <div className={styles.shine} aria-hidden="true" />
                </div>
                <div className={styles.stageText}>
                  {rules.usesTicket ? '카드를 뽑는 중…' : `${count}장을 뽑는 중…`}
                </div>
              </>
            ) : (
              <>
                <div className={styles.deck} data-deck data-shuffle={shuffling ? '' : undefined} key={shuffleKey}>
                  {Array.from({ length: DECK }, (_, i) => (
                    <div key={i} className={styles.deckCard} style={jitter(i)} aria-hidden="true">
                      <Sparkles size={13} strokeWidth={1.6} />
                    </div>
                  ))}
                </div>
                {shuffling ? (
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#e6e5e1' }}>섞는 중…</div>
                ) : (
                  lineup.length > 0 && (
                    <button type="button" className={styles.stageBtn} onClick={() => setSheet(true)} data-open-sheet>
                      <Layers size={15} strokeWidth={1.9} aria-hidden="true" />
                      카드 목록 ({lineup.length}종)
                    </button>
                  )
                )}
              </>
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
                <ShuffleRow busy={busy || shuffling} onShuffle={() => {
                  setShuffleKey((v) => v + 1)
                  setShuffling(true)
                }} />
              </>
            ) : (
              <CountPicker
                count={count}
                max={max}
                onCount={setCount}
                onGo={() => void go()}
                label="몇 장을 뽑을까요?"
                goLabel={`${count}장 뽑기`}
                busy={busy}
                disabled={shuffling || settings.closed}
                className={styles.picker}
              />
            )}
            {!rules.usesTicket && (
              <ShuffleRow
                busy={busy || shuffling}
                onShuffle={() => {
                  setShuffleKey((v) => v + 1)
                  setShuffling(true)
                }}
              />
            )}

            {error && (
              <p className={styles.error} data-draw-error>
                {error}
              </p>
            )}
          </div>
        </div>
      )}

      {sheet && (
        <div className={styles.sheetBackdrop} onClick={() => setSheet(false)} data-sheet>
          <div
            className={styles.sheet}
            role="dialog"
            aria-modal="true"
            aria-label="카드 목록"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.sheetBar}>
              <div className={styles.sheetTitle}>카드 목록</div>
              <button type="button" className={styles.sheetClose} onClick={() => setSheet(false)} aria-label="닫기">
                <X size={18} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>

            <div className={styles.lineup} data-lineup>
              {lineup.map((c) => (
                <div
                  key={c.id}
                  className={styles.lineupCard}
                  data-lucky={c.lucky ? '' : undefined}
                  data-sold={c.soldOut ? '' : undefined}
                >
                  {/* 카드 앞면도 background-image — 길게 눌러 저장되면 안 된다 (CLAUDE.md) */}
                  <div
                    className={styles.lineupFace}
                    style={c.image ? { backgroundImage: cssUrl(c.image) } : undefined}
                    role={c.image ? 'img' : undefined}
                    aria-label={c.name}
                  >
                    {!c.image && <ImageIcon size={20} strokeWidth={1.6} aria-hidden="true" />}
                  </div>
                  {c.lucky && !c.soldOut && (
                    <span className={styles.luckyMark} aria-label="럭키 카드">
                      <Star size={13} strokeWidth={2.6} fill="currentColor" aria-hidden="true" />
                    </span>
                  )}
                  <div className={styles.lineupName}>{c.name}</div>
                </div>
              ))}
            </div>

            {(lineup.some((c) => c.lucky) || lineup.some((c) => c.soldOut)) && (
              <div className={styles.lineupLegend}>
                {lineup.some((c) => c.lucky) && (
                  <span>
                    <span className={styles.legendDot} aria-hidden="true" />
                    럭키 카드
                  </span>
                )}
                {lineup.some((c) => c.soldOut) && <span>흐린 카드는 소진됐어요</span>}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

/**
 * 뒷면 덱의 장수 — **연출값이다.** 실제 카드 종류와 아무 상관이 없다.
 * 3줄 × 7장 = 21장 (타로 메이저 22장 언저리라 한 벌처럼 보인다).
 */
const DECK = 21

/** 덱 격자 — 3줄 × 7장 */
const COLS = 7
const ROWS = DECK / COLS

/**
 * 섞기용 좌표 — **자기 칸에서 격자 중앙까지의 거리를 칸 수로** 센다.
 *
 * CSS 가 이 값에 `100% + 간격` 을 곱해 실제 거리로 바꾼다. 픽셀이 아니라 칸 수로 주는 이유:
 * 카드 크기가 화면 폭에 따라 변하는데 픽셀로 굳히면 좁은 화면에서 중앙을 지나쳐 버린다.
 *
 * `Math.random()` 을 안 쓰는 이유: 렌더마다 값이 바뀌면 애니메이션 중간에 방향이 튄다.
 * 같은 자리의 카드는 늘 같은 쪽으로 움직여야 눈이 따라간다.
 */
function jitter(i: number): React.CSSProperties {
  const col = i % COLS
  const row = Math.floor(i / COLS)
  // 왼쪽 절반은 오른쪽으로, 오른쪽 절반은 왼쪽으로 밀린다 — 두 뭉치가 서로를 지나간다
  const side = col < (COLS - 1) / 2 ? 1 : -1
  return {
    ['--i' as string]: String(i),
    ['--cx' as string]: String(((COLS - 1) / 2 - col).toFixed(2)),
    ['--cy' as string]: String(((ROWS - 1) / 2 - row).toFixed(2)),
    ['--dr' as string]: `${(side * (4 + (i % 3) * 2)).toFixed(0)}deg`,
    ['--rf' as string]: `${side * (10 + (i % 4) * 4)}px`,
  }
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
    </>
  )
}

/** 화면이 통째로 다른 규칙을 쓰므로 타입만 다시 노출한다 */
export type { PhotocardDisplay }
