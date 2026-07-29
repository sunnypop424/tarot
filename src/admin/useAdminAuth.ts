import { useCallback, useEffect, useState } from 'react'

import { repo } from '@/lib/repo'
import type { AdminUser } from '@/lib/repo'

type Status = 'checking' | 'in' | 'out'

/**
 * 관리자 세션.
 *
 * 판정은 전부 `repo.auth` 어댑터가 한다 — 지금은 local 어댑터가 통과시키지만,
 * 백엔드가 붙으면 이 훅은 그대로 두고 어댑터만 바뀐다.
 *
 * **슬롯 스코프가 핵심이다.** 리안 슬롯 관리자가 하온 슬롯 관리 화면에 들어가면 안 되므로
 * 로그인 여부만이 아니라 그 계정이 **이 슬롯을 맡았는지**까지 본다.
 */
export function useAdminAuth(slug: string) {
  const [user, setUser] = useState<AdminUser | null>(null)
  const [status, setStatus] = useState<Status>('checking')

  const refresh = useCallback(async () => {
    const current = await repo.auth.currentUser()
    // 이 슬롯을 안 맡은 계정이면 여기선 로그아웃 상태로 본다
    // (겸업 주최자라면 다른 슬롯에선 그대로 로그인 상태다 — 슬롯마다 훅이 따로 돈다)
    // 최고관리자는 어느 슬롯이든 (RLS 도 그렇게 돼 있다 — 화면만 막고 있었다)
    const valid = current && (current.owner || current.slugs.includes(slug)) ? current : null
    setUser(valid)
    setStatus(valid ? 'in' : 'out')
  }, [slug])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const signIn = useCallback(
    async (email: string, password: string) => {
      const next = await repo.auth.signIn(slug, email, password)
      setUser(next)
      setStatus('in')
    },
    [slug]
  )

  const signOut = useCallback(async () => {
    await repo.auth.signOut()
    setUser(null)
    setStatus('out')
  }, [])

  return { user, status, signIn, signOut }
}
