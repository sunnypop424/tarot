import plansJson from './plans.json'
import type { Slot } from '@/types/slot'

/**
 * 슬롯 플랜 — **최고관리자가 슬롯마다 정한다.** 주최자는 못 바꾼다.
 *
 * 플랜이 정하는 건 결국 **AI 를 얼마나 쓰게 해줄 것인가**다. AI 는 호출마다 원가가 있고
 * (`docs/PRICING.md` 에 실측), 상한이 없으면 슬롯 하나가 예산을 통째로 태울 수 있다.
 *
 * **한도를 넘어도 앱은 안 멈춘다.** AI 종합만 빠지고 카드별 개별 해석으로 돌아간다 —
 * 방문자는 "고장난 서비스"가 아니라 "종합이 없는 화면"을 볼 뿐이다.
 *
 * 값이 JSON 인 이유: **서버도 같은 파일을 읽어야 한다.** 한도를 화면에서만 지키면
 * curl 한 방에 뚫린다. 그래서 슬롯을 만들 때 이 값이 슬롯 행의 `limits` 로 굳고, 서버(Edge Function)는 그 행을 읽어 강제한다.
 *
 * 금액은 여기 없다 — 화면에 매매 관련 표현을 쓰지 않는다. 원가·정산 근거는 `docs/PRICING.md`.
 */

export type PlanId = 'free' | 'light' | 'standard' | 'premium'

export interface Plan {
  id: PlanId
  label: string
  /**
   * 3장 스프레드를 켤 수 있나. **3장이 곧 AI 종합**이라 이게 AI 리딩 포함 여부다.
   * 무료·라이트는 전부 1장 — 3장은 스탠다드부터.
   */
  allowSpread: boolean
  /** AI 리딩 상한 (횟수). 넘으면 일반 리딩으로 나간다. 0 이면 AI 리딩 없음 */
  readingLimit: number
  /**
   * 질문 답변 "AI로 전체 생성" 실행 상한 (재생성 포함).
   * 0 이면 버튼이 아예 없다 — 주최자가 **직접 입력**만 한다.
   */
  answerGenLimit: number
}

/**
 * 한도는 실측 원가에서 역산했다 (`docs/PRICING.md` — 플랜별 원가율 10% 이내).
 *
 * | 플랜 | 3장 | 리딩 | 답변 생성 |
 * |---|---|---|---|
 * | 무료 | ✗ | 0 | 0 (직접 입력) |
 * | 라이트 | ✗ | 0 | 15회 |
 * | 스탠다드 | ✓ | 1,500 | 50회 |
 * | 프리미엄 | ✓ | 6,000 | 150회 |
 *
 * 한도의 목적은 이윤 보호가 아니라 **사고 방지**다 (새로고침 연타 · 무한 재생성).
 * 슬롯마다 `limits` 로 더 올려줄 수 있다 (`effectiveLimits`).
 */
export const PLANS = plansJson as Plan[]

/** 슬롯의 플랜 — 없으면 무료 (플랜 개념이 생기기 전 슬롯은 열어둔 것들이다) */
export function getPlan(slot: Slot): Plan {
  return PLANS.find((p) => p.id === slot.plan) ?? PLANS[0]
}

export function planById(id: PlanId): Plan {
  return PLANS.find((p) => p.id === id) ?? PLANS[0]
}

/**
 * 실제로 적용되는 한도 — **슬롯이 플랜을 덮어쓸 수 있다.**
 * 플랜을 통째로 올리지 않고 한도만 더 주는 경우가 흔하다.
 * 서버는 이 계산을 다시 하지 않는다 — 슬롯을 만들 때 굳혀둔 `limits` 를 그대로 읽는다
 * (`supabase/migrations/0003_ai.sql` 의 claim_ai_usage). 플랜표 사본을 서버에 두면 그게 곧 드리프트다.
 */
export function effectiveLimits(slot: Slot): { reading: number; answerGen: number } {
  const plan = getPlan(slot)
  return {
    reading: slot.limits?.reading ?? plan.readingLimit,
    answerGen: slot.limits?.answerGen ?? plan.answerGenLimit,
  }
}
