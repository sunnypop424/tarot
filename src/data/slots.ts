import defaultThemeJson from './slot-default.json'
import { planById, type PlanId } from './plans'
import type { ServiceId } from './services'
import type { DeckRange } from './cards'
import type { DateRange, Slot, SlotPeriod } from '@/types/slot'
import type { Theme } from '@/types/theme'

/**
 * 슬롯에 관한 **순수 계산**만 여기 둔다.
 * 어디서 읽고 쓰는지는 `repo.slots` 가 안다 (localStorage 냐 DB 냐는 화면이 알 바 아니다).
 */

/**
 * 오늘 (KST, `'YYYY-MM-DD'`).
 *
 * **서버와 같은 기준이어야 한다** — RLS 의 `slot_open()` 도 `Asia/Seoul` 로 본다
 * (`0005_slot_period.sql`). 브라우저 로컬 타임존을 쓰면 해외에서 접속했을 때
 * 화면은 "열렸다" 는데 DB 는 안 주는 상태가 된다.
 *
 * `sv-SE` 로케일인 이유는 그게 `YYYY-MM-DD` 를 주는 표준 로케일이기 때문이다
 * (`toISOString()` 은 UTC 로 바꿔버려 이 자리에선 못 쓴다).
 */
const KST_DATE = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export const todayKst = (): string => KST_DATE.format(new Date())

/** 구간이 비었나 — 양끝이 다 없으면 "안 정했다" 는 뜻이다 (0 일짜리 구간이 아니다) */
const isEmpty = (r: DateRange | undefined): boolean => !r?.start && !r?.end

/** 오늘이 이 구간 안인가. 열린 끝(null)은 그쪽으로 무한하다 */
function contains(r: DateRange | undefined, today: string): boolean {
  if (isEmpty(r)) return false
  return (!r!.start || today >= r!.start) && (!r!.end || today <= r!.end)
}

/**
 * 이 슬롯이 오늘 열려 있나 — **테스트·대여 중 하나라도 품으면 열린다.**
 *
 * 기간을 하나도 안 정했으면 제한이 없다는 뜻이라 열어 준다. 안 그러면 기간이 생기기 전에
 * 만든 슬롯이 배포하는 순간 전부 죽는다.
 *
 * **이건 방어가 아니다** — 진짜 판정은 RLS 가 한다. 여기 계산은 화면이 미리 말해주기 위한 것이다.
 */
export function isSlotOpen(slot: Slot, today: string = todayKst()): boolean {
  const period = slot.period
  if (!period || (isEmpty(period.test) && isEmpty(period.rent))) return true
  return contains(period.test, today) || contains(period.rent, today)
}

/**
 * 대여가 끝났나 — 목록에서 "지워야 할 슬롯" 을 가린다.
 *
 * `!isSlotOpen` 과 다르다: 아직 시작 전인 슬롯도 닫혀 있지만 그건 지울 게 아니라 기다릴 것이다.
 * 여기선 **끝난 것만** 본다.
 */
export function isSlotExpired(slot: Slot, today: string = todayKst()): boolean {
  const end = slot.period?.rent?.end
  return Boolean(end && today > end) && !isSlotOpen(slot, today)
}

/**
 * 종료 뒤 자료를 꺼낼 수 있는 날 수 — **`slot_grace_days` 를 그대로 옮긴 것이다**
 * (`0039_grace_days_all.sql`).
 *
 * **모든 서비스가 14일이다.** 한때는 서비스마다 달랐는데(배송 명단이 남는 다섯만 14일),
 * 롤링페이퍼·소원나무·영상회도 쪽지 CSV 가 실제로 나온다는 걸 놓친 판단이었다 — 유예가 0 이면
 * 주최자는 부스를 접는 그 순간 그걸 잃는다. 서비스마다 다른 유예는 설명할 수도 없다.
 *
 * **함수로 두는 이유:** 숫자를 화면 여기저기에 적으면 DB 를 고칠 때 화면이 따라오지 않는다.
 * 실제로 대시보드가 전부에게 "종료 후 14일" 이라고 적고 있었고, 그게 절반에겐 거짓이었다.
 * 인자도 남겨 둔다 — 서비스별로 다시 갈릴 일이 생기면 부르는 쪽을 안 고쳐도 된다.
 */
