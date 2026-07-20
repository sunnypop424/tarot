import { authHeader, hasSupabase, supabaseUrl } from './client'
import { fail } from './http'
import type { Organizer, OrganizersRepo } from './types'

/**
 * 주최자 계정 어댑터 — Edge Function 을 부른다 (`supabase/functions/admin`).
 *
 * AI 와 같은 이유로 서버를 거친다: **계정 생성은 service_role 키를 요구하고,
 * 그 키는 브라우저에 못 둔다** (`repo/client.ts`). 화면은 그걸 모른다 —
 * `repo.organizers.create(...)` 를 부를 뿐이다.
 *
 * **주소는 AI 와 달리 유도한다.** `VITE_AI_BASE` 는 개발 서버 미들웨어 시절의 유산이라
 * 환경변수로 남았지만, 이 함수는 처음부터 Supabase 에만 살아서 프로젝트 주소가 곧 함수 주소다.
 * 변수를 하나 더 만들면 그만큼 "안 채워서 조용히 죽는" 자리가 늘 뿐이다.
 */
const BASE = `${supabaseUrl}/functions/v1/admin`

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify(body),
  })
  if (!res.ok) await fail(res)
  return (await res.json()) as T
}

export const httpOrganizers: OrganizersRepo = {
  ready: () => hasSupabase,

  async list(slug) {
    const res = await fetch(`${BASE}/organizers?slug=${encodeURIComponent(slug)}`, {
      headers: await authHeader(),
    })
    if (!res.ok) await fail(res)
    const { organizers } = (await res.json()) as { organizers: Organizer[] }
    return organizers
  },

  async create(slug, email, password) {
    const { organizer, linked } = await post<{ organizer: Organizer; linked?: boolean }>(
      'organizers',
      { slug, email, password }
    )
    return { ...organizer, linked }
  },

  async resetPassword(userId) {
    const { password } = await post<{ password: string }>('password', { userId })
    return password
  },

  async remove(slug, userId) {
    await post('revoke', { slug, userId })
  },

  async purgeSlot(slug) {
    return post<{ deletedAccounts: number; deletedFiles?: number }>('purge', { slug })
  },
}

/**
 * Supabase 가 없으면 **흉내 내지 않는다.**
 *
 * 다른 어댑터는 localStorage 로 그럴듯하게 돌지만 계정만은 그럴 수 없다:
 * 계정은 Supabase 가 갖고 있으므로, 여기서 "만들었다" 고 답하면 그 계정으로는
 * 아무도 로그인하지 못한다 — 화면이 거짓말을 하게 된다.
 * `ready()` 가 false 라 편집기는 패널을 아예 띄우지 않는다.
 */
export const localOrganizers: OrganizersRepo = {
  ready: () => false,
  async list() {
    return []
  },
  async create() {
    throw new Error('Supabase 를 붙여야 계정을 만들 수 있어요')
  },
  async resetPassword(): Promise<string> {
    throw new Error('Supabase 를 붙여야 계정을 만질 수 있어요')
  },
  async remove() {
    throw new Error('Supabase 를 붙여야 계정을 만질 수 있어요')
  },
  async purgeSlot() {
    // local 어댑터엔 지울 계정이 없다 — SlotList 가 이 어댑터에선 repo.slots.remove 를 쓴다
    return { deletedAccounts: 0 }
  },
}
