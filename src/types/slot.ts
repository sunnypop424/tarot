import type { Theme } from './theme'
import type { DeckRange } from '@/data/cards'

/** 카테고리별 뽑기 설정 — 소유자가 슬롯마다 정한다 (주최자는 못 바꾼다) */
export interface CategorySetting {
  /** 뽑는 수 — 그 카테고리의 spreads 에 정의된 것만 */
  cardCount?: number
  deck?: DeckRange
  /** 펼치는 수 — null 이면 덱 전체 */
  spreadCount?: number | null
  allowReversed?: boolean
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
   * 이 슬롯이 쓰는 카드 범위 — 도감·업로드·뽑기·질문 전부의 단일 소스.
   * 'major' 면 22장, 'full' 이면 78장. 없으면 'full' (getSlotDeck).
   * 카테고리·질문 덱은 이 범위를 넘을 수 없다 (effectiveDeck 로 캡).
   */
  deck?: DeckRange
  theme: Theme
  event: EventConfig
}
