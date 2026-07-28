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
}

interface Row {
  bubbles: number
  ratio: string
  interval_sec: number
  show_name: boolean
  per_person: number
  max_length: number
  closed: boolean
}

const toSettings = (r: Row): CheerSettings => ({
  bubbles: r.bubbles,
  ratio: r.ratio,
  intervalSec: r.interval_sec,
  showName: r.show_name,
  perPerson: r.per_person,
  maxLength: r.max_length,
  closed: r.closed,
})

export const supabaseCheer: CheerRepo = {
  ready: () => true,

  async settings(slug) {
    const { data, error } = await (await db())
      .from('cheer_settings')
      .select('bubbles, ratio, interval_sec, show_name, per_person, max_length, closed')
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
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'slug' }
      )
    if (error) throw new Error(error.message)
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
}
