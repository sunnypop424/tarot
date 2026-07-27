import { db } from './client'
import type { RollingMessage, RollingRepo } from './types'

/**
 * 롤링페이퍼 어댑터 — Supabase 와 localStorage **둘 다 진짜다.**
 *
 * 럭키드로우와 다른 점: 여기엔 원자적 재고 같은 게 없어 localStorage 로도 성립한다.
 * 그래서 `localRolling` 은 흉내가 아니라 실제 구현이고 — key 없는 dev 빌드에서도 벽이 돈다
 * (질문 타로의 local 어댑터와 같은 급).
 */

// ── Supabase ────────────────────────────────────────────────
/** DB 는 snake_case, 화면은 camelCase — 매핑은 이 파일에만 있다 */
function toMessage(row: Record<string, unknown>): RollingMessage {
  return {
    id: row.id as string,
    nickname: (row.nickname as string) ?? '',
    body: (row.body as string) ?? '',
    color: (row.color as string) ?? '',
    sticker: (row.sticker as string) || undefined,
    hidden: row.hidden === true,
    createdAt: row.created_at as string,
  }
}

export const supabaseRolling: RollingRepo = {
  async list(slug) {
    const { data, error } = await (await db())
      .from('rolling_messages')
      .select('*')
      .eq('slug', slug)
      .eq('hidden', false)
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return (data ?? []).map(toMessage)
  },

  /** 숨김까지 — RLS 가 "자기 슬롯 관리자인가"를 본다. 남의 슬롯이면 공개분만 온다 */
  async listAll(slug) {
    const { data, error } = await (await db())
      .from('rolling_messages')
      .select('*')
      .eq('slug', slug)
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return (data ?? []).map(toMessage)
  },

  /** 방문자가 남긴다 — anon INSERT 가 RLS 로 열려 있다 (스태프 게이트 없음) */
  async add(slug, msg) {
    const { error } = await (await db()).from('rolling_messages').insert({
      slug,
      nickname: msg.nickname,
      body: msg.body,
      color: msg.color,
      sticker: msg.sticker ?? null,
    })
    if (error) throw new Error(error.message)
  },

  async setHidden(slug, id, hidden) {
    const { error } = await (await db())
      .from('rolling_messages')
      .update({ hidden })
      .eq('slug', slug)
      .eq('id', id)
    if (error) throw new Error(error.message)
  },

  async remove(slug, id) {
    const { error } = await (await db())
      .from('rolling_messages')
      .delete()
      .eq('slug', slug)
      .eq('id', id)
    if (error) throw new Error(error.message)
  },

  /**
   * 벽 실시간 — 다른 기기가 남기면 그 자리에서 알려준다.
   * 럭키드로우 watch 와 같은 규칙: **무엇이 바뀌었는지는 안 본다**, 바뀌었다는 신호만 받고 다시 읽는다.
   */
  watch(slug, onChange) {
    let channel: { unsubscribe: () => void } | null = null
    let cancelled = false
    void db().then((client) => {
      if (cancelled) return
      channel = client
        .channel(`rolling:${slug}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'rolling_messages', filter: `slug=eq.${slug}` },
          onChange
        )
        .subscribe()
    })
    return () => {
      cancelled = true
      channel?.unsubscribe()
    }
  },
}

// ── localStorage ────────────────────────────────────────────
const storageKey = (slug: string) => `tarot-pocket:rolling:${slug}`

function read(slug: string): RollingMessage[] {
  try {
    const raw = localStorage.getItem(storageKey(slug))
    return raw ? (JSON.parse(raw) as RollingMessage[]) : []
  } catch {
    return []
  }
}

function write(slug: string, all: RollingMessage[]): void {
  try {
    localStorage.setItem(storageKey(slug), JSON.stringify(all))
  } catch {
    /* 저장 실패는 조용히 넘긴다 — 읽기는 계속 동작해야 한다 */
  }
}

const byNewest = (a: RollingMessage, b: RollingMessage) => b.createdAt.localeCompare(a.createdAt)

/**
 * 벽 실시간(local) — **같은 브라우저 안에서만** 도는 신호 (`changed.ts` 와 같은 결).
 * 같은 탭은 리스너를 바로 부르고, 다른 탭은 BroadcastChannel 이 나른다.
 * (다른 기기까지는 Supabase 어댑터가 realtime 으로 한다.)
 */
const CHANNEL = 'tarot-pocket:rolling-changed'
const listeners = new Set<(slug: string) => void>()

function notify(slug: string): void {
  listeners.forEach((fn) => fn(slug))
  if (typeof BroadcastChannel !== 'undefined') {
    const ch = new BroadcastChannel(CHANNEL)
    ch.postMessage(slug)
    ch.close()
  }
}

export const localRolling: RollingRepo = {
  async list(slug) {
    return read(slug)
      .filter((m) => !m.hidden)
      .sort(byNewest)
  },
  async listAll(slug) {
    return read(slug).sort(byNewest)
  },
  async add(slug, msg) {
    const all = read(slug)
    all.push({
      id: crypto.randomUUID(),
      nickname: msg.nickname,
      body: msg.body,
      color: msg.color,
      sticker: msg.sticker,
      hidden: false,
      createdAt: new Date().toISOString(),
    })
    write(slug, all)
    notify(slug)
  },
  async setHidden(slug, id, hidden) {
    write(
      slug,
      read(slug).map((m) => (m.id === id ? { ...m, hidden } : m))
    )
    notify(slug)
  },
  async remove(slug, id) {
    write(
      slug,
      read(slug).filter((m) => m.id !== id)
    )
    notify(slug)
  },
  watch(slug, onChange) {
    const local = (changed: string) => {
      if (changed === slug) onChange()
    }
    listeners.add(local)
    let ch: BroadcastChannel | null = null
    if (typeof BroadcastChannel !== 'undefined') {
      ch = new BroadcastChannel(CHANNEL)
      ch.onmessage = (e: MessageEvent<string>) => {
        if (e.data === slug) onChange()
      }
    }
    return () => {
      listeners.delete(local)
      ch?.close()
    }
  },
}
