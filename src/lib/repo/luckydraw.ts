import { db, hasSupabase } from './client'
import type {
  DrawResult,
  LuckydrawRepo,
  LuckydrawSettings,
  Prize,
  PrizeReport,
  ShippingEntry,
} from './types'

/**
 * 럭키드로우 어댑터 — Supabase 전용이다.
 *
 * 다른 저장소는 local 짝이 있지만 여기엔 없다: 럭키드로우는 **여러 기기가 같은 재고를
 * 원자적으로 나눠 갖는 것**이 값어치의 전부라, 브라우저 저장소로는 흉내조차 성립하지 않는다
 * (태블릿 두 대가 재고를 공유하지 못하면 이중 당첨이 난다).
 * 그래서 `localLuckydraw` 는 전부 던지고 `ready()` 가 false 다 — 화면이 그걸 보고 접는다.
 */

/** DB 는 snake_case, 화면은 camelCase — 매핑은 이 파일에만 있다 */
function toPrize(row: Record<string, unknown>): Prize {
  return {
    id: row.id as string,
    rank: row.rank as number,
    name: (row.name as string) ?? '',
    remaining: (row.remaining as number) ?? 0,
    requiresShipping: row.requires_shipping === true,
    batchCapRatio: row.batch_cap_ratio == null ? null : Number(row.batch_cap_ratio),
  }
}

const DEFAULT_SETTINGS: LuckydrawSettings = {
  displayMode: 'both',
  locked: false,
  closed: false,
  // 기본이 리허설이다 — 전날 시연에서 실수로 재고를 태우는 사고가 훨씬 비싸다
  rehearsal: true,
  batchCapEnabled: false,
}

