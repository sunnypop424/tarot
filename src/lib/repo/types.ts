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
  /** 뽑기 전 '경품 미리보기' 를 손님에게 보여줄지 — 상품명이 스포일러인 행사는 끈다 */
  showPrizePreview: boolean
  /** 미리보기에서 남은 수량까지 보여줄지 — 수량이 민망하면 끈다 */
  showPrizeCount: boolean
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

/**
 * 롤링페이퍼 메시지 한 장 (세 번째 서비스).
 *
 * 방문자가 자기 폰으로 남긴다 — 럭키드로우와 **반대다**: 스태프 로그인이 필요 없다.
 * **공개 벽 + 후검수**: 남기는 즉시 벽에 뜨고(hidden=false), 주최자가 나중에 부적절한 걸 숨긴다.
 * 색·스티커는 **이름만** 든다 (hex·이미지가 아니다) — 실체는 테마 토큰과 슬롯 Storage 가 댄다.
 */
export interface RollingMessage {
  id: string
  /** 방문자가 적은 이름 — 비어도 된다 (익명) */
  nickname: string
  body: string
  /** 쪽지 종이색 — RollingDisplay.papers 의 hex 중 하나. 비면 첫 종이색 */
  color: string
  /** 쪽지 손글씨 폰트 — fonts.ts WEBFONTS 의 id. 비면 벽 기본 폰트 */
  font: string
  /** 붙인 스티커 — RollingDisplay.stickers 의 경로. 없으면 스티커 없음 */
  sticker?: string
  /** 후검수로 숨겼나 — 방문자 벽엔 안 나온다 (주최자만 본다) */
  hidden: boolean
  createdAt: string
}

/**
 * 롤링페이퍼 (세 번째 서비스).
 *
 * ⚠ **소원나무(`wish`) 서비스도 이 인터페이스와 `rolling_messages` 테이블을 그대로 쓴다.**
 * 데이터 모양이 정확히 같고(닉네임+본문+색+글꼴+장식+숨김) 그리는 방법만 다르다 —
 * 포스트잇이냐 등불이냐. 필드 셋은 소원나무에서 이렇게 읽힌다:
 * `color`→등불 색 · `font`→손글씨(그대로) · `sticker`→매다는 장식 (`src/data/wish.ts`).
 * 여기를 고칠 땐 **두 서비스를 같이 본다.** `wish_messages` 를 새로 만들지 말 것 —
 * 만드는 순간 주최자 후검수 화면이 둘로 갈린다.
 *
 * 럭키드로우와 달리 **local 짝이 진짜로 있다** — 재고 같은 원자성 요구가 없어 localStorage 로도
 * 성립한다. 그래서 `ready()` 가 없다: 어느 어댑터든 돈다 (QuestionRepo 와 같은 급).
 *
 * `list`(공개분)/`listAll`(숨김 포함)의 분리는 `QuestionRepo` 와 같다 — 방문자는 앞을, 주최자는 뒤를 본다.
 */
export interface RollingRepo {
  /** 방문자용 — 숨김 아닌 것만, 최신이 위 */
  list(slug: string): Promise<RollingMessage[]>
  /** 주최자용 — 숨김 포함 전부 (후검수) */
  listAll(slug: string): Promise<RollingMessage[]>
  /** 방문자가 남긴다 — id·createdAt·hidden 은 저장소가 붙인다 */
  add(
    slug: string,
    msg: Pick<RollingMessage, 'nickname' | 'body' | 'color' | 'font' | 'sticker'>
  ): Promise<void>
  /** 후검수 — 숨기거나 되살린다 (주최자만) */
  setHidden(slug: string, id: string, hidden: boolean): Promise<void>
  /** 지운다 (주최자만) */
  remove(slug: string, id: string): Promise<void>
  /**
   * 벽 실시간 — 다른 기기·탭이 남기면 그 자리에서 알려준다 (되돌리는 함수를 준다).
   * 부스 태블릿을 벽 전용으로 띄우면 전광판이 된다. **무엇이 바뀌었는지는 안 본다** —
   * 바뀌었다는 신호만 받고 화면이 다시 읽는다 (`LuckydrawRepo.watch` 와 같은 이유).
   */
  watch(slug: string, onChange: () => void): () => void
}

