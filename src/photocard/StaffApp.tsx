import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { History, Image as ImageIcon, Info, Layers, Lock, Sparkles, Star, WifiOff, X } from 'lucide-react'

import { useSlotState } from '@/slot/SlotProvider'
import { photocardDisplay, photocardRules, RARITY_LABEL } from '@/data/photocard'
import { getSlotService } from '@/data/services'
import { countPicker, pickerVars } from '@/data/countPicker'
import { fontStack, loadWebfont } from '@/data/fonts'
import { repo } from '@/lib/repo'
import { cssUrl } from '@/lib/image'
import { CountPicker } from '@/components/CountPicker'
import { useAdminAuth } from '@/admin/useAdminAuth'
import { useOnline, useStaffLog } from '@/staff/staffLocal'
import type { PhotocardDrawn, PhotocardLineupRow, PhotocardSettings } from '@/lib/repo/types'
import type { Slot } from '@/types/slot'
import styles from './Staff.module.css'
import { useT } from '@/i18n'
import { LangBar } from '@/components/LangBar'

/**
 * 스태프 기기 — `/{slug}/staff`. **관리 화면이 아니다.**
 *
 * 화면이 **럭키드로우와 같다** (`components/DrawStage.module.css` 를 같이 쓴다).
 * 두 화면은 하는 일이 같기 때문이다: 스태프가 수량을 정해 뽑고 결과를 방문자에게 건넨다.
 * 다른 건 **결과** 하나뿐 — 포토카드는 그림과 이름을 보여줘야 한다.
 *
 * 관리 화면 밖에 둔 이유: 부스에 세워두는 기기에 사이드바·로그아웃이 같이 떠 있으면
 * 방문자가 누른다. 게이트는 두 겹이다 — 여기서 로그인을 보고 RPC 가 `manages_slot` 을 다시 본다.
 */
export default function StaffApp() {
  const state = useSlotState()
  if (state.status === 'loading') return <div className="app" aria-busy="true" />
  if (state.status === 'missing') return null
  return <Staff slot={state.slot} />
}

