import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Minus, Plus } from 'lucide-react'

import { luckydrawDisplay, WEBFONTS, type LuckydrawDisplay } from '@/data/luckydraw'
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

  /**
   * 고른 웹폰트를 **그때 받는다.**
   *
   * index.html 에 세 개를 다 넣어두면 안 쓰는 폰트까지 모든 방문자가 받는다 —
   * 카페 대기줄에서 그만큼 더 기다린다. 슬롯이 고른 하나만 붙인다.
   * Paperlogy 는 CSS 가 아니라 woff2 라 @font-face 를 직접 만든다.
   */
  useEffect(() => {
    const font = WEBFONTS[display.fontFamily]
    if (!font) return
    const id = `ld-font-${display.fontFamily}`
    if (document.getElementById(id)) return

    // woff2 를 직접 주는 폰트는 @font-face 를 굵기별로 만든다 (CSS 를 주는 폰트는 link 하나)
    const el =
      'faces' in font
        ? Object.assign(document.createElement('style'), {
            id,
            textContent: font.faces
              .map(
                (f) =>
                  `@font-face{font-family:'Paperlogy';src:url('${f.href}') format('woff2');font-weight:${f.weight};font-display:swap}`
              )
              .join(''),
          })
        : Object.assign(document.createElement('link'), { id, rel: 'stylesheet', href: font.href })

    document.head.appendChild(el)
  }, [display.fontFamily])

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
      <main
        className={styles.stage}
        /* 편집기가 누른 색이 어느 자리인지 — 그 부분만 깜빡인다 */
        data-hl={preview?.highlight ?? undefined}
        /* 박스 위치·여백은 슬롯이 정한다 — 배경 사진마다 얼굴이 오는 높이가 다르다 */
        style={
          {
            '--ld-box-top': `${display.boxTopMargin}px`,
            '--ld-box-padding': `${display.boxPadding}px`,
            '--ld-admin-link': display.adminLinkColor,
            '--ld-font': WEBFONTS[display.fontFamily]?.stack,
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
               * 버튼은 **늘 이 자리에 있고 로그인 전엔 비활성**이다 (원본과 같다).
               * 로그인 링크로 바꿔치우면 손님이 보는 화면의 주인공이 로그인 버튼이 되고,
               * 로그인한 뒤엔 버튼 위치가 달라져 스태프가 한 번 더 헤맨다.
               * 어디로 가야 하는지는 박스 아래 흐린 링크가 말해준다 (원본과 같은 자리).
               */}
              <button
                type="button"
                className="btn btn--primary btn--block"
                disabled={(authStatus !== 'in' && !previewing) || drawing}
                onClick={draw}
                data-draw
              >
                {drawing ? '뽑는 중…' : display.drawLabel}
              </button>

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
         * 손님 눈엔 안 띄고 스태프는 어디 있는지 안다 — 박스 안에 크게 두면
         * 추첨 화면의 주인공이 로그인 버튼이 돼 버린다.
         */}
        {/**
         * 미리보기에서도 **보여야 한다** — 이 링크의 색을 고르는 칸이 편집기에 있는데
         * 정작 화면에 안 나오면 무슨 색인지 확인할 수가 없다.
         * 다만 링크로 두면 미리보기 iframe 이 관리자 화면으로 넘어가 버리므로 글자만 그린다.
         */}
        {previewing ? (
          <span className={styles.adminLink} data-part="adminLink">
            관리자로 로그인
          </span>
        ) : (
          /**
           * **로그인한 뒤에도 남는다** (원본과 같다). 로그인하면 링크가 사라지게 해뒀더니
           * 스태프가 관리 화면으로 갈 길이 없어졌다 — 행사 중에 수량을 고치거나 마감하려면
           * 여기로 들어가야 한다.
           */
          <Link to={`/${slot.slug}/admin`} className={styles.adminLink}>
            {authStatus === 'in'
              ? '관리자 페이지로 이동'
              : authStatus === 'checking'
                ? '확인 중…'
                : '관리자로 로그인'}
          </Link>
        )}

        {display.footerNote && <p className={styles.footerNote}>{display.footerNote}</p>}
      </main>
    </div>
  )
}
