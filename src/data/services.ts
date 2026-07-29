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
  { id: 'luckydraw', label: '럭키드로우', hint: '스태프가 경품을 뽑는다' },
  { id: 'rolling', label: '롤링페이퍼', hint: '손님이 응원 메시지를 남긴다' },
  { id: 'photozone', label: '포토존', hint: '이벤트 프레임을 씌워 인증샷을 저장한다' },
  // 데이터는 롤링페이퍼와 공유한다 (같은 테이블·같은 repo) — 겉모습만 다르다. src/data/wish.ts
  { id: 'wish', label: '소원나무', hint: '손님이 소원을 등불로 매단다' },
  { id: 'poll', label: '실시간 투표', hint: '즉석 투표하고 결과가 그 자리에서 차오른다' },
  { id: 'stamp', label: '방문 스탬프', hint: '현장 암호로 도장을 모으고 다 모으면 선물' },
  { id: 'quiz', label: '최애 모의고사', hint: '문제를 풀고 점수·칭호를 받는다' },
  { id: 'photocard', label: '포토카드 뽑기', hint: '레어도 뽑기 — 저장용·1장 증정·판매' },
  {
    id: 'cheer',
    label: '영상회 응원',
    hint: '한마디가 상영 화면에 말풍선으로 뜬다',
  },
] as const

export type ServiceId = (typeof SERVICES)[number]['id']

/** 슬롯의 서비스 — 없으면 타로 (서비스 개념이 생기기 전 슬롯들이 전부 타로였다) */
export function getSlotService(slot: Slot): ServiceId {
  return slot.service ?? 'tarot'
}

export function serviceLabel(id: ServiceId): string {
  return SERVICES.find((s) => s.id === id)?.label ?? id
}
