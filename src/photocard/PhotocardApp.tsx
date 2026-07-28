import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronLeft,
  Download,
  Image as ImageIcon,
  Info,
  Layers,
  Lock,
  RotateCw,
  Settings,
  Shuffle,
  Sparkles,
  Store,
  Ticket,
  TriangleAlert,
} from 'lucide-react'

import { useSlotState } from '@/slot/SlotProvider'
import { photocardDisplay, photocardRules, RARITY_LABEL, type PhotocardDisplay } from '@/data/photocard'
import { fontStack, loadWebfont } from '@/data/fonts'
import { repo } from '@/lib/repo'
import { isLight, mix } from '@/lib/color'
import { cssUrl } from '@/lib/image'
import { visitorId } from '@/lib/visitor'
import { appendItem, readList } from '@/lib/locker'
import { fromUrl, releaseResult, saveResult, type ResultImage } from '@/lib/compose'
import { SavableImage } from '@/components/SavableImage'
import type { PhotocardDrawn, PhotocardMine, PhotocardSettings, PhotocardTicket } from '@/lib/repo/types'
import type { Slot } from '@/types/slot'
import styles from './Photocard.module.css'

/**
 * 포토카드 뽑기 — **운영 방식 셋이 한 파일에 있다** (`photocardRules` 가 가른다).
 * 화면은 claude.ai/design 시안 '포토카드 뽑기 방문자' 를 옮긴 것이다.
 *
 *   save : 방문자가 덱에서 뽑고 이미지를 가져간다
 *   gift : 방문자는 **뽑기권만** 만든다. 뽑는 건 스태프 기기(`admin/photocard/Draw.tsx`)
 *   sale : 방문자 화면이 안내 한 장뿐이다 (럭키드로우가 스태프 전용인 것과 같은 자리)
 *
 * **URL 로 안 가른다** — 뽑는 중에 뒤로가기가 결과를 날리는 게 더 나쁘다.
 */
export default function PhotocardApp() {
  const state = useSlotState()
  if (state.status === 'loading') return <div className="app" aria-busy="true" />
  if (state.status === 'missing') return null
  return <Photocard slot={state.slot} />
}

type View = 'deck' | 'drawing' | 'result' | 'locker' | 'ticket'

/** 보관함에 남는 카드 한 장 — **서버로 안 간다** (`lib/locker.ts`) */
interface Kept {
  id: string
  name: string
  image: string
  rarity: number
  at: string
}

