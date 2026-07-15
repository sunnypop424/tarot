import type { Question } from '@/types/question'

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

export interface Repo {
  questions: QuestionRepo
  auth: AuthRepo
}
