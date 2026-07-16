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
  /**
   * 새 슬롯이면 추가, 있으면 덮어쓴다.
   *
   * `prevSlug` 를 주면 **그 슬롯의 슬러그를 옮긴다** — 새로 만들고 옛것을 지우는 게 아니다.
   * 지우면 questions·slot_admins 가 `on delete cascade` 로 **같이 사라진다**:
   * 주최자가 78장씩 검수해 채운 답변이 슬러그 오타 고치다 날아간다.
   * 옮기기는 FK 의 `on update cascade` 가 따라온다 (`0004_slug_rename.sql`).
   */
  save(slot: Slot, prevSlug?: string): Promise<void>
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
  /**
   * **자기** 비밀번호를 바꾼다 — 최고관리자에게 임시 비번을 받아 들어온 뒤 쓰는 자리다.
   *
   * 계정 생성(`OrganizersRepo`)과 달리 서버 함수를 안 거친다: 남의 계정을 만질 때만
   * service_role 이 필요하고, 자기 세션으로 자기 비번을 바꾸는 건 anon 키로 된다.
   * 그래서 이건 주최자 화면에 있고 저건 최고관리자 화면에 있다.
   */
  changePassword(password: string): Promise<void>
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

/** 주최자 계정 한 개. 이메일은 `auth.users` 에 있어 **서버만 읽을 수 있다** */
export interface Organizer {
  userId: string
  email: string
  createdAt: string
}

/**
 * 주최자 계정 — **최고관리자 도구** (슬롯 편집기에서만 쓴다).
 *
 * 이 인터페이스가 따로 있는 이유는 `AuthRepo` 와 하는 일이 반대이기 때문이다:
 * `AuthRepo` 는 주최자가 **자기 계정으로 들어오는** 문이고, 여기는 최고관리자가
 * **그 계정을 만들어 주는** 자리다. 섞으면 주최자 화면이 계정 생성 코드를 들고 다니게 된다.
 *
 * **어댑터가 local 이면 할 수 있는 게 없다.** 계정은 Supabase 가 갖고 있고,
 * 만들려면 service_role 키가 필요해 브라우저가 직접 못 부른다 → Edge Function 을 거친다
 * (`supabase/functions/admin`). 그래서 `ready()` 가 false 면 화면은 패널을 통째로 접는다 —
 * localStorage 에 계정을 흉내 내면 "만들었다" 고 말해놓고 아무도 로그인하지 못한다.
 */
export interface OrganizersRepo {
  /**
   * 계정을 만들 수 있는 어댑터인가 — false 면 화면이 패널을 아예 안 띄운다.
   * `AiRepo.ready()` 와 달리 동기다: 저쪽은 서버에 키가 있는지 물어야 알지만,
   * 여기는 "Supabase 를 붙였나" 뿐이라 왕복할 게 없다.
   */
  ready(): boolean
  list(slug: string): Promise<Organizer[]>
  /**
   * 계정 생성 + 슬롯 지정을 **한 번에**. 둘로 나누면 사이에서 실패했을 때
   * 로그인은 되는데 아무 슬롯도 못 보는 유령 계정이 남는다 (그 이메일은 이미 쓰여서 재사용도 안 된다).
   */
  create(slug: string, email: string, password: string): Promise<Organizer>
  /**
   * **임시 비밀번호를 발급받는다** — 최고관리자가 정하는 게 아니라 서버가 만들어 돌려준다.
   * 돌아온 값은 **이때 한 번만** 볼 수 있다 (해시로만 저장되므로 다시 못 꺼낸다).
   * 주최자는 그걸로 들어와 `AuthRepo.changePassword` 로 자기 것으로 바꾼다.
   */
  resetPassword(userId: string): Promise<string>
  /** 매핑만이 아니라 **계정째** 지운다 */
  remove(userId: string): Promise<void>
  /**
   * 슬롯과 관련된 **모든 것**을 지운다 — 주최자 계정·이미지·질문·사용량까지.
   *
   * `repo.slots.remove` 로는 부족하다: cascade 가 매핑은 지워도 주최자의 로그인 계정은
   * 남긴다 (`auth.users`, service_role 이라야 지운다). 그래서 슬롯 삭제는 이 경로를 탄다.
   * 돌려주는 수는 실제로 지운 계정 수.
   */
  purgeSlot(slug: string): Promise<{ deletedAccounts: number }>
}

export interface Repo {
  slots: SlotRepo
  questions: QuestionRepo
  auth: AuthRepo
  ownerAuth: OwnerAuthRepo
  organizers: OrganizersRepo
  ai: AiRepo
}