export const supabaseLuckydraw: LuckydrawRepo = {
  ready: () => hasSupabase,

  async listPrizes(slug) {
    const { data, error } = await (await db())
      .from('prizes')
      .select('*')
      .eq('slug', slug)
      .order('rank')
    if (error) throw new Error(error.message)
    return (data ?? []).map(toPrize)
  },

  /** 소진 집계는 서버가 센다 — 로그 수천 줄을 브라우저로 끌어와 더할 이유가 없다 */
  async report(slug) {
    const { data, error } = await (await db()).rpc('luckydraw_report', { target: slug })
    if (error) throw new Error(error.message)
    return (data ?? []) as PrizeReport[]
  },

  /**
   * 상품 표 저장 — **행 순서가 곧 등수다.**
   *
   * 화면에서 사라진 상품은 지운다. 지우면 draw_logs 의 prize_id 는 null 이 되지만
   * 상품명 스냅샷이 남아 있어 지난 리포트는 그대로 읽힌다 (`0007_luckydraw.sql`).
   */
  async savePrizes(slug, prizes) {
    const client = await db()
    const rows = prizes.map((p, i) => ({
      id: p.id,
      slug,
      rank: i + 1,
      name: p.name,
      remaining: Math.max(0, Math.floor(p.remaining) || 0),
      requires_shipping: p.requiresShipping,
      batch_cap_ratio: p.batchCapRatio ?? null,
    }))

    /**
     * 사라진 상품을 지운다 — **id 목록을 필터 문자열로 조립하지 않는다.**
     * `.not('id','in','(...)')` 는 값을 직접 이어 붙이는 자리라 이스케이프가 어긋나면
     * 조용히 아무것도 안 지우거나 엉뚱한 걸 지운다. 남은 id 를 읽어와 JS 에서 차집합을 내고
     * `.in()` 으로 지우면 그 조립이 사라진다.
     */
    const { data: existing, error: readError } = await client
      .from('prizes')
      .select('id')
      .eq('slug', slug)
    if (readError) throw new Error(readError.message)

    const keep = new Set(rows.map((r) => r.id))
    const drop = (existing ?? []).map((r) => r.id as string).filter((id) => !keep.has(id))
    if (drop.length) {
      const { error } = await client.from('prizes').delete().eq('slug', slug).in('id', drop)
      if (error) throw new Error(error.message)
    }

    if (rows.length) {
      const { error } = await client.from('prizes').upsert(rows)
      if (error) throw new Error(error.message)
    }
  },

  async getSettings(slug) {
    const { data, error } = await (await db())
      .from('luckydraw_settings')
      .select('*')
      .eq('slug', slug)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return { ...DEFAULT_SETTINGS }
    return {
      displayMode: (data.display_mode as LuckydrawSettings['displayMode']) ?? 'both',
      locked: data.locked === true,
      closed: data.closed === true,
      rehearsal: data.rehearsal === true,
      batchCapEnabled: data.batch_cap_enabled === true,
    }
  },

  async saveSettings(slug, settings) {
    const { error } = await (await db()).from('luckydraw_settings').upsert({
      slug,
      display_mode: settings.displayMode,
      locked: settings.locked,
      closed: settings.closed,
      rehearsal: settings.rehearsal,
      batch_cap_enabled: settings.batchCapEnabled,
    })
    if (error) throw new Error(error.message)
  },

  /**
   * 추첨 — 서버 함수 한 발. 재고 검사·차감·기록이 그 안에서 원자적으로 일어난다.
   * 실패 메시지는 서버가 한국어로 준다 (마감·재고 부족·권한 없음) — 그대로 보여주면 된다.
   */
  async draw(slug, count) {
    const { data, error } = await (await db()).rpc('draw_prizes', {
      target: slug,
      draw_count: count,
    })
    if (error) throw new Error(error.message)
    return data as DrawResult
  },

  /**
   * 배송 정보 — 방문자가 **넣을 수만** 있다 (RLS). 넣은 본인도 다시 못 읽는다.
   * 읽을 수 있으면 그 슬롯 당첨자 전원의 이름·연락처·주소가 anon 키로 긁힌다.
   */
  async submitShipping(slug, entry) {
    const { error } = await (await db()).from('shipping_entries').insert({
      slug,
      name: entry.name,
      phone: entry.phone,
      address: entry.address,
      prizes: entry.prizes,
    })
    if (error) throw new Error(error.message)
  },

  async listShipping(slug) {
    const { data, error } = await (await db())
      .from('shipping_entries')
      .select('*')
      .eq('slug', slug)
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return (data ?? []).map((row) => ({
      id: row.id as string,
      name: row.name as string,
      phone: row.phone as string,
      address: row.address as string,
      prizes: (row.prizes ?? []) as ShippingEntry['prizes'],
      createdAt: row.created_at as string,
    }))
  },

  /** 배송이 끝나면 **지우는 게 맞다** — 남겨둘 이유가 없는 개인정보다 */
  async clearShipping(slug) {
    const { error } = await (await db()).from('shipping_entries').delete().eq('slug', slug)
    if (error) throw new Error(error.message)
  },
}

/**
 * Supabase 가 없으면 **흉내 내지 않는다** (`OrganizersRepo` 와 같은 이유).
 * 여기서 localStorage 로 재고를 굴리면 기기마다 재고가 따로 놀아, 로컬에선 멀쩡한데
 * 현장에서 이중 당첨이 나는 상태가 된다. 차라리 못 한다고 말하는 게 낫다.
 */
const unavailable = () => {
  throw new Error('Supabase 를 붙여야 럭키드로우를 쓸 수 있어요')
}

export const localLuckydraw: LuckydrawRepo = {
  ready: () => false,
  async listPrizes() {
    return []
  },
  async report() {
    return []
  },
  async savePrizes() {
    unavailable()
  },
  async getSettings() {
    return { ...DEFAULT_SETTINGS }
  },
  async saveSettings() {
    unavailable()
  },
  async draw(): Promise<DrawResult> {
    return unavailable()
  },
  async submitShipping() {
    unavailable()
  },
  async listShipping() {
    return []
  },
  async clearShipping() {
    unavailable()
  },
}