function Photocard({ slot }: { slot: Slot }) {
  const { slug } = slot
  const display = useMemo(() => photocardDisplay(slot), [slot])
  const subject = useMemo(() => visitorId(), [])

  const [settings, setSettings] = useState<PhotocardSettings | null>(null)
  const [mine, setMine] = useState<PhotocardMine | null>(null)
  const [ticket, setTicket] = useState<PhotocardTicket | null>(null)
  const [kept, setKept] = useState<Kept[]>(() => readList<Kept>('photocard', slug))
  const [drawn, setDrawn] = useState<PhotocardDrawn | null>(null)
  const [view, setView] = useState<View>('deck')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    loadWebfont(display.font)
  }, [display.font])

  const rules = settings ? photocardRules(settings.mode) : null

  const load = useCallback(async () => {
    if (!repo.photocard.ready()) return
    const st = await repo.photocard.settings(slug)
    setSettings(st)
    const r = photocardRules(st.mode)
    if (r.visitorDraws) setMine(await repo.photocard.mine(slug, subject).catch(() => null))
    if (r.usesTicket) {
      /*
       * **없는 뽑기권을 여기서 만들지 않는다.** 화면을 열기만 해도 발급되면 "한 번만" 이
       * 아무 뜻이 없어진다 — 손님이 버튼을 눌러야 만든다.
       * 이미 있으면 코드로 조회한다(로컬에 사본을 둔다).
       */
      const saved = readList<{ id: string }>('photocard-ticket', slug)[0]
      if (saved) setTicket(await repo.photocard.ticket(slug, saved.id).catch(() => null))
    }
  }, [slug, subject])

  useEffect(() => {
    void load()
  }, [load])

  const vars = {
    ['--pc-font' as string]: fontStack(display.font),
    ['--pc-head' as string]: display.headText,
    ['--pc-sub' as string]: display.subText,
    ['--pc-btn' as string]: display.buttonColor,
    ['--pc-btnFg' as string]: isLight(display.buttonColor) ? '#1f1f1f' : '#ffffff',
    ['--pc-bg' as string]: display.bg,
    ['--pc-deckBg' as string]: display.deckBg,
    ['--pc-deckGlow' as string]: display.deckGlow,
    // 배경 밝기에서 파생 (CLAUDE.md 규칙)
    ['--pc-wash' as string]: mix(display.bg, isLight(display.bg) ? 'black' : 'white', 0.045),
    ['--pc-line' as string]: mix(display.bg, isLight(display.bg) ? 'black' : 'white', 0.1),
  }

  if (!repo.photocard.ready()) {
    return (
      <div className={`app ${styles.root}`} style={vars}>
        <div className={styles.empty}>지금은 포토카드 뽑기를 쓸 수 없어요.</div>
      </div>
    )
  }
  if (!settings || !rules) return <div className="app" aria-busy="true" />

  /* ── sale: 방문자 화면이 안내 한 장뿐이다 ── */
  if (!rules.visitorScreen) {
    return (
      <div className={`app ${styles.root}`} style={vars}>
        <div className={styles.phone}>
          <Counter display={display} slug={slug} />
        </div>
      </div>
    )
  }

  async function draw() {
    if (busy) return
    setBusy(true)
    setError(null)
    setView('drawing')
    // 연출을 최소 1.1초는 보여준다 — 서버가 빨리 답해도 "뽑는 느낌" 이 없으면 밋밋하다
    const wait = new Promise((r) => setTimeout(r, 1100))
    try {
      const card = await repo.photocard.drawSelf(slug, subject)
      await wait
      setDrawn(card)
      const item: Kept = {
        id: card.cardId,
        name: card.name,
        image: card.image,
        rarity: card.rarity,
        at: new Date().toISOString(),
      }
      appendItem('photocard', slug, item)
      setKept(readList<Kept>('photocard', slug))
      setMine(await repo.photocard.mine(slug, subject).catch(() => null))
      setView('result')
    } catch (e) {
      await wait
      // **실패 복귀 경로** — 재고 소진·횟수 초과·마감이면 덱으로 돌아가고 이유를 말한다
      setError(e instanceof Error ? e.message : '뽑지 못했어요')
      setView('deck')
    } finally {
      setBusy(false)
    }
  }

  async function makeTicket() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const t = await repo.photocard.issueTicket(slug, subject)
      setTicket(t)
      // 코드를 이 기기에 남긴다 — 화면을 닫아도 다시 볼 수 있어야 한다
      appendItem('photocard-ticket', slug, { id: t.code }, 1)
      setView('ticket')
    } catch (e) {
      setError(e instanceof Error ? e.message : '뽑기권을 받지 못했어요')
    } finally {
      setBusy(false)
    }
  }

  /* ── gift: 뽑기권 ── */
  if (rules.usesTicket) {
    return (
      <div className={`app ${styles.root}`} style={vars}>
        <div className={styles.phone}>
          {ticket?.status === 'drawn' ? (
            <Result
              display={display}
              card={{
                cardId: '',
                name: ticket.cardName ?? '',
                image: ticket.cardImage ?? '',
                rarity: 0,
              }}
              vars={vars}
              physical
              allowSave={settings.allowSave}
              left={0}
              onAgain={null}
              onLocker={null}
            />
          ) : ticket ? (
            <TicketView
              display={display}
              ticket={ticket}
              busy={busy}
              onRefresh={async () => {
                setBusy(true)
                try {
                  setTicket(await repo.photocard.ticket(slug, ticket.code))
                } finally {
                  setBusy(false)
                }
              }}
            />
          ) : (
            <TicketIntro
              display={display}
              slug={slug}
              busy={busy}
              closed={settings.closed}
              error={error}
              onIssue={() => void makeTicket()}
            />
          )}
        </div>
      </div>
    )
  }

  /* ── save: 덱 → 뽑는 중 → 결과 → 보관함 ── */
  const left = mine?.left ?? settings.drawsPerVisitor

  if (view === 'locker') {
    return (
      <div className={`app ${styles.root}`} style={vars}>
        <div className={styles.phone}>
          <Locker
            display={display}
            kept={kept}
            kinds={mine?.kinds ?? 0}
            left={left}
            onBack={() => setView(drawn ? 'result' : 'deck')}
            onDraw={() => void draw()}
          />
        </div>
      </div>
    )
  }

  return (
    <div className={`app ${styles.root} ${styles.dark}`} style={vars}>
      <div
        className={styles.glow}
        style={{
          background: `radial-gradient(120% 70% at 50% ${view === 'deck' ? '12%' : '40%'}, ${display.deckGlow} 0%, ${display.deckBg} 60%, ${mix(display.deckBg, 'black', 0.3)} 100%)`,
        }}
        aria-hidden="true"
      />
      <div className={styles.phone}>
        {view === 'deck' && (
          <Deck
            display={display}
            slug={slug}
            left={left}
            closed={settings.closed}
            error={error}
            kept={kept.length}
            onPick={() => void draw()}
            onLocker={() => setView('locker')}
          />
        )}
        {view === 'drawing' && (
          <div className={styles.drawing}>
            <div className={styles.spinCard}>
              <Sparkles size={34} strokeWidth={1.6} aria-hidden="true" />
              <div className={styles.shine} aria-hidden="true" />
            </div>
            <div className={styles.drawingText}>카드를 뽑는 중…</div>
          </div>
        )}
        {view === 'result' && drawn && (
          <Result
            display={display}
            card={drawn}
            vars={vars}
            physical={false}
            allowSave
            left={left}
            onAgain={left > 0 ? () => void draw() : null}
            onLocker={() => setView('locker')}
          />
        )}
      </div>
    </div>
  )
}

