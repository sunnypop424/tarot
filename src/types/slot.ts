import type { Theme } from './theme'
import type { DeckRange } from '@/data/cards'
import type { ServiceId } from '@/data/services'
import type { PlanId } from '@/data/plans'

/** 카테고리별 뽑기 설정 — 최고관리자가 슬롯마다 정한다 (주최자는 못 바꾼다) */
export interface CategorySetting {
  /** 뽑는 수 — 그 카테고리의 spreads 에 정의된 것만. 2장 이상이면 AI 종합이 붙는다 */
  cardCount?: number
  deck?: DeckRange
  /** 펼치는 수 — null 이면 덱 전체 */
  spreadCount?: number | null
  allowReversed?: boolean
  /**
   * @deprecated 역방향 확률은 고정이다 (`REVERSED_RATE`, src/lib/deck.ts).
   * 옛 slots.json 호환으로만 남아 있다.
   */
  reversedRate?: number
}

/** `{categoryId}` → 설정. 없는 카테고리는 코드 기본값을 쓴다 */
export type EventConfig = Record<string, CategorySetting>

/**
 * 슬롯 — 배포 하나에 여러 이벤트가 얹힌다.
 *
 * `/seventeen-dino` 가 그 슬롯의 루트가 되고, `/seventeen-dino/admin` 은
 * 그 슬롯 주최자만 관리한다. 슬러그·테마·이벤트 설정은 **소유자가 정해서 배포**하고,
 * 주최자는 질문과 답변만 만진다.
 */
export interface Slot {
  /** URL 경로 — 소유자가 정한다. 예: 'seventeen-dino' */
  slug: string
  /** 이벤트명 — 관리 화면에서 슬롯을 고를 때 보인다 */
  name: string
  /**
   * 이 슬롯이 파는 서비스 — 타로는 첫 번째 서비스일 뿐이다 (`src/data/services.ts`).
   * 없으면 'tarot' (getSlotService). 아래 deck·event 는 타로 서비스의 설정이다.
   */
  service?: ServiceId
  /**
   * 이 슬롯을 얼마짜리로 팔았나 — AI 상한이 여기서 나온다 (`src/data/plans.ts`).
   * 없으면 무료 (플랜 개념이 생기기 전 슬롯들). 최고관리자만 정한다.
   */
  plan?: PlanId
  /**
   * 플랜 기본 한도를 덮어쓴다 — **추가 결제를 받고 한도를 더 줄 때**.
   * 없으면 플랜 값 그대로 (`effectiveLimits`). 최고관리자만 정한다.
   */
  limits?: {
    /** AI 리딩 횟수 상한 */
    reading?: number
    /** 질문 답변 AI 생성 실행 상한 (재생성 포함) */
    answerGen?: number
  }
  /**
   * 이 슬롯이 쓰는 카드 범위 — 도감·업로드·뽑기·질문 전부의 단일 소스.
   * 'major' 면 22장, 'full' 이면 78장. 없으면 'full' (getSlotDeck).
   * 카테고리·질문 덱은 이 범위를 넘을 수 없다 (effectiveDeck 로 캡).
   */
  deck?: DeckRange
  theme: Theme
  event: EventConfig
}
