import seedSlots from '@/data/slots.json'
import type { Question } from '@/types/question'
import type { Slot } from '@/types/slot'
import { httpAi } from './ai'
import { publishSlotChange } from './changed'
import { db } from './client'
import { httpOrganizers } from './organizers'
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
 * Supabase 어댑터 — 진짜 백엔드.
 *
 * local 어댑터와 결정적으로 다른 점: **주최자가 고친 답변이 방문자에게 간다.**
 * 그리고 격리가 프론트가 아니라 **DB(RLS)** 에서 지켜진다
 * (`supabase/migrations/0001_init.sql`). 여기 있는 slug 조건들은 편의지 방어가 아니다 —
 * 이 파일을 전부 지워도 남의 슬롯은 못 읽는다.
 */

/** slots 테이블 행 ↔ Slot. 컬럼 이름이 곧 필드 이름이라 매핑이 얇다 */
type SlotRow = Slot

const SLOT_COLUMNS = 'slug, name, service, plan, limits, deck, period, theme, event'

/**
 * 번들된 씨앗 — **네트워크가 죽었을 때의 마지막 방어선**.
 *
 * 카페 와이파이가 흔들려도 이미 배포된 이벤트는 열려야 한다 (PLANNING.md §1).
 * 단, 여기 없는 슬롯(방금 만든 것)은 못 구한다 — 그건 DB 가 살아야만 열린다.
 */
const seedSlot = (slug: string): Slot | null =>
  (seedSlots as Slot[]).find((s) => s.slug === slug) ?? null

const slots: SlotRepo = {
  async list() {
    const { data, error } = await (await db())
      .from('slots')
      .select(SLOT_COLUMNS)
      .order('created_at')
    if (error) throw new Error(error.message)
    return data as SlotRow[]
  },

  async get(slug) {
    try {
      const { data, error } = await (await db())
        .from('slots')
        .select(SLOT_COLUMNS)
        .eq('slug', slug)
        .maybeSingle()
      if (error) throw new Error(error.message)
      // 없는 슬러그면 폴백도 안 본다 — DB 가 답했고 답은 "없다" 다
      return (data as SlotRow | null) ?? null
    } catch {
      // DB 를 못 불렀다 — 번들에 있으면 그걸로라도 연다 (색이 조금 옛것일 수 있다)
      return seedSlot(slug)
    }
  },

  async save(slot, prevSlug) {
    const row = {
      slug: slot.slug,
      name: slot.name,
      service: slot.service ?? 'tarot',
      plan: slot.plan ?? 'free',
      limits: slot.limits ?? {},
      deck: slot.deck ?? 'full',
      // 컬럼이 not null 이라 빈 기간은 {} 로 — "안 정했다" = 제한 없음 (slot_open 이 그렇게 읽는다)
      period: slot.period ?? {},
      theme: slot.theme,
      event: slot.event,
    }

    /**
     * 슬러그를 옮기는 중이면 **update 한 문장**이다 — 새로 만들고 옛것을 지우는 게 아니다.
     *
     * 지우면 questions·slot_admins 가 `on delete cascade` 로 같이 사라진다:
     * 주최자가 검수해 채운 답변과 그 슬롯 계정이 슬러그 오타 고치다 날아간다.
     * 한 문장이라 옛 행이 잠깐이라도 없어지는 순간이 없고, FK 의 `on update cascade` 가
     * 질문·계정·사용량을 새 슬러그로 따라오게 한다 (`0004_slug_rename.sql`).
     */
    if (prevSlug && prevSlug !== slot.slug) {
      const { error } = await (await db()).from('slots').update(row).eq('slug', prevSlug)
      if (error) throw new Error(error.message)
      // 옛 주소로 열어둔 화면(편집기 미리보기)도 다시 읽어야 한다
      publishSlotChange(prevSlug)
      publishSlotChange(slot.slug)
      return
    }

    const { error } = await (await db()).from('slots').upsert(row)
    if (error) throw new Error(error.message)
    // 저장이 됐다는 걸 이 브라우저의 다른 화면(편집기 미리보기)에 알린다
    publishSlotChange(slot.slug)
  },

  async remove(slug) {
    const { error } = await (await db()).from('slots').delete().eq('slug', slug)
    if (error) throw new Error(error.message)
    publishSlotChange(slug)
  },
}

interface QuestionRow {
  id: string
  slug: string
  published: boolean
  data: Question
}

/**
 * DB 행 → Question.
 * `published` 는 컬럼과 data 양쪽에 있다 — 컬럼은 RLS 가 방문자를 거르는 데 쓰고(jsonb 안은 정책이 못 본다),
 * data 는 화면이 읽는다. 읽을 때 컬럼을 진실로 삼아 둘이 어긋나는 일을 막는다.
 */
