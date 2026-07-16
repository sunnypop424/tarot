import { isSlotExpired, isSlotOpen, todayKst } from '@/data/slots'
import type { DateRange, Slot } from '@/types/slot'

/**
 * 기간을 사람 말로 — 최고관리자가 목록에서 훑는 값이다.
 * 판정(`isSlotOpen`)은 `data/slots.ts` 에 있고, 여긴 그걸 어떻게 보여줄지만 안다.
 */

/** '2026-07-16' → '7.16' — 목록에선 연도가 소음이다 (대부분 올해다) */
const short = (d: string): string => {
  const [, m, day] = d.split('-')
  return `${Number(m)}.${Number(day)}`
}

export function rangeLabel(r: DateRange | undefined): string | null {
  if (!r?.start && !r?.end) return null
  if (r.start && r.end) return `${short(r.start)}~${short(r.end)}`
  // 한쪽만 있으면 그쪽으로 열려 있다는 뜻이라 화살표로 방향을 보인다
  return r.start ? `${short(r.start)}~` : `~${short(r.end!)}`
}

export type SlotStatus = 'open' | 'expired' | 'upcoming' | 'unlimited'

export function slotStatus(slot: Slot, today: string = todayKst()): SlotStatus {
  if (!slot.period?.test && !slot.period?.rent) return 'unlimited'
  if (isSlotExpired(slot, today)) return 'expired'
  if (isSlotOpen(slot, today)) return 'open'
  return 'upcoming'
}

const STATUS_LABEL: Record<SlotStatus, string> = {
  open: '열림',
  expired: '종료됨',
  upcoming: '시작 전',
  unlimited: '기간 없음',
}

/** 목록 한 줄에 들어갈 말 — '열림 · 7.16~7.20' */
export function periodLabel(slot: Slot, today: string = todayKst()): string {
  const status = slotStatus(slot, today)
  const rent = rangeLabel(slot.period?.rent)
  const test = rangeLabel(slot.period?.test)
  const span = rent ?? (test ? `테스트 ${test}` : null)
  return span ? `${STATUS_LABEL[status]} · ${span}` : STATUS_LABEL[status]
}

/**
 * 거꾸로 된 구간이 있나 — 종료일이 시작일보다 앞선다.
 *
 * `<input type="date">` 의 `min` 이 이미 막지만 그건 **피커에서만** 막는다:
 * 키보드로 직접 치거나, 종료일을 먼저 고르고 시작일을 뒤로 밀면 그대로 통과한다.
 * 그렇게 저장되면 `slot_open` 이 영영 false 라 아무도 못 들어오는 슬롯이 된다.
 */
export function rangeInvalid(slot: Slot): boolean {
  return [slot.period?.test, slot.period?.rent].some(
    (r) => r?.start && r?.end && r.end < r.start
  )
}
