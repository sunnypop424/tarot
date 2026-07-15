import type { Orientation } from '@/types/card'
import { dateKey, weekKey, monthKey } from './date'

/** 뽑기를 한 번으로 제한하는 기간 단위 */
export type PeriodUnit = 'day' | 'week' | 'month'

export interface SavedCard {
  cardId: string
  orientation: Orientation
}

interface SavedDraw {
  /** 저장 시점의 기간 키 — 기간이 바뀌면 무효가 된다 */
  key: string
  cards: SavedCard[]
}

/** 기간 단위별 현재 키. 이 값이 바뀌는 순간 뽑기가 다시 열린다 */
export function periodKey(unit: PeriodUnit, d: Date = new Date()): string {
  if (unit === 'day') return dateKey(d)
  if (unit === 'week') return weekKey(d)
  return monthKey(d)
}

const storeKey = (categoryId: string) => `tarot-pocket:draw:${categoryId}`

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    // 사생활 보호 모드 등에서 localStorage 접근이 막힐 수 있다 — 조용히 넘어간다
    return null
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* 저장 실패해도 뽑기 자체는 계속 동작해야 한다 */
  }
}

/** 이번 기간에 뽑아둔 카드. 기간이 지났으면 null (다시 뽑을 수 있다) */
export function loadPeriodDraw(categoryId: string, unit: PeriodUnit): SavedCard[] | null {
  const saved = read<SavedDraw>(storeKey(categoryId))
  if (!saved || saved.key !== periodKey(unit)) return null
  return saved.cards
}

export function savePeriodDraw(categoryId: string, unit: PeriodUnit, cards: SavedCard[]): void {
  write(storeKey(categoryId), { key: periodKey(unit), cards } satisfies SavedDraw)
}