/** 설문 하나의 선택지 */
export interface PollOption {
  id: string
  order: number
  label: string
  /** 이미지형 설문일 때 (업로드 URL) */
  image?: string
  /** 지금까지 받은 표 — **컬럼으로 든다** (0020 주석: 럭드와 반대인 이유) */
  votes: number
}

export interface Poll {
  id: string
  title: string
  /** single = 하나만 · multi = 여러 개 */
  kind: 'single' | 'multi'
  maxPick: number
  closed: boolean
  /** 주최자가 준비 중 — 방문자에게 안 보인다 */
  hidden: boolean
  order: number
  options: PollOption[]
}

/** 내가 이 설문에 찍은 것 — 남의 선택은 절대 안 온다 (`poll_mine` 이 subject 로만 준다) */
export interface MyVote {
  pollId: string
  optionIds: string[]
  at: string
}

/**
 * 실시간 투표 (여섯 번째 서비스).
 *
 * **`ready()` 가 false 다** — 집계 원자성과 여러 기기 실시간이 이 서비스의 값어치 전부라,
 * localStorage 로 흉내내면 "혼자만의 투표" 가 된다. 럭키드로우와 정확히 같은 논리다
 * (`LuckydrawRepo` 주석). local 어댑터는 전부 던진다.
 */
export interface PollRepo {
  ready(): boolean
  /** 방문자 — hidden 제외 */
  list(slug: string): Promise<Poll[]>
  /** 주최자 — 준비 중인 것까지 */
  listAll(slug: string): Promise<Poll[]>
  savePoll(slug: string, poll: Poll): Promise<void>
  removePoll(slug: string, id: string): Promise<void>
  /** 내가 찍은 것들 (기기별 익명 id 로) */
  mine(slug: string, subject: string): Promise<MyVote[]>
  /** 투표 — **최신 집계를 함께 돌려준다** (왕복 한 번을 아낀다) */
  vote(slug: string, pollId: string, optionIds: string[], subject: string): Promise<Poll[]>
  /**
   * 집계 실시간. 표 하나마다 이벤트가 오므로 **부르는 쪽이 디바운스해야 한다** —
   * 초당 수십 표면 그대로 리로드 폭풍이 된다 (롤페·럭드엔 없던 문제).
   */
  watch(slug: string, onChange: () => void): () => void
}

/** 공용 보상(0019)에서 내 것 하나 — **응모 정보는 안 온다** (닉네임·연락처·주소) */
export interface MyReward {
  code: string
  label: string
  kind: 'guaranteed' | 'raffle'
  /** 스태프가 수령 처리한 시각 — null 이면 아직 */
  redeemedAt: string | null
  /** 응모(raffle)에서 이미 냈나 */
  entered: boolean
  createdAt: string
}

export interface StampSettings {
  rewardMode: 'none' | 'guaranteed' | 'raffle'
  /** 켜면 KST 00시에 판이 비워진다 (실제로 지우지 않는다 — 0022 주석) */
  dailyReset: boolean
  closed: boolean
  /** 응모 폼에서 받을 필드 — 안 켠 건 폼에도 DB 에도 안 들어간다 */
  entryFields: { handle: boolean; contact: boolean; address: boolean }
  rewardLabel: string
}

/**
 * 체크인 결과.
 *
 * **틀린 암호는 예외가 아니라 `ok: false` 로 온다** — 예외를 던지면 트랜잭션이 되감기면서
 * 바로 앞에서 넣은 레이트리밋 카운터까지 같이 사라져 브루트포스 차단이 무력화된다
 * (`supabase/migrations/0023_stamp_fail_counts.sql`). 슬롯 자체가 잘못됐거나 리밋에
 * 걸린 건 여전히 예외다 — 그건 화면이 통째로 다른 상태여야 하는 상황이다.
 */
