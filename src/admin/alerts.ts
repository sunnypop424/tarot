import { repo } from '@/lib/repo'
import { exportDeadline, graceDays } from '@/data/slots'
import { slotStatus } from '@/owner/period'
import type { ServiceId } from '@/data/services'
import type { Slot } from '@/types/slot'

/**
 * 주최자 알림 — **행사장에서 사고를 알아채는 장치.**
 *
 * 지금까지 재고 소진도, 안 받아간 선물도, 자료를 꺼낼 기한도 전부 **화면을 열어봐야** 알았다.
 * 대시보드에만 두면 문항을 고치는 중에는 안 보이므로, 이건 **관리 셸 전체**에 뜬다
 * (`AdminLayout` 이 읽어 모든 화면 위에 얹는다).
 *
 * 규칙 셋:
 *
 *  1. **이미 있는 조회만 쓴다.** 알림용 RPC 를 새로 파면 같은 숫자를 두 곳에서 세게 되고,
 *     한쪽만 고치는 날이 온다 (대시보드가 같은 판단을 이미 하고 있다).
 *  2. **조용히 실패한다.** 알림을 못 읽었다고 관리 화면이 막히면 안 된다 — 못 읽은 항목은
 *     그냥 빠진다. "알림이 없다" 와 "못 읽었다" 를 구분해 보여줄 만큼 중요한 자리가 아니다.
 *  3. **적게 띄운다.** 늘 떠 있는 알림은 배경이 된다. 여기 있는 건 전부 **오늘 손을 대야
 *     하는 것**이고, 정상 상태에서는 하나도 안 뜬다.
 *
 * **푸시 알림이 아니다.** 서비스워커가 없어(`slot/pwa.ts` — '홈 화면 추가'만 한다) 화면을
 * 안 열면 여전히 모른다. 이건 "열어둔 사람이 놓치지 않게" 까지다.
 */

export interface Alert {
  /** 화면 키 겸 중복 제거용 */
  id: string
  /** urgent: 지금 손대야 한다 · warn: 오늘 안에 · info: 알고만 있으면 된다 */
  level: 'urgent' | 'warn' | 'info'
  text: string
  /** 누르면 갈 곳 — `/{slug}/admin/` 뒤에 붙는 조각. 없으면 링크 없이 문장만 */
  to?: string
}

const n = (v: number) => v.toLocaleString('ko-KR')

/** 재고가 이 수 아래로 남으면 알린다 — 대시보드 막대의 '20% 아래' 와 다른 축(절대 수)이다 */
const LOW_STOCK = 10

/**
 * 공통 — **자료를 꺼낼 기한.**
 *
 * 놓치면 되돌릴 수 없는 유일한 알림이다: 기한이 지나면 슬롯째 지워져 다시 꺼낼 방법이 없다.
 * 그래서 다른 알림과 달리 **종료 뒤에는 매일 뜬다** — 한 번 보고 넘긴 뒤 잊는 게 이 자리에서
 * 제일 흔한 사고다.
 */
function periodAlerts(slot: Slot, service: ServiceId): Alert[] {
  const deadline = exportDeadline(slot, service)
  if (!deadline) return []
  const grace = graceDays(service)
  const expired = slotStatus(slot) === 'expired'

  if (deadline.over)
    return [
      {
        id: 'export-over',
        level: 'urgent',
        text: '자료를 꺼낼 수 있는 기한이 지났어요. 남은 기록은 곧 파기돼요.',
      },
    ]

  // 종료 전에는 마지막 사흘부터, 종료 뒤에는 늘 말한다 (그때부터는 매일이 마지막에 가깝다)
  if (!expired && deadline.left > 3) return []

  const when = deadline.left === 0 ? '오늘까지예요' : `${n(deadline.left)}일 남았어요`
  return [
    {
      id: 'export-due',
      level: deadline.left <= 1 ? 'urgent' : 'warn',
      text: `자료를 꺼낼 수 있는 날이 ${when} (종료 +${grace}일). 대시보드에서 내보내 주세요.`,
    },
  ]
}

/** 확정 선물 중 아직 안 받아간 것 — 스탬프·모의고사가 같은 공용 보상을 쓴다 */
async function unredeemed(slug: string, source: ServiceId): Promise<Alert[]> {
  if (!repo.rewards.ready()) return []
  const issued = await repo.rewards.issued(slug, source)
  const left = issued.filter((r) => r.kind === 'guaranteed' && !r.redeemedAt).length
  return left === 0
    ? []
    : [
        {
          id: 'unredeemed',
          level: 'info',
          text: `아직 안 받아간 선물이 ${n(left)}건 있어요.`,
          to: 'redeem',
        },
      ]
}

