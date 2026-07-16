import { hasSupabase } from './client'
import { localRepo } from './local'
import { supabaseRepo } from './supabase'
import type { Repo } from './types'

/**
 * 백엔드 선택은 **이 파일에서만** 한다.
 * 화면·컨텍스트는 전부 types.ts 의 인터페이스만 알고 있으므로 손댈 곳이 없다.
 *
 * `.env.local` 에 VITE_SUPABASE_URL·VITE_SUPABASE_ANON_KEY 가 있으면 Supabase,
 * 없으면 localStorage 로 돈다. 키 없이 받아온 사람도 앱을 띄워볼 수 있게 —
 * 다만 그 상태에선 **주최자가 고친 답변이 방문자에게 가지 않는다** (그 브라우저에만 남는다).
 */
export const repo: Repo = hasSupabase ? supabaseRepo : localRepo

export type * from './types'
