import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { repo } from '@/lib/repo'
import { getSlotService, SERVICES } from '@/data/services'
import type { ServiceId } from '@/data/services'
import { useSlot } from '@/slot/SlotProvider'
import { periodLabel, slotStatus } from '@/owner/period'
import { collectSheets, downloadSheets, type Sheet } from './exportAll'
import { toast } from './AdminFeedback'
import type { Slot } from '@/types/slot'

/**
 * 주최자 대시보드 — `/{slug}/admin`. **행사장에서 제일 먼저 여는 화면이다.**
 *
 * 예전엔 로그인하면 곧장 서비스 화면(카드 목록·문항 목록)으로 떨어졌다. 그건 "고치는 화면"
 * 이지 "지금 어떻게 돌고 있나" 를 보는 화면이 아니라서, 오늘 몇 장 나갔는지 알려면 메뉴를
 * 돌아다녀야 했다.
 *
 * **숫자는 이미 있는 조회만으로 만든다.** 대시보드를 위해 RPC 를 새로 파면 서비스가 늘 때마다
 * 같은 숫자를 두 곳에서 세게 된다 — 각 서비스가 이미 쓰는 report/stats 를 그대로 읽는다.
 * 못 읽는 항목은 **조용히 빼지 않고** "지금은 못 봐요" 로 남긴다(0 과 모름은 다르다).
 */

interface Stat {
  label: string
  value: string
  /** 숫자 뒤에 붙는 단위 (개·명·장…) */
  unit?: string
  /** 숫자 아래 한 줄 — 뭘 센 건지 */
  note?: string
  /** 눈에 띄어야 하는 값 (재고 소진 임박 등) */
  warn?: boolean
}

interface Shortcut {
  to: string
  label: string
  desc: string
  /** 관리 셸 밖 화면 — 새 탭 */
  external?: boolean
}

