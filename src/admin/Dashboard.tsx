import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowUpRight, ExternalLink, Info } from 'lucide-react'

import { repo } from '@/lib/repo'
import { getSlotService, SERVICES } from '@/data/services'
import type { ServiceId } from '@/data/services'
import { useSlot } from '@/slot/SlotProvider'
import { periodLabel, slotStatus } from '@/owner/period'
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
  /** 숫자 아래 한 줄 — 뭘 센 건지 */
  note?: string
  /** 눈에 띄어야 하는 값 (재고 소진 임박 등) */
  warn?: boolean
}

interface Shortcut {
  to: string
  label: string
  /** 관리 셸 밖 화면 — 새 탭 */
  external?: boolean
}

export function Dashboard() {
  const slot = useSlot()
  const service = getSlotService(slot)
  const [stats, setStats] = useState<Stat[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setStats(await collect(service, slot.slug))
    } catch (e) {
      setError(e instanceof Error ? e.message : '현황을 읽지 못했어요')
      setStats([])
    }
  }, [service, slot.slug])

  useEffect(() => {
    void load()
  }, [load])

  const period = periodLine(slot)

  return (
    <>
      <header className="admin__head">
        <div>
          <h1 className="t-title-s">오늘 현황</h1>
          <p className="t-text-xs t-muted">
            {SERVICES.find((s) => s.id === service)?.label ?? service} · /{slot.slug}
          </p>
        </div>
        <div className="dash__periodBox">
          <span className="dash__period" data-state={period.state}>
            {period.text}
          </span>
        </div>
      </header>

      {error && (
        <div className="admin-banner admin-banner--warn">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <section className="dash__grid" data-stats>
        {stats === null
          ? [0, 1, 2, 3].map((i) => <div key={i} className="dash__card" aria-busy="true" style={{ minHeight: 96 }} />)
          : stats.map((s) => (
              <div key={s.label} className="dash__card" data-warn={s.warn || undefined}>
                <div className="dash__label">{s.label}</div>
                <div className="dash__value">{s.value}</div>
                {s.note && <div className="dash__note">{s.note}</div>}
              </div>
            ))}
      </section>

      {stats?.length === 0 && !error && (
        <div className="admin-banner admin-banner--info">
          <Info size={16} aria-hidden="true" />
          <span>이 서비스는 서버에 쌓이는 기록이 없어요 — 아래 메뉴에서 설정만 확인하시면 됩니다.</span>
        </div>
      )}

      <section className="dash__section">
        <h2 className="dash__sectionTitle">바로 가기</h2>
        <div className="dash__links">
          {SHORTCUTS[service].map((s) =>
            s.external ? (
              <a
                key={s.to}
                className="dash__link"
                href={`/${slot.slug}/${s.to}`}
                target="_blank"
                rel="noreferrer"
              >
                {s.label}
                <ExternalLink size={14} strokeWidth={2} aria-hidden="true" />
              </a>
            ) : (
              <Link key={s.to} className="dash__link" to={`/${slot.slug}/admin/${s.to}`}>
                {s.label}
                <ArrowUpRight size={14} strokeWidth={2} aria-hidden="true" />
              </Link>
            )
          )}
          <a className="dash__link" href={`/${slot.slug}`} target="_blank" rel="noreferrer">
            내 페이지 보기
            <ExternalLink size={14} strokeWidth={2} aria-hidden="true" />
          </a>
        </div>
      </section>
    </>
  )
}

/**
 * 기간 한 줄 — **판정은 이미 있는 것을 쓴다** (`owner/period.ts` · `data/slots.ts`).
 * 여기서 날짜 비교를 다시 짜면 편집기와 관리 화면이 서로 다른 날 "열렸다" 고 말하게 된다.
 */
function periodLine(slot: Slot): { text: string; state: 'open' | 'soon' | 'closed' } {
  const status = slotStatus(slot)
  const end = slot.period?.rent?.end ?? slot.period?.test?.end ?? null
  if (status === 'expired') return { text: '기간이 끝났어요', state: 'closed' }
  if (status === 'upcoming') return { text: `${periodLabel(slot)}`, state: 'soon' }
  if (status === 'unlimited') return { text: '기간 제한 없음', state: 'open' }
  if (end) {
    const days = Math.ceil((new Date(`${end}T23:59:59+09:00`).getTime() - Date.now()) / 86400000)
    // 마지막 사흘은 남은 날을 말한다 — 그때부터는 날짜보다 "며칠 남았나" 가 급하다
    if (days <= 3) return { text: `종료까지 ${Math.max(0, days)}일`, state: 'soon' }
  }
  return { text: periodLabel(slot), state: 'open' }
}

const SHORTCUTS: Record<ServiceId, Shortcut[]> = {
  tarot: [{ to: 'questions', label: '질문 관리' }],
  luckydraw: [
    { to: 'overview', label: '상품·운영' },
    { to: 'shipping', label: '배송 정보' },
  ],
  rolling: [{ to: 'messages', label: '쪽지 검수' }],
  wish: [{ to: 'messages', label: '소원 검수' }],
  photozone: [{ to: 'photozone', label: '안내' }],
  poll: [
    { to: 'polls', label: '설문 관리' },
    { to: 'live', label: '전광판', external: false },
  ],
  stamp: [
    { to: 'stamp', label: '스탬프 설정' },
    { to: 'redeem', label: '수령 확인' },
    { to: 'entries', label: '응모자' },
  ],
  quiz: [
    { to: 'quiz', label: '문항 관리' },
    { to: 'stats', label: '통계' },
    { to: 'redeem', label: '수령 확인' },
  ],
  photocard: [
    { to: 'photocard', label: '카드 관리' },
    { to: 'tickets', label: '뽑기권' },
    { to: 'staff', label: '스태프 화면', external: true },
  ],
}

const n = (v: number) => v.toLocaleString('ko-KR')

/**
 * 서비스별 숫자 — **각 서비스가 이미 쓰는 조회를 그대로 읽는다.**
 * `Record<ServiceId, …>` 라 서비스가 늘면 여기가 컴파일 에러로 터진다.
 */
const COLLECT: Record<ServiceId, (slug: string) => Promise<Stat[]>> = {
  async tarot(slug) {
    const [all, open] = await Promise.all([repo.questions.listAll(slug), repo.questions.list(slug)])
    return [
      { label: '질문', value: n(all.length), note: '등록된 질문 수' },
      { label: '공개', value: n(open.length), note: '방문자에게 보이는 질문' },
    ]
  },
  async luckydraw(slug) {
    if (!repo.luckydraw.ready()) return []
    const rows = await repo.luckydraw.report(slug)
    const left = rows.reduce((a, r) => a + r.remaining, 0)
    const today = rows.reduce((a, r) => a + r.consumedToday, 0)
    const total = rows.reduce((a, r) => a + r.consumedTotal, 0)
    return [
      { label: '오늘 나간 경품', value: n(today), note: '리허설분은 빠져요' },
      { label: '전체 나간 경품', value: n(total) },
      { label: '남은 재고', value: n(left), note: `상품 ${rows.length}종`, warn: left > 0 && left <= 10 },
    ]
  },
  async rolling(slug) {
    const all = await repo.rolling.listAll(slug)
    return messageStats(all)
  },
  async wish(slug) {
    const all = await repo.rolling.listAll(slug)
    return messageStats(all)
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
      { label: '진행 중 설문', value: n(open), note: `전체 ${polls.length}개` },
      { label: '받은 표', value: n(votes) },
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
      { label: '찍힌 도장', value: n(stamped), note: `칸 ${report.length}개 합계` },
      { label: '판을 채운 사람', value: n(issued.length), note: '교환권이 나간 수' },
      { label: '아직 안 받아간 선물', value: n(unredeemed), warn: unredeemed > 0 },
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
      { label: '응시', value: n(stats.attempts) },
      { label: '평균 점수', value: stats.attempts ? `${Math.round(stats.avg)}점` : '—' },
      { label: '나간 교환권', value: n(issued.length) },
      { label: '아직 안 받아감', value: n(unredeemed), warn: unredeemed > 0 },
    ]
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
      { label: '나간 카드', value: n(drawn), note: `카드 ${rows.length}종` },
      {
        label: '남은 한정 재고',
        value: limited.length ? n(left) : '무제한',
        note: limited.length ? `한정 ${limited.length}종 · 소진 ${soldOut}종` : '재고를 정한 카드가 없어요',
        warn: limited.length > 0 && left <= 10,
      },
      { label: '아직 안 쓴 뽑기권', value: n(open), note: `발급 ${tickets.length}장` },
    ]
  },
}

function messageStats(all: { hidden?: boolean; createdAt: string }[]): Stat[] {
  const today = new Date().toISOString().slice(0, 10)
  return [
    { label: '남긴 글', value: n(all.filter((m) => !m.hidden).length), note: '숨긴 것 제외' },
    { label: '오늘', value: n(all.filter((m) => m.createdAt.slice(0, 10) === today).length) },
    { label: '숨김', value: n(all.filter((m) => m.hidden).length) },
  ]
}

function collect(service: ServiceId, slug: string): Promise<Stat[]> {
  return COLLECT[service](slug)
}