/**
 * 서비스별 — **`Record<ServiceId, …>` 라 서비스가 늘면 여기가 컴파일 에러로 터진다.**
 * "새 서비스에 알림을 안 붙였다" 를 조용히 지나가지 않게 (`readiness.ts` 와 같은 장치).
 */
const BY_SERVICE: Record<ServiceId, (slug: string) => Promise<Alert[]>> = {
  async tarot() {
    return []
  },
  async luckydraw(slug) {
    if (!repo.luckydraw.ready()) return []
    const [prizes, settings] = await Promise.all([
      repo.luckydraw.listPrizes(slug),
      repo.luckydraw.getSettings(slug).catch(() => null),
    ])
    const left = prizes.reduce((a, p) => a + p.remaining, 0)
    const out: Alert[] = []
    /**
     * **리허설이 제일 위에 온다.** 기본이 켜짐이라(실수로 재고를 태우는 게 더 비싸다) 끄는 걸
     * 잊은 채 하루가 지나면 그날 나간 경품이 통째로 기록에 안 남는다 — 재고와 실물이 어긋난다.
     */
    if (settings?.rehearsal)
      out.push({
        id: 'rehearsal',
        level: 'urgent',
        text: '리허설이 켜져 있어요 — 뽑아도 재고가 줄지 않고 기록에도 안 남아요.',
        to: 'overview',
      })
    if (prizes.length > 0 && left === 0)
      out.push({ id: 'stock-out', level: 'urgent', text: '경품이 전부 소진됐어요.', to: 'overview' })
    else if (left > 0 && left <= LOW_STOCK)
      out.push({
        id: 'stock-low',
        level: 'warn',
        text: `남은 경품이 ${n(left)}개예요.`,
        to: 'overview',
      })
    return out
  },
  // 벽은 방문자가 채운다 — 주최자가 손대야 할 상태라는 게 없다 (검수는 상시 작업이지 알림이 아니다)
  async rolling() {
    return []
  },
  async wish() {
    return []
  },
  async cheer() {
    return []
  },
  // 서버에 아무것도 안 쌓인다 — 알릴 게 생기지 않는다
  async photozone() {
    return []
  },
  async poll() {
    return []
  },
  async stamp(slug) {
    return unredeemed(slug, 'stamp')
  },
  async quiz(slug) {
    return unredeemed(slug, 'quiz')
  },
  async photocard(slug) {
    if (!repo.photocard.ready()) return []
    const [rows, settings] = await Promise.all([
      repo.photocard.report(slug),
      repo.photocard.settings(slug).catch(() => null),
    ])
    const out: Alert[] = []
    if (settings?.rehearsal)
      out.push({
        id: 'rehearsal',
        level: 'urgent',
        text: '연습 모드가 켜져 있어요 — 뽑아도 재고가 줄지 않아요.',
        to: 'photocard',
      })
    /** 재고를 정한 카드만 본다 — `null` 은 무제한이라 소진이라는 개념이 없다 */
    const limited = rows.filter((r) => r.remaining !== null)
    const left = limited.reduce((a, r) => a + (r.remaining ?? 0), 0)
    if (limited.length > 0 && left === 0)
      out.push({
        id: 'stock-out',
        level: 'urgent',
        text: '한정 카드가 전부 소진됐어요.',
        to: 'photocard',
      })
    else if (limited.length > 0 && left <= LOW_STOCK)
      out.push({
        id: 'stock-low',
        level: 'warn',
        text: `남은 한정 카드가 ${n(left)}장이에요.`,
        to: 'photocard',
      })
    return out
  },
}

/** 급한 것부터 — 배너가 하나만 보일 때 무엇이 위에 와야 하나 */
const ORDER: Record<Alert['level'], number> = { urgent: 0, warn: 1, info: 2 }

export async function loadAlerts(slot: Slot, service: ServiceId): Promise<Alert[]> {
  const own = await BY_SERVICE[service](slot.slug).catch(() => [] as Alert[])
  return [...periodAlerts(slot, service), ...own].sort((a, b) => ORDER[a.level] - ORDER[b.level])
}
