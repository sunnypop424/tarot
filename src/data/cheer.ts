import type { Slot } from '@/types/slot'
import type { FontId } from './fonts'

/**
 * 영상회 라이브 응원 **겉모습** — 최고관리자가 편집기에서 정한다.
 *
 * 운영값(한 화면 개수·비율·교체 간격·이름 표시·1인 입력 수·글자 수·마감)은 **주최자**가
 * `/{slug}/admin` 에서 정한다 (`cheer_settings`). 행사 중에 보고 조정하는 값이라서다.
 *
 * **한마디 자체는 롤링페이퍼 테이블에 산다** (`rolling_messages`) — 0029 주석.
 */
export interface CheerDisplay {
  /** 입력 화면 제목 */
  title: string
  showTitle: boolean
  subtitle: string
  showSubtitle: boolean
  /** 입력칸에 흐리게 뜨는 안내 */
  prompt: string
  /** 이름칸 안내 */
  namePrompt: string
  /** 보내기 버튼 문구 */
  postLabel: string
  /** 보낸 뒤 화면에 뜨는 말 */
  thanks: string

  font: FontId
  /** 입력 화면 배경·글자 */
  bg: string
  headText: string
  subText: string
  buttonColor: string
  logo: string

  /**
   * 말풍선 **팔레트** — hex 목록. 오버레이가 이 안에서 무작위로 고른다.
   * 비면 첫 색 하나로만 그린다. **아무 색이나 뽑지 않는 이유**: 행사 색이 무너진다.
   */
  bubbleColors: string[]
  /**
   * **먹색과 종이색** — 말풍선 조합의 두 축이다.
   *
   * 참고한 예능 자막바의 문법이 그렇다: 진한 색 판 위엔 **종이색 글자**, 흰 판 위엔 **먹색 글자**,
   * 테두리는 늘 먹색. 글자색을 하나만 두면 팔레트에 밝은 색과 어두운 색이 섞이는 순간 한쪽이
   * 안 읽힌다 — 그래서 둘로 나누고, 어느 쪽을 쓸지는 **말풍선 모양이 정한다**.
   */
  bubbleInk: string
  bubblePaper: string
  /** 말풍선 테두리 — 예능 자막바처럼 굵은 선. 0 이면 선 없음 (비우면 먹색을 쓴다) */
  bubbleBorder: string
  bubbleBorderWidth: number

  /** 엔딩크레딧 배경 (오버레이는 투명이라 이 값을 안 쓴다) */
  creditsBg: string
  creditsText: string
  /** 엔딩크레딧 맨 위 제목 */
  creditsTitle: string
}

export const DEFAULT_CHEER: CheerDisplay = {
  title: '한마디 남기기',
  showTitle: true,
  subtitle: '남긴 한마디가 상영 화면에 떠요',
  showSubtitle: true,
  prompt: '오늘 하고 싶은 말을 적어 주세요',
  namePrompt: '이름 (선택)',
  postLabel: '보내기',
  thanks: '화면에서 만나요!',
  font: 'pretendard',
  bg: '#12121a',
  headText: '#f4f3ff',
  subText: '#a5a3c0',
  buttonColor: '#816bff',
  logo: '',
  // 예능 자막바 결 — 진한 색 위 흰 글자가 기본이다 (참고 이미지의 문법)
  bubbleColors: ['#ff6b9d', '#ffd166', '#5bd1c4', '#8b8cf7', '#ff9f5a'],
  bubbleInk: '#161616',
  bubblePaper: '#ffffff',
  bubbleBorder: '#161616',
  bubbleBorderWidth: 3,
  creditsBg: '#08080c',
  creditsText: '#f4f3ff',
  creditsTitle: '오늘 함께해 주신 분들',
}

/** 슬롯 설정 + 기본값 — **키 단위로 채운다** */
export function cheerDisplay(slot: Slot): CheerDisplay {
  const saved = (slot.cheer ?? {}) as Partial<CheerDisplay>
  return {
    title: saved.title || DEFAULT_CHEER.title,
    showTitle: saved.showTitle ?? DEFAULT_CHEER.showTitle,
    subtitle: saved.subtitle ?? DEFAULT_CHEER.subtitle,
    showSubtitle: saved.showSubtitle ?? DEFAULT_CHEER.showSubtitle,
    prompt: saved.prompt || DEFAULT_CHEER.prompt,
    namePrompt: saved.namePrompt || DEFAULT_CHEER.namePrompt,
    postLabel: saved.postLabel || DEFAULT_CHEER.postLabel,
    thanks: saved.thanks || DEFAULT_CHEER.thanks,
    font: saved.font || DEFAULT_CHEER.font,
    bg: saved.bg || DEFAULT_CHEER.bg,
    headText: saved.headText || DEFAULT_CHEER.headText,
    subText: saved.subText || DEFAULT_CHEER.subText,
    buttonColor: saved.buttonColor || DEFAULT_CHEER.buttonColor,
    logo: saved.logo ?? DEFAULT_CHEER.logo,
    // 빈 배열은 "색을 다 지웠다" 는 뜻이 아니라 대개 실수다 — 비면 기본 팔레트로 되돌린다
    bubbleColors: saved.bubbleColors?.length ? saved.bubbleColors : DEFAULT_CHEER.bubbleColors,
    bubbleInk: saved.bubbleInk || DEFAULT_CHEER.bubbleInk,
    bubblePaper: saved.bubblePaper || DEFAULT_CHEER.bubblePaper,
    bubbleBorder: saved.bubbleBorder || DEFAULT_CHEER.bubbleBorder,
    // 0 은 "선 없음" 이라 살린다
    bubbleBorderWidth: saved.bubbleBorderWidth ?? DEFAULT_CHEER.bubbleBorderWidth,
    creditsBg: saved.creditsBg || DEFAULT_CHEER.creditsBg,
    creditsText: saved.creditsText || DEFAULT_CHEER.creditsText,
    creditsTitle: saved.creditsTitle || DEFAULT_CHEER.creditsTitle,
  }
}

/**
 * 영상 비율 — 오버레이가 **가운데를 이만큼 비운다**. 거기 영상이 있다.
 * 직접 입력을 받지 않는 이유: 잘못 적으면 말풍선이 영상 위를 덮는데, 그건 상영 중에야 안다.
 */
export const RATIOS = ['16:9', '4:3', '21:9', '9:16'] as const
export type CheerRatio = (typeof RATIOS)[number]

export function ratioValue(ratio: string): number {
  const [w, h] = ratio.split(':').map(Number)
  return w && h ? w / h : 16 / 9
}

/**
 * 말풍선 변형 — 참고 이미지(예능 자막바)의 문법을 여섯으로 정리했다.
 * **글자 길이와 이름 유무가 후보를 좁힌다** — 20자를 별 배지에 넣으면 읽을 수 없다.
 */
export type BubbleShape = 'chipBar' | 'solidBar' | 'bubble' | 'banner' | 'burst' | 'plaque'

export function shapesFor(text: string, hasName: boolean): BubbleShape[] {
  const n = text.length
  const out: BubbleShape[] = []
  if (hasName) out.push('chipBar', 'plaque')
  out.push('solidBar', 'bubble')
  if (n <= 14) out.push('banner')
  // 별 배지는 **아주 짧은 것만** — 7자만 되어도 별 밖으로 삐져나온다 (실측)
  if (n <= 5) out.push('burst')
  return out
}
