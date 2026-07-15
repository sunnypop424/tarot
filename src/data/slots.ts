import slotsJson from './slots.json'
import type { DeckRange } from './cards'
import type { Slot } from '@/types/slot'

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
 * 슬롯 목록 — 소유자가 정해서 배포한다 (주최자는 못 바꾼다).
 * 테마 편집기에서 편집분을 localStorage 에 저장하면 그게 우선한다.
 */
/** 테마 편집기 편집분. 미리보기 iframe 이 storage 이벤트로 이 키를 지켜본다 */
export const SLOTS_DRAFT_KEY = 'tarot-pocket:slots-draft'
const KEY_DRAFT = SLOTS_DRAFT_KEY

const BUNDLED = slotsJson as Slot[]

/** 테마 편집기 편집분 → 번들 순 */
export function getSlots(): Slot[] {
  try {
    const raw = localStorage.getItem(KEY_DRAFT)
    if (raw) return JSON.parse(raw) as Slot[]
  } catch {
    /* 편집분을 못 읽으면 번들된 걸 쓴다 */
  }
  return BUNDLED
}

export function getSlot(slug: string | undefined): Slot | undefined {
  if (!slug) return undefined
  return getSlots().find((s) => s.slug === slug)
}

/** 테마 편집기 전용 — 편집분 저장 */
export function saveSlotsDraft(slots: Slot[]): void {
  try {
    localStorage.setItem(KEY_DRAFT, JSON.stringify(slots))
  } catch {
    /* noop */
  }
}

export function clearSlotsDraft(): void {
  try {
    localStorage.removeItem(KEY_DRAFT)
  } catch {
    /* noop */
  }
}