const toQuestion = (row: QuestionRow): Question => ({ ...row.data, id: row.id, published: row.published })

const questions: QuestionRepo = {
  async list(slug) {
    // 공개된 것만 — RLS 도 같은 조건을 걸지만, 여기서도 걸어야 쓸데없이 다 받아오지 않는다
    const { data, error } = await (await db())
      .from('questions')
      .select('id, slug, published, data')
      .eq('slug', slug)
      .eq('published', true)
      .order('created_at')
    if (error) throw new Error(error.message)
    return (data as QuestionRow[]).map(toQuestion)
  },

  async listAll(slug) {
    // 비공개까지 — RLS 가 "자기 슬롯 관리자인가"를 본다. 남의 슬롯이면 빈 배열이 온다
    const { data, error } = await (await db())
      .from('questions')
      .select('id, slug, published, data')
      .eq('slug', slug)
      .order('created_at')
    if (error) throw new Error(error.message)
    return (data as QuestionRow[]).map(toQuestion)
  },

  async save(slug, question) {
    const { error } = await (await db())
      .from('questions')
      .upsert({ id: question.id, slug, published: question.published, data: question })
    if (error) throw new Error(error.message)
  },

  async remove(slug, id) {
    const { error } = await (await db()).from('questions').delete().eq('id', id).eq('slug', slug)
    if (error) throw new Error(error.message)
  },
}

/** 로그인한 사용자가 맡은 슬롯 (`slot_admins` 는 자기 행만 읽힌다) */
async function myAdminSlug(): Promise<string | null> {
  const { data, error } = await (await db()).from('slot_admins').select('slug').maybeSingle()
  if (error) throw new Error(error.message)
  return data?.slug ?? null
}

const auth: AuthRepo = {
  /**
   * 주최자 로그인 — 비밀번호가 맞아도 **그 슬롯 관리자가 아니면 못 들어온다.**
   * 여기서 막지 않아도 RLS 때문에 아무것도 못 읽지만, 빈 화면보다 "권한 없음"이 정직하다.
   */
  async signIn(slug, email, password) {
    const { data, error } = await (await db()).auth.signInWithPassword({ email, password })
    if (error) throw new Error(error.message)

    const mine = await myAdminSlug()
    if (mine !== slug) {
      // 남의 슬롯 로그인 화면에서 맞는 비번을 넣은 경우 — 세션을 남기지 않는다
      await (await db()).auth.signOut()
      throw new Error('이 슬롯의 관리자 계정이 아니에요')
    }
    return { email: data.user.email ?? email, slug }
  },

  async signOut() {
    await (await db()).auth.signOut()
  },

  /**
   * 자기 비밀번호 — **자기 세션으로 바꾼다.** service_role 도 Edge Function 도 필요 없다.
   * 최고관리자가 발급한 임시 비번으로 들어온 주최자가 여기서 자기 것으로 바꾼다.
   */
  async changePassword(password) {
    const { error } = await (await db()).auth.updateUser({ password })
    if (error) throw new Error(error.message)
  },

  async currentUser(): Promise<AdminUser | null> {
    const { data } = await (await db()).auth.getUser()
    if (!data.user) return null
    const slug = await myAdminSlug()
    if (!slug) return null
    return { email: data.user.email ?? '', slug }
  },
}

const ownerAuth: OwnerAuthRepo = {
  /** 최고관리자 로그인 — `owners` 에 없으면 비번이 맞아도 못 들어온다 */
  async signIn(email, password) {
    const { data, error } = await (await db()).auth.signInWithPassword({ email, password })
    if (error) throw new Error(error.message)

    const { data: owner, error: ownerError } = await (await db())
      .from('owners')
      .select('user_id')
      .maybeSingle()
    if (ownerError) throw new Error(ownerError.message)
    if (!owner) {
      await (await db()).auth.signOut()
      throw new Error('최고관리자 계정이 아니에요')
    }
    return { email: data.user.email ?? email }
  },

  async signOut() {
    await (await db()).auth.signOut()
  },

  async currentUser(): Promise<OwnerUser | null> {
    const { data } = await (await db()).auth.getUser()
    if (!data.user) return null
    const { data: owner } = await (await db()).from('owners').select('user_id').maybeSingle()
    if (!owner) return null
    return { email: data.user.email ?? '' }
  },
}

/**
 * AI 와 계정은 저장소와 무관하다 — 둘 다 **키 때문에** 서버 엔드포인트를 거친다.
 * AI 는 ANTHROPIC_API_KEY, 계정은 service_role 키. 어느 쪽도 브라우저에 둘 수 없다.
 */
export const supabaseRepo: Repo = {
  slots,
  questions,
  auth,
  ownerAuth,
  organizers: httpOrganizers,
  ai: httpAi,
}
