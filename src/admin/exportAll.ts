import { repo } from '@/lib/repo'
import { RARITY_LABEL } from '@/data/photocard'
import type { ServiceId } from '@/data/services'
import type { Slot } from '@/types/slot'

/**
 * 행사 자료 한 번에 내보내기 — **종료 +14일이 지나면 잠긴다.**
 *
 * 응모자·수령·기록이 화면마다 흩어져 있어서, 행사가 끝나면 주최자가 세 화면을 돌며 각각
 * CSV 를 받아야 했다. 하나라도 빠뜨린 채 기간이 지나면 **다시 꺼낼 방법이 없다**
 * (`slot_grace_days` 가 잠그고, 그 뒤엔 슬롯째 지워진다).
 *
 * **한 파일로 합치지 않는다.** 표마다 열이 달라서 합치면 빈 칸투성이 표 하나가 되고,
 * 엑셀에서 나누는 게 더 번거롭다. 파일 여러 개를 순서대로 받는다.
 *
 * 개인정보가 들어 있는 파일이 섞여 있으므로(응모자·배송) **받는 순간을 화면이 말해준다** —
 * 조용히 떨어뜨리지 않는다.
 */

export interface Sheet {
  /** 파일 이름 조각 — `{slug}-{name}.csv` */
  name: string
  header: string[]
  rows: (string | number | null)[][]
}

/** CSV 한 칸 — 쉼표·따옴표·줄바꿈이 들어가면 깨지므로 감싸고 따옴표는 두 번 쓴다 */
const cell = (v: string | number | null) => `"${String(v ?? '').replaceAll('"', '""')}"`
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('ko-KR') : '')

