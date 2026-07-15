import {
  Sparkles,
  CalendarDays,
  MoonStar,
  Heart,
  Coins,
  Briefcase,
  Scale,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Aspect } from '@/types/card'
import type { PeriodUnit } from '@/lib/storage'
import { formatDateLabel, formatWeekLabel, formatMonthLabel } from '@/lib/date'

/**
 * 뽑기 카테고리 (PLANNING.md §2).
 * 오늘·주간·월간도 결국 "직접 뽑는" 같은 플로우라 카테고리로 통합했다.
 * 다른 점은 기간마다 한 번만 뽑을 수 있다는 것뿐 — period 필드가 그 잠금을 건다.
 * 아이콘은 Lucide 만 사용한다 — 이모지 금지 (DESIGN.md §4 Iconography).
 */
export interface Category {
  id: string
  label: string
  desc: string
  icon: LucideIcon
  /**
   * 장수별 포지션 라벨. 관리자가 1장/3장을 고를 수 있는 카테고리는 둘 다 정의한다.
   * 3장은 카드 텍스트가 "한 장짜리 완결 해석"으로 쓰여 있어 종합이 약하다 —
   * 제대로 된 종합은 AI 연동(M4) 후에 붙인다. 그래서 기본은 1장.
   */
  spreads: Record<number, string[]>
  /** 기본 뽑는 수 (관리자가 바꿀 수 있음) */
  defaultCount: number
  /** 해석에 사용할 관점 */
  aspect: Aspect
  /** 뽑기 화면 상단 안내 */
  prompt: string
  /** 값이 있으면 그 기간에 한 번만 뽑을 수 있다 */
  period?: PeriodUnit
  /** 지금이 어느 기간인지 — "2026년 7월 15일 수요일", "7월 13일 ~ 7월 19일" 등.
   *  세 기간 모두 같은 자리에 나와야 세그먼트를 오갈 때 버튼이 움직이지 않는다 */
  periodLabel?: () => string
  /** 기간 잠금 안내 — period 가 있을 때만 */
  renews?: string
  /** 다 뽑은 뒤 보여줄 문구 */
  locked?: string
}

export const CATEGORIES: Category[] = [
  {
    id: 'today',
    label: '오늘',
    desc: '하루 한 장의 메시지',
    icon: Sparkles,
    spreads: { 1: ['오늘의 메시지'] },
    defaultCount: 1,
    aspect: 'general',
    prompt: '오늘 하루를 떠올리며 카드를 골라보세요.',
    period: 'day',
    periodLabel: () => formatDateLabel(),
    renews: '매일 자정에 새로워져요',
    locked: '내일 다시 만나요',
  },
  {
    id: 'weekly',
    label: '주간',
    desc: '이번 주의 흐름',
    icon: CalendarDays,
    spreads: { 1: ['이번 주의 흐름'] },
    defaultCount: 1,
    aspect: 'general',
    prompt: '이번 주를 떠올리며 카드를 골라보세요.',
    period: 'week',
    periodLabel: () => formatWeekLabel(),
    renews: '매주 월요일에 새로워져요',
    locked: '다음 주에 다시 만나요',
  },
  {
    id: 'monthly',
    label: '월간',
    desc: '이달의 키워드',
    icon: MoonStar,
    spreads: { 1: ['이달의 키워드'] },
    defaultCount: 1,
    aspect: 'general',
    prompt: '이번 달을 떠올리며 카드를 골라보세요.',
    period: 'month',
    periodLabel: () => formatMonthLabel(),
    renews: '매월 1일에 새로워져요',
    locked: '다음 달에 다시 만나요',
  },
  {
    id: 'love',
    label: '애정운',
    desc: '그 사람의 마음이 궁금할 때',
    icon: Heart,
    spreads: {
      1: ['관계의 흐름'],
      3: ['나의 마음', '상대의 마음', '관계의 흐름'],
    },
    defaultCount: 1,
    aspect: 'love',
    prompt: '마음속 상대를 떠올려 보세요.',
  },
  {
    id: 'money',
    label: '금전운',
    desc: '돈의 흐름 살펴보기',
    icon: Coins,
    spreads: {
      1: ['돈의 흐름'],
      3: ['현재 상황', '장애물', '조언'],
    },
    defaultCount: 1,
    aspect: 'money',
    prompt: '돈에 관한 고민을 떠올려 보세요.',
  },
  {
    id: 'career',
    label: '직업·학업운',
    desc: '지금 이 길이 맞을까',
    icon: Briefcase,
    spreads: {
      1: ['지금 이 길'],
      3: ['현재 위치', '다가올 가능성', '조언'],
    },
    defaultCount: 1,
    aspect: 'career',
    prompt: '지금 걷고 있는 길을 떠올려 보세요.',
  },
  {
    id: 'yesno',
    label: '예 / 아니오',
    desc: '가장 단순한 답',
    icon: Scale,
    spreads: { 1: ['답'] },
    defaultCount: 1,
    aspect: 'general',
    prompt: '예 또는 아니오로 답할 수 있는 질문을 떠올려 보세요.',
  },
]

export function getCategory(id: string): Category | undefined {
  return CATEGORIES.find((c) => c.id === id)
}

/** 관리자가 고른 장수의 포지션 라벨. 설정이 없거나 어긋나면 기본 장수로 되돌린다 */
export function positionsFor(category: Category, count = category.defaultCount): string[] {
  return category.spreads[count] ?? category.spreads[category.defaultCount]
}

/** 기간 운세 탭의 세그먼트 — 오늘·주간·월간 */
export const PERIOD_CATEGORIES = CATEGORIES.filter((c) => c.period)

/** 운세 탭 그리드 — 주제별만 (기간 운세는 홈에) */
export const TOPIC_CATEGORIES = CATEGORIES.filter((c) => !c.period)
