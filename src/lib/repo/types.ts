import type { Aspect, Orientation } from '@/types/card'
import type { Question } from '@/types/question'
import type { Slot } from '@/types/slot'

/**
 * 백엔드 경계.
 *
 * 주최자가 답변을 고치면 카페에 오는 **모든 방문자**에게 보여야 하므로 원격 저장이 필요하다.
 * Supabase / Firebase 중 무엇을 쓸지는 아직 정해지지 않았다 —
 * 그래서 인터페이스를 먼저 못박고 어댑터만 갈아끼운다.
 * 화면은 이 타입만 알고, 어떤 백엔드인지는 src/lib/repo/index.ts 만 안다.
 *
 * **모든 접근은 슬롯 스코프다.** 배포 하나에 여러 이벤트(`/seventeen-dino`, `/twice-nayeon`)가
 * 얹히므로, slug 없이 질문을 읽고 쓰는 경로를 만들면 남의 이벤트를 건드릴 수 있게 된다.
 */

/**
 * 슬롯 — **최고관리자만 쓴다.** 방문자·주최자는 읽기만 (RLS 가 그렇게 잡혀 있다).
 *
 * 방문자가 `/seventeen-dino` 로 들어오면 이걸 읽어야 화면이 뜬다 (테마·이벤트 설정).
 * 그래서 `get` 은 **앱의 첫 네트워크 왕복**이다 — 여기서 실패하면 아무것도 못 보여준다.
 */
export interface SlotRepo {
  /** 최고관리자 목록용 — 방문자는 부를 일이 없다 (배포 루트에 목록을 안 낸다) */
  list(): Promise<Slot[]>
  /** 없는 슬러그면 null */
  get(slug: string): Promise<Slot | null>
  /** 새 슬롯이면 추가, 있으면 덮어쓴다 */
  save(slot: Slot): Promise<void>
  remove(slug: string): Promise<void>
}

export interface QuestionRepo {
  /** 사용자 앱용 — 그 슬롯의 공개된 질문만 */
  list(slug: string): Promise<Question[]>
  /** 관리자용 — 그 슬롯의 비공개 포함 전부 */
  listAll(slug: string): Promise<Question[]>
  /** 새 질문이면 추가, 있으면 덮어쓴다 */
  save(slug: string, question: Question): Promise<void>
  remove(slug: string, id: string): Promise<void>
}

export interface AdminUser {
  email: string
  /** 이 관리자가 관리할 수 있는 슬롯 — 다른 슬롯의 관리 화면은 막아야 한다 */
  slug: string
}

export interface AuthRepo {
  /** 슬롯 스코프 로그인 — 계정은 슬롯에 매인다 */
  signIn(slug: string, email: string, password: string): Promise<AdminUser>
  signOut(): Promise<void>
  /** 로그인 상태가 아니면 null */
  currentUser(): Promise<AdminUser | null>
}

/**
 * 최고관리자 — 슬롯을 만들고 파는 플랫폼 소유자.
 * 주최자(AdminUser)와 달리 **슬롯에 매이지 않는다**: 모든 슬롯을 만들고 지울 수 있다.
 * 그래서 세션도 따로 둔다 — 주최자 로그인이 슬롯 편집기를 열어주면 역할 분리가 깨진다.
 */
export interface OwnerUser {
  email: string
}

export interface OwnerAuthRepo {
  signIn(email: string, password: string): Promise<OwnerUser>
  signOut(): Promise<void>
  currentUser(): Promise<OwnerUser | null>
}

/** 뽑힌 카드 한 장 — **서버에 보낼 수 있는 건 이것뿐이다** (의미 텍스트는 서버가 자기 데이터에서 붙인다) */
export interface DrawnRef {
  cardId: string
  orientation: Orientation
  /** 포지션 라벨 — "나의 마음". 순서가 곧 리딩의 흐름이다 */
  position: string
}

export interface SynthesisInput {
  /** 카테고리 라벨 — "애정운" */
  category: string
  aspect: Aspect
  /** **고른 순서대로.** 이 순서가 리딩의 흐름이 된다 */
  drawn: DrawnRef[]
  /** 질문 타로면 그 질문 */
  question?: string
}

export interface GeneratedAnswer {
  cardId: string
  upright: string
  reversed?: string
}

export interface AnswerGenInput {
  question: string
  aspect: Aspect
  cardIds: string[]
  allowReversed: boolean
}

export interface ThemeGenInput {
  /** 대표 색 — 팬이 아는 그 색. 이게 주인공이고 나머지는 받쳐준다 */
  baseColor: string
  mode: 'light' | 'dark'
  /** 있으면 프롬프트에 분위기 힌트로 들어간다 */
  eventName?: string
}

/**
 * AI (M4).
 *
 * API 키를 클라이언트에 둘 수 없으므로 이 어댑터는 **반드시 서버 엔드포인트를 거친다** —
 * 개발도 배포도 같은 Supabase Edge Function (`supabase/functions/ai`).
 * 화면은 어느 쪽인지 모른다.
 *
 * 앞의 둘은 슬롯 스코프다 — 슬롯마다 플랜 한도가 다르다 (docs/PRICING.md).
 * `generateTheme` 만 슬롯이 없다: 슬롯을 **만들 때** 쓰는 최고관리자 도구라 한도가 없다.
 */
export interface AiRepo {
  /** AI 가 붙어 있나 — 안 붙어 있으면 화면은 관련 UI 를 아예 띄우지 않는다 */
  ready(): Promise<boolean>
  /** 여러 장을 하나의 흐름으로. `onText` 로 조각이 흘러온다 */
  synthesize(slug: string, input: SynthesisInput, onText?: (delta: string) => void): Promise<string>
  /** 질문 × 카드 답변 일괄 생성. `onProgress(done, total)` 로 진행률 */
  generateAnswers(
    slug: string,
    input: AnswerGenInput,
    onProgress?: (done: number, total: number) => void
  ): Promise<GeneratedAnswer[]>
  /**
   * 대표 색 하나 → 테마 색 한 벌 (최고관리자 도구).
   * **읽히는지는 이 함수가 보장하지 않는다** — 부르는 쪽이 `repairContrast` 로 강제한다
   * (src/owner/aiTheme.ts). 모델에게 대비를 맡기면 대충 맞춰 온다.
   */
  generateTheme(input: ThemeGenInput): Promise<Record<string, string>>
}

export interface Repo {
  slots: SlotRepo
  questions: QuestionRepo
  auth: AuthRepo
  ownerAuth: OwnerAuthRepo
  ai: AiRepo
}