export function graceDays(_service: ServiceId): number {
  return 14
}

/**
 * 자료를 꺼낼 수 있는 기한 — **종료일 + 유예**.
 *
 *  · `null`  — 기한이라는 게 없다 (종료일 미정)
 *  · `left`  — 오늘부터 남은 날 (0 이면 오늘이 마지막)
 *  · `over`  — 이미 지났다 (그 뒤엔 슬롯째 지워진다)
 *
 * 유예가 0일인 서비스는 **종료일이 곧 마지막 날**이다.
 */
export function exportDeadline(
  slot: Slot,
  service: ServiceId,
  today: string = todayKst()
): { date: string; left: number; over: boolean } | null {
  const end = slot.period?.rent?.end ?? slot.period?.test?.end
  if (!end) return null
  const days = graceDays(service)
  const date = new Date(`${end}T00:00:00+09:00`)
  date.setDate(date.getDate() + days)
  const last = KST_DATE.format(date)
  const left = Math.round(
    (new Date(`${last}T00:00:00+09:00`).getTime() - new Date(`${today}T00:00:00+09:00`).getTime()) /
      86400000
  )
  return { date: last, left, over: left < 0 }
}

/** 빈 구간은 저장하지 않는다 — `{start:null,end:null}` 이 쌓이면 "안 정했다" 와 구별이 안 된다 */
export function cleanPeriod(period: SlotPeriod | undefined): SlotPeriod | undefined {
  if (!period) return undefined
  const out: SlotPeriod = {}
  if (!isEmpty(period.test)) out.test = period.test
  if (!isEmpty(period.rent)) out.rent = period.rent
  return isEmpty(out.test) && isEmpty(out.rent) ? undefined : out
}

/** 슬롯이 쓰는 카드 범위 — 없으면 전체(78장) */
export function getSlotDeck(slot: Slot): DeckRange {
  return slot.deck ?? 'full'
}

/**
 * 카테고리·질문이 원하는 덱을 슬롯 범위로 캡한다.
 * 슬롯이 메이저 22장이면 무조건 major, 전체 슬롯이면 원하는 값을 그대로(미지정은 그대로 undefined).
 */
export function effectiveDeck(slot: Slot, wanted: DeckRange | undefined): DeckRange | undefined {
  return getSlotDeck(slot) === 'major' ? 'major' : wanted
}

/**
 * 새 슬롯 — 기본 테마(보라 미스틱)로 시작한다. 색은 편집기에서 이벤트에 맞춰 갈아입힌다.
 * 기본값이 slots.json 이 아니라 slot-default.json 에 따로 있는 건, 슬롯을 전부 지워도
 * 새 슬롯을 만들 바탕은 남아 있어야 하기 때문이다.
 */
export function createSlot(
  slug: string,
  name: string,
  plan: PlanId = 'free',
  period?: SlotPeriod
): Slot {
  const theme = structuredClone(defaultThemeJson) as Theme
  // 로고 이미지를 올리기 전까지는 이벤트명이 로고 자리에 나온다
  theme.assets.logoAlt = name

  // 한도는 플랜 값으로 시작한다 — 편집기에서 여기서부터 올릴 수 있다
  const p = planById(plan)
  return {
    slug,
    name,
    service: 'tarot',
    plan,
    limits: { reading: p.readingLimit, answerGen: p.answerGenLimit },
    deck: 'full',
    ...(cleanPeriod(period) ? { period: cleanPeriod(period) } : {}),
    theme,
    event: {},
  }
}