export interface StampCheckinResult {
  ok: boolean
  /** `ok=false` 일 때 화면에 그대로 보여줄 문장 */
  message?: string
  stampId?: string
  got?: number
  total?: number
  complete?: boolean
  /** 완성했고 보상이 있으면 교환코드가 함께 온다 */
  rewardCode?: string | null
}

export interface StampCodeRow {
  stampId: string
  code: string
}

/**
 * 방문 스탬프 (일곱 번째 서비스).
 *
 * **`ready()` 가 false 다** — 현장 암호 검증과 보상 발급이 서버여야 의미가 있다.
 * 코드가 localStorage 에 있으면 개발자도구로 그냥 읽힌다.
 *
 * 보상은 **공용 인프라(0019)를 쓴다** — 이 인터페이스에 `claim`·`redeem` 이 없는 게 그 증거다.
 */
export interface StampRepo {
  ready(): boolean
  settings(slug: string): Promise<StampSettings>
  saveSettings(slug: string, s: StampSettings): Promise<void>
  /** 내 판 (기기별 익명 id 로) */
  mine(slug: string, subject: string): Promise<{ stampIds: string[]; day: string | null }>
  /** 현장 암호로 도장 — 완성하면 서버가 같은 트랜잭션에서 보상까지 발급한다 */
  checkin(slug: string, subject: string, code: string): Promise<StampCheckinResult>
  /** 주최자만 — 코드는 anon 에게 안 읽힌다 */
  codes(slug: string): Promise<StampCodeRow[]>
  saveCode(slug: string, stampId: string, code: string): Promise<void>
  report(slug: string): Promise<{ stampId: string; count: number }[]>
  /** 내 보상 (공용 rewards) */
  myReward(slug: string, subject: string): Promise<MyReward | null>
  /** 응모 제출 (공용 rewards) */
  enter(
    slug: string,
    code: string,
    form: { nickname: string; handle?: string; contact?: string; address?: string }
  ): Promise<void>
}

export type QuizKind = 'choice' | 'short'

/**
 * 방문자용 문항 — **`answers` 가 아예 없다.**
 * 타입에 없으면 방문자 화면이 **실수로도** 정답을 못 그린다. 서버 쪽 방어(별도 테이블 +
 * anon grant 없음)와 짝을 이룬다 — 한쪽만으로는 다음 사람이 무심코 뚫는다.
 */
export interface QuizQuestion {
  id: string
  order: number
  kind: QuizKind
  body: string
  image?: string
  /** 객관식 보기. 주관식이면 빈 배열 */
  choices: string[]
  points: number
  hidden: boolean
}

/** 주최자용 — 정답이 붙는다 */
export interface QuizQuestionFull extends QuizQuestion {
  /** 객관식은 보기 인덱스 문자열('0'), 주관식은 허용 정답들 */
  answers: string[]
}

export interface QuizSettings {
  rewardMode: 'none' | 'threshold' | 'raffle'
  /** `threshold` 에서 이 점수 이상이면 확정 */
  rewardMinScore: number
  rewardLabel: string
  entryFields: { handle: boolean; contact: boolean; address: boolean }
  /** 0 = 무제한 */
  timeLimitSec: number
  /** **보상이 있으면 서버가 강제로 끈다** (0024 트리거) */
  allowRetry: boolean
  showAnswers: 'none' | 'after' | 'wrongOnly'
  closed: boolean
}

/** 제출 결과 — `detail` 은 `showAnswers` 정책대로 **서버가 잘라서** 준다 */
export interface QuizResult {
  attemptId: string
  score: number
  total: number
  correct: number
  count: number
  detail: {
    id: string
    order: number
    ok: boolean
    body?: string | null
    given?: string | null
    answer?: string | null
  }[]
  rewardCode?: string | null
  rewardKind?: 'guaranteed' | 'raffle' | null
}

