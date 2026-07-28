import { repo } from '@/lib/repo'
import { getSlotService, type ServiceId } from '@/data/services'
import { photozoneDisplay } from '@/data/photozone'
import { stampDisplay } from '@/data/stamp'
import { quizDisplay } from '@/data/quiz'
import { rangeInvalid } from './period'
import type { Slot } from '@/types/slot'

/**
 * 출시 전 점검 — **비어 있으면 손님이 빈 화면을 본다.**
 *
 * 편집기는 색·문구를 고르는 도구라, 정작 "카드가 한 장도 없다"·"현장 암호를 안 정했다" 는
 * 저장할 때까지 아무도 안 말해준다. 그 상태로 QR 을 인쇄해 붙이면 손님이 빈 화면을 만난다.
 *
 * **막지 않고 말한다.** 준비 중인 슬롯을 저장하는 건 정상이다(내일 카드를 올릴 수도 있다) —
 * 그래서 저장을 막는 대신 무엇이 비었는지 보여주고, 치명적인 게 남아 있으면 저장 직전에
 * 한 번 되묻는다.
 *
 * 판정은 **실제 데이터를 읽어서** 한다. 설정 jsonb 만 보면 "카드 5종" 처럼 다른 테이블에
 * 사는 것들을 영영 못 본다.
 */

export interface ReadyIssue {
  /** blocker: 이대로 열면 손님이 못 쓴다 · warn: 열리긴 하지만 확인이 필요하다 */
  level: 'block' | 'warn'
  text: string
}

/** 공통 — 서비스와 무관하게 슬롯이면 다 본다 */
async function common(slot: Slot): Promise<ReadyIssue[]> {
  const out: ReadyIssue[] = []
  if (!slot.name.trim()) out.push({ level: 'block', text: '이벤트명이 비었어요' })
  if (rangeInvalid(slot)) out.push({ level: 'block', text: '기간이 거꾸로예요 (종료일이 시작일보다 앞서요)' })
  if (!slot.period?.rent?.start && !slot.period?.rent?.end)
    out.push({ level: 'warn', text: '대여 기간이 없어요 — 언제까지 열어둘지 정하지 않으면 계속 열려 있어요' })

  // 주최자 계정이 없으면 고객이 자기 화면에 못 들어간다
  try {
    const list = await repo.organizers.list(slot.slug)
    if (list.length === 0) out.push({ level: 'block', text: '주최자 계정이 없어요 — 고객이 관리 화면에 못 들어가요' })
  } catch {
    /* 계정 조회는 백엔드가 있을 때만 — 없으면 점검하지 않는다 */
  }
  return out
}

const n = (v: number) => v.toLocaleString('ko-KR')

/**
 * 서비스별 점검 — **`Record<ServiceId, …>` 라 서비스가 늘면 여기가 컴파일 에러로 터진다.**
 * "새 서비스에 점검을 안 붙였다" 를 조용히 지나가지 않게.
 */
