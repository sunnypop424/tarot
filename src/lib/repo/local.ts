import seedQuestions from '@/data/questions.json'
import type { Question } from '@/types/question'
import type { AdminUser, AuthRepo, QuestionRepo, Repo } from './types'

/**
 * localStorage 어댑터 — 백엔드가 정해지기 전까지 UI 를 전부 만들고 검증하기 위한 것.
 *
 * 한계를 분명히 해둔다: 이 어댑터로는 **주최자가 고친 답변이 방문자에게 가지 않는다**
 * (편집한 브라우저에만 남는다). 실제 운영은 Supabase/Firebase 어댑터가 붙어야 성립한다.
 */

const questionsKey = (slug: string) => `tarot-pocket:admin:questions:${slug}`
const KEY_USER = 'tarot-pocket:admin:user'

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* 저장 실패는 조용히 넘긴다 — 읽기는 계속 동작해야 한다 */
  }
}

/** 편집분이 없으면 번들된 씨앗 질문으로 시작한다 */
function allQuestions(slug: string): Question[] {
  return read<Question[]>(questionsKey(slug)) ?? (seedQuestions as Question[])
}

const questions: QuestionRepo = {
  async list(slug) {
    return allQuestions(slug).filter((q) => q.published)
  },
  async listAll(slug) {
    return allQuestions(slug)
  },
  async save(slug, question) {
    const all = allQuestions(slug)
    const i = all.findIndex((q) => q.id === question.id)
    if (i === -1) all.push(question)
    else all[i] = question
    write(questionsKey(slug), all)
  },
  async remove(slug, id) {
    write(
      questionsKey(slug),
      allQuestions(slug).filter((q) => q.id !== id)
    )
  },
}

const auth: AuthRepo = {
  // 아직 인증이 없다 — 어떤 값이든 통과시키고 요청한 슬롯에 매어 준다.
  // 로그인 화면이 이 사실을 사용자에게 명시한다.
  async signIn(slug, email) {
    const user: AdminUser = { email, slug }
    write(KEY_USER, user)
    return user
  },
  async signOut() {
    try {
      localStorage.removeItem(KEY_USER)
    } catch {
      /* noop */
    }
  },
  async currentUser() {
    return read<AdminUser>(KEY_USER)
  },
}

export const localRepo: Repo = { questions, auth }