/** 문항별 정답률 — 주최자 통계 */
export interface QuizStat {
  questionId: string
  body: string
  tried: number
  correct: number
}

/**
 * 최애 모의고사 (여덟 번째 서비스).
 *
 * **`ready()` 가 false 다** — 정답이 localStorage 에 있으면 개발자도구로 100점이 나온다.
 * 보상은 **공용 인프라(0019)** 를 쓴다 (`repo.rewards` + 아래 `myReward`/`enter`).
 */
export interface QuizRepo {
  ready(): boolean
  /** 방문자 — 공개 문항만, **정답 없이** */
  list(slug: string): Promise<QuizQuestion[]>
  /** 주최자 — 비공개 포함, 정답 포함 */
  listAll(slug: string): Promise<QuizQuestionFull[]>
  saveQuestion(slug: string, q: QuizQuestionFull): Promise<void>
  removeQuestion(slug: string, id: string): Promise<void>
  settings(slug: string): Promise<QuizSettings>
  saveSettings(slug: string, s: QuizSettings): Promise<void>
  /** 채점은 서버가 한다 — 정답이 브라우저에 한 번도 안 내려간다 */
  submit(slug: string, subject: string, answers: { id: string; value: string }[]): Promise<QuizResult>
  /** 이미 냈나 (재응시 금지 이벤트에서 시작 화면이 물어본다) */
  mine(slug: string, subject: string): Promise<{ attempts: number }>
  stats(slug: string): Promise<{ attempts: number; avg: number; questions: QuizStat[] }>
  /** 주관식 허용 정답을 늘린 뒤 기존 응시분을 다시 채점한다 */
  regrade(slug: string): Promise<number>
  /** 내 보상 (공용 rewards) */
  myReward(slug: string, subject: string): Promise<MyReward | null>
  /** 응모 제출 (공용 rewards) */
  enter(
    slug: string,
    code: string,
    form: { nickname: string; handle?: string; contact?: string; address?: string }
  ): Promise<void>
}

/** 응모 추첨의 후보/결과 한 줄 — 주최자만 본다 (준-PII) */
export interface RewardEntry {
  rewardId: string
  code: string
  label: string
  nickname: string
  handle: string | null
  contact: string | null
  address: string | null
  score: number | null
  won: boolean
  pickedRound: number | null
  createdAt: string
}

/**
 * 공용 보상 — **주최자 쪽만** 있는 인터페이스다.
 *
 * 방문자 쪽(`myReward`·`enter`)은 각 서비스 repo 안에 있다 — 방문자는 자기가 참여한
 * 서비스 화면에서만 보상을 만나고, `source` 를 클라이언트가 고르게 두면 남의 서비스
 * 보상을 조회하는 통로가 된다.
 *
 * **`ready()` 가 false 다** — 추첨·수령 판정이 서버여야 의미가 있다.
 */
export interface RewardsRepo {
  ready(): boolean
  /** 응모자 명단 (`kind='raffle'` 만). 발표·CSV 의 원본 */
  entries(slug: string, source: string): Promise<RewardEntry[]>
  /** 랜덤 또는 점수순으로 cnt 명 — 이미 당첨된 사람은 후보에서 빠진다 */
  pick(slug: string, source: string, count: number, method: 'random' | 'score'): Promise<RewardEntry[]>
  /** 그 회차만 되돌린다 */
  unpick(slug: string, source: string, round: number): Promise<number>
}

export interface Repo {
  slots: SlotRepo
  questions: QuestionRepo
  auth: AuthRepo
  ownerAuth: OwnerAuthRepo
  organizers: OrganizersRepo
  ai: AiRepo
  luckydraw: LuckydrawRepo
  rolling: RollingRepo
  poll: PollRepo
  stamp: StampRepo
  quiz: QuizRepo
  rewards: RewardsRepo
}
