import { db } from './client'
import type { MyVote, Poll, PollOption, PollRepo } from './types'

/**
 * 실시간 투표 어댑터.
 *
 * **local 짝을 만들지 않는다** (`ready()` = false, 전부 던진다). 럭키드로우와 같은 이유다:
 * 집계 원자성과 여러 기기 실시간이 이 서비스의 값어치 전부라, localStorage 로 흉내내면
 * "혼자만의 투표" 가 된다 — 로컬에선 되는데 현장에서 터지는 거짓말이다.
 */

/** DB 행 ↔ 도메인. snake↔camel 매핑은 이 파일 안에만 둔다 (repo 규약) */
interface PollRow {
  id: string
  title: string
  kind: 'single' | 'multi'
  max_pick: number
  closed: boolean
  hidden: boolean
  order: number
  title_i18n: Record<string, string> | null
  poll_options: {
    id: string
    order: number
    label: string
    label_i18n: Record<string, string> | null
    image: string | null
    votes: number
  }[]
}

const toPoll = (r: PollRow): Poll => ({
  id: r.id,
  title: r.title,
  /** 주최자가 언어별로 적은 제목 — 없으면 title (`0046_content_i18n.sql`) */
  titleI18n: r.title_i18n ?? null,
  kind: r.kind,
  maxPick: r.max_pick,
  closed: r.closed,
  hidden: r.hidden,
  order: r.order,
  options: [...(r.poll_options ?? [])]
    .sort((a, b) => a.order - b.order)
    .map<PollOption>((o) => ({
      id: o.id,
      order: o.order,
      label: o.label,
      labelI18n: o.label_i18n ?? null,
      image: o.image ?? undefined,
      votes: o.votes,
    })),
})

const SELECT = 'id, title, kind, max_pick, closed, hidden, order:"order", poll_options(id, order:"order", label, image, votes)'

async function read(slug: string, includeHidden: boolean): Promise<Poll[]> {
  let q = (await db()).from('poll_polls').select(SELECT).eq('slug', slug)
  // 방문자에겐 준비 중인 설문이 안 보인다 (RLS 도 같은 조건이지만 굳이 받아오지 않는다)
  if (!includeHidden) q = q.eq('hidden', false)
  const { data, error } = await q.order('order')
  if (error) throw new Error(error.message)
  return (data as unknown as PollRow[]).map(toPoll)
}

export const supabasePoll: PollRepo = {
  ready: () => true,

  list: (slug) => read(slug, false),
  listAll: (slug) => read(slug, true),

  async savePoll(slug, poll) {
    const client = await db()
    const { error } = await client.from('poll_polls').upsert({
      id: poll.id,
      slug,
      title: poll.title,
      title_i18n: poll.titleI18n ?? null,
      kind: poll.kind,
      max_pick: poll.maxPick,
      closed: poll.closed,
      hidden: poll.hidden,
      order: poll.order,
    })
    if (error) throw new Error(error.message)

    /**
     * 선택지는 **지우고 다시 넣지 않는다.** 지우면 `poll_votes` 가 `on delete cascade` 로
     * 같이 사라져 **이미 받은 표가 날아간다** — 주최자가 오타 하나 고치다 집계를 잃는다.
     * upsert 로 덮고, 화면에서 뺀 것만 골라 지운다.
     */
    const { error: upErr } = await client.from('poll_options').upsert(
      poll.options.map((o) => ({
        id: o.id,
        poll_id: poll.id,
        order: o.order,
        label: o.label,
        label_i18n: o.labelI18n ?? null,
        image: o.image ?? null,
      }))
    )
    if (upErr) throw new Error(upErr.message)

    const keep = poll.options.map((o) => o.id)
    const { error: delErr } = await client
      .from('poll_options')
      .delete()
      .eq('poll_id', poll.id)
      // 남길 게 하나도 없으면 조건이 비어 전부 지워지므로 불가능한 id 를 넣는다
      .not('id', 'in', `(${(keep.length ? keep : ['00000000-0000-0000-0000-000000000000']).join(',')})`)
    if (delErr) throw new Error(delErr.message)
  },

  async removePoll(slug, id) {
    const { error } = await (await db()).from('poll_polls').delete().eq('id', id).eq('slug', slug)
    if (error) throw new Error(error.message)
  },

  async mine(slug, subject) {
    const { data, error } = await (await db()).rpc('poll_mine', { target: slug, subj: subject })
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as { poll_id: string; option_id: string; created_at: string }[]
    const byPoll = new Map<string, MyVote>()
    for (const r of rows) {
      const hit = byPoll.get(r.poll_id)
      if (hit) hit.optionIds.push(r.option_id)
      else byPoll.set(r.poll_id, { pollId: r.poll_id, optionIds: [r.option_id], at: r.created_at })
    }
    return [...byPoll.values()]
  },

  async vote(slug, pollId, optionIds, subject) {
    const { error } = await (await db()).rpc('cast_vote', {
      target: slug,
      poll: pollId,
      options: optionIds,
      subj: subject,
    })
    // 서버가 이유를 문장으로 준다 ('이미 투표하셨어요' 등) — 그대로 화면에 보여준다
    if (error) throw new Error(error.message)
    // 집계가 함께 오지만 화면은 목록 전체를 다시 그리므로 새로 읽는 게 단순하다
    return read(slug, false)
  },

  watch(slug, onChange) {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    /**
     * **디바운스가 필수다.** 집계 행이 바뀔 때마다 이벤트가 오는데, 인기 설문은 초당 수십 표가
     * 들어온다 — 그대로 받으면 리로드 폭풍이 된다. 롤페·럭드엔 없던 문제다(이벤트 빈도가 낮다).
     */
    const bump = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        if (!cancelled) onChange()
      }, 500)
    }

    const channel = db().then((client) => {
      if (cancelled) return null
      const ch = client
        .channel(`poll:${slug}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_options' }, bump)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_polls', filter: `slug=eq.${slug}` }, bump)
        .subscribe()
      return ch
    })

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      void channel.then((ch) => ch?.unsubscribe())
    }
  },
}

/** 로컬에선 성립하지 않는다 — 화면이 `ready()` 를 보고 통째로 접는다 */
const nope = (): never => {
  throw new Error('투표는 Supabase 가 붙어야 동작해요')
}

export const localPoll: PollRepo = {
  ready: () => false,
  list: nope,
  listAll: nope,
  savePoll: nope,
  removePoll: nope,
  mine: nope,
  vote: nope,
  watch: () => () => {},
}
