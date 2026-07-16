import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Supabase 클라이언트 — **anon 키만** 쓴다.
 *
 * anon 키는 브라우저에 그대로 내려간다. 그래서 이 키로 뭘 할 수 있는지는 키가 아니라
 * **RLS 가 정한다** (`supabase/migrations/0001_init.sql`). 격리는 거기 있지 여기 있지 않다.
 *
 * `service_role` 키는 **절대 여기 오면 안 된다** — RLS 를 통째로 무시하는 키라
 * 브라우저에 내려가는 순간 남의 슬롯을 다 만질 수 있다. 그 키는 Edge Function secret 자리다.
 *
 * **동적 import 인 이유:** supabase-js 는 gzip 57KB 다. 정적으로 넣으면 초기 로드가
 * 200KB 가 돼 예산(150KB, PLANNING.md §7)을 넘고, 카페 대기줄에서 그만큼 더 기다린다.
 * 카드 뽑기는 어차피 네트워크 없이 도는 화면이라 그때까지 이 코드가 필요 없다 —
 * 질문 타로를 열거나 로그인할 때 비로소 받는다.
 */

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/** 키가 있나 — 없으면 앱은 local 어댑터로 돈다 (`repo/index.ts`) */
export const hasSupabase = Boolean(url && anonKey)

/**
 * 프로젝트 주소 — Storage 공개 URL 을 **동기로** 만들어야 하는 자리에서 쓴다
 * (`owner/upload/storage.ts`). `db()` 는 동적 import 라 렌더 중엔 못 기다린다.
 */
export const supabaseUrl: string = url ?? ''

let pending: Promise<SupabaseClient> | null = null

/**
 * Edge Function 에 보낼 Authorization 헤더 (ai · admin 둘 다 이걸 쓴다).
 *
 * **방문자는 로그인하지 않는다** — 카페에서 회원가입 없이 뽑는 게 이 앱의 전제다.
 * 그런데 함수를 아무나 부르면 남이 우리 Claude 예산을 쓴다. 그래서 리딩을 부르기 직전에만
 * **익명 로그인**으로 토큰을 받는다 (`anonymous: true`) — 그래야 레이트리밋을 걸 주체가 생긴다.
 * 앱을 열 때가 아니라 리딩 직전인 이유: QR 을 찍고 카드를 고르는 동안은 필요 없고,
 * 그 왕복이 첫 화면을 늦추면 안 된다 (수정구슬 로더가 떠 있는 동안 끝난다).
 *
 * 주최자·최고관리자는 이미 로그인해 있으므로 그 세션이 그대로 쓰인다.
 * 익명 로그인이 꺼져 있으면 토큰 없이 보낸다 — 함수가 IP 로 레이트리밋을 센다.
 */
/** 익명 로그인이 꺼져 있으면 매번 실패하는 왕복을 하지 않는다 — 한 번 겪으면 기억한다 */
let anonBlocked = false

export async function authHeader({ anonymous = false } = {}): Promise<Record<string, string>> {
  if (!hasSupabase) return {}
  try {
    const client = await db()
    let session = (await client.auth.getSession()).data.session
    if (!session && anonymous && !anonBlocked) {
      const { data, error } = await client.auth.signInAnonymously()
      // 대시보드에서 익명 로그인을 안 켰다 — 토큰 없이 보낸다 (함수가 IP 로 센다)
      if (error) anonBlocked = true
      session = data.session
    }
    return session ? { authorization: `Bearer ${session.access_token}` } : {}
  } catch {
    return {}
  }
}

/** 클라이언트 — 처음 부를 때 받아오고, 그 뒤론 같은 걸 돌려준다 */
export function db(): Promise<SupabaseClient> {
  if (!pending) {
    pending = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(url, anonKey, {
        auth: { persistSession: true, autoRefreshToken: true },
      })
    )
  }
  return pending
}
