import seedQuestions from '@/data/questions.json'
import seedSlots from '@/data/slots.json'
import type { Question } from '@/types/question'
import type { Slot } from '@/types/slot'
import { httpAi } from './ai'
import { publishSlotChange } from './changed'
import { localLuckydraw } from './luckydraw'
import { localOrganizers } from './organizers'
import { localRolling } from './rolling'
import { localPoll } from './poll'
import { localQuiz } from './quiz'
import { localRewards } from './rewards'
import { localStamp } from './stamp'
import type {
  AdminUser,
  AuthRepo,
  OwnerAuthRepo,
  OwnerUser,
  QuestionRepo,
  Repo,
  SlotRepo,
} from './types'

/**
 * localStorage 어댑터 — 백엔드가 정해지기 전까지 UI 를 전부 만들고 검증하기 위한 것.
 *
 * 한계를 분명히 해둔다: 이 어댑터로는 **주최자가 고친 답변이 방문자에게 가지 않는다**
 * (편집한 브라우저에만 남는다). 실제 운영은 Supabase/Firebase 어댑터가 붙어야 성립한다.
 */

const questionsKey = (slug: string) => `tarot-pocket:admin:questions:${slug}`
const KEY_USER = 'tarot-pocket:admin:user'
/** 최고관리자 세션은 주최자와 따로 — 한쪽 로그인이 다른 쪽 화면을 열면 안 된다 */
const KEY_OWNER = 'tarot-pocket:owner:user'
/** 슬롯 편집분 */
export const SLOTS_DRAFT_KEY = 'tarot-pocket:slots-draft'

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

/**
 * 슬롯 — 편집분(localStorage)이 있으면 그게 우선, 없으면 번들된 씨앗.
 *
 * **이 어댑터로 만든 슬롯은 이 브라우저 밖으로 안 나간다.** 방문자에게 보이려면
 * 내보낸 slots.json 을 레포에 넣고 재배포해야 한다 — Supabase 어댑터가 붙으면 사라지는 제약이다.
 */
const allSlots = (): Slot[] => read<Slot[]>(SLOTS_DRAFT_KEY) ?? (seedSlots as Slot[])

const slots: SlotRepo = {
  async list() {
    return allSlots()
  },
  async get(slug) {
    return allSlots().find((s) => s.slug === slug) ?? null
  },
  async save(slot, prevSlug) {
    const all = allSlots()
    // 슬러그를 옮기는 중이면 **옛 행을 찾아 갈아끼운다** — 새로 push 하면 옛 슬롯이 목록에 남는다
    const i = all.findIndex((s) => s.slug === (prevSlug ?? slot.slug))
    if (i === -1) all.push(slot)
    else all[i] = slot
    write(SLOTS_DRAFT_KEY, all)

    /**
     * 질문은 슬러그별 키에 산다 — 슬롯을 옮겼으면 질문도 따라가야 한다.
     * Supabase 어댑터에선 FK 의 `on update cascade` 가 하는 일을 여기선 손으로 한다
     * (`0004_slug_rename.sql`). 안 하면 옛 키에 갇혀 새 슬롯에선 질문이 사라진 것처럼 보인다.
     */
    if (prevSlug && prevSlug !== slot.slug) {
      const moved = read<Question[]>(questionsKey(prevSlug))
      if (moved) {
        write(questionsKey(slot.slug), moved)
        try {
          localStorage.removeItem(questionsKey(prevSlug))
        } catch {
          /* 지우기 실패는 넘긴다 — 새 키에 이미 옮겨 놨다 */
        }
      }
      publishSlotChange(prevSlug)
    }
    publishSlotChange(slot.slug)
  },
  async remove(slug) {
    write(
      SLOTS_DRAFT_KEY,
      allSlots().filter((s) => s.slug !== slug)
    )
    publishSlotChange(slug)
  },
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
    const user: AdminUser = { email, slugs: [slug] }
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
  // 비밀번호랄 게 없는 어댑터다 — 아무 값이나 통과시키므로 바꿀 것도 없다.
  // 화면은 이 사실을 hasSupabase 로 알고 변경 UI 를 아예 띄우지 않는다.
  async changePassword() {
    throw new Error('Supabase 를 붙여야 비밀번호를 바꿀 수 있어요')
  },
  async currentUser() {
    return read<AdminUser>(KEY_USER)
  },
}

const ownerAuth: OwnerAuthRepo = {
  // 주최자 로그인과 같은 한계 — 아무나 통과한다. 로그인 화면이 그 사실을 밝힌다.
  // 이 문은 Supabase 를 안 붙인 빌드에만 있다 (붙이면 supabaseRepo 가 대신한다).
  async signIn(email) {
    const user: OwnerUser = { email }
    write(KEY_OWNER, user)
    return user
  },
  async signOut() {
    try {
      localStorage.removeItem(KEY_OWNER)
    } catch {
      /* noop */
    }
  },
  async currentUser() {
    return read<OwnerUser>(KEY_OWNER)
  },
}

/**
 * reading 만 localStorage 가 아니다 — AI 는 키 때문에 반드시 서버를 거친다.
 * 저장소가 Supabase 로 바뀌어도 이 줄은 그대로다 (엔드포인트 주소만 VITE_AI_BASE 로 바뀐다).
 */
export const localRepo: Repo = {
  slots,
  questions,
  auth,
  ownerAuth,
  organizers: localOrganizers,
  ai: httpAi,
  // 럭키드로우는 local 짝이 없다 — 재고를 기기마다 따로 굴리면 이중 당첨이 난다 (luckydraw.ts)
  luckydraw: localLuckydraw,
  // 롤링페이퍼는 local 짝이 진짜다 — 원자성 요구가 없어 localStorage 로도 성립한다 (rolling.ts)
  rolling: localRolling,
  poll: localPoll,
  stamp: localStamp,
  quiz: localQuiz,
  rewards: localRewards,
}
