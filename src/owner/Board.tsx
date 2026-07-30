import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react'

import { repo } from '@/lib/repo'
import { exportDeadline, isSlotExpired, isSlotOpen } from '@/data/slots'
import { getSlotService, serviceLabel } from '@/data/services'
import { AI_MODEL, costKrw, krwLabel } from '@/data/aiCost'
import type { AiUsageRow } from '@/lib/repo'
import type { Slot } from '@/types/slot'
import { Card, CSS } from './editorUi'
import { checkReadiness, type ReadyIssue } from './readiness'
import { periodLabel } from './period'

/**
 * 최고관리자 운영 보드 — `/theme-editor/board`.
 *
 * **슬롯 목록이 답하지 못하는 질문만 모은다.** 목록은 "무엇이 있나" 를 보여주지만,
 * 슬롯이 스무 개가 넘어가면 정작 급한 건 그게 아니다:
 *
 *   · 이번 주에 뭐가 끝나나 (끝나기 전에 연장을 물어야 한다)
 *   · 자료를 아직 못 꺼낸 슬롯이 있나 (기한이 지나면 되돌릴 수 없다)
 *   · AI 로 얼마를 쓰고 있나 (`PRICING.md` 의 추정이 지금도 맞나)
 *   · 열어도 되는 상태인가 (출시 전 점검에 걸린 게 남았나)
 *
 * **숫자를 새로 만들지 않는다.** 기간은 `data/slots.ts`, 점검은 `readiness.ts`,
 * 사용량은 `repo.ai.usage()` — 전부 이미 있는 판정을 모아 보여줄 뿐이다.
 * 여기서 날짜 비교를 다시 짜면 편집기와 보드가 서로 다른 날 "끝났다" 고 말하게 된다.
 */

const INK = '#121212'
const INK2 = '#505050'
const INK3 = '#8a8a8a'
const PURPLE = '#816bff'
const WARN = '#d9822b'
const BAD = '#d64545'

/** 며칠 안에 끝나면 '곧 끝남' 으로 볼 것인가 — 연장을 물어볼 여유가 이만큼은 있어야 한다 */
const SOON_DAYS = 7

const n = (v: number) => Math.round(v).toLocaleString('ko-KR')

interface Row {
  slot: Slot
  /** 자료 회수 기한 — 기간을 안 정한 슬롯은 null */
  deadline: ReturnType<typeof exportDeadline>
  daysLeft: number | null
}