/** 엑셀은 BOM 이 없으면 UTF-8 을 못 알아본다 (다른 화면들과 같은 규칙) */
function download(slug: string, sheet: Sheet) {
  const body = [sheet.header.map(cell).join(','), ...sheet.rows.map((r) => r.map(cell).join(','))].join('\r\n')
  const blob = new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${slug}-${sheet.name}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

/** 보상은 세 서비스가 같은 테이블을 쓴다 — 모으는 코드도 하나다 */
async function rewardSheets(slug: string, source: ServiceId): Promise<Sheet[]> {
  if (!repo.rewards.ready()) return []
  const [issued, entries] = await Promise.all([
    repo.rewards.issued(slug, source).catch(() => []),
    repo.rewards.entries(slug, source).catch(() => []),
  ])
  const out: Sheet[] = []
  if (issued.length)
    out.push({
      name: '교환권',
      header: ['교환코드', '내용', '종류', '점수', '수령시각', '발급시각'],
      rows: issued.map((r) => [
        r.code,
        r.label,
        r.kind === 'guaranteed' ? '확정' : '응모',
        r.score,
        when(r.redeemedAt),
        when(r.createdAt),
      ]),
    })
  if (entries.length)
    out.push({
      name: '응모자',
      header: ['닉네임', '트위터', '연락처', '주소', '점수', '당첨회차', '응모시각'],
      rows: entries.map((e) => [
        e.nickname,
        e.handle ?? '',
        e.contact ?? '',
        e.address ?? '',
        e.score,
        e.won ? e.pickedRound : '',
        when(e.createdAt),
      ]),
    })
  return out
}

/**
 * 서비스별로 **뭘 내보낼지** — `Record<ServiceId, …>` 라 서비스가 늘면 컴파일 에러가 난다.
 * (새 서비스의 기록이 조용히 빠진 채 슬롯이 삭제되는 게 최악이다.)
 */
const SHEETS: Record<ServiceId, (slot: Slot) => Promise<Sheet[]>> = {
  async tarot(slot) {
    const qs = await repo.questions.listAll(slot.slug).catch(() => [])
    return qs.length
      ? [
          {
            name: '질문',
            header: ['질문', '공개', '펼치는 카드 수'],
            rows: qs.map((q) => [q.question, q.published ? 'O' : '', q.spreadCount ?? '슬롯 전체']),
          },
        ]
      : []
  },
  async luckydraw(slot) {
    if (!repo.luckydraw.ready()) return []
    const [report, shipping] = await Promise.all([
      repo.luckydraw.report(slot.slug).catch(() => []),
      repo.luckydraw.listShipping(slot.slug).catch(() => []),
    ])
    const out: Sheet[] = []
    if (report.length)
      out.push({
        name: '경품',
        header: ['등수', '상품', '남은수량', '오늘나감', '전체나감', '배송필요'],
        rows: report.map((p) => [p.rank, p.name, p.remaining, p.consumedToday, p.consumedTotal, p.requiresShipping ? 'O' : '']),
      })
    if (shipping.length)
      out.push({
        name: '배송',
        header: ['이름', '연락처', '주소', '상품', '제출시각'],
        rows: shipping.map((e) => [
          e.name,
          e.phone,
          e.address,
          e.prizes.map((p) => `${p.rank}등 ${p.name} ${p.count}개`).join(' / '),
          when(e.createdAt),
        ]),
      })
    return out
  },
  rolling: messageSheets,
  wish: messageSheets,
  // 영상회 한마디도 같은 테이블이다 (0029) — 내보내는 표도 같다
  cheer: messageSheets,
  // 서버에 남는 게 없다 — 사진은 방문자 폰에서 합성되고 올라오지 않는다
  async photozone() {
    return []
  },
  async poll(slot) {
    if (!repo.poll.ready()) return []
    const polls = await repo.poll.listAll(slot.slug).catch(() => [])
    return polls.length
      ? [
          {
            name: '투표결과',
            header: ['설문', '선택지', '표', '마감', '숨김'],
            rows: polls.flatMap((p) =>
              p.options.map((o) => [p.title, o.label, o.votes, p.closed ? 'O' : '', p.hidden ? 'O' : ''])
            ),
          },
        ]
      : []
  },
  async stamp(slot) {
    const out: Sheet[] = []
    if (repo.stamp.ready()) {
      const report = await repo.stamp.report(slot.slug).catch(() => [])
      if (report.length)
        out.push({
          name: '도장',
          header: ['칸', '찍힌수'],
          rows: report.map((r) => [r.stampId, r.count]),
        })
    }
    return [...out, ...(await rewardSheets(slot.slug, 'stamp'))]
  },
  async quiz(slot) {
    const out: Sheet[] = []
    if (repo.quiz.ready()) {
      const stats = await repo.quiz.stats(slot.slug).catch(() => null)
      if (stats)
        out.push({
          name: '문항통계',
          header: ['문항', '푼 사람', '맞힌 사람', '정답률'],
          rows: stats.questions.map((q) => [
            q.body,
            q.tried,
            q.correct,
            q.tried ? `${Math.round((q.correct / q.tried) * 100)}%` : '—',
          ]),
        })
    }
    return [...out, ...(await rewardSheets(slot.slug, 'quiz'))]
  },
  async photocard(slot) {
    if (!repo.photocard.ready()) return []
    const [report, tickets] = await Promise.all([
      repo.photocard.report(slot.slug).catch(() => []),
      repo.photocard.listTickets(slot.slug).catch(() => []),
    ])
    const out: Sheet[] = []
    if (report.length)
      out.push({
        name: '카드',
        header: ['카드', '레어도', '럭키', '나간수', '남은재고'],
        rows: report.map((r) => [
          r.name,
          RARITY_LABEL[r.rarity] ?? r.rarity,
          r.lucky ? 'O' : '',
          r.drawn,
          r.remaining === null ? '무제한' : r.remaining,
        ]),
      })
    if (tickets.length)
      out.push({
        name: '뽑기권',
        header: ['번호', '상태', '뽑힌카드', '발급시각', '뽑은시각'],
        rows: tickets.map((t) => [
          t.code,
          t.status === 'drawn' ? '뽑음' : '대기',
          t.cardName ?? '',
          when(t.issuedAt),
          when(t.drawnAt),
        ]),
      })
    return out
  },
}

async function messageSheets(slot: Slot): Promise<Sheet[]> {
  const all = await repo.rolling.listAll(slot.slug).catch(() => [])
  return all.length
    ? [
        {
          name: '메시지',
          header: ['닉네임', '내용', '숨김', '작성시각'],
          rows: all.map((m) => [m.nickname, m.body, m.hidden ? 'O' : '', when(m.createdAt)]),
        },
      ]
    : []
}

/** 이 슬롯에서 내보낼 수 있는 표들을 모은다 (받기 전에 목록을 보여주려고 분리) */
export function collectSheets(slot: Slot, service: ServiceId): Promise<Sheet[]> {
  return SHEETS[service](slot)
}

/** 모아둔 표를 순서대로 내려받는다 — 브라우저가 연속 다운로드를 막지 않게 조금 띄운다 */
export async function downloadSheets(slug: string, sheets: Sheet[]): Promise<void> {
  for (const [i, sheet] of sheets.entries()) {
    download(slug, sheet)
    if (i < sheets.length - 1) await new Promise((r) => setTimeout(r, 350))
  }
}
