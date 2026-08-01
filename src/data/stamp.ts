import { serviceTheme } from './serviceTheme'
import type { Slot } from '@/types/slot'
import type { FontId } from './fonts'
import type { DisplayI18n, I18nText } from './multilingual'

/**
 * 방문 스탬프 **겉모습** — 최고관리자가 슬롯 편집기에서 정한다.
 * 현장 암호·보상 방식 같은 **운영값은 주최자**가 `/{slug}/admin` 에서 정한다
 * (`stamp_settings` 테이블) — 럭드에서 상품표가 주최자 것인 것과 같은 경계다.
 */
export interface StampDisplay {
  /**
   * 주최자가 언어별로 적어 둔 값 — 키는 이 설정의 필드 이름이다.
   * `useLocalizedDisplay` 가 화면을 그리기 전에 갈아 끼운다 (`src/i18n/display.ts`).
   */
  i18n?: DisplayI18n

  title: string
  showTitle: boolean
  subtitle: string
  showSubtitle: boolean

  /**
   * 칸 정의 — 이 개수가 곧 판의 크기다. **서버도 이 값을 읽는다**
   * (`stamp_checkin` 이 완성 여부를 판단할 때) — 화면과 서버가 같은 수를 봐야 한다.
   */
  stamps: StampCell[]

  font: FontId
  headText: string
  subText: string
  buttonColor: string
  bg: string
  /** 찍힌 도장 색 */
  stampColor: string
  logo: string
  logoAlign: 'left' | 'center' | 'right'

  codeLabel: string
  codeHint: string
}

export interface StampCell {
  /** 코드와 이어지는 열쇠 — `stamp_codes.stamp_id` */
  id: string
  /** 칸 이름 — "1번 카페", "포토존 참여" */
  name: string
  /**
   * 언어별 칸 이름 — 없으면 `name`.
   *
   * **`display.i18n` 묶음에 못 넣는다.** 그 묶음은 `useLocalizedDisplay` 가 훑는
   * *평평한 문자열 필드*를 위한 것이고(`src/i18n/display.ts`), 칸은 배열 안의 객체다.
   * 그래서 칸마다 자기 사전을 든다.
   */
  nameI18n?: I18nText
  /**
   * 찍힌 도장 그림 (투명 PNG). 없으면 내장 아이콘(도장·별·하트)이 돌아가며 들어간다.
   *
   * **`background-image` 로 그린다** — 슬롯 자산이라 길게 눌러 저장되면 안 된다 (CLAUDE.md).
   * 도장색(`stampColor`)은 이 그림엔 안 먹는다: PNG 의 색이 그대로 나온다.
   */
  icon?: string
}

export const DEFAULT_STAMP: StampDisplay = {
  title: '방문 스탬프',
  showTitle: true,
  subtitle: '이벤트에 참여하고 받은 암호를 입력하면 도장이 찍혀요',
  showSubtitle: true,
  stamps: [],
  font: 'pretendard',
  /* 색은 비워 둔다 — 안 고르면 **슬롯 테마에서 파생한다** (`serviceTheme.ts`) */
  headText: '',
  subText: '',
  buttonColor: '',
  bg: '',
  stampColor: '',
  logo: '',
  logoAlign: 'left',
  codeLabel: '암호 입력',
  codeHint: '각 이벤트를 마치면 암호를 알려드려요.',
}

/** 슬롯 설정 + 기본값 — **키 단위로 채운다** */
export function stampDisplay(slot: Slot): StampDisplay {
  const saved = (slot.stamp ?? {}) as Partial<StampDisplay>
  const base = serviceTheme(slot)
  return {
    /** 주최자가 언어별로 적어 둔 값 — 기본값이 없다 (안 적으면 없는 게 맞다) */
    i18n: saved.i18n,
    title: saved.title || DEFAULT_STAMP.title,
    showTitle: saved.showTitle ?? DEFAULT_STAMP.showTitle,
    subtitle: saved.subtitle ?? DEFAULT_STAMP.subtitle,
    showSubtitle: saved.showSubtitle ?? DEFAULT_STAMP.showSubtitle,
    // 빈 배열은 "아직 칸을 안 만들었다" — 살린다
    stamps: saved.stamps ?? DEFAULT_STAMP.stamps,
    font: saved.font || DEFAULT_STAMP.font,
    // 색은 고른 값이 늘 이기고, 안 골랐으면 슬롯 테마를 따른다 (`serviceTheme.ts`)
    headText: saved.headText || base.headText,
    subText: saved.subText || base.subText,
    buttonColor: saved.buttonColor || base.button,
    bg: saved.bg || base.bg,
    // 찍히는 도장 — 판에서 제일 강한 자국이라 강조색을 그대로 쓴다
    stampColor: saved.stampColor || base.button,
    logo: saved.logo ?? DEFAULT_STAMP.logo,
    logoAlign: saved.logoAlign || DEFAULT_STAMP.logoAlign,
    codeLabel: saved.codeLabel || DEFAULT_STAMP.codeLabel,
    codeHint: saved.codeHint ?? DEFAULT_STAMP.codeHint,
  }
}
