import defaultThemeJson from './slot-default.json'
import { planById, type PlanId } from './plans'
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
