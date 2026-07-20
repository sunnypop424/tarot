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
  /**
   * 이 관리자가 맡은 슬롯들 — 여기 없는 슬롯의 관리 화면은 막아야 한다.
   *
   * **한 계정이 여러 슬롯을 가질 수 있다** (`0006_multi_slot_admins.sql`). 같은 행사 주최자가
   * 타로 슬롯과 럭키드로우 슬롯을 동시에 갖는 경우가 생겼기 때문이다 — 계정을 두 개 주면
   * 행사 당일 두 번 로그인해야 한다.
   *
   * 배열이어도 **"지금 어느 슬롯인가"는 여기서 정하지 않는다** — 늘 URL 이 정한다(SlotProvider).
   * 이 배열은 "그 주소에 들어갈 자격이 있나"만 답한다.
   */
  slugs: string[]
  /**
   * 최고관리자로 들어왔나 — **모든 슬롯의 관리 화면에 들어갈 수 있다.**
   *
   * RLS 는 이미 그렇게 돼 있다(`owner manages all ...` 정책들): 최고관리자는 대신 만들어
   * 주거나 사고를 수습해야 하기 때문이다. 그런데 화면 게이트는 `slot_admins` 만 보고 있어서,
   * **DB 는 허락하는데 화면이 막는** 상태였다. 고객 문의를 받고 대신 확인해 줄 수가 없었다.
   *
   * `slugs` 에 전체 목록을 넣지 않는 이유: 그러면 슬롯 전환 목록에 남의 이벤트가 다 뜬다.
   */
  owner?: boolean
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
   *
   * **이미 주최자인 이메일이면 그 계정을 이 슬롯에도 연결한다** (`linked: true`) —
   * 타로 슬롯을 쓰던 주최자에게 럭키드로우 슬롯을 열어주는 자리다. 이때 **비밀번호는
   * 바뀌지 않는다**: 계정이 하나이므로 덮어쓰면 그 사람의 다른 슬롯 로그인이 깨진다.
   */
  create(slug: string, email: string, password: string): Promise<Organizer & { linked?: boolean }>
  /**
   * **임시 비밀번호를 발급받는다** — 최고관리자가 정하는 게 아니라 서버가 만들어 돌려준다.
   * 돌아온 값은 **이때 한 번만** 볼 수 있다 (해시로만 저장되므로 다시 못 꺼낸다).
   * 주최자는 그걸로 들어와 `AuthRepo.changePassword` 로 자기 것으로 바꾼다.
   */
  resetPassword(userId: string): Promise<string>
  /**
   * 이 슬롯에서 뺀다 — **마지막 슬롯이면 계정째** 지운다.
   *
   * slug 를 받는 이유: 한 계정이 슬롯 여럿을 맡을 수 있으므로(`0006_multi_slot_admins.sql`)
   * "계정을 지운다" 만으로는 어느 슬롯에서 빼는지 알 수 없다. 다른 슬롯이 남아 있으면
   * 매핑만 빼고 계정은 살린다 — 그 사람은 남은 슬롯에서 계속 일해야 한다.
   */
  remove(slug: string, userId: string): Promise<void>
  /**
   * 슬롯과 관련된 **모든 것**을 지운다 — 주최자 계정·이미지·질문·사용량까지.
   *
   * `repo.slots.remove` 로는 부족하다: cascade 가 매핑은 지워도 주최자의 로그인 계정은
   * 남긴다 (`auth.users`, service_role 이라야 지운다). 그래서 슬롯 삭제는 이 경로를 탄다.
   * 돌려주는 수는 실제로 지운 계정 수.
   */
  purgeSlot(slug: string): Promise<{ deletedAccounts: number; deletedFiles?: number }>
}

/** 상품 한 줄 — 등수는 표의 행 순서다 (1등이 위) */
export interface Prize {
  id: string
  rank: number
  name: string
  /**
   * **지금 뽑을 수 있는 수량 — 이게 단일 진실이다.**
   *
   * 원본(Firebase)엔 '전체 수량'과 '남은 수량'이 따로 있었지만, 전체를 고치면 남은 수량이
   * 그 값으로 덮이는 구조라 매일 재입력하는 순간 '전체'가 거짓이 됐다. 칸은 하나고,
   * **관리자가 적은 값이 곧 뽑을 수 있는 수량**이다 (운영이 이 약속 위에 서 있다).
   */
  remaining: number
  requiresShipping: boolean
  /**
   * 한 묶음에 이 상품이 나올 수 있는 최대 비율 — 상한은 `ceil(뽑기수 × ratio)`.
   * null 이면 이 상품은 제한 없음. **슬롯 설정이 꺼져 있으면 값이 있어도 무시된다.**
   */
  batchCapRatio?: number | null
}

