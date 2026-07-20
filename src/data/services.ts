import type { Slot } from '@/types/slot'

/**
 * 슬롯이 파는 **서비스** — 이 플랫폼은 타로만 파는 게 아니라 생일카페 이벤트 페이지를 판다.
 * 타로는 그 첫 번째 서비스일 뿐이고, 슬롯마다 무엇을 얹을지 소유자가 고른다.
 *
 * 서비스가 늘어나면 여기에 항목을 더하고, 슬롯 셸(App.tsx SlotLayout)에서 서비스별 화면으로 가른다.
 *
 * **조작 주체가 서비스마다 다르다.** 타로는 방문자가 자기 폰으로 직접 뽑고, 럭키드로우는
 * 부스에 놓인 태블릿에서 **스태프가** 뽑는다 (관리자 로그인 상태여야 버튼이 산다).
 * 화면을 옮길 때 이걸 놓치면 방문자에게 추첨 버튼을 열어주게 된다 — docs/LUCKYDRAW-REVIEW.md.
 */
export const SERVICES = [
  { id: 'tarot', label: '타로', hint: '카드를 뽑고 해석을 본다' },
  { id: 'luckydraw', label: '럭키드로우', hint: '스태프가 경품을 추첨한다' },
] as const

export type ServiceId = (typeof SERVICES)[number]['id']

/** 슬롯의 서비스 — 없으면 타로 (서비스 개념이 생기기 전 슬롯들이 전부 타로였다) */
export function getSlotService(slot: Slot): ServiceId {
  return slot.service ?? 'tarot'
}

export function serviceLabel(id: ServiceId): string {
  return SERVICES.find((s) => s.id === id)?.label ?? id
}
