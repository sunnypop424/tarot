import { db } from './client'
import type { MyReward, StampCheckinResult, StampRepo, StampSettings } from './types'

/**
 * 방문 스탬프 어댑터.
 *
 * **local 짝을 만들지 않는다** (`ready()` = false). 코드 검증·보상 발급·수령 판정이 전부
 * 서버여야 의미가 있다 — 코드가 로컬에 있으면 개발자도구로 다 읽힌다.
 */

const toSettings = (r: {
  reward_mode: StampSettings['rewardMode']
  daily_reset: boolean
  closed: boolean
  entry_fields: StampSettings['entryFields']
  reward_label: string
}): StampSettings => ({
  rewardMode: r.reward_mode,
  dailyReset: r.daily_reset,
  closed: r.closed,
  entryFields: r.entry_fields,
  rewardLabel: r.reward_label,
})

const DEFAULTS: StampSettings = {
  rewardMode: 'none',
  dailyReset: false,
  closed: false,
  entryFields: { handle: true, contact: false, address: false },
  rewardLabel: '선물',
}

export const supabaseStamp: StampRepo = {
  ready: () => true,

  async settings(slug) {
    const { data, error } = await (await db())
      .from('stamp_settings')
      .select('reward_mode, daily_reset, closed, entry_fields, reward_label')
      .eq('slug', slug)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return data ? toSettings(data as never) : DEFAULTS
  },

  async saveSettings(slug, s) {
    const { error } = await (await db()).from('stamp_settings').upsert({
      slug,
      reward_mode: s.rewardMode,
      daily_reset: s.dailyReset,
      closed: s.closed,
      entry_fields: s.entryFields,
      reward_label: s.rewardLabel,
      updated_at: new Date().toISOString(),
    })
    if (error) throw new Error(error.message)
  },

  async mine(slug, subject) {
    const { data, error } = await (await db()).rpc('stamp_mine', { target: slug, subj: subject })
    if (error) throw new Error(error.message)
    const d = (data ?? {}) as { stampIds?: string[]; day?: string | null }
    return { stampIds: d.stampIds ?? [], day: d.day ?? null }
  },

  async checkin(slug, subject, code) {
    const { data, error } = await (await db()).rpc('stamp_checkin', {
      target: slug,
      subj: subject,
      raw_code: code,
    })
    // 서버가 이유를 문장으로 준다 ('암호가 맞지 않아요' 등) — 그대로 화면에 보여준다
    if (error) throw new Error(error.message)
    return data as StampCheckinResult
  },

  async codes(slug) {
    const { data, error } = await (await db())
      .from('stamp_codes')
      .select('stamp_id, code')
      .eq('slug', slug)
    if (error) throw new Error(error.message)
    return (data ?? []).map((r) => ({ stampId: r.stamp_id as string, code: r.code as string }))
  },

  async saveCode(slug, stampId, code) {
    const { error } = await (await db())
      .from('stamp_codes')
      .upsert({ slug, stamp_id: stampId, code, updated_at: new Date().toISOString() })
    if (error) throw new Error(error.message)
  },

  async report(slug) {
    const { data, error } = await (await db())
      .from('stamp_checkins')
      .select('stamp_id')
      .eq('slug', slug)
    if (error) throw new Error(error.message)
    const n = new Map<string, number>()
    for (const r of data ?? []) n.set(r.stamp_id as string, (n.get(r.stamp_id as string) ?? 0) + 1)
    return [...n].map(([stampId, count]) => ({ stampId, count }))
  },

  async myReward(slug, subject) {
    const { data, error } = await (await db()).rpc('reward_mine', {
      target: slug,
      src: 'stamp',
      subj: subject,
    })
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as {
      code: string
      label: string
      kind: 'guaranteed' | 'raffle'
      redeemed_at: string | null
      entered: boolean
      created_at: string
    }[]
    if (!rows.length) return null
    const r = rows[0]
    return {
      code: r.code,
      label: r.label,
      kind: r.kind,
      redeemedAt: r.redeemed_at,
      entered: r.entered,
      createdAt: r.created_at,
    } satisfies MyReward
  },

  async enter(slug, code, form) {
    const { error } = await (await db()).rpc('reward_enter', {
      target: slug,
      raw_code: code,
      nick: form.nickname,
      tw: form.handle ?? null,
      ct: form.contact ?? null,
      addr: form.address ?? null,
    })
    if (error) throw new Error(error.message)
  },
}

const nope = (): never => {
  throw new Error('스탬프는 Supabase 가 붙어야 동작해요')
}

export const localStamp: StampRepo = {
  ready: () => false,
  settings: nope,
  saveSettings: nope,
  mine: nope,
  checkin: nope,
  codes: nope,
  saveCode: nope,
  report: nope,
  myReward: nope,
  enter: nope,
}
