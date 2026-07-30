import { db } from './client'
import type { RollingMessage, RollingRepo } from './types'

/**
 * 금칙어 비교 규칙 — **`normalize_for_ban` (0041 §1) 과 같아야 한다.**
 *
 * 공백·문장부호를 걷어내고 소문자로 맞춘다. 'ㅅ ㅂ' 처럼 한 칸만 띄워도 통과하는 걸 막기
 * 위해서다. 여기서 더 나가면(자모 분해·유사글자 치환) 오탐이 늘기 시작하는데, 정상적인 응원
 * 글이 막히는 게 욕 하나가 지나가는 것보다 나쁘다.
 *
 * 클라이언트에도 두는 이유는 **local 어댑터 때문**이다 — Supabase 없는 빌드엔 트리거가 없다.
 * Supabase 빌드에서는 이 함수를 안 쓴다(서버가 판정한다).
 */
export function normalizeForBan(src: string): string {
  return (src ?? '')
    .toLowerCase()
    .replace(/[\s!-/:-@[-`{-~]/g, '')
}

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
    font: (row.font as string) ?? '',
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
      font: msg.font,
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
   * 이 슬롯이 더한 단어만 — **전역 기본 목록은 안 온다.**
   * RLS 가 그렇게 잡혀 있고(주최자는 `slug is not null` 인 자기 행만), 화면도 그걸 전제로
   * "기본 목록은 이미 걸려 있어요" 라고만 말한다.
   */
  async bannedWords(slug) {
    const { data, error } = await (await db())
      .from('banned_words')
      .select('word')
      .eq('slug', slug)
      .order('created_at', { ascending: true })
    if (error) throw new Error(error.message)
    return (data ?? []).map((r) => r.word as string)
  },

  async addBannedWord(slug, word) {
    const { error } = await (await db()).from('banned_words').insert({ slug, word })
    if (error) throw new Error(error.message)
  },

  async removeBannedWord(slug, word) {
    const { error } = await (await db())
      .from('banned_words')
      .delete()
      .eq('slug', slug)
      .eq('word', word)
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
 * local 금칙어 — 슬롯별 목록만 든다.
 * **기본(전역) 목록은 안 심는다** — 그건 DB 가 갖고 있고(0041 §4), 여기 사본을 두면
 * 두 곳이 갈라진다. local 어댑터는 개발용이라 주최자가 넣은 단어만 지키면 충분하다.
 */
const bannedKey = (slug: string) => `tarot-pocket:banned:${slug}`

function localBanned(slug: string): string[] {
  try {
    const raw = localStorage.getItem(bannedKey(slug))
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

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
    /**
     * **local 에도 금칙어를 건다.** 여기 트리거가 없으므로(0041 은 DB 것이다) 안 걸면
     * 개발 빌드에서만 통과하는 글이 생기고, 그러면 화면의 오류 처리를 아무도 못 본다.
     * 서버와 같은 문장으로 던진다 — 화면은 어느 어댑터인지 몰라야 한다.
     */
    const words = localBanned(slug)
    if (words.length > 0) {
      const haystack = `${normalizeForBan(msg.body)} ${normalizeForBan(msg.nickname)}`
      const hit = words.some((w) => {
        const n = normalizeForBan(w)
        return n !== '' && haystack.includes(n)
      })
      if (hit) throw new Error('이 표현은 남길 수 없어요')
    }

    const all = read(slug)
    all.push({
      id: crypto.randomUUID(),
      nickname: msg.nickname,
      body: msg.body,
      color: msg.color,
      font: msg.font,
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
  async bannedWords(slug) {
    return localBanned(slug)
  },
  async addBannedWord(slug, word) {
    const next = [...localBanned(slug).filter((w) => w !== word), word]
    localStorage.setItem(bannedKey(slug), JSON.stringify(next))
  },
  async removeBannedWord(slug, word) {
    const next = localBanned(slug).filter((w) => w !== word)
    localStorage.setItem(bannedKey(slug), JSON.stringify(next))
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