/* ── 덱 (부채꼴) ───────────────────────────────── */

/**
 * 시안의 부채꼴 좌표를 그대로 옮긴다 (13장 기준 상수: 폭 112 · 높이 173 · 각도 46° · 퍼짐 110).
 *
 * **타로의 `DeckSpread` 를 안 쓴다.** 저쪽은 타로 카드 비율(63×88)과 뽑기 흐름에 맞춰져
 * 있고, 포토카드는 55×85 에 "결과가 클릭 뒤에 정해진다". 공용화하려면 그 컴포넌트에
 * prop 두 개를 더해야 하는데, 이미 배포된 타로 화면을 건드리는 값이 아니다.
 */
function fanCard(i: number, n: number) {
  const W = 112
  const t = n > 1 ? i / (n - 1) - 0.5 : 0
  const rot = t * 46
  const x = 170 + t * 110 - W / 2
  /*
   * 시안은 `150 + t²·150` 이지만 그 150 은 시안 상자(400px) 안에서 위로 띄운 여백이다.
   * 여기서는 상자를 카드가 실제로 차지하는 만큼(330px)으로 줄였으니 그 여백을 뺀다 —
   * 안 빼면 위가 통째로 비고 아래가 잘린다.
   */
  const y = t * t * 150
  return {
    left: Math.round(x),
    top: Math.round(y),
    rot: Number(rot.toFixed(1)),
    z: i + 1,
    // 섞기 애니메이션이 "가운데" 를 알아야 한다 — 카드마다 중심까지의 거리가 다르다
    toCenter: Math.round(170 - W / 2 - x),
  }
}