/** 마감 리포트 행 — 상품 + 소진 집계 (소진은 draw_logs 에서 센다) */
export interface PrizeReport extends Prize {
  /** 오늘(KST) 실제로 나간 수 — 리허설분은 빠진다 */
  consumedToday: number
  consumedTotal: number
}

/** 주최자가 행사 중에 바꾸는 값들 — 테마(최고관리자 소관)와 섞지 않는다 */
export interface LuckydrawSettings {
  displayMode: 'rank' | 'prize' | 'both'
  /** 설정 잠금 — 스태프 오입력 방지. 추첨은 계속 된다 */
  locked: boolean
  /** 행사 마감 — 추첨이 막힌다 */
  closed: boolean
  /** 리허설 — 뽑아도 재고가 안 깎인다. **기본이 켜짐**이다 (실수로 재고를 태우는 게 더 비싸다) */
  rehearsal: boolean
  /** 다중 뽑기 출현 제한 마스터 스위치 — 기본 꺼짐. 원하는 주최자만 켠다 */
  batchCapEnabled: boolean
}

export interface DrawnPrize {
  prizeId: string
  rank: number
  name: string
  requiresShipping: boolean
}

export interface DrawResult {
  batchId: string
  /** 리허설이었나 — 화면이 "재고가 안 깎였다"고 말해야 한다 */
  rehearsal: boolean
  /** 뽑은 순서 그대로 */
  results: DrawnPrize[]
  /** 추첨 직후의 재고 — 왕복을 한 번 아끼려고 같이 온다 */
  prizes: Prize[]
}

export interface ShippingEntry {
  id: string
  name: string
  phone: string
  address: string
  /** 당첨 시점 스냅샷 */
  prizes: { rank: number; name: string; count: number }[]
  createdAt: string
}

/**
 * 럭키드로우 (두 번째 서비스).
 *
 * **추첨은 클라이언트가 하지 않는다.** 원본(Firebase)은 재고를 읽고 뽑고 깎는 걸 전부
 * 브라우저에서 했다 — 관리자 토큰만 있으면 재고를 마음대로 쓸 수 있는 구조다.
 * 여기서 `draw` 는 서버 함수 한 발이고(`draw_prizes`), 화면은 그 사실조차 몰라도 된다.
 *
 * `ready()` 가 false 면 이 서비스는 **아예 못 돈다** — 타로와 달리 localStorage 로 흉내 낼 수
 * 없기 때문이다. 럭키드로우의 값어치는 "여러 기기가 같은 재고를 원자적으로 나눠 갖는 것" 인데
 * 그건 브라우저 저장소로는 성립하지 않는다 (태블릿 두 대가 재고를 공유하지 못한다).
 * 흉내 내면 로컬에선 되는데 현장에서 이중 당첨이 나는, 제일 나쁜 종류의 거짓말이 된다.
 */
export interface LuckydrawRepo {
  ready(): boolean
  listPrizes(slug: string): Promise<Prize[]>
  /** 관리자용 — 상품 + 오늘/누적 소진 (마감 리포트) */
  report(slug: string): Promise<PrizeReport[]>
  savePrizes(slug: string, prizes: Prize[]): Promise<void>
  getSettings(slug: string): Promise<LuckydrawSettings>
  saveSettings(slug: string, settings: LuckydrawSettings): Promise<void>
  /**
   * 추첨 — **재고 검사·차감·기록이 서버 안에서 한 번에** 일어난다.
   * 남은 수량보다 많이 요청하면 던진다 (그 검사도 서버가 한다 — 화면을 믿지 않는다).
   */
  draw(slug: string, count: number): Promise<DrawResult>
  submitShipping(slug: string, entry: Omit<ShippingEntry, 'id' | 'createdAt'>): Promise<void>
  listShipping(slug: string): Promise<ShippingEntry[]>
  clearShipping(slug: string): Promise<void>
  /**
   * 다른 기기의 변화를 **가만히 있어도** 받는다 — 되돌리는 함수를 준다.
   *
   * 부스에 태블릿을 두 대 놓는 행사가 있다. 옆 기기에서 마지막 하나가 나가도 이쪽 화면이
   * "1개 남음" 을 띄우고 있으면, 손님 앞에서 눌렀다가 에러를 보게 된다 —
   * 서버가 막아 주는 것과 **애초에 안 보이게 하는 것**은 다르다.
   *
   * 못 붙는 어댑터(local)에선 아무것도 안 하고 빈 함수를 준다. 화면은 그걸 몰라도 된다.
   */
  watch(slug: string, onChange: () => void): () => void
}

export interface Repo {
  slots: SlotRepo
  questions: QuestionRepo
  auth: AuthRepo
  ownerAuth: OwnerAuthRepo
  organizers: OrganizersRepo
  ai: AiRepo
  luckydraw: LuckydrawRepo
}
