import { db } from './client'
import type {
  Photocard,
  PhotocardDrawn,
  PhotocardLineupRow,
  PhotocardMine,
  PhotocardReportRow,
  PhotocardRepo,
  PhotocardSettings,
  PhotocardTicket,
  PhotocardTicketRow,
} from './types'

/**
 * 포토카드 뽑기 어댑터.
 *
 * **local 짝을 만들지 않는다** (`ready()` = false). 재고 차감·뽑기권 소각·확률이 전부
 * 서버여야 의미가 있다 — localStorage 에 두면 원하는 카드를 골라 넣을 수 있다.
 *
 * **`listCards` 는 주최자 전용이다.** 방문자에게는 카드 목록이 통째로 안 간다
 * (레어도와 재고가 보이면 확률이 노출된다) — 방문자용은 `mine` 이 개수만 준다.
 */

const DEFAULTS: PhotocardSettings = {
  mode: 'save',
  drawsPerVisitor: 1,
  batchCount: 10,
  batchCapEnabled: true,
  allowSave: false,
  closed: false,
  rehearsal: true,
  rarityCurve: 'gentle',
}

interface CardRow {
  id: string
  name: string
  name_i18n: Record<string, string> | null
  rarity: number
  image: string
  remaining: number | null
  batch_cap_ratio: number | null
  lucky: boolean
  order: number
}

const toCard = (r: CardRow): Photocard => ({
  id: r.id,
  name: r.name,
  /** 주최자가 언어별로 적은 카드 이름 — 없으면 name */
  nameI18n: r.name_i18n ?? null,
  rarity: r.rarity,
  image: r.image,
  remaining: r.remaining,
  batchCapRatio: r.batch_cap_ratio,
  lucky: r.lucky,
  order: r.order,
})

/** RPC 가 돌려주는 카드 한 장 */
const toDrawn = (c: { cardId: string; name: string; image: string; rarity: number }): PhotocardDrawn => ({
  cardId: c.cardId,
  name: c.name,
  image: c.image,
  rarity: c.rarity,
})

const toTicket = (d: {
  code: string
  status: 'open' | 'drawn'
  cardName: string | null
  cardImage: string | null
  issuedAt: string
}): PhotocardTicket => ({
  code: d.code,
  status: d.status,
  cardName: d.cardName,
  cardImage: d.cardImage,
  issuedAt: d.issuedAt,
})