export function Dashboard() {
  const slot = useSlot()
  const service = getSlotService(slot)
  const [stats, setStats] = useState<Stat[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** 재고 막대 — 한정 카드/경품이 있을 때만 (없으면 그릴 게 없다) */
  const [bars, setBars] = useState<StockBar[] | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      setStats(await collect(service, slot.slug))
    } catch (e) {
      setError(e instanceof Error ? e.message : '현황을 읽지 못했어요')
      setStats([])
    }
    setBars(await stockBars(service, slot.slug).catch(() => []))
  }, [service, slot.slug])

  /**
   * 행사 자료 내보내기 — **종료 +14일이 지나면 못 꺼낸다.**
   * 파일이 여러 개라 받기 전에 몇 개인지 말해 준다 (조용히 여러 개가 떨어지면 놀란다).
   */
  async function exportAll() {
    if (saving) return
    setSaving(true)
    try {
      const sheets: Sheet[] = await collectSheets(slot, service)
      if (sheets.length === 0) {
        toast('내보낼 기록이 아직 없어요')
        return
      }
      await downloadSheets(slot.slug, sheets)
      toast(`${sheets.length}개 파일을 받았어요`)
    } catch (e) {
      toast(e instanceof Error ? e.message : '내보내지 못했어요')
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    void load()
  }, [load])

  const period = periodLine(slot)
  const serviceName = SERVICES.find((s) => s.id === service)?.label ?? service

  return (
    <>
      <header className="ad-head">
        <div className="ad-head__row">
          <h1 className="ad-head__title">대시보드</h1>
          <span className="ad-head__count">{serviceName}</span>
        </div>
        <p className="ad-head__desc">
          오늘 이 행사에서 무엇이 얼마나 돌고 있는지 한눈에 봐요.
        </p>
      </header>

      <div className="ad-stack">
        <div className="ad-card ad-card--tight" style={{ display: 'flex', alignItems: 'center', gap: 11, flexWrap: 'wrap' }}>
          <span className="ad-state" data-tone={period.tone}>
            <span className="ad-state__dot" aria-hidden="true" />
            {period.badge}
          </span>
          <span className="ad-sub">{period.detail}</span>
        </div>

        {error && (
          <div className="ad-banner ad-banner--err ad-banner--pad">
            <div className="ad-banner__title">현황을 읽지 못했어요</div>
            <div className="ad-banner__body">{error}</div>
          </div>
        )}

        {stats === null && (
          <div className="ad-stats ad-stats--4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="ad-skel" style={{ height: 96 }} />
            ))}
          </div>
        )}

        {stats && stats.length > 0 && (
          <div
            className={`ad-stats ${stats.length >= 4 ? 'ad-stats--4' : stats.length === 2 ? 'ad-stats--2' : ''}`}
            data-stats
          >
            {stats.map((s) => (
              <div key={s.label} className="ad-stat" data-hot={s.warn || undefined}>
                <div className="ad-stat__label">{s.label}</div>
                <div className="ad-stat__row">
                  <span className="ad-stat__value tnum">{s.value}</span>
                  {s.unit && <span className="ad-stat__unit">{s.unit}</span>}
                </div>
                {s.note && <div className="ad-stat__sub">{s.note}</div>}
              </div>
            ))}
          </div>
        )}

        <div className="ad-split">
          <div className="ad-stack">
            {bars && bars.length > 0 && (
              <div className="ad-card" data-stock>
                <div className="ad-card__title">품목별 남은 비율</div>
                <div className="ad-bars">
                  {bars.map((b) => {
                    const pct = b.total > 0 ? Math.round((b.left / b.total) * 100) : 0
                    const tone = b.left === 0 ? 'out' : pct < 20 ? 'low' : undefined
                    return (
                      <div key={b.name} className="ad-bar" data-tone={tone}>
                        <div className="ad-bar__top">
                          <span className="ad-bar__name">{b.name}</span>
                          <span className="ad-bar__num tnum">
                            {b.left} / {b.total}
                          </span>
                        </div>
                        <div className="ad-bar__track">
                          {/* 남은 비율을 그린다 — "얼마나 빠졌나" 보다 "얼마나 남았나" 가 현장의 질문이다 */}
                          <span className="ad-bar__fill" style={{ ['--ad-pct' as string]: `${pct}%` }} />
                        </div>
                        {tone && (
                          <div className="ad-bar__note">
                            {tone === 'out' ? '소진됐어요' : '20% 아래로 남았어요'}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="ad-card">
              <div className="ad-card__title">바로 가기</div>
              <div className="ad-shortcuts">
                {SHORTCUTS[service].concat(COMMON_SHORTCUTS).map((s) =>
                  s.external ? (
                    <a
                      key={s.to}
                      className="ad-shortcut"
                      href={`/${slot.slug}${s.to ? `/${s.to}` : ''}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <div className="ad-card__titleRow">
                        <span className="ad-shortcut__name">{s.label}</span>
                        <span className="ad-shortcut__tag">새 탭 ↗</span>
                      </div>
                      <div className="ad-shortcut__desc">{s.desc}</div>
                    </a>
                  ) : (
                    <Link key={s.to} className="ad-shortcut" to={`/${slot.slug}/admin/${s.to}`}>
                      <div className="ad-card__titleRow">
                        <span className="ad-shortcut__name">{s.label}</span>
                      </div>
                      <div className="ad-shortcut__desc">{s.desc}</div>
                    </Link>
                  )
                )}
              </div>
            </div>
          </div>

          <div className="ad-stack">
            <div className="ad-card">
              <div className="ad-card__title">행사 기간</div>
              <span className="ad-state" data-tone={period.tone}>
                <span className="ad-state__dot" aria-hidden="true" />
                {period.badge}
              </span>
              <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="ad-kv">
                  <span>기간</span>
                  <span className="tnum">{periodLabel(slot)}</span>
                </div>
                {period.left !== null && (
                  <div className="ad-kv">
                    <span>남은 일수</span>
                    <span className="tnum">{period.left}일</span>
                  </div>
                )}
                <div className="ad-kv">
                  <span>자료 보관</span>
                  <span>종료 후 14일</span>
                </div>
              </div>
              <div className="ad-hr" />
              <p className="ad-fine">
                종료되면 손님 주소는 종료 안내로 바뀌고, 보관 기간이 지나면 자료가 파기돼요.
              </p>
            </div>

            <div className="ad-card">
              <div className="ad-card__title">행사 자료 내보내기</div>
              <p className="ad-card__desc">
                CSV 여러 개로 떨어져요 · 개인정보가 든 파일이 섞여 있어요 · 종료 +14일이 지나면
                꺼낼 수 없어요
              </p>
              <button
                type="button"
                className="ad-btn ad-btn--soft ad-btn--xl ad-btn--block"
                style={{ marginTop: 14 }}
                onClick={() => void exportAll()}
                disabled={saving}
                data-export
              >
                {saving ? '모으는 중…' : '내보내기'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

/**
 * 기간 한 줄 — **판정은 이미 있는 것을 쓴다** (`owner/period.ts` · `data/slots.ts`).
 * 여기서 날짜 비교를 다시 짜면 편집기와 관리 화면이 서로 다른 날 "열렸다" 고 말하게 된다.
 */
function periodLine(slot: Slot): {
  badge: string
  detail: string
  tone: 'key' | 'warn' | 'mute'
  left: number | null
} {
  const status = slotStatus(slot)
  const end = slot.period?.rent?.end ?? slot.period?.test?.end ?? null
  const days =
    end !== null
      ? Math.max(0, Math.ceil((new Date(`${end}T23:59:59+09:00`).getTime() - Date.now()) / 86400000))
      : null

  if (status === 'expired')
    return { badge: '종료', detail: '기간이 끝났어요 · 자료는 종료 +14일까지 꺼낼 수 있어요', tone: 'mute', left: null }
  if (status === 'upcoming')
    return { badge: '시작 전', detail: `${periodLabel(slot)} 에 열려요`, tone: 'warn', left: days }
  if (status === 'unlimited')
    return { badge: '진행 중', detail: '기간 제한 없음', tone: 'key', left: null }
  return {
    badge: '진행 중',
    // 마지막 사흘은 남은 날을 말한다 — 그때부터는 날짜보다 "며칠 남았나" 가 급하다
    detail:
      days !== null && days <= 3
        ? `${periodLabel(slot)} · 종료까지 ${days}일 · 자료는 종료 +14일까지 꺼낼 수 있어요`
        : `${periodLabel(slot)} · 자료는 종료 +14일까지 꺼낼 수 있어요`,
    tone: days !== null && days <= 3 ? 'warn' : 'key',
    left: days,
  }
}

const SHORTCUTS: Record<ServiceId, Shortcut[]> = {
  tarot: [{ to: 'questions', label: '질문 관리', desc: '질문과 답변을 고쳐요' }],
  luckydraw: [
    { to: 'overview', label: '상품 · 운영', desc: '재고와 운영 방식을 봐요' },
    { to: 'shipping', label: '배송 정보', desc: '당첨자 주소를 확인해요' },
  ],
  rolling: [{ to: 'messages', label: '쪽지 검수', desc: '남긴 쪽지를 검수해요' }],
  wish: [{ to: 'messages', label: '소원 검수', desc: '걸린 소원을 검수해요' }],
  photozone: [{ to: 'photozone', label: '포토존 안내', desc: '이 서비스의 안내를 봐요' }],
  poll: [
    { to: 'polls', label: '설문 관리', desc: '설문과 선택지를 고쳐요' },
    { to: 'live', label: '스크린', desc: '부스에 세워둘 화면을 봐요' },
  ],
  stamp: [
    { to: 'stamp', label: '스탬프 설정', desc: '현장 암호를 새로 만들거나 고쳐요' },
    { to: 'redeem', label: '수령 확인', desc: '코드를 입력해 실물 전달을 처리해요' },
    { to: 'entries', label: '응모자', desc: '응모한 분들의 명단을 봐요' },
  ],
  quiz: [
    { to: 'quiz', label: '문항 관리', desc: '문항과 운영 방식을 고쳐요' },
    { to: 'stats', label: '통계', desc: '정답률을 보고 다시 채점해요' },
    { to: 'redeem', label: '수령 확인', desc: '교환권을 처리해요' },
  ],
  cheer: [
    { to: 'cheer', label: '상영 설정', desc: '화면에 몇 개씩 띄울지 정해요' },
    { to: 'messages', label: '한마디 검수', desc: '받은 한마디를 검수해요' },
    { to: 'overlay', label: '오버레이 열기', desc: '상영 화면을 새 탭으로 열어요', external: true },
  ],
  photocard: [
    { to: 'photocard', label: '카드 관리', desc: '레어도와 재고를 고쳐요' },
    { to: 'tickets', label: '뽑기권', desc: '발급된 번호를 봐요' },
    { to: 'staff', label: '스태프 화면', desc: '부스 기기용 화면을 새 탭으로 열어요', external: true },
  ],
}

/** 서비스와 무관하게 늘 붙는 두 장 */
const COMMON_SHORTCUTS: Shortcut[] = [
  { to: 'qr', label: 'QR 만들기', desc: '붙일 QR을 내려받아요' },
  { to: '', label: '내 페이지 보기', desc: '손님에게 보이는 화면을 확인해요', external: true },
]

const n = (v: number) => v.toLocaleString('ko-KR')

/**
 * 서비스별 숫자 — **각 서비스가 이미 쓰는 조회를 그대로 읽는다.**
 * `Record<ServiceId, …>` 라 서비스가 늘면 여기가 컴파일 에러로 터진다.
 */
const COLLECT: Record<ServiceId, (slug: string) => Promise<Stat[]>> = {
  async tarot(slug) {
    const [all, open] = await Promise.all([repo.questions.listAll(slug), repo.questions.list(slug)])
    return [
      { label: '질문', value: n(all.length), unit: '개', note: '등록된 질문 수' },
      { label: '공개', value: n(open.length), unit: '개', note: '손님에게 보이는 질문' },
    ]
  },
  async luckydraw(slug) {
    if (!repo.luckydraw.ready()) return []
    const rows = await repo.luckydraw.report(slug)
    const left = rows.reduce((a, r) => a + r.remaining, 0)
    const today = rows.reduce((a, r) => a + r.consumedToday, 0)
    const total = rows.reduce((a, r) => a + r.consumedTotal, 0)
    return [
      { label: '오늘 나간 경품', value: n(today), unit: '개', note: '리허설분은 빼고 셌어요' },
      { label: '전체 나간 경품', value: n(total), unit: '개' },
      {
        label: '남은 재고',
        value: n(left),
        unit: '개',
        note: `상품 ${rows.length}종`,
        warn: left > 0 && left <= 10,
      },
    ]
  },
  async rolling(slug) {
    const all = await repo.rolling.listAll(slug)
    return messageStats(all, '쪽지')
  },
  async wish(slug) {
    const all = await repo.rolling.listAll(slug)
    return messageStats(all, '소원')
  },
  // 서버에 쌓이는 게 없다 — 사진은 손님 폰에서 합성되고 올라오지 않는다
  async photozone() {
    return []
  },
  async poll(slug) {
    if (!repo.poll.ready()) return []
    const polls = await repo.poll.listAll(slug)
    const votes = polls.reduce((a, p) => a + p.options.reduce((b, o) => b + o.votes, 0), 0)
    const open = polls.filter((p) => !p.closed && !p.hidden).length
    return [
      { label: '진행 중 설문', value: n(open), unit: '개', note: `전체 ${polls.length}개` },
      { label: '받은 표', value: n(votes), unit: '표' },
    ]
  },
  async stamp(slug) {
    if (!repo.stamp.ready()) return []
    const [report, issued] = await Promise.all([
      repo.stamp.report(slug),
      repo.rewards.ready() ? repo.rewards.issued(slug, 'stamp') : Promise.resolve([]),
    ])
    const stamped = report.reduce((a, r) => a + r.count, 0)
    const unredeemed = issued.filter((r) => r.kind === 'guaranteed' && !r.redeemedAt).length
    return [
      { label: '찍힌 도장', value: n(stamped), unit: '개', note: `칸 ${report.length}개 합계` },
      { label: '판을 채운 사람', value: n(issued.length), unit: '명', note: '교환권이 나간 수' },
      {
        label: '아직 안 받아간 선물',
        value: n(unredeemed),
        unit: '건',
        note: unredeemed > 0 ? '카운터에서 확인해 주세요' : undefined,
        warn: unredeemed > 0,
      },
    ]
  },
  async quiz(slug) {
    if (!repo.quiz.ready()) return []
    const [stats, issued] = await Promise.all([
      repo.quiz.stats(slug),
      repo.rewards.ready() ? repo.rewards.issued(slug, 'quiz') : Promise.resolve([]),
    ])
    const unredeemed = issued.filter((r) => r.kind === 'guaranteed' && !r.redeemedAt).length
    return [
      { label: '응시', value: n(stats.attempts), unit: '명' },
      { label: '평균 점수', value: stats.attempts ? `${Math.round(stats.avg)}` : '—', unit: stats.attempts ? '점' : '' },
      { label: '나간 교환권', value: n(issued.length), unit: '건' },
      {
        label: '아직 안 받아감',
        value: n(unredeemed),
        unit: '건',
        note: unredeemed > 0 ? '카운터에서 확인해 주세요' : undefined,
        warn: unredeemed > 0,
      },
    ]
  },
  // 한마디는 롤페 테이블에 산다 — 세는 코드도 같다
  async cheer(slug) {
    return messageStats(await repo.rolling.listAll(slug), '한마디')
  },
  async photocard(slug) {
    if (!repo.photocard.ready()) return []
    const [rows, tickets] = await Promise.all([
      repo.photocard.report(slug),
      repo.photocard.listTickets(slug).catch(() => []),
    ])
    const drawn = rows.reduce((a, r) => a + r.drawn, 0)
    /** 재고를 정한 카드만 센다 — `null` 은 무제한이라 더하면 뜻이 흐려진다 */
    const limited = rows.filter((r) => r.remaining !== null)
    const left = limited.reduce((a, r) => a + (r.remaining ?? 0), 0)
    const soldOut = limited.filter((r) => (r.remaining ?? 0) === 0).length
    const open = tickets.filter((t) => t.status === 'open').length
    return [
      { label: '나간 카드', value: n(drawn), unit: '장', note: `카드 ${rows.length}종` },
      {
        label: '남은 한정 재고',
        value: limited.length ? n(left) : '무제한',
        unit: limited.length ? '장' : '',
        note: limited.length ? `한정 ${limited.length}종 · 소진 ${soldOut}종` : '재고를 정한 카드가 없어요',
        warn: limited.length > 0 && left <= 10,
      },
      { label: '아직 안 쓴 뽑기권', value: n(open), unit: '장', note: `발급 ${tickets.length}장` },
    ]
  },
}

function messageStats(all: { hidden?: boolean; createdAt: string }[], unit: string): Stat[] {
  const today = new Date().toISOString().slice(0, 10)
  return [
    { label: `남긴 ${unit}`, value: n(all.filter((m) => !m.hidden).length), unit: '개', note: '숨김 제외' },
    { label: '오늘', value: n(all.filter((m) => m.createdAt.slice(0, 10) === today).length), unit: '개' },
    { label: '숨김', value: n(all.filter((m) => m.hidden).length), unit: '개' },
  ]
}

function collect(service: ServiceId, slug: string): Promise<Stat[]> {
  return COLLECT[service](slug)
}

interface StockBar {
  name: string
  left: number
  total: number
}

/**
 * 재고 막대 — **한정 수량이 있는 서비스에서만.**
 *
 * 지금까지는 다 빠진 뒤에야 알았다(숫자를 표에서 읽어야 했다). 막대는 "어느 카드가 곧 없어지나" 를
 * 훑는 데 표보다 낫다. `total` 은 **처음 수량이 아니라 나간 것 + 남은 것**이다 —
 * 주최자가 중간에 재고를 더 넣으면 처음 수량은 의미가 없어진다.
 */
async function stockBars(service: ServiceId, slug: string): Promise<StockBar[]> {
  if (service === 'photocard' && repo.photocard.ready()) {
    const rows = await repo.photocard.report(slug)
    return rows
      .filter((r) => r.remaining !== null)
      .map((r) => ({ name: r.name, left: r.remaining ?? 0, total: (r.remaining ?? 0) + r.drawn }))
  }
  if (service === 'luckydraw' && repo.luckydraw.ready()) {
    const rows = await repo.luckydraw.report(slug)
    return rows.map((r) => ({
      name: `${r.rank}등 ${r.name}`,
      left: r.remaining,
      total: r.remaining + r.consumedTotal,
    }))
  }
  return []
}
