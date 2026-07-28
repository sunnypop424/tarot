import { db } from './client'
import type { CheerRepo, CheerSettings } from './types'

/**
 * 영상회 응원 — **운영값만 여기 있다.**
 *
 * 한마디 자체는 `repo.rolling` 이 다룬다 (같은 테이블 — 0029 주석). 그래서 이 어댑터에는
 * 목록도 쓰기도 없다: 있으면 두 경로가 생기고, 언젠가 한쪽만 고치게 된다.
 */

const DEFAULTS: CheerSettings = {
  bubbles: 6,
  ratio: '16:9',
  intervalSec: 6,
  showName: true,
  perPerson: 3,
  maxLength: 40,
  closed: false,
  showState: 'idle',
  startedAt: null,
  runtimeSec: 0,
}

interface Row {
  bubbles: number
  ratio: string
  interval_sec: number
  show_name: boolean
  per_person: number
  max_length: number
  closed: boolean
  show_state: CheerSettings['showState']
  started_at: string | null
  runtime_sec: number
}

const COLUMNS =
  'bubbles, ratio, interval_sec, show_name, per_person, max_length, closed, show_state, started_at, runtime_sec'

const toSettings = (r: Row): CheerSettings => ({
  bubbles: r.bubbles,
  ratio: r.ratio,
  intervalSec: r.interval_sec,
  showName: r.show_name,
  perPerson: r.per_person,
  maxLength: r.max_length,
  closed: r.closed,
  showState: r.show_state ?? 'idle',
  startedAt: r.started_at,
  runtimeSec: r.runtime_sec ?? 0,
})

export const supabaseCheer: CheerRepo = {
  ready: () => true,

  async settings(slug) {
    const { data, error } = await (await db())
      .from('cheer_settings')
      .select(COLUMNS)
      .eq('slug', slug)
      .maybeSingle()
    if (error) throw new Error(error.message)
    // 아직 저장한 적이 없으면 기본값 — 행이 없다고 화면이 비면 안 된다
    return data ? toSettings(data as unknown as Row) : DEFAULTS
  },

  async saveSettings(slug, s) {
    const { error } = await (await db())
      .from('cheer_settings')
      .upsert(
        {
          slug,
          bubbles: s.bubbles,
          ratio: s.ratio,
          interval_sec: s.intervalSec,
          show_name: s.showName,
          per_person: s.perPerson,
          max_length: s.maxLength,
          closed: s.closed,
          runtime_sec: s.runtimeSec,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'slug' }
      )
    if (error) throw new Error(error.message)
  },

  async setShow(slug, state) {
    /**
     * **`live` 로 갈 때만 시작 시각을 새로 박는다.** `hidden` 에서 돌아올 때도 새로 박으면
     * 경과 시간이 되감겨 자동 크레딧이 영영 안 온다 — 감추기는 '멈춤' 이 아니라 '가림' 이다.
     */
    const now = new Date().toISOString()
    const patch: Record<string, unknown> = { slug, show_state: state, updated_at: now }
    if (state === 'live') {
      const before = await this.settings(slug)
      if (before.showState !== 'hidden' || !before.startedAt) patch.started_at = now
    }
    if (state === 'idle') patch.started_at = null

    const { data, error } = await (await db())
      .from('cheer_settings')
      .upsert(patch, { onConflict: 'slug' })
      .select(COLUMNS)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return data ? toSettings(data as unknown as Row) : { ...DEFAULTS, showState: state }
  },

  watch(slug, onChange) {
    let channel: { unsubscribe: () => void } | null = null
    let cancelled = false
    void db().then((client) => {
      if (cancelled) return
      channel = client
        .channel(`cheer:${slug}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'cheer_settings', filter: `slug=eq.${slug}` },
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

/**
 * local 어댑터 — **기본값을 읽어주고 저장은 흉내만 낸다.**
 * 한마디는 `localRolling` 이 이미 로컬에 쌓으므로, 백엔드 없이도 화면은 돈다
 * (다만 다른 기기와 공유되지 않아 상영 화면의 의미가 없다 — 그건 개발용이다).
 */
export const localCheer: CheerRepo = {
  ready: () => false,
  async settings() {
    return DEFAULTS
  },
  async saveSettings() {
    /* 저장할 곳이 없다 — 화면은 초안을 그대로 들고 있는다 */
  },
  async setShow(_slug, state) {
    return { ...DEFAULTS, showState: state, startedAt: new Date().toISOString() }
  },
  watch() {
    return () => {}
  },
}
