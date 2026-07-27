import { db } from './client'
import type { RewardEntry, RewardsRepo } from './types'

/**
 * 공용 보상 — **주최자 쪽 어댑터** (0019).
 *
 * 스탬프·모의고사·포토카드가 같은 테이블을 쓰고 `source` 로만 갈린다. 그래서 이 파일에는
 * 서비스 이름이 하나도 안 나온다 — 부르는 쪽이 `source` 를 준다.
 *
 * **`local` 짝을 만들지 않는다** (`ready()` = false). 추첨을 로컬에서 돌리면 그건 추첨이
 * 아니라 그 폰의 장난이다.
 */

/** `rewards` + `reward_entries` 조인 결과 한 줄 */
interface Row {
  id: string
  code: string
  label: string
  score: number | null
  won: boolean
  picked_round: number | null
  created_at: string
  reward_entries: {
    nickname: string
    handle: string | null
    contact: string | null
    address: string | null
  } | null
}

const toEntry = (r: Row): RewardEntry => ({
  rewardId: r.id,
  code: r.code,
  label: r.label,
  nickname: r.reward_entries?.nickname ?? '',
  handle: r.reward_entries?.handle ?? null,
  contact: r.reward_entries?.contact ?? null,
  address: r.reward_entries?.address ?? null,
  score: r.score,
  won: r.won,
  pickedRound: r.picked_round,
  createdAt: r.created_at,
})

export const supabaseRewards: RewardsRepo = {
  ready: () => true,

  async entries(slug, source) {
    const { data, error } = await (await db())
      .from('rewards')
      .select(
        'id, code, label, score, won, picked_round, created_at, reward_entries(nickname, handle, contact, address)'
      )
      .eq('slug', slug)
      .eq('source', source)
      .eq('kind', 'raffle')
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    // 응모를 안 낸 행(reward_entries 가 없는)은 후보가 아니라 명단에도 안 넣는다
    return (data as unknown as Row[]).filter((r) => r.reward_entries).map(toEntry)
  },

  async pick(slug, source, count, method) {
    const { data, error } = await (await db()).rpc('reward_pick', {
      target: slug,
      src: source,
      cnt: count,
      method,
    })
    if (error) throw new Error(error.message)
    /*
     * `reward_pick` 은 `setof rewards` 라 응모 정보가 안 붙어 온다 — 발표에 필요한 건
     * 닉네임·트위터 아이디라서 뽑힌 id 로 한 번 더 읽는다. 뽑는 인원이 수백이라 왕복 한 번은 싸다.
     */
    const ids = (data as { id: string }[]).map((r) => r.id)
    if (!ids.length) return []
    const { data: full, error: e2 } = await (await db())
      .from('rewards')
      .select(
        'id, code, label, score, won, picked_round, created_at, reward_entries(nickname, handle, contact, address)'
      )
      .in('id', ids)
      .order('score', { ascending: false, nullsFirst: false })
    if (e2) throw new Error(e2.message)
    return (full as unknown as Row[]).map(toEntry)
  },

  async unpick(slug, source, round) {
    const { data, error } = await (await db()).rpc('reward_unpick', {
      target: slug,
      src: source,
      rnd: round,
    })
    if (error) throw new Error(error.message)
    return (data as number) ?? 0
  },
}

const nope = (): never => {
  throw new Error('추첨은 Supabase 가 붙어야 동작해요')
}

export const localRewards: RewardsRepo = {
  ready: () => false,
  entries: nope,
  pick: nope,
  unpick: nope,
}
