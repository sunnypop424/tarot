import { useCallback, useEffect, useState } from 'react'

import { repo } from '@/lib/repo'
import type { OwnerUser } from '@/lib/repo'

type Status = 'checking' | 'in' | 'out'

/**
 * 최고관리자 세션 — 슬롯 편집기(`/theme-editor`) 전용.
 *
 * 주최자 세션(`useAdminAuth`)과 판정도 저장도 완전히 분리돼 있다.
 * 주최자 로그인으로 슬롯을 만들거나 남의 테마를 열 수 있으면 역할 분리가 무너진다.
 *
 * 판정은 `repo.ownerAuth` 어댑터가 한다 — 지금은 local 어댑터가 통과시키지만,
 * 백엔드가 붙으면 이 훅은 그대로 두고 어댑터만 바뀐다.
 */
export function useOwnerAuth() {
  const [user, setUser] = useState<OwnerUser | null>(null)
  const [status, setStatus] = useState<Status>('checking')

  const refresh = useCallback(async () => {
    const current = await repo.ownerAuth.currentUser()
    setUser(current)
    setStatus(current ? 'in' : 'out')
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const signIn = useCallback(async (email: string, password: string) => {
    const next = await repo.ownerAuth.signIn(email, password)
    setUser(next)
    setStatus('in')
  }, [])

  const signOut = useCallback(async () => {
    await repo.ownerAuth.signOut()
    setUser(null)
    setStatus('out')
  }, [])

  return { user, status, signIn, signOut }
}