export const supabasePhotocard: PhotocardRepo = {
  ready: () => true,

  async listCards(slug) {
    const { data, error } = await (await db())
      .from('photocards')
      .select('id, name, rarity, image, remaining, batch_cap_ratio, lucky, "order"')
      .eq('slug', slug)
      .order('order')
    if (error) throw new Error(error.message)
    return (data as unknown as CardRow[]).map(toCard)
  },

  async saveCard(slug, card) {
    const { error } = await (await db()).from('photocards').upsert({
      id: card.id,
      slug,
      name: card.name,
      name_i18n: card.nameI18n ?? null,
      rarity: card.rarity,
      image: card.image,
      remaining: card.remaining,
      batch_cap_ratio: card.batchCapRatio,
      lucky: card.lucky,
      order: card.order,
    })
    if (error) throw new Error(error.message)
  },

  async removeCard(slug, id) {
    const { error } = await (await db()).from('photocards').delete().eq('slug', slug).eq('id', id)
    if (error) throw new Error(error.message)
  },

  async settings(slug) {
    const { data, error } = await (await db())
      .from('photocard_settings')
      .select('mode, draws_per_visitor, batch_count, batch_cap_enabled, allow_save, closed, rehearsal, rarity_curve')
      .eq('slug', slug)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return DEFAULTS
    const r = data as never as {
      mode: PhotocardSettings['mode']
      draws_per_visitor: number
      batch_count: number
      batch_cap_enabled: boolean
      allow_save: boolean
      closed: boolean
      rehearsal: boolean
      rarity_curve: PhotocardSettings['rarityCurve'] | null
    }
    return {
      mode: r.mode,
      drawsPerVisitor: r.draws_per_visitor,
      batchCount: r.batch_count,
      batchCapEnabled: r.batch_cap_enabled,
      allowSave: r.allow_save,
      closed: r.closed,
      rehearsal: r.rehearsal,
      // 옛 행엔 컬럼이 없다 — 기본은 완만 (0045 의 default 와 같은 값)
      rarityCurve: r.rarity_curve ?? 'gentle',
    }
  },

  async saveSettings(slug, s) {
    const { error } = await (await db()).from('photocard_settings').upsert({
      slug,
      mode: s.mode,
      draws_per_visitor: s.drawsPerVisitor,
      batch_count: s.batchCount,
      batch_cap_enabled: s.batchCapEnabled,
      allow_save: s.allowSave,
      closed: s.closed,
      rehearsal: s.rehearsal,
      rarity_curve: s.rarityCurve,
      updated_at: new Date().toISOString(),
    })
    if (error) throw new Error(error.message)
  },

  async report(slug) {
    const db_ = await db()
    const [{ data: cards, error: e1 }, { data: draws, error: e2 }] = await Promise.all([
      db_.from('photocards').select('id, name, image, rarity, lucky, remaining, "order"').eq('slug', slug).order('order'),
      // 리허설 분은 빼고 센다 — 그게 리허설의 뜻이다 (재고도 안 깎였다)
      db_.from('photocard_draws').select('card_id').eq('slug', slug).eq('rehearsal', false),
    ])
    if (e1) throw new Error(e1.message)
    if (e2) throw new Error(e2.message)
    const n = new Map<string, number>()
    for (const d of (draws ?? []) as unknown as { card_id: string | null }[]) {
      if (d.card_id) n.set(d.card_id, (n.get(d.card_id) ?? 0) + 1)
    }
    return (
      (cards ?? []) as unknown as {
        id: string
        name: string
        image: string
        rarity: number
        lucky: boolean
        remaining: number | null
      }[]
    ).map(
      (c): PhotocardReportRow => ({
        cardId: c.id,
        name: c.name,
        image: c.image,
        rarity: c.rarity,
        lucky: c.lucky,
        drawn: n.get(c.id) ?? 0,
        remaining: c.remaining,
      })
    )
  },

  async lineup(slug) {
    const { data, error } = await (await db())
      .from('photocards')
      // **레어도를 안 읽는다** — 방문자가 같이 보는 화면으로 가는 값이라 확률이 새면 안 된다
      .select('id, name, image, lucky, remaining, "order"')
      .eq('slug', slug)
      .order('order')
    if (error) throw new Error(error.message)
    return (
      data as unknown as { id: string; name: string; image: string; lucky: boolean; remaining: number | null }[]
    ).map(
      (c): PhotocardLineupRow => ({
        id: c.id,
        name: c.name,
        image: c.image,
        lucky: c.lucky,
        soldOut: c.remaining === 0,
      })
    )
  },

  async drawSelf(slug, subject) {
    const { data, error } = await (await db()).rpc('photocard_draw_self', { target: slug, subj: subject })
    if (error) throw new Error(error.message)
    const d = data as { cards: { cardId: string; name: string; image: string; rarity: number }[] }
    return toDrawn(d.cards[0])
  },

  async mine(slug, subject) {
    const { data, error } = await (await db()).rpc('photocard_mine', { target: slug, subj: subject })
    if (error) throw new Error(error.message)
    return data as PhotocardMine
  },

  async issueTicket(slug, subject) {
    const { data, error } = await (await db()).rpc('photocard_issue_ticket', { target: slug, subj: subject })
    if (error) throw new Error(error.message)
    return toTicket(data as never)
  },

  async ticket(slug, code) {
    const { data, error } = await (await db()).rpc('photocard_ticket', { target: slug, raw_code: code })
    if (error) throw new Error(error.message)
    return data ? toTicket(data as never) : null
  },

  async drawByTicket(slug, code) {
    const { data, error } = await (await db()).rpc('photocard_draw_ticket', { target: slug, raw_code: code })
    if (error) throw new Error(error.message)
    return toDrawn((data as { card: never }).card)
  },

  async drawBatch(slug, count) {
    const { data, error } = await (await db()).rpc('photocard_draw_batch', { target: slug, cnt: count })
    if (error) throw new Error(error.message)
    const d = data as { cards: { cardId: string; name: string; image: string; rarity: number }[] }
    return d.cards.map(toDrawn)
  },

  async ticketStats(slug) {
    const db_ = await db()
    const [a, b] = await Promise.all([
      db_.from('photocard_tickets').select('id', { count: 'exact', head: true }).eq('slug', slug),
      db_
        .from('photocard_tickets')
        .select('id', { count: 'exact', head: true })
        .eq('slug', slug)
        .eq('status', 'drawn'),
    ])
    return { issued: a.count ?? 0, drawn: b.count ?? 0 }
  },

  async removeTicket(slug, code) {
    const { error } = await (await db())
      .from('photocard_tickets')
      .delete()
      .eq('slug', slug)
      .eq('code', code)
    if (error) throw new Error(error.message)
  },

  async listTickets(slug) {
    const { data, error } = await (await db())
      .from('photocard_tickets')
      .select('code, status, card_name, card_image, issued_at, drawn_at, photocards(rarity)')
      .eq('slug', slug)
      .order('issued_at', { ascending: false })
    if (error) throw new Error(error.message)
    return (
      data as unknown as {
        code: string
        status: 'open' | 'drawn'
        card_name: string | null
        card_image: string | null
        issued_at: string
        drawn_at: string | null
        photocards: { rarity: number } | null
      }[]
    ).map(
      (r): PhotocardTicketRow => ({
        code: r.code,
        status: r.status,
        cardName: r.card_name,
        cardImage: r.card_image,
        issuedAt: r.issued_at,
        drawnAt: r.drawn_at,
        // 카드를 나중에 지워도 이름은 티켓에 박아뒀다 — 레어도만 못 따라온다
        rarity: r.photocards?.rarity ?? null,
      })
    )
  },
}

const nope = (): never => {
  throw new Error('포토카드는 Supabase 가 붙어야 동작해요')
}

export const localPhotocard: PhotocardRepo = {
  ready: () => false,
  listCards: nope,
  saveCard: nope,
  removeCard: nope,
  settings: nope,
  saveSettings: nope,
  report: nope,
  lineup: nope,
  drawSelf: nope,
  mine: nope,
  issueTicket: nope,
  ticket: nope,
  drawByTicket: nope,
  drawBatch: nope,
  ticketStats: nope,
  listTickets: nope,
  removeTicket: nope,
}