export function Board() {
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [usage, setUsage] = useState<AiUsageRow[] | null>(null)
  const [busy, setBusy] = useState(false)
  /** 점검은 슬롯마다 여러 번 조회한다 — 자동으로 안 돌리고 눌렀을 때만 (`checkAll`) */
  const [issues, setIssues] = useState<Map<string, ReadyIssue[]> | null>(null)
  const [checking, setChecking] = useState(false)

  const load = useCallback(async () => {
    setBusy(true)
    try {
      const [list, rows] = await Promise.all([
        repo.slots.list().catch(() => [] as Slot[]),
        repo.ai.usage().catch(() => [] as AiUsageRow[]),
      ])
      setSlots(list)
      setUsage(rows)
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const rows: Row[] = useMemo(() => {
    if (!slots) return []
    const today = Date.now()
    return slots.map((slot) => {
      const end = slot.period?.rent?.end ?? slot.period?.test?.end ?? null
      const daysLeft =
        end === null
          ? null
          : Math.ceil((new Date(`${end}T23:59:59+09:00`).getTime() - today) / 86400000)
      return { slot, deadline: exportDeadline(slot, getSlotService(slot)), daysLeft }
    })
  }, [slots])

  /**
   * 손봐야 할 것 셋. **한 슬롯은 한 칸에만** 들어간다 — 같은 슬롯이 두 목록에 뜨면
   * "몇 개 남았나" 를 셀 수가 없다. 급한 순서대로 걸러 낸다.
   */
  const buckets = useMemo(() => {
    const overdue: Row[] = [] // 기한이 지났다 — 곧 지워진다
    const collecting: Row[] = [] // 끝났고 유예 중 — 자료를 꺼내야 한다
    const soon: Row[] = [] // 곧 끝난다 — 연장을 물어볼 때다
    for (const r of rows) {
      if (r.deadline?.over) overdue.push(r)
      else if (isSlotExpired(r.slot)) collecting.push(r)
      else if (r.daysLeft !== null && r.daysLeft >= 0 && r.daysLeft <= SOON_DAYS && isSlotOpen(r.slot))
        soon.push(r)
    }
    const byLeft = (a: Row, b: Row) => (a.deadline?.left ?? 0) - (b.deadline?.left ?? 0)
    return { overdue: overdue.sort(byLeft), collecting: collecting.sort(byLeft), soon: soon.sort(byLeft) }
  }, [rows])

  /** 사용량 합계 + 추정 원가 — 슬롯을 안 지운 것만 센다(지운 슬롯은 행도 cascade 로 사라진다) */
  const totals = useMemo(() => {
    const u = usage ?? []
    const sum = (f: (r: AiUsageRow) => number) => u.reduce((a, r) => a + f(r), 0)
    const readingWon = costKrw({ input: sum((r) => r.readingIn), output: sum((r) => r.readingOut) })
    const answerWon = costKrw({ input: sum((r) => r.answerIn), output: sum((r) => r.answerOut) })
    const cacheWon = costKrw({
      input: 0,
      output: 0,
      cacheRead: sum((r) => r.cacheRead),
      cacheWrite: sum((r) => r.cacheWrite),
    })
    return {
      reading: sum((r) => r.reading),
      answerGen: sum((r) => r.answerGen),
      tokens: sum((r) => r.readingIn + r.readingOut + r.answerIn + r.answerOut),
      won: readingWon + answerWon + cacheWon,
      readingWon,
      answerWon,
    }
  }, [usage])

  /**
   * 출시 전 점검을 **전부** 돌린다 — 종료된 슬롯은 뺀다(고칠 이유가 없다).
   * 슬롯마다 여러 조회가 나가므로 자동으로 안 돈다. 누르면 그때 돈다.
   */
  async function checkAll() {
    if (!slots || checking) return
    setChecking(true)
    try {
      const live = slots.filter((s) => !isSlotExpired(s))
      const found = new Map<string, ReadyIssue[]>()
      const results = await Promise.all(
        live.map((s) =>
          checkReadiness(s)
            .then((list): [string, ReadyIssue[]] => [s.slug, list])
            .catch((): [string, ReadyIssue[]] => [s.slug, []])
        )
      )
      for (const [slug, list] of results) if (list.length > 0) found.set(slug, list)
      setIssues(found)
    } finally {
      setChecking(false)
    }
  }

  const tiles = [
    { label: '전체 슬롯', value: slots ? n(slots.length) : '—', unit: '개' },
    { label: '대여 중', value: slots ? n(slots.filter((s) => isSlotOpen(s)).length) : '—', unit: '개' },
    {
      label: `${SOON_DAYS}일 안에 종료`,
      value: n(buckets.soon.length),
      unit: '개',
      hot: buckets.soon.length > 0,
    },
    {
      label: '자료 회수 대기',
      value: n(buckets.collecting.length),
      unit: '개',
      hot: buckets.collecting.length > 0,
    },
    {
      /**
       * **행이 없으면 '0원' 이 아니라 '—' 다.** 사용량이 진짜 0 일 수도 있지만,
       * 최고관리자가 아니거나 Supabase 를 안 붙인 빌드라 못 읽는 것일 수도 있다.
       * 0 이라고 적으면 "AI 를 아무도 안 쓴다" 로 읽힌다 — 아래 카드가 그 차이를 설명한다.
       */
      label: 'AI 누적 추정 원가',
      value: usage === null || usage.length === 0 ? '—' : krwLabel(totals.won),
      unit: '',
      note: usage !== null && usage.length === 0 ? '아직 기록 없음' : undefined,
    },
  ]

  return (
    <div className="owner" style={{ minHeight: '100dvh', background: '#f7f7f7' }}>
      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '22px 20px 60px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
          <Link to="/theme-editor" style={{ ...CSS.ghostPill, textDecoration: 'none' }}>
            <ArrowLeft size={13} aria-hidden="true" /> 슬롯 목록
          </Link>
          <h1 style={{ fontSize: 21, fontWeight: 700, color: INK, margin: 0 }}>운영 보드</h1>
          <span style={{ flex: 1 }} />
          <button type="button" style={CSS.ghostPill} onClick={() => void load()} disabled={busy}>
            <RefreshCw size={13} aria-hidden="true" /> {busy ? '읽는 중…' : '새로고침'}
          </button>
        </div>

        {/* ── 요약 타일 ─────────────────────────────── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,180px),1fr))',
            gap: 12,
            marginBottom: 18,
          }}
        >
          {tiles.map((t) => (
            <div key={t.label} style={{ ...CSS.card, padding: '15px 17px' }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: INK3 }}>{t.label}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 7 }}>
                <span style={{ fontSize: 25, fontWeight: 700, color: t.hot ? WARN : INK }}>{t.value}</span>
                {t.unit && <span style={{ fontSize: 12, color: INK3 }}>{t.unit}</span>}
              </div>
              {t.note && <div style={{ fontSize: 11, color: INK3, marginTop: 4 }}>{t.note}</div>}
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          {/* ── 손봐야 할 슬롯 ───────────────────────── */}
          <Card title="손봐야 할 슬롯" note="급한 것부터">
            {slots === null ? (
              <div style={{ fontSize: 12.5, color: INK3 }}>읽는 중…</div>
            ) : (
              <div style={{ display: 'grid', gap: 18 }}>
                <Bucket
                  title="기한이 지났어요"
                  desc="자료를 더는 꺼낼 수 없어요. 곧 슬롯째 지워져요."
                  tone={BAD}
                  rows={buckets.overdue}
                />
                <Bucket
                  title="자료를 꺼내야 해요"
                  desc="행사가 끝났고 보관 기간이 도는 중이에요. 지나면 되돌릴 수 없어요."
                  tone={WARN}
                  rows={buckets.collecting}
                />
                <Bucket
                  title={`${SOON_DAYS}일 안에 끝나요`}
                  desc="연장을 물어볼 때예요."
                  tone={PURPLE}
                  rows={buckets.soon}
                />
                {buckets.overdue.length + buckets.collecting.length + buckets.soon.length === 0 && (
                  <div style={{ fontSize: 12.5, color: INK3 }}>지금 손봐야 할 슬롯이 없어요.</div>
                )}
              </div>
            )}
          </Card>

          {/* ── AI 사용량 ────────────────────────────── */}
          <Card
            title="AI 사용량"
            note={`${AI_MODEL} · 누적`}
            right={
              <span style={{ fontSize: 11.5, color: INK3 }}>
                리딩 {n(totals.reading)}회 · 답변 생성 {n(totals.answerGen)}회
              </span>
            }
          >
            {usage === null ? (
              <div style={{ fontSize: 12.5, color: INK3 }}>읽는 중…</div>
            ) : usage.length === 0 ? (
              /**
               * **0 과 모름은 다르다.** 사용량이 진짜 0 일 수도 있고, 최고관리자가 아니거나
               * Supabase 를 안 붙인 빌드라 못 읽는 것일 수도 있다. 둘을 같은 문장으로
               * 보여주면 "AI 를 아무도 안 쓴다" 고 잘못 읽는다.
               */
              <div style={{ fontSize: 12.5, color: INK3, lineHeight: 1.7 }}>
                아직 기록이 없거나, 이 빌드에선 볼 수 없어요.
                <br />
                토큰은 <b>0040 마이그레이션 이후의 호출부터</b> 쌓여요 — 그전 사용분은 횟수만 남아 있어요.
              </div>
            ) : (
              <>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 620 }}>
                    <thead>
                      <tr style={{ color: INK3, textAlign: 'right' }}>
                        <th style={{ ...th, textAlign: 'left' }}>슬롯</th>
                        <th style={th}>리딩</th>
                        <th style={th}>답변 생성</th>
                        <th style={th}>입력 토큰</th>
                        <th style={th}>출력 토큰</th>
                        <th style={th}>추정 원가</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usage.map((r) => {
                        const won = costKrw({
                          input: r.readingIn + r.answerIn,
                          output: r.readingOut + r.answerOut,
                          cacheRead: r.cacheRead,
                          cacheWrite: r.cacheWrite,
                        })
                        return (
                          <tr key={r.slug} style={{ borderTop: '1px solid #f4f4f4', textAlign: 'right' }}>
                            <td style={{ ...td, textAlign: 'left' }}>
                              <Link to={`/theme-editor/${r.slug}`} style={{ color: PURPLE, textDecoration: 'none' }}>
                                /{r.slug}
                              </Link>
                            </td>
                            <td style={td}>{n(r.reading)}</td>
                            <td style={td}>{n(r.answerGen)}</td>
                            <td style={td}>{n(r.readingIn + r.answerIn)}</td>
                            <td style={td}>{n(r.readingOut + r.answerOut)}</td>
                            <td style={{ ...td, fontWeight: 700 }}>{krwLabel(won)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{ fontSize: 11, color: INK3, marginTop: 12, lineHeight: 1.7 }}>
                  리딩 {krwLabel(totals.readingWon)} · 답변 생성 {krwLabel(totals.answerWon)} ·
                  토큰 {n(totals.tokens)}개.{' '}
                  <b>추정이에요</b> — 실제 청구는 Anthropic 콘솔이 정해요. 단가·환율은{' '}
                  <code>src/data/aiCost.ts</code> 한 곳에 있어요.
                </div>
              </>
            )}
          </Card>

          {/* ── 출시 전 점검 ─────────────────────────── */}
          <Card
            title="출시 전 점검"
            note="종료된 슬롯은 빼고"
            right={
              <button type="button" style={CSS.ghostPill} onClick={() => void checkAll()} disabled={checking || !slots}>
                {checking ? '점검 중…' : '전부 점검하기'}
              </button>
            }
          >
            {issues === null ? (
              <div style={{ fontSize: 12.5, color: INK3, lineHeight: 1.7 }}>
                슬롯마다 실제 데이터를 읽어서 판정해요 — 슬롯이 많으면 조금 걸려요.
                <br />
                눌렀을 때만 돌아요.
              </div>
            ) : issues.size === 0 ? (
              <div style={{ fontSize: 12.5, color: INK3 }}>걸린 슬롯이 없어요.</div>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {[...issues].map(([slug, list]) => (
                  <div key={slug} style={{ borderTop: '1px solid #f4f4f4', paddingTop: 11 }}>
                    <Link
                      to={`/theme-editor/${slug}`}
                      style={{ fontSize: 12.5, fontWeight: 700, color: PURPLE, textDecoration: 'none' }}
                    >
                      /{slug}
                    </Link>
                    <ul style={{ margin: '6px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 5 }}>
                      {list.map((issue, i) => (
                        <li
                          key={i}
                          style={{
                            fontSize: 12,
                            color: issue.level === 'block' ? BAD : WARN,
                            display: 'flex',
                            gap: 6,
                            alignItems: 'flex-start',
                          }}
                        >
                          <AlertTriangle size={12} style={{ marginTop: 2, flexShrink: 0 }} aria-hidden="true" />
                          <span>{issue.text}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

const th: React.CSSProperties = { padding: '0 8px 9px', fontWeight: 700, whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '9px 8px', color: INK2, whiteSpace: 'nowrap' }

/** 손봐야 할 슬롯 한 묶음 — 비면 아무것도 안 그린다 (빈 제목이 늘어서면 신호가 죽는다) */
function Bucket({
  title,
  desc,
  tone,
  rows,
}: {
  title: string
  desc: string
  tone: string
  rows: Row[]
}) {
  if (rows.length === 0) return null
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: tone }}>{title}</span>
        <span style={{ fontSize: 11, color: INK3 }}>{desc}</span>
      </div>
      <div style={{ display: 'grid', gap: 6, marginTop: 9 }}>
        {rows.map(({ slot, deadline }) => (
          <div
            key={slot.slug}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
              border: '1px solid #eeeeee',
              borderRadius: 6,
              padding: '9px 12px',
              background: '#fff',
            }}
          >
            <Link
              to={`/theme-editor/${slot.slug}`}
              style={{ fontSize: 12.5, fontWeight: 700, color: INK, textDecoration: 'none' }}
            >
              {slot.name}
            </Link>
            <span style={{ fontSize: 11.5, color: INK3 }}>/{slot.slug}</span>
            <span style={{ fontSize: 11, color: INK3 }}>{serviceLabel(getSlotService(slot))}</span>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 11.5, color: INK2 }}>{periodLabel(slot)}</span>
            {deadline && (
              <span style={{ fontSize: 11.5, fontWeight: 700, color: tone }}>
                {deadline.over
                  ? `자료 기한 ${-deadline.left}일 지남`
                  : `자료 회수 ${deadline.left}일 남음`}
              </span>
            )}
            {/* 주최자 화면으로 바로 — 자료 내보내기가 거기 있다 */}
            <a
              href={`/${slot.slug}/admin`}
              target="_blank"
              rel="noreferrer"
              style={{ ...CSS.ghostPill, textDecoration: 'none' }}
            >
              관리 화면 ↗
            </a>
          </div>
        ))}
      </div>
    </div>
  )
}
