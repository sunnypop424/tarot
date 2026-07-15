import { localRepo } from './local'
import type { Repo } from './types'

/**
 * 백엔드 선택은 **이 파일에서만** 한다.
 * Supabase/Firebase 가 정해지면 어댑터를 하나 추가하고 아래 한 줄만 바꾼다 —
 * 화면·컨텍스트는 전부 types.ts 의 인터페이스만 알고 있으므로 손댈 곳이 없다.
 *
 *   import { supabaseRepo } from './supabase'
 *   export const repo: Repo = supabaseRepo
 */
export const repo: Repo = localRepo

export type * from './types'