const BY_SERVICE: Record<ServiceId, (slot: Slot) => Promise<ReadyIssue[]>> = {
  async tarot(slot) {
    const open = await repo.questions.list(slot.slug)
    return open.length === 0
      ? [{ level: 'block', text: '공개된 질문이 없어요 — 손님이 고를 게 없어요' }]
      : []
  },
  async luckydraw(slot) {
    if (!repo.luckydraw.ready()) return []
    const prizes = await repo.luckydraw.listPrizes(slot.slug)
    const stock = prizes.reduce((a, p) => a + p.remaining, 0)
    const out: ReadyIssue[] = []
    if (prizes.length === 0) out.push({ level: 'block', text: '경품이 하나도 없어요' })
    else if (stock === 0) out.push({ level: 'block', text: '경품 재고가 전부 0이에요' })
    return out
  },
  // 벽은 손님이 채운다 — 비어 있는 게 정상이다
  async rolling() {
    return []
  },
  async wish() {
    return []
  },
  async photozone(slot) {
    const d = photozoneDisplay(slot)
    return d.frames.length === 0
      ? [{ level: 'block', text: '프레임 PNG 가 없어요 — 찍어도 씌울 게 없어요' }]
      : []
  },
  async poll(slot) {
    if (!repo.poll.ready()) return []
    const polls = await repo.poll.listAll(slot.slug)
    const open = polls.filter((p) => !p.hidden)
    const out: ReadyIssue[] = []
    if (polls.length === 0) out.push({ level: 'block', text: '설문이 하나도 없어요' })
    else if (open.length === 0) out.push({ level: 'warn', text: '설문이 전부 숨김이에요 — 손님에겐 안 보여요' })
    return out
  },
  async stamp(slot) {
    const d = stampDisplay(slot)
    const out: ReadyIssue[] = []
    if (d.stamps.length === 0) out.push({ level: 'block', text: '스탬프 칸이 없어요' })
    if (!repo.stamp.ready()) return out
    const [codes, settings] = await Promise.all([
      repo.stamp.codes(slot.slug).catch(() => []),
      repo.stamp.settings(slot.slug).catch(() => null),
    ])
    const missing = d.stamps.filter((c) => !codes.find((x) => x.stampId === c.id && x.code))
    if (d.stamps.length > 0 && missing.length > 0)
      out.push({
        level: 'block',
        text: `현장 암호가 없는 칸이 ${n(missing.length)}개예요 — 주최자 화면에서 정해야 도장이 찍혀요`,
      })
    if (settings?.rewardMode === 'raffle' && !settings.entryFields.handle && !settings.entryFields.contact)
      out.push({
        level: 'warn',
        text: '응모를 받는데 연락 수단(트위터·연락처)을 하나도 안 받아요 — 당첨자에게 연락할 길이 없어요',
      })
    return out
  },
  async quiz(slot) {
    const out: ReadyIssue[] = []
    if (!repo.quiz.ready()) return out
    const [questions, settings] = await Promise.all([
      repo.quiz.listAll(slot.slug).catch(() => []),
      repo.quiz.settings(slot.slug).catch(() => null),
    ])
    const open = questions.filter((q) => !q.hidden)
    if (questions.length === 0) out.push({ level: 'block', text: '문항이 하나도 없어요' })
    else if (open.length === 0) out.push({ level: 'warn', text: '문항이 전부 숨김이에요' })
    const noAnswer = questions.filter((q) => q.answers.length === 0 || q.answers.every((a) => !a.trim()))
    if (noAnswer.length > 0)
      out.push({ level: 'block', text: `정답이 안 정해진 문항이 ${n(noAnswer.length)}개예요` })
    if (quizDisplay(slot).titles.length === 0)
      out.push({ level: 'warn', text: '칭호가 없어요 — 결과 화면에 점수만 나와요' })
    if (settings?.rewardMode === 'raffle' && !settings.entryFields.handle && !settings.entryFields.contact)
      out.push({
        level: 'warn',
        text: '응모를 받는데 연락 수단(트위터·연락처)을 하나도 안 받아요 — 당첨자에게 연락할 길이 없어요',
      })
    return out
  },
  async photocard(slot) {
    if (!repo.photocard.ready()) return []
    const [cards, settings] = await Promise.all([
      repo.photocard.listCards(slot.slug).catch(() => []),
      repo.photocard.settings(slot.slug).catch(() => null),
    ])
    const out: ReadyIssue[] = []
    if (cards.length === 0) out.push({ level: 'block', text: '카드가 한 장도 없어요' })
    else {
      const limited = cards.filter((c) => c.remaining !== null)
      if (limited.length > 0 && limited.every((c) => (c.remaining ?? 0) === 0) && limited.length === cards.length)
        out.push({ level: 'block', text: '카드 재고가 전부 0이에요' })
    }
    if (settings?.rehearsal)
      out.push({ level: 'warn', text: '연습 모드가 켜져 있어요 — 뽑아도 재고가 줄지 않아요' })
    if (settings?.closed) out.push({ level: 'warn', text: '마감으로 되어 있어요' })
    return out
  },
}

/** 슬롯 하나를 점검한다 — 실패한 조회는 조용히 건너뛴다(점검이 저장을 막으면 안 된다) */
export async function checkReadiness(slot: Slot): Promise<ReadyIssue[]> {
  const [base, own] = await Promise.all([
    common(slot).catch(() => [] as ReadyIssue[]),
    BY_SERVICE[getSlotService(slot)](slot).catch(() => [] as ReadyIssue[]),
  ])
  return [...base, ...own]
}
