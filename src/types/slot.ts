import type { Theme } from './theme'
import type { DeckRange } from '@/data/cards'
import type { LuckydrawDisplay } from '@/data/luckydraw'
import type { RollingDisplay } from '@/data/rolling'
import type { PhotozoneDisplay } from '@/data/photozone'
import type { WishDisplay } from '@/data/wish'
import type { PollDisplay } from '@/data/poll'
import type { StampDisplay } from '@/data/stamp'
import type { QuizDisplay } from '@/data/quiz'
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
 * 날짜 구간 — `'YYYY-MM-DD'` (**KST 기준**).
 *
 * 문자열인 이유: 이 값은 시각이 아니라 **날짜**다. Date 로 들고 다니면 타임존이 붙어
 * "6월 1일" 이 브라우저에 따라 5월 31일이 된다. 이 형식은 사전순 비교가 곧 시간순이라
 * 비교도 문자열로 그냥 된다.
 *
 * null = 그쪽 끝이 열려 있다 (시작이 null 이면 언제부터든, 끝이 null 이면 언제까지든).
 */
export interface DateRange {
  start: string | null
  end: string | null
}

/**
 * 슬롯이 열려 있는 기간 — **접근을 정한다.**
 *
 * 두 기간 중 **하나라도** 오늘을 품으면 슬롯이 열린다:
 *  - `test` — 주최자가 미리 열어보고 질문·답변을 채우는 기간
 *  - `rent` — 실제로 파는 기간. 이게 끝나면 방문자도 주최자도 못 들어온다
 *
 * **판정은 DB(RLS)가 한다** (`0005_slot_period.sql` 의 `slot_open`).
 * 여기 있는 계산은 화면이 미리 알려주기 위한 것이지 방어가 아니다 —
 * 프론트만 막으면 anon 키로 슬롯을 그대로 읽어 종료된 이벤트가 열린다.
 *
 * 비었으면(둘 다 미설정) **제한이 없다** — 기간이 생기기 전에 만든 슬롯이 죽으면 안 된다.
 */
export interface SlotPeriod {
  test?: DateRange
  rent?: DateRange
}

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
  /**
   * 이 슬롯이 열려 있는 기간 — 없으면 **제한 없음** (기간이 생기기 전 슬롯들).
   * 최고관리자만 정한다. 대여 기간이 끝나면 주최자도 못 들어온다.
   */
  period?: SlotPeriod
  theme: Theme
  event: EventConfig
  /**
   * 럭키드로우 서비스의 **겉모습** — 최고관리자만 정한다 (`src/data/luckydraw.ts`).
   * 타로 슬롯엔 없다. `event` 가 타로 전용인 것과 같은 짝이고,
   * 서비스와 무관한 색·형태는 `theme` 이 갖는다.
   */
  luckydraw?: Partial<LuckydrawDisplay>
  /**
   * 롤링페이퍼 서비스의 **겉모습** — 최고관리자만 정한다 (`src/data/rolling.ts`).
   * `luckydraw` 필드와 같은 짝이고, 서비스와 무관한 색·형태는 `theme` 이 갖는다.
   */
  rolling?: Partial<RollingDisplay>
  /**
   * 포토존 서비스의 **겉모습** — 최고관리자만 정한다 (`src/data/photozone.ts`).
   * `rolling`·`luckydraw` 와 같은 짝. **이 서비스는 데이터 테이블이 없다** — 방문자 사진은
   * 폰에서 합성해 바로 내려받고 서버로 안 간다. 그래서 슬롯에 붙는 이 설정이 전부다.
   */
  photozone?: Partial<PhotozoneDisplay>
  /**
   * 소원나무 서비스의 **겉모습** — 최고관리자만 정한다 (`src/data/wish.ts`).
   * **데이터는 롤링페이퍼와 공유한다** (`rolling_messages` 테이블 · `repo.rolling`) —
   * 겉모습만 이 필드로 갈린다. 그래서 `wish` 전용 repo 도 테이블도 없다.
   */
  wish?: Partial<WishDisplay>
  /**
   * 실시간 투표 서비스의 **겉모습** — 최고관리자만 정한다 (`src/data/poll.ts`).
   * 설문·선택지 같은 운영 데이터는 **주최자**가 만든다 (`poll_polls` 테이블) —
   * 럭드에서 상품표가 주최자 것인 것과 같은 경계다.
   */
  poll?: Partial<PollDisplay>
  /**
   * 방문 스탬프 서비스의 **겉모습** — 최고관리자만 정한다 (`src/data/stamp.ts`).
   * 현장 암호·보상 방식 같은 운영값은 **주최자**가 정한다 (`stamp_settings` 테이블).
   */
  stamp?: Partial<StampDisplay>
  /**
   * 최애 모의고사 서비스의 **겉모습 + 칭호** — 최고관리자만 정한다 (`src/data/quiz.ts`).
   * 문항·정답·커트라인은 **주최자**가 만든다 (`quiz_questions`·`quiz_settings`).
   */
  quiz?: Partial<QuizDisplay>
}