function Staff({ slot }: { slot: Slot }) {
  const t = useT()
  const { slug } = slot
  const display = useMemo(() => photocardDisplay(slot), [slot])
  const { status } = useAdminAuth(slug)

  const [settings, setSettings] = useState<PhotocardSettings | null>(null)
  const [lineup, setLineup] = useState<PhotocardLineupRow[]>([])
  /** 한정 카드 재고 합 — 한정이 하나도 없으면 null (무제한이라 셀 게 없다) */
  const [stock, setStock] = useState<number | null>(null)
  const [count, setCount] = useState(1)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<PhotocardDrawn[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sheet, setSheet] = useState(false)
  /** 당첨 결과 → 전체 결과 — **럭드의 `ResultReveal` 과 같은 전환이다** */
  const [summary, setSummary] = useState(false)
  /**
   * 오늘 **이 기기에서** 뽑은 수 + 직전 결과 (`staff/staffLocal.ts`).
   * 서버 합계가 아니다 — 부스에 기기가 둘이면 그건 두 사람 몫이 섞인 값이라,
   * 스태프가 알고 싶은 "내가 지금까지 몇 번 돌렸나" 와 다르다.
   */
  const log = useStaffLog<PhotocardDrawn[]>(slug)
  const online = useOnline()

  useEffect(() => {
    loadWebfont(display.font)
  }, [display.font])

  const load = useCallback(async () => {
    if (!repo.photocard.ready()) return
    const [st, cards, rows] = await Promise.all([
      repo.photocard.settings(slug),
      repo.photocard.lineup(slug).catch(() => []),
      // 재고는 스태프에게 필요한 값이다 ("몇 장 남았어요?" 를 방문자가 묻는다). 주최자 조회를 그대로 쓴다
      repo.photocard.report(slug).catch(() => []),
    ])
    setSettings(st)
    setLineup(cards)
    /** 재고를 정한 카드만 센다 — `null` 은 무제한이라 더하면 뜻이 흐려진다 */
    const limited = rows.filter((r) => r.remaining !== null)
    setStock(limited.length ? limited.reduce((a, r) => a + (r.remaining ?? 0), 0) : null)
  }, [slug])

  useEffect(() => {
    if (status === 'in' || slot.demo) void load()
  }, [load, status, slot.demo])

  /**
   * 색·형태는 **슬롯 테마 토큰을 그대로 쓴다** (럭드와 같다).
   * 포토카드의 `deckBg` 계열은 방문자 폰의 덱 화면 전용이라 여기서 안 쓴다 —
   * 이 화면은 럭드와 같은 판이어야 한다.
   */
  const c = slot.theme.colors
  const vars = {
    ['--ds-font' as string]: fontStack(display.font),
    ['--ds-box-top' as string]: `${display.boxTopMargin}px`,
    ['--ds-box-padding' as string]: `${display.boxPadding}px`,
    ['--ds-box-border-w' as string]: `${display.boxBorderWidth}px`,
    ['--ds-box-border-c' as string]: display.boxBorderColor || 'transparent',
    ['--ds-admin-link' as string]: display.adminLinkColor,
    // 켜면 타일·배너·줄의 테두리를 통째로 뺀다 (럭드와 같은 설정)
    ['--ds-tile-border' as string]: display.noBorder ? 'transparent' : '',
    // 미리보기 모달 — 비운 값은 CSS 가 테마 토큰으로 폴백한다
    ['--pc-modal-bg' as string]: display.modalBg,
    ['--pc-modal-text' as string]: display.modalText,
    ['--pc-modal-item' as string]: display.modalItemBg,
    ['--pc-modal-border' as string]: display.modalNoBorder ? 'transparent' : display.modalBorder,
    ['--ds-shadow' as string]: `0 ${display.boxShadowY}px ${display.boxShadowBlur}px ${display.boxShadowColor}`,
    ...pickerVars(
      countPicker(display.picker, {
        bg: c.wash,
        borderColor: c.border,
        fg: c.fg1,
        stepBg: c.surfaceRaised,
        onBg: c.primary,
        onFg: c.onPrimary,
        goBg: c.primary,
        goFg: c.onPrimary,
      })
    ),
  }

  const shell = (children: React.ReactNode) => (
    <div className={`app ${styles.app}`}>
      <LangBar all />
      <main className={styles.stage} style={vars}>
        <div className={`surface ${styles.panel}`}>{children}</div>
        <a className={styles.adminLink} href={`/${slug}/admin/photocard`}>
          {t('관리자 페이지로 이동')}
        </a>
      </main>
    </div>
  )

  if (getSlotService(slot) !== 'photocard') {
    return shell(
      <div className={styles.center}>
        <div className={styles.centerTitle}>{t('이 이벤트에는 스태프 화면이 없어요')}</div>
        <p className={styles.centerBody}>{t('포토카드 뽑기 이벤트에서만 쓰는 화면이에요.')}</p>
      </div>
    )
  }

  if (status === 'checking' && !slot.demo) return shell(<div className={styles.center} aria-busy="true" />)

  /**
   * **체험 슬롯은 로그인을 안 묻는다** (0032). 랜딩에서 이 화면을 보여주려면 열려 있어야 하고,
   * 계정을 만들어 공개할 수는 없다(그 계정으로 다른 걸 만지게 된다).
   * 뽑기 자체의 판정은 서버가 한다 — 화면을 열어주는 것과 뽑게 해주는 것은 다른 문이다.
   */
  if (status === 'out' && !slot.demo) {
    return shell(
      <div className={styles.center}>
        <Lock size={32} strokeWidth={1.6} aria-hidden="true" />
        <div className={styles.centerTitle}>{t('스태프만 쓰는 화면이에요')}</div>
        <p className={styles.centerBody}>
          {t('행사 계정으로 한 번만 로그인해 두시면 이 기기에서 계속 쓸 수 있어요.')}
        </p>
        <Link className={styles.linkBtn} to={`/${slug}/admin/login`}>
          {t('로그인하러 가기')}
        </Link>
      </div>
    )
  }

  if (!repo.photocard.ready() || !settings) return shell(<div className={styles.center} aria-busy="true" />)

  const rules = photocardRules(settings.mode)

  if (rules.visitorDraws) {
    return shell(
      <div className={styles.center}>
        <Sparkles size={32} strokeWidth={1.6} aria-hidden="true" />
        <div className={styles.centerTitle}>{t('이 이벤트는 방문자가 직접 뽑아요')}</div>
        <p className={styles.centerBody}>
          {t('운영 방식이 저장용이라 스태프가 뽑을 일이 없어요. 방식은 관리 화면의 카드에서 바꿀 수 있어요.')}
        </p>
        <Link className={styles.linkBtn} to={`/${slug}/admin/photocard`}>
          {t('관리 화면 열기')}
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
    try {
      const cards = rules.usesTicket
        ? [await repo.photocard.drawByTicket(slug, code)]
        : await repo.photocard.drawBatch(slug, count)
      setResult(cards)
      setSummary(false)
      setCode('')
      log.record(cards)
      // 재고가 떨어졌으면 미리보기의 소진 표시가 바뀐다
      void load()
    } catch (e) {
      // 끊긴 걸 모르면 "뽑지 못했어요" 만 뜨고 스태프는 시스템이 고장난 줄 안다
      setError(
        online ? (e instanceof Error ? e.message : t('뽑지 못했어요')) : t('연결이 끊겼어요 — 와이파이를 확인하고 다시 눌러 주세요')
      )
    } finally {
      setBusy(false)
    }
  }

  /** 전체 결과 — **카드 이름과 장수**. 같은 카드가 여러 장이면 한 줄로 묶는다 */
  const rollup = result
    ? [...result.reduce((m, x) => m.set(x.name, (m.get(x.name) ?? 0) + 1), new Map<string, number>())]
    : []

  const canPreview = lineup.length > 0

  return (
    <div className={`app ${styles.app}`}>
      <LangBar all />
      <main className={styles.stage} style={vars}>
        <div className={`surface ${styles.panel}`}>
          {/* 위쪽 밴드 — 럭드의 '경품 미리보기' 자리 */}
          {!result && (
            <div className={styles.band}>
              <span className={styles.bandMsg}>{t('어떤 포토카드가 있는지 확인해보세요!')}</span>
              {canPreview && (
                <button type="button" className={styles.previewBtn} onClick={() => setSheet(true)} data-open-sheet>
                  <Layers size={13} strokeWidth={2} aria-hidden="true" />
                  {t('포토카드 미리보기')}
                </button>
              )}
            </div>
          )}

          {result ? (
            /*
             * 결과 — **럭드 `ResultReveal` 과 같은 뼈대다** (머리말 → 목록 → 아래 버튼 한 줄).
             * 가운데만 다르다: 등수 타일이 아니라 카드 그림 + 이름.
             */
            <div className={styles.reveal}>
              <header className={styles.revealHead}>
                {!summary && <p className={styles.eyebrow}>{t('✦ 두근두근')}</p>}
                <h2 className={styles.revealTitle}>{summary ? t('전체 결과') : t('당첨 결과')}</h2>
              </header>

              {settings.rehearsal && (
                <div className={styles.banner}>
                  <Info size={16} aria-hidden="true" />
                  <span>
                    연습이라 <b>{t('재고는 줄지 않았어요')}</b>.
                  </span>
                </div>
              )}

              {summary ? (
                /* 전체 결과 — 카드 이름과 장수 (럭드 요약과 같은 줄) */
                <ul className={styles.summary} data-summary>
                  {rollup.map(([name, n]) => (
                    <li key={name} className={styles.summaryRow}>
                      <span className={styles.summaryName}>{name}</span>
                      <span className={styles.summaryCount}>{n}장</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className={styles.cards} data-drawn>
                  {result.map((x, i) => (
                    <div key={`${x.cardId}-${i}`} className={styles.card}>
                      {/* 카드 앞면도 background-image — 길게 눌러 저장되면 안 된다 (CLAUDE.md) */}
                      <div
                        className={styles.face}
                        style={
                          x.image
                            ? { backgroundImage: cssUrl(x.image), animationDelay: `${i * 80}ms` }
                            : { animationDelay: `${i * 80}ms` }
                        }
                        role={x.image ? 'img' : undefined}
                        aria-label={x.name}
                      >
                        {!x.image && <ImageIcon size={26} strokeWidth={1.6} aria-hidden="true" />}
                      </div>
                      <div className={styles.cardName}>{x.name}</div>
                      <div className={styles.cardRarity}>{t(RARITY_LABEL[x.rarity] ?? '')}</div>
                    </div>
                  ))}
                </div>
              )}

              <div className={styles.revealFoot}>
                {summary ? (
                  <button
                    type="button"
                    className="btn btn--slight btn--block"
                    onClick={() => setResult(null)}
                    data-done
                  >
                    처음으로
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn--primary btn--block"
                    onClick={() => setSummary(true)}
                    data-summary-btn
                  >
                    전체 결과 보기
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className={styles.controls}>
              {slot.demo && (
                <div className={styles.banner} data-demo>
                  <Info size={17} strokeWidth={2} aria-hidden="true" />
                  <span>
                    <b>{t('체험용 화면이에요.')}</b> 실제로는 스태프가 로그인한 기기에서만 열려요.
                  </span>
                </div>
              )}
              {!online && (
                <div className={styles.banner} data-offline>
                  <WifiOff size={17} strokeWidth={2} aria-hidden="true" />
                  <span>
                    <b>{t('연결이 끊겼어요.')}</b> 지금 누르면 뽑히지 않아요 — 와이파이를 확인해 주세요.
                  </span>
                </div>
              )}
              {settings.rehearsal && (
                <div className={styles.banner}>
                  <Info size={17} strokeWidth={2} aria-hidden="true" />
                  <span>
                    지금은 <b>{t('연습')}</b>이에요. 뽑아도 실제 재고는 줄지 않아요.
                  </span>
                </div>
              )}
              {settings.closed && (
                <div className={styles.banner}>
                  <Info size={17} strokeWidth={2} aria-hidden="true" />
                  <span>{display.closedText}</span>
                </div>
              )}

              {rules.usesTicket ? (
                <>
                  <p className={styles.codeLabel}>{t('뽑기권 번호')}</p>
                  <p className={styles.codeHint}>{t('방문자 폰에 뜬 네 자리를 그대로 입력해 주세요.')}</p>
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
                    aria-label={t('뽑기권 번호')}
                    data-ticket-code
                  />
                  <button
                    type="button"
                    className="btn btn--primary btn--block"
                    style={{ height: 56 }}
                    disabled={busy || settings.closed || code.trim().length < 4}
                    onClick={() => void go()}
                    data-draw
                  >
                    {busy ? t('뽑는 중…') : t('뽑기')}
                  </button>
                </>
              ) : (
                <CountPicker
                  count={count}
                  max={max}
                  onCount={setCount}
                  onGo={() => void go()}
                  label={t('몇 장을 뽑을까요?')}
                  /* `drawLabel` 은 방문자 폰의 '뽑기권 받기' 라 여기선 안 쓴다 — 스태프가 누르는 건 뽑기다 */
                  goLabel={t('뽑기')}
                  busy={busy}
                  disabled={settings.closed}
                  className={styles.picker}
                />
              )}

              {error && (
                <p className={styles.error} data-draw-error>
                  {error}
                </p>
              )}

              {/*
                * 직전 결과 다시 보기 — **전달 착오가 나면 되짚어야 한다.**
                * '전달 완료' 를 누르면 화면이 비어서, 방금 뭘 건넸는지 확인할 길이 없었다.
                */}
              {log.last && log.last.length > 0 && (
                <button
                  type="button"
                  className={styles.lastBtn}
                  onClick={() => {
                    setResult(log.last)
                    setSummary(log.last!.length > 1)
                  }}
                  data-last
                >
                  <History size={14} strokeWidth={2} aria-hidden="true" />
                  직전 결과 다시 보기 ({log.last.length}장)
                </button>
              )}
            </div>
          )}
        </div>

        {/*
          * 박스 아래는 **스태프만 보는 줄**이다 (관리자 링크가 원래 거기 있다).
          * 오늘 처리 수를 밴드에 넣었더니 문구·미리보기 버튼과 셋이 밀려 밴드가 네 줄이 됐다.
          */}
        <div className={styles.footRow}>
          <span className={styles.tally} data-tally>
            오늘 이 기기 {log.count}회
          </span>
          {stock !== null && (
            <span className={styles.tally} data-stock>
              남은 재고 {stock}장
            </span>
          )}
          <a className={styles.adminLink} href={`/${slug}/admin/photocard`}>
            {t('관리자 페이지로 이동')}
          </a>
        </div>
        {display.footerNote && <div className={styles.footerNote}>{display.footerNote}</div>}
      </main>

      {sheet && (
        <div className={styles.sheetBackdrop} onClick={() => setSheet(false)} data-sheet>
          <div
            className={styles.sheet}
            role="dialog"
            aria-modal="true"
            aria-label={t('포토카드 미리보기')}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.sheetBar}>
              <div className={styles.sheetTitle}>{t('포토카드 미리보기')}</div>
              <button type="button" className={styles.sheetClose} onClick={() => setSheet(false)} aria-label={t('닫기')}>
                <X size={17} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>

            <div className={styles.lineup} data-lineup>
              {lineup.map((x) => (
                <div
                  key={x.id}
                  className={styles.lineupCard}
                  data-lucky={x.lucky ? '' : undefined}
                  data-sold={x.soldOut ? '' : undefined}
                >
                  {/* 카드 앞면도 background-image (CLAUDE.md) */}
                  <div
                    className={styles.lineupFace}
                    style={x.image ? { backgroundImage: cssUrl(x.image) } : undefined}
                    role={x.image ? 'img' : undefined}
                    aria-label={x.name}
                  >
                    {!x.image && <ImageIcon size={20} strokeWidth={1.6} aria-hidden="true" />}
                  </div>
                  {x.lucky && !x.soldOut && (
                    <span className={styles.luckyMark} aria-label={t('럭키 카드')}>
                      <Star size={12} strokeWidth={2.6} fill="currentColor" aria-hidden="true" />
                    </span>
                  )}
                  <div className={styles.lineupName}>{x.name}</div>
                </div>
              ))}
            </div>

            {(lineup.some((x) => x.lucky) || lineup.some((x) => x.soldOut)) && (
              <div className={styles.legend}>
                {lineup.some((x) => x.lucky) && (
                  <span>
                    <span className={styles.legendDot} aria-hidden="true" />
                    {t('럭키 카드')}
                  </span>
                )}
                {lineup.some((x) => x.soldOut) && <span>{t('흐린 카드는 소진됐어요')}</span>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
