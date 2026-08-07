import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Flag, Gift, Info, Lock } from 'lucide-react'

import { luckydrawDisplay, loadWebfont, fontStack, type LuckydrawDisplay } from '@/data/luckydraw'
import { luminance, softTint } from '@/lib/color'
import { repo } from '@/lib/repo'
import type { DrawResult, LuckydrawSettings, Prize } from '@/lib/repo'
import { useAdminAuth } from '@/admin/useAdminAuth'
import { useSlot } from '@/slot/SlotProvider'
import { useLivePreview } from '@/slot/preview'
import { CountPicker } from '@/components/CountPicker'
import { countPicker, pickerVars } from '@/data/countPicker'
import { ResultReveal } from './ResultReveal'
import { PrizePreview } from './PrizePreview'
import styles from './Luckydraw.module.css'
import { useT, useLang } from '@/i18n'
import { pick } from '@/data/multilingual'
import { LangBar } from '@/components/LangBar'
import { useLocalizedDisplay } from '@/i18n/display'

/** 한 번에 뽑을 수 있는 최대 — 서버도 같은 값으로 막는다 (`draw_prizes`) */
const MAX_DRAW = 100

/** 두 색 중 **더 어두운 쪽** — 등수 배지가 옅은 배경에서도 읽히게 (휘도 못 재면 앞 색) */
function darker(a: string, b: string): string {
  const la = luminance(a)
  const lb = luminance(b)
  if (la === null) return b
  if (lb === null) return a
  return la <= lb ? a : b
}

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
  const t = useT()
  const { lang } = useLang()
  const slot = useSlot()
  const rawDisplay = luckydrawDisplay(slot)
  /** 기본 문구는 사전에서 번역되고, 주최자가 쓴 문구는 원문 그대로 (src/i18n/display.ts) */
  const display = useLocalizedDisplay(rawDisplay)
  const { status: authStatus } = useAdminAuth(slot.slug)
  const preview = useLivePreview()

  const [prizes, setPrizes] = useState<Prize[] | null>(null)
  /**
   * **경품 id → 주최자가 언어별로 적은 이름** (`0046_content_i18n.sql`).
   *
   * `draw_prizes` 는 결과 JSON 을 서버에서 만들어 주는데 거기엔 원문 이름만 실려 있다 —
   * 그 함수는 재고 차감과 묶음 상한을 한 트랜잭션에서 하는 자리라 번역을 붙이자고 열지 않았다.
   * 대신 **경품 표를 읽을 때 이 맵을 떠 둔다.** 뽑고 나면 서버가 준 최신 재고로 `prizes` 가
   * 덮이지만(번역이 없는 값이다), 이 맵은 그대로 남아 결과 화면이 계속 쓸 수 있다.
   */
  const [nameI18n, setNameI18n] = useState<Record<string, Prize['nameI18n']>>({})
  const [settings, setSettings] = useState<LuckydrawSettings | null>(null)
  const [count, setCount] = useState(1)
  const [drawing, setDrawing] = useState(false)
  const [result, setResult] = useState<DrawResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [prizeOpen, setPrizeOpen] = useState(false)

  /**
   * 고른 웹폰트를 **그때 받는다.**
   *
   * index.html 에 세 개를 다 넣어두면 안 쓰는 폰트까지 모든 방문자가 받는다 —
   * 카페 대기줄에서 그만큼 더 기다린다. 슬롯이 고른 하나만 붙인다.
   * Paperlogy 는 CSS 가 아니라 woff2 라 @font-face 를 직접 만든다.
   */
  useEffect(() => {
    // 배송·경품 모달은 body 로 포털돼 .stage 밖에 있다 — :root 에도 실어야 웹폰트가 먹는다
    document.documentElement.style.setProperty('--ds-font', fontStack(display.fontFamily))
    loadWebfont(display.fontFamily)
  }, [display.fontFamily])

  /**
   * 모달 전용 색 — 배송·경품 모달은 body 로 포털돼 .stage 밖이라 :root 에 실어야 닿는다.
   * 비어 있으면 변수를 지워 CSS 가 테마 토큰으로 폴백한다 (기본은 지금과 똑같다).
   */
  const c0 = slot.theme.colors
  useEffect(() => {
    const root = document.documentElement
    const set = (name: string, value: string) =>
      value ? root.style.setProperty(name, value) : root.style.removeProperty(name)
    set('--ld-modal-bg', display.modalBg)
    set('--ld-modal-text', display.modalText)
    set('--ld-modal-item', display.modalItemBg)
    // 테두리 없음이면 색을 무시하고 투명으로 (비면 CSS 가 테마 border 로 폴백)
    set('--ld-modal-border', display.modalNoBorder ? 'transparent' : display.modalBorder)
    // 타일 테두리 없애기 — 결과 타일·요약 줄·경품 모달 줄까지 (포털이라 :root 에 실어야 닿는다)
    set('--ds-tile-border', display.noBorder ? 'transparent' : '')
    /*
     * 당첨(긁는 등수) 타일만 따로 테두리 없음 — 위 토글과 나눈 이유는 `data/luckydraw.ts`.
     * **색이 아니라 표식이다**: 투명 테두리는 자리를 차지해 커버 둘레에 흰 링이 남는다
     * (`Luckydraw.module.css` 의 `[data-ld-high-noborder]`). 그래서 테두리를 통째로 없앤다.
     */
    if (display.highNoBorder) root.setAttribute('data-ld-high-noborder', '')
    else root.removeAttribute('data-ld-high-noborder')
    // 수량 카운터 전용 색 (비우면 CSS 가 테마 색·시안 그림자로 폴백)
    set('--ld-counter-shadow', display.counterShadow)
    /*
     * 보조 버튼('처음으로') 색 — 비우면 CSS 가 파생색으로 폴백한다 (지금과 똑같다).
     * :root 에 싣는 이유는 다른 --ld-* 와 같다: 모달이 body 로 포털돼 무대 밖이다.
     */
    set('--ld-sub-bg', display.subBtnBg)
    set('--ld-sub-fg', display.subBtnFg)
    /*
     * 포인트 글자·아이콘('경품 미리보기'·안내 배너 아이콘·배송 칩). 비우면 변수를 지워
     * CSS 가 primary 로 폴백한다 — 안 고른 슬롯의 화면은 지금과 똑같다.
     */
    set('--ld-point', display.pointColor)
    /*
     * 수량 고르기는 공용 컴포넌트라 `--cp-*` 로 넘긴다. 안 고른 색은 **슬롯 테마와 옛
     * counter* 값에서** 물려받는다 — 이미 도는 럭드 슬롯의 화면이 달라지면 안 된다.
     */
    const cp = pickerVars(
      countPicker(display.picker, {
        /**
         * 안 고르면 **옅게 파생한 wash** 를 쓴다 (저장값 그대로가 아니라).
         * 저장값은 럭드 편집기에서 '커버 배경' 이라 진한 색이 올 수 있는데, 카운터는
         * 화면 한가운데 큰 알약이라 그 색으로 꽉 차면 무대가 통째로 그 색이 된다.
         */
        bg: display.counterBg || softTint(c0.wash, c0.canvas),
        borderColor: display.counterBorder || c0.border,
        fg: c0.fg1,
        stepBg: c0.surfaceRaised,
        onBg: c0.primary,
        onFg: c0.onPrimary,
        goBg: c0.primary,
        goFg: c0.onPrimary,
      })
    )
    for (const [k, v] of Object.entries(cp)) root.style.setProperty(k, v)
    // 등수 배지 스타일 — 경품 미리보기 모달이 body 로 포털돼 :root 에 실어야 닿는다
    root.setAttribute('data-ld-badge', display.badgeStyle)
    /**
     * 등수 배지의 등수색 — **짝(배경/글자) 중 더 어두운 쪽**을 쓴다.
     * soft 는 옅은 배경에 이 색을 글자로, solid 는 이 색을 배경에 흰 글자로 얹는데,
     * 밝은 쪽(예: onHigh 가 흰색)을 그대로 쓰면 soft 에서 글자가 안 보이고 solid 도 흰 배경이
     * 된다. 늘 어두운 쪽을 골라 두 스타일 모두 대비를 확보한다.
     */
    set('--ld-rank', darker(c0.primary, c0.onPrimary))
    set('--ld-rank-hi', darker(c0.high, c0.onHigh))
  }, [
    display.modalBg,
    display.modalText,
    display.modalItemBg,
    display.modalBorder,
    display.modalNoBorder,
    display.noBorder,
    display.highNoBorder,
    display.counterBg,
    display.counterBorder,
    display.counterShadow,
    display.subBtnBg,
    display.subBtnFg,
    display.picker,
    display.badgeStyle,
    c0,
  ])

  const load = useCallback(async () => {
    try {
      const [p, s] = await Promise.all([
        repo.luckydraw.listPrizes(slot.slug),
        repo.luckydraw.getSettings(slot.slug),
      ])
      setPrizes(p)
      // 번역 맵은 **경품 표를 읽을 때만** 뜬다 — 뽑기 결과엔 원문만 실려 온다
      setNameI18n(Object.fromEntries(p.map((x) => [x.id, x.nameI18n])))
      setSettings(s)
    } catch {
      // 못 읽은 것과 상품이 없는 것은 다르다 — 빈 배열로 두면 "마감" 처럼 보인다
      setError(t('상품 정보를 불러오지 못했어요'))
      setPrizes([])
    }
  }, [slot.slug])

  useEffect(() => {
    void load()
  }, [load])

  /**
   * 다른 기기가 뽑거나 주최자가 마감하면 **가만히 있어도** 따라온다.
   *
   * **결과를 보고 있을 땐 안 읽는다** — 당첨 화면 한가운데서 재고가 갱신되면 화면이
   * 흔들리고, 어차피 '처음으로' 를 누르면 다시 읽는다. 재고가 중요한 건 뽑기 화면이다.
   * 미리보기에서도 안 붙인다 (편집기가 보내는 초안이 진짜 데이터를 덮어쓰는 화면이다).
   */
  useEffect(() => {
    if (result || preview) return
    return repo.luckydraw.watch(slot.slug, () => void load())
  }, [slot.slug, load, result, preview])

  const realRemaining = (prizes ?? []).reduce((sum, p) => sum + p.remaining, 0)
  const soldOut = prizes !== null && realRemaining === 0
  const closed = settings?.closed === true

  /**
   * 결과에 실린 경품 이름을 **방문자의 언어로 갈아 끼운다.**
   *
   * 아래 화면들(당첨 연출·요약·배송 폼)이 전부 `name` 하나만 본다. 여기서 한 번 바꿔 두면
   * 그 셋을 안 건드려도 되고, 나중에 화면이 늘어도 자동으로 따라온다.
   * 한국어면 바꿀 게 없어 그대로 돌려준다 (`pick` 이 원문을 준다).
   */
  const localizeResult = useCallback(
    (r: DrawResult): DrawResult => ({
      ...r,
      results: r.results.map((x) => ({ ...x, name: pick(x.name, nameI18n[x.prizeId], lang) })),
      prizes: r.prizes.map((x) => ({ ...x, name: pick(x.name, nameI18n[x.id], lang) })),
    }),
    [nameI18n, lang]
  )

  async function draw() {
    if (drawing) return
    setDrawing(true)
    setError(null)
    try {
      const next = await repo.luckydraw.draw(slot.slug, count)
      setResult(localizeResult(next))
      // 서버가 최신 재고를 같이 준다 — 다시 읽을 필요가 없다
      setPrizes(next.prizes)
    } catch (e) {
      // 마감·재고 부족·권한 없음 — 서버가 한국어로 답한다
      setError(e instanceof Error ? e.message : t('뽑지 못했어요'))
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

  const rehearsal = settings?.rehearsal === true
  const lowStock =
    display.lowStockThreshold !== null && remaining <= display.lowStockThreshold && !unavailable
  const showCount = settings?.showPrizeCount ?? true
  // 방문자에게 경품 목록을 보여줄지 (주최자 설정) — 상품이 있고, 마감/품절이 아닐 때만
  const canPreview =
    (settings?.showPrizePreview ?? true) && (prizes?.length ?? 0) > 0 && !unavailable

  if (prizes === null && !previewing) return <div className="app" aria-busy="true" />

  return (
    <div className={`app ${styles.app}`}>
      {/* 이 서비스는 자기 무대를 그린다 — ServiceHeader 가 없어 여기서 얹는다 */}
      <LangBar />
      <main
        className={styles.stage}
        /* 편집기가 누른 색이 어느 자리인지 — 그 부분만 깜빡인다 */
        data-hl={preview?.highlight ?? undefined}
        /* 박스 위치·여백은 슬롯이 정한다 — 배경 사진마다 얼굴이 오는 높이가 다르다 */
        style={
          {
            '--ds-box-top': `${display.boxTopMargin}px`,
            '--ds-box-padding': `${display.boxPadding}px`,
            '--ds-box-border-w': `${display.boxBorderWidth}px`,
            '--ds-box-border-c': display.boxBorderColor || 'transparent',
            '--ds-admin-link': display.adminLinkColor,
            // 색만이 아니라 **완전한 그림자 문자열** — 슬롯이 색·번짐·내림을 다 정한다
            '--ds-shadow': `0 ${display.boxShadowY}px ${display.boxShadowBlur}px ${display.boxShadowColor}`,
            '--ds-font': fontStack(display.fontFamily),
          } as React.CSSProperties
        }
      >
        <div className={`surface ${styles.panel}`} data-part="box">
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
              {result ? (
                <ResultReveal
                  result={result}
                  display={display}
                  displayMode={settings?.displayMode ?? 'both'}
                  slug={slot.slug}
                  onFinish={finish}
                />
              ) : unavailable ? (
                <div className={styles.closedScreen} data-part="box">
                  <span className={styles.closedIcon}>
                    <Flag size={26} aria-hidden="true" />
                  </span>
                  <p className={styles.closedTitle}>{display.closedText}</p>
                  <p className={styles.closedSub}>
                    참여해 주셔서 고마워요. 다음 이벤트에서 만나요!
                  </p>
                </div>
              ) : (
                <div className={styles.controls}>
                  {/* 상단 밴드 — 남은 수량 문구 + 경품 미리보기 */}
                  {(lowStock || canPreview) && (
                    <div className={styles.band}>
                      <span className={styles.bandMsg} data-low={lowStock || undefined}>
                        {lowStock
                          ? t('남은 경품 {n}개, 서둘러요!', { n: remaining })
                          : t('어떤 경품이 있는지 확인해보세요!')}
                      </span>
                      {canPreview && (
                        <button
                          type="button"
                          className={styles.previewBtn}
                          onClick={() => setPrizeOpen(true)}
                          data-prize-preview
                        >
                          <Gift size={14} aria-hidden="true" /> {t('경품 미리보기')}
                        </button>
                      )}
                    </div>
                  )}

                  {rehearsal && (
                    <div className={styles.infoBanner} data-rehearsal>
                      <Info size={16} aria-hidden="true" />
                      {/* 조각내지 않는다 — 예전엔 "리허설" 만 감싸서 앞뒤 조사가 한국어로 남았다 */}
                      <span>{t('지금은 리허설이에요. 뽑아도 실제 재고는 줄지 않아요.')}</span>
                    </div>
                  )}

                  {/**
                    * 수량 고르기 — **포토카드와 같은 컴포넌트**를 쓴다
                    * (`src/components/CountPicker.tsx`). 예전엔 두 서비스가 같은 묶음을
                    * 각자 그려서 프리셋 숫자가 이미 갈라져 있었다 (여기 1·5·10 / 포토카드 1·3·5·10).
                    */}
                  <CountPicker
                    count={count}
                    max={MAX_DRAW}
                    /* 빠른선택 숫자 — 색과 달리 CSS 로 못 보내서 값으로 넘긴다 (비우면 기본 1·5·10) */
                    presets={display.picker.presets}
                    onCount={setCount}
                    onGo={draw}
                    label={t('몇 개를 뽑을까요?')}
                    goLabel={display.drawLabel}
                    busy={drawing}
                    /**
                     * **체험 슬롯은 로그인 없이 뽑는다** (`0034_demo_admin.sql`).
                     * 이 화면 자체가 스태프 화면이라(럭드는 방문자 화면이 곧 뽑기 화면),
                     * 잠겨 있으면 랜딩에서 보여줄 게 "경품 목록" 뿐이다.
                     * 서버도 같은 판정을 한다 — `draw_prizes` 가 `manages_slot` 을 보고,
                     * 그게 체험 슬롯이면 통과한다.
                     */
                    disabled={authStatus !== 'in' && !previewing && !slot.demo}
                    className={styles.picker}
                  />

                  {authStatus !== 'in' && !previewing && !slot.demo && (
                    <p className={styles.staffHint}>
                      <Lock size={13} aria-hidden="true" /> 스태프가 로그인해야 뽑을 수 있어요.
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

        {/**
         * 관리자 진입은 **박스 밖 아래**에 흐릿하게 (원본과 같은 자리).
         * 방문자 눈엔 안 띄고 스태프는 어디 있는지 안다 — 박스 안에 크게 두면
         * 추첨 화면의 주인공이 로그인 버튼이 돼 버린다.
         */}
        {/**
         * 미리보기에서도 **보여야 한다** — 이 링크의 색을 고르는 칸이 편집기에 있는데
         * 정작 화면에 안 나오면 무슨 색인지 확인할 수가 없다.
         * 다만 링크로 두면 미리보기 iframe 이 관리자 화면으로 넘어가 버리므로 글자만 그린다.
         */}
        {previewing ? (
          <span className={styles.adminLink} data-part="adminLink">
            {t('관리자로 로그인')}
          </span>
        ) : (
          /**
           * **로그인한 뒤에도 남는다** (원본과 같다). 로그인하면 링크가 사라지게 해뒀더니
           * 스태프가 관리 화면으로 갈 길이 없어졌다 — 행사 중에 수량을 고치거나 마감하려면
           * 여기로 들어가야 한다.
           */
          <Link to={`/${slot.slug}/admin`} className={styles.adminLink}>
            {/* 체험 슬롯은 로그인이 없으니 "로그인" 이라 쓰면 거짓말이다 — 그냥 가는 문이다 */}
            {authStatus === 'in' || slot.demo
              ? t('관리자 페이지로 이동')
              : authStatus === 'checking'
                ? t('확인 중…')
                : t('관리자로 로그인')}
          </Link>
        )}

        {display.footerNote && <p className={styles.footerNote}>{display.footerNote}</p>}
      </main>

      {prizeOpen && prizes && (
        <PrizePreview
          prizes={[...prizes].sort((a, b) => a.rank - b.rank)}
          showCount={showCount}
          highlightRanks={display.highlightRanks}
          hideRank={settings?.displayMode === 'prize'}
          onClose={() => setPrizeOpen(false)}
        />
      )}
    </div>
  )
}
