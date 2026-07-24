import type { Slot } from '@/types/slot'

/**
 * 롤링페이퍼 **겉모습** — 최고관리자가 슬롯 편집기에서 정한다 (주최자는 못 건드린다).
 *
 * 럭키드로우(`luckydrawDisplay`)와 같은 짝이다: 서비스별 설정은 여기, 색·형태는 theme 이 갖는다.
 * **색·이미지의 실체는 여기 없다.** 카드 색은 테마 토큰 키로만 가리키고(hex 아님, tokens.css 규칙),
 * 스티커·벽 배경은 슬롯 이미지라 Storage 경로(슬롯 폴더 기준)만 든다.
 */
export interface RollingDisplay {
  /** 벽 제목 — 방문자 화면 맨 위 */
  wallTitle: string
  /** 입력 안내 — 방문자에게 무엇을 남기라고 할지 */
  prompt: string
  /** 남기기 버튼 문구 */
  postLabel: string
  /**
   * 방문자가 고를 수 있는 카드 색 — **테마 색 키**의 목록이다 (hex 아님, `ROLLING_COLOR_CHOICES`).
   * 메시지엔 이 키 하나만 저장되고, 실제 색은 tokens.css/applyTheme 이 댄다.
   * 비면 카드 색 선택이 없다 (전부 기본 표면색).
   */
  cardColors: string[]
  /**
   * 붙일 수 있는 스티커 — 업로드된 이미지 **URL** 목록 (`uploadAsset` 이 돌려준 값 그대로,
   * 로고·배경과 같은 규칙 — 화면이 직접 background-image 로 그린다). **최고관리자가 올린다**
   * (주최자가 원본을 넘기고 편집기에서 업로드). 비면 스티커 없음.
   */
  stickers: string[]
  /**
   * 벽 전용 배경 이미지 **URL** — 비면 슬롯 테마 배경을 그대로 쓴다.
   * 럭키드로우 배경처럼 `<img>` 가 아니라 background-image 로만 그린다.
   */
  wallBg: string
}

/**
 * 방문자에게 내줄 수 있는 카드 색 후보 — **테마 색 키이자 CSS 토큰 접미사**다.
 * 단어 하나짜리만 골랐다 (`--color-primary`·`--color-high` 처럼 그대로 `var(--color-{key})` 로 쓰려고 —
 * `surfaceRaised`·`fg1` 같은 키는 토큰이 `--color-surface-raised`·`--color-fg-1` 라 어긋난다).
 */
export const ROLLING_COLOR_CHOICES = ['primary', 'accent', 'high', 'wash'] as const

/** 편집기에서 보여줄 이름 — 카드 색은 역할이 아니라 느낌으로 부른다 (스와치가 실제 색을 보여준다) */
export const ROLLING_COLOR_LABELS: Record<string, string> = {
  primary: '기본',
  accent: '포인트',
  high: '강조',
  wash: '은은',
}

export const DEFAULT_ROLLING: RollingDisplay = {
  wallTitle: '롤링페이퍼',
  prompt: '응원 한마디를 남겨 주세요',
  postLabel: '남기기',
  // 테마에 늘 있는 두 색 — 편집기에서 더하거나 뺄 수 있다
  cardColors: ['primary', 'accent'],
  stickers: [],
  wallBg: '',
}

/**
 * 슬롯 설정 + 기본값 — **키 단위로 채운다** (`luckydrawDisplay` 와 같은 이유).
 * `slot.rolling ?? DEFAULT` 로 뭉뚱그리면 편집기가 한 값만 저장한 슬롯에서 나머지가 빈다.
 */
export function rollingDisplay(slot: Slot): RollingDisplay {
  const saved = slot.rolling ?? {}
  return {
    wallTitle: saved.wallTitle || DEFAULT_ROLLING.wallTitle,
    prompt: saved.prompt || DEFAULT_ROLLING.prompt,
    postLabel: saved.postLabel || DEFAULT_ROLLING.postLabel,
    // 빈 배열은 "선택 없음" 이라는 뜻이라 살린다 (|| 로 기본값을 덮으면 그 의도가 사라진다)
    cardColors: saved.cardColors ?? DEFAULT_ROLLING.cardColors,
    stickers: saved.stickers ?? DEFAULT_ROLLING.stickers,
    // 빈 문자열은 "테마 배경을 쓴다" 는 뜻이라 살린다
    wallBg: saved.wallBg ?? DEFAULT_ROLLING.wallBg,
  }
}
