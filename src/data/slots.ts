import defaultThemeJson from './slot-default.json'
import { planById, type PlanId } from './plans'
import type { DeckRange } from './cards'
import type { Slot } from '@/types/slot'
import type { Theme } from '@/types/theme'

/**
 * 슬롯에 관한 **순수 계산**만 여기 둔다.
 * 어디서 읽고 쓰는지는 `repo.slots` 가 안다 (localStorage 냐 DB 냐는 화면이 알 바 아니다).
 */

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
export function createSlot(slug: string, name: string, plan: PlanId = 'free'): Slot {
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
    theme,
    event: {},
  }
}