function Deck({
  display,
  slug,
  left,
  closed,
  error,
  kept,
  onPick,
  onLocker,
}: {
  display: PhotocardDisplay
  slug: string
  left: number
  closed: boolean
  error: string | null
  kept: number
  onPick: () => void
  onLocker: () => void
}) {
  const n = Math.max(3, Math.min(display.spreadCount, 21))
  const wrapRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  /**
   * 섞기 — **명목상이다.** 결과는 서버가 누른 뒤에 정하므로 이 상태는 연출에만 쓴다.
   * `key` 를 올려 애니메이션을 다시 트리거한다(같은 클래스를 다시 붙이는 것만으론 안 돈다).
   */
  const [shuffle, setShuffle] = useState(0)
  const [shuffling, setShuffling] = useState(false)

  useEffect(() => {
    if (!shuffling) return
    const t = setTimeout(() => setShuffling(false), 720 + n * 26)
    return () => clearTimeout(t)
  }, [shuffling, shuffle, n])

  // 부채꼴은 340px 고정 좌표라 좁은 폰에서 넘친다 — 상자째 줄인다
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setScale(Math.min(1, (el.clientWidth - 24) / 340, (el.clientHeight - 16) / 330))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const disabled = closed || left <= 0

  return (
    <>
      <header className={styles.head}>
        {display.logo && (
          <div className={styles.logo} style={{ backgroundImage: cssUrl(display.logo) }} role="img" aria-label={display.title} />
        )}
        {display.showTitle && <h1 className={styles.title}>{display.title}</h1>}
      </header>
      {display.deckGuide && <p className={styles.deckGuide}>{display.deckGuide}</p>}

      <div className={styles.fanWrap} ref={wrapRef}>
        <div
          className={styles.fan}
          style={{ ['--fanScale' as string]: scale }}
          data-fan
          data-shuffle={shuffling ? '' : undefined}
          key={shuffle}
        >
          {Array.from({ length: n }, (_, i) => {
            const p = fanCard(i, n)
            return (
              <button
                key={i}
                type="button"
                className={styles.card}
                style={{
                  left: p.left,
                  top: p.top,
                  transform: `rotate(${p.rot}deg)`,
                  zIndex: p.z,
                  ['--rot' as string]: `${p.rot}deg`,
                  ['--toCenter' as string]: `${p.toCenter}px`,
                  ['--i' as string]: String(i),
                }}
                disabled={disabled || shuffling}
                onClick={onPick}
                aria-label="카드 뽑기"
                data-deck-card
              >
                <span className={styles.face}>
                  <Sparkles size={20} strokeWidth={1.6} aria-hidden="true" />
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className={styles.deckFoot}>
        {error ? (
          <p className={`${styles.error} ${styles.deckLeft}`} data-deck-error>
            {error}
          </p>
        ) : (
          <div className={`${styles.deckLeft} ${styles.tnum}`}>
            {closed ? '마감됐어요' : left > 0 ? `남은 기회 ${left}회` : '뽑을 수 있는 횟수를 다 쓰셨어요'}
          </div>
        )}
        {/**
          * 섞기·보관함은 **덱에서 항상 닿아야 한다.**
          * 보관함을 결과 화면에서만 열 수 있으면, 뽑기를 다 쓴 뒤 새로고침한 손님이
          * 자기가 모은 카드로 돌아갈 길이 없다.
          */}
        <div className={styles.deckActions}>
          <button
            type="button"
            onClick={() => {
              setShuffle((v) => v + 1)
              setShuffling(true)
            }}
            disabled={shuffling}
            data-shuffle-btn
          >
            <Shuffle size={15} strokeWidth={1.9} aria-hidden="true" />
            섞기
          </button>
          {kept > 0 && (
            <button type="button" onClick={onLocker} data-open-locker>
              <Layers size={15} strokeWidth={1.9} aria-hidden="true" />
              {display.lockerLabel} {kept > 0 && `(${kept})`}
            </button>
          )}
        </div>

        <div className={styles.deckHint}>
          {disabled
            ? kept > 0
              ? '모은 카드는 보관함에서 볼 수 있어요'
              : '이벤트를 확인해 주세요'
            : shuffling
              ? '섞는 중…'
              : '카드를 눌러 한 장을 골라 주세요'}
        </div>
        <div className={styles.adminRow}>
          <a className={styles.adminLink} href={`/${slug}/admin`}>
            <Settings size={12} strokeWidth={1.7} aria-hidden="true" />
            관리자
          </a>
        </div>
      </div>
    </>
  )
}

/* ── 결과 ─────────────────────────────────────── */

function Result({
  display,
  card,
  vars,
  physical,
  allowSave,
  left,
  onAgain,
  onLocker,
}: {
  display: PhotocardDisplay
  card: PhotocardDrawn
  vars: Record<string, string>
  physical: boolean
  allowSave: boolean
  left: number
  onAgain: (() => void) | null
  onLocker: (() => void) | null
}) {
  const [image, setImage] = useState<ResultImage | null>(null)
  const [note, setNote] = useState<string | null>(null)

  /*
   * **저장물은 `compose.fromUrl` 로 만든다** — 원본 URL 을 `<img src>` 로 그대로 쓰면
   * "이미지 주소 복사" 로 Storage 원본에 도달한다. blob URL 이면 그 길이 막힌다.
   * 실패해도 화면은 그대로 (배경이미지로 이미 보인다) — 저장 버튼만 비활성이 된다.
   */
  useEffect(() => {
    if (!allowSave || !card.image) return
    let alive = true
    let made: ResultImage | null = null
    void fromUrl(card.image)
      .then((img) => {
        made = img
        if (alive) setImage(img)
        else releaseResult(img)
      })
      .catch(() => {})
    return () => {
      alive = false
      if (made) releaseResult(made)
    }
  }, [card.image, allowSave])

  async function save() {
    if (!image) return
    const how = await saveResult(image, `${card.name || '포토카드'}.png`)
    if (how === 'opened') setNote('새 탭에서 사진을 길게 눌러 저장해 주세요.')
  }

  return (
    <>
      <div className={styles.resultWrap}>
        <div className={styles.kicker}>{physical ? '뽑힌 카드' : '뽑은 카드'}</div>
        {/**
          * **카드 앞면은 `background-image` 다** — 길게 눌러 저장되면 안 된다.
          * 저장은 아래 버튼(`SavableImage` + `saveResult`)으로만 간다. (CLAUDE.md)
          */}
        <div
          className={styles.polaroid}
          style={{ backgroundImage: cssUrl(card.image) }}
          role="img"
          aria-label={card.name}
          data-drawn-card
        >
          {!card.image && (
            <span style={{ display: 'grid', placeItems: 'center', height: '100%', color: '#b1afa9' }}>
              <ImageIcon size={36} strokeWidth={1.6} aria-hidden="true" />
            </span>
          )}
          {card.name && <div className={styles.polaroidName}>{card.name}</div>}
        </div>

        {physical ? (
          <>
            <div className={styles.resultName}>실물을 받아 가세요</div>
            <div className={styles.chip}>
              <Store size={18} strokeWidth={1.7} aria-hidden="true" />
              카운터에서 수령
            </div>
          </>
        ) : (
          <>
            <div className={styles.resultName} data-card-name>
              {card.name}
              {card.rarity > 0 && ` · ${RARITY_LABEL[card.rarity] ?? ''}`}
            </div>
            <div className={styles.resultNote}>이 기기에만 저장돼요</div>
          </>
        )}

        {note && <div className={styles.resultNote}>{note}</div>}
      </div>

      <div className={styles.resultFoot}>
        {allowSave && (
          <button type="button" className={styles.lightBtn} disabled={!image} onClick={() => void save()} data-save>
            <Download size={19} strokeWidth={1.9} aria-hidden="true" />
            {display.saveLabel}
          </button>
        )}
        {onAgain && (
          <button type="button" className={styles.ghostDark} onClick={onAgain} data-again>
            <RotateCw size={17} strokeWidth={1.8} aria-hidden="true" />
            한 번 더 ({left}회 남음)
          </button>
        )}
        {onLocker && (
          <button type="button" className={styles.ghostDark} onClick={onLocker} data-open-locker>
            {display.lockerLabel}
          </button>
        )}
      </div>

      {/* 화면엔 안 그린다 — 저장·공유의 원본이다 (코드베이스에서 <img> 가 나는 유일한 자리) */}
      {image && (
        <div style={{ display: 'none' }} aria-hidden="true">
          <SavableImage image={image} alt={card.name} />
        </div>
      )}
      <span style={{ display: 'none' }}>{vars['--pc-bg']}</span>
    </>
  )
}

/* ── 보관함 ───────────────────────────────────── */

function Locker({
  display,
  kept,
  kinds,
  left,
  onBack,
  onDraw,
}: {
  display: PhotocardDisplay
  kept: Kept[]
  kinds: number
  left: number
  onBack: () => void
  onDraw: () => void
}) {
  // 같은 카드를 두 번 뽑을 수 있다 — 종류로 접는다
  const owned = useMemo(() => {
    const m = new Map<string, Kept>()
    for (const k of kept) if (!m.has(k.id)) m.set(k.id, k)
    return [...m.values()]
  }, [kept])
  const total = Math.max(kinds, owned.length)
  const pct = total ? Math.round((owned.length / total) * 100) : 0

  return (
    <>
      <div className={styles.lockerTop}>
        <button type="button" className={styles.backBtn} onClick={onBack} aria-label="돌아가기">
          <ChevronLeft size={18} strokeWidth={1.7} aria-hidden="true" />
        </button>
        <div className={styles.lockerTitle}>{display.lockerLabel}</div>
        <span className={`${styles.lockerCount} ${styles.tnum}`} data-locker-count>
          {owned.length} / {total} 종
        </span>
      </div>
      <div className={styles.track}>
        <div className={styles.bar} style={{ width: `${pct}%` }} />
      </div>

      <div className={styles.grid} data-locker>
        {Array.from({ length: total }, (_, i) => {
          const c = owned[i]
          return (
            <div key={c?.id ?? `lock-${i}`}>
              {/**
                * **보관함 썸네일도 `background-image` 다.** 여기를 `<img>` 로 열면
                * 다 뽑은 사람에게 실질적으로 원본 개방과 같아진다 (CLAUDE.md).
                */}
              <div
                className={styles.cell}
                data-locked={c ? undefined : ''}
                style={c ? { backgroundImage: cssUrl(c.image) } : undefined}
                role={c ? 'img' : undefined}
                aria-label={c?.name}
              >
                {!c && <Lock size={18} strokeWidth={1.7} aria-hidden="true" />}
              </div>
              <div className={styles.cellName}>{c?.name ?? '???'}</div>
            </div>
          )
        })}
      </div>

      <div className={styles.lockerFoot}>
        <div className={styles.note} style={{ marginTop: 0, marginBottom: 12 }}>
          <Info size={16} strokeWidth={1.7} aria-hidden="true" style={{ flex: 'none', marginTop: 1 }} />
          <span>이 기기에만 저장돼요. 브라우저 기록을 지우면 보관함도 사라져요.</span>
        </div>
        <button
          type="button"
          className={styles.cta}
          style={{ height: 52, fontSize: 15 }}
          disabled={left <= 0}
          onClick={onDraw}
          data-draw-more
        >
          {left > 0 ? `한 번 더 뽑기 (${left}회 남음)` : '뽑을 수 있는 횟수를 다 쓰셨어요'}
        </button>
      </div>
    </>
  )
}

/* ── gift: 뽑기권 ─────────────────────────────── */

function TicketIntro({
  display,
  slug,
  busy,
  closed,
  error,
  onIssue,
}: {
  display: PhotocardDisplay
  slug: string
  busy: boolean
  closed: boolean
  error: string | null
  onIssue: () => void
}) {
  return (
    <>
      <div style={{ height: 32, flex: 'none' }} />
      <header className={styles.head} style={{ paddingTop: 8 }}>
        {display.logo && (
          <div
            className={`${styles.logo} ${styles.logoLight}`}
            style={{ backgroundImage: cssUrl(display.logo) }}
            role="img"
            aria-label={display.title}
          />
        )}
        {display.showTitle && <h1 className={styles.title}>{display.title}</h1>}
      </header>

      <div className={styles.center}>
        <div className={styles.ticketArt}>
          <Ticket size={38} strokeWidth={1.6} aria-hidden="true" />
        </div>
        <div className={styles.ticketHead}>{display.ticketHeadline}</div>
        <p className={styles.ticketBody}>{display.ticketGuide}</p>
        <div className={styles.note}>
          <TriangleAlert size={16} strokeWidth={1.7} aria-hidden="true" style={{ flex: 'none', marginTop: 1 }} />
          <span>
            뽑기권은 <b style={{ color: 'var(--pc-head)' }}>한 번만</b> 받을 수 있어요. 받은 뒤에는 다시
            받을 수 없어요.
          </span>
        </div>
        {error && <p className={styles.error} style={{ marginTop: 14 }}>{error}</p>}
      </div>

      <div className={styles.bottom}>
        <button type="button" className={styles.cta} disabled={busy || closed} onClick={onIssue} data-issue>
          {closed ? '마감됐어요' : busy ? '받는 중…' : display.drawLabel}
        </button>
        <div className={styles.adminRow} style={{ textAlign: 'center' }}>
          <a className={`${styles.adminLink} ${styles.adminLinkLight}`} href={`/${slug}/admin`}>
            <Settings size={12} strokeWidth={1.7} aria-hidden="true" />
            관리자
          </a>
        </div>
      </div>
    </>
  )
}

function TicketView({
  display: _display,
  ticket,
  busy,
  onRefresh,
}: {
  display: PhotocardDisplay
  ticket: PhotocardTicket
  busy: boolean
  onRefresh: () => void
}) {
  return (
    <>
      <div style={{ height: 32, flex: 'none' }} />
      <div style={{ padding: '10px 20px 0', textAlign: 'center', fontSize: 12, fontWeight: 800, color: 'var(--pc-sub)', letterSpacing: '0.04em' }}>
        뽑기권
      </div>

      <div className={styles.center} style={{ padding: '0 22px' }}>
        <div className={styles.codeCard}>
          <div className={styles.codeLabel}>카운터에 이 번호를 보여 주세요</div>
          <div className={styles.code} data-ticket-code>
            {ticket.code}
          </div>
          <div className={styles.codeRule} />
          <div className={styles.codeGuide}>
            스태프가 이 번호를 입력하면
            <br />
            카드를 대신 뽑아 드려요
          </div>
        </div>

        <div className={styles.waiting}>
          <span className={styles.dot} aria-hidden="true" />
          <span className={styles.waitingText}>스태프가 뽑기를 기다리는 중</span>
        </div>
        <p className={styles.ticketBody} style={{ marginTop: 10 }}>
          뽑히면 이 화면이 결과로 바뀌어요.
          <br />
          바뀌지 않으면 새로고침해 주세요.
        </p>
        {/**
          * **폴링을 안 건다.** 실물을 건네받는 자리에서 손님이 직접 누르는 버튼이라
          * 사용자가 트리거다 — 수백 대가 몇 초마다 서버를 때릴 이유가 없다.
          */}
        <button type="button" className={styles.ghostBtn} disabled={busy} onClick={onRefresh} data-refresh>
          <RotateCw size={17} strokeWidth={1.8} aria-hidden="true" />
          {busy ? '확인 중…' : '새로고침'}
        </button>

        <div className={`${styles.note} ${styles.noteStrong}`}>
          <TriangleAlert size={16} strokeWidth={1.7} aria-hidden="true" style={{ flex: 'none', marginTop: 1 }} />
          <span>이 번호는 다시 받을 수 없어요. 화면을 닫아도 이 기기에서 다시 볼 수 있어요.</span>
        </div>
      </div>

      <div className={`${styles.stamp} ${styles.tnum}`}>
        발급 {new Date(ticket.issuedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
      </div>
    </>
  )
}

/* ── sale: 안내 ───────────────────────────────── */

function Counter({ display, slug }: { display: PhotocardDisplay; slug: string }) {
  return (
    <>
      <div style={{ height: 32, flex: 'none' }} />
      <div className={styles.center}>
        <div className={styles.bigLogo} style={display.logo ? { backgroundImage: cssUrl(display.logo) } : undefined}>
          {!display.logo && <ImageIcon size={30} strokeWidth={1.6} aria-hidden="true" />}
        </div>
        {display.showTitle && <h1 className={styles.counterHeadline}>{display.title}</h1>}

        <div className={styles.counterBox}>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Store size={34} strokeWidth={1.6} aria-hidden="true" />
          </div>
          <div className={styles.counterTitle}>{display.counterTitle}</div>
          <p className={styles.counterBody}>{display.counterBody}</p>
        </div>
        {display.counterHours && <div className={styles.counterHours}>{display.counterHours}</div>}
      </div>
      <div className={styles.bottom} style={{ textAlign: 'center' }}>
        <a className={`${styles.adminLink} ${styles.adminLinkLight}`} href={`/${slug}/admin`}>
          <Settings size={12} strokeWidth={1.7} aria-hidden="true" />
          관리자
        </a>
      </div>
    </>
  )
}
