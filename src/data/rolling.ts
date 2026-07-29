import { serviceTheme } from './serviceTheme'
import type { Slot } from '@/types/slot'
import type { FontId } from './fonts'

/**
 * 롤링페이퍼 **겉모습** — 최고관리자가 슬롯 편집기에서 정한다 (주최자는 못 건드린다).
 *
 * 럭키드로우(`luckydrawDisplay`)와 같은 짝이다. 화면은 이 값들을 `--rp-*` CSS 변수로 주입해
 * 그린다. 이미지(벽 배경·로고·스티커)는 업로드 URL.
 *
 * **벽 색은 슬롯 테마에서 파생한다** (`serviceTheme.ts`) — 안 그러면 최고관리자가 고른 색이
 * 이 서비스에 안 닿는다.
 *
 * **쪽지 위 색만 예외로 고정한다** (`noteBody`·`noteName`, 그리고 파스텔 `papers`):
 * 쪽지는 벽이 아니라 **자기 종이색 위에** 글자를 얹는다. 테마 글자색을 그대로 쓰면 다크 슬롯의
 * 흰 글자가 연한 한지색 쪽지 위로 올라가 **한 글자도 안 읽힌다.** 종이와 잉크는 짝이라 같이 간다.
 */
export interface RollingDisplay {
  /** 벽 제목 — 방문자 화면 맨 위 (편집 가능, 고정 아님) */
  wallTitle: string
  /** 제목을 벽에 보일지 (로고만 쓰거나 제목을 숨기고 싶을 때 끈다) */
  showTitle: boolean
  /** 벽 부제 — 제목 아래 한 줄 안내 */
  wallSubtitle: string
  /** 부제를 벽에 보일지 */
  showSubtitle: boolean
  /** 입력 안내 — 작성 화면 메시지칸에 흐리게 */
  prompt: string
  /** 남기기 버튼 문구 */
  postLabel: string

  /** 벽 기본 글꼴 (제목·UI·작성 폼) — 방문자는 쪽지마다 따로 고른다 */
  font: FontId

  /** 제목·헤더 글자색 */
  headText: string
  /** 서브 글자색 (부제·안내) */
  subText: string
  /** 포스트잇 본문 글자색 */
  noteBody: string
  /** 포스트잇 이름 글자색 */
  noteName: string
  /** 벽 배경색 — 벽 배경 이미지가 없을 때 (있으면 이미지가 덮는다) */
  boardBg: string
  /** 남기기·보내기 버튼 색 */
  buttonColor: string

  /**
   * 포스트잇 종이색 **팔레트** — hex 목록. 방문자가 쓸 때 이 중 하나를 고른다.
   * 비면 쪽지 색 선택이 없고 전부 첫 색.
   */
  papers: string[]

  /**
   * 붙일 수 있는 스티커 — 업로드된 이미지 **URL** 목록. **최고관리자가 올린다**.
   * 화면이 직접 background-image 로 그린다 (로고·배경과 같은 규칙). 비면 스티커 없음.
   */
  stickers: string[]

  /** 벽 전용 배경 이미지 **URL** — 비면 벽 배경색을 쓴다. */
  wallBg: string
  /** 벽 배경을 패턴처럼 반복(타일)할지 — false 면 화면을 꽉 채운다(cover). */
  wallBgRepeat: boolean
  /** 벽 헤더 로고 이미지 **URL** — 비면 제목 텍스트만. */
  logo: string
  /** 로고·제목 가로 정렬 (벽 헤더). */
  logoAlign: 'left' | 'center' | 'right'
  /** 로고·제목 위 여백(px) — 벽 상단에서 얼마나 내릴지. */
  logoMarginTop: number
  /** 작성 화면 글씨체 고르기에 뜨는 예시 문구 — 폰트명 대신 이 문구를 각 글씨체로 보여준다. */
  fontSample: string
}

/** 기본 종이색 팔레트 — 중립 파스텔 (편집기에서 갈아끼운다) */
const DEFAULT_PAPERS = ['#f4efe2', '#eef1e6', '#eceff4', '#f4ecec', '#f1ecf4', '#e9f0ef']

export const DEFAULT_ROLLING: RollingDisplay = {
  wallTitle: '롤링페이퍼',
  showTitle: true,
  wallSubtitle: '따뜻한 한마디를 남겨 주세요',
  showSubtitle: true,
  prompt: '축하하는 마음을 자유롭게 적어 주세요',
  postLabel: '남기기',
  font: 'pretendard',
  /* 벽 색은 비워 둔다 — 안 고르면 **슬롯 테마에서 파생한다** (`serviceTheme.ts`) */
  headText: '',
  subText: '',
  /* 쪽지 위 잉크만 고정 — 파스텔 종이색과 짝이라 테마를 안 받는다 (파일 머리말) */
  noteBody: '#3b3833',
  noteName: '#8c877e',
  boardBg: '',
  buttonColor: '',
  papers: DEFAULT_PAPERS,
  stickers: [],
  wallBg: '',
  wallBgRepeat: false,
  logo: '',
  logoAlign: 'left',
  logoMarginTop: 0,
  fontSample: '생일 축하해!',
}

/**
 * 슬롯 설정 + 기본값 — **키 단위로 채운다** (`luckydrawDisplay` 와 같은 이유).
 * `slot.rolling ?? DEFAULT` 로 뭉뚱그리면 한 값만 저장한 슬롯에서 나머지가 빈다.
 */
export function rollingDisplay(slot: Slot): RollingDisplay {
  const saved = (slot.rolling ?? {}) as Partial<RollingDisplay>
  const base = serviceTheme(slot)
  return {
    wallTitle: saved.wallTitle || DEFAULT_ROLLING.wallTitle,
    showTitle: saved.showTitle ?? DEFAULT_ROLLING.showTitle,
    wallSubtitle: saved.wallSubtitle ?? DEFAULT_ROLLING.wallSubtitle,
    showSubtitle: saved.showSubtitle ?? DEFAULT_ROLLING.showSubtitle,
    prompt: saved.prompt || DEFAULT_ROLLING.prompt,
    postLabel: saved.postLabel || DEFAULT_ROLLING.postLabel,
    font: saved.font || DEFAULT_ROLLING.font,
    // 벽 색은 고른 값이 늘 이기고, 안 골랐으면 슬롯 테마를 따른다 (`serviceTheme.ts`)
    headText: saved.headText || base.headText,
    subText: saved.subText || base.subText,
    // 쪽지 잉크는 종이색과 짝이라 테마를 안 받는다 (파일 머리말)
    noteBody: saved.noteBody || DEFAULT_ROLLING.noteBody,
    noteName: saved.noteName || DEFAULT_ROLLING.noteName,
    boardBg: saved.boardBg || base.bg,
    buttonColor: saved.buttonColor || base.button,
    // 빈 배열은 "색 선택 없음" 이라는 뜻이라 살린다
    papers: saved.papers ?? DEFAULT_ROLLING.papers,
    stickers: saved.stickers ?? DEFAULT_ROLLING.stickers,
    // 빈 문자열은 "이미지 없음(색/텍스트를 쓴다)" 는 뜻이라 살린다
    wallBg: saved.wallBg ?? DEFAULT_ROLLING.wallBg,
    wallBgRepeat: saved.wallBgRepeat ?? DEFAULT_ROLLING.wallBgRepeat,
    logo: saved.logo ?? DEFAULT_ROLLING.logo,
    logoAlign: saved.logoAlign ?? DEFAULT_ROLLING.logoAlign,
    logoMarginTop: saved.logoMarginTop ?? DEFAULT_ROLLING.logoMarginTop,
    fontSample: saved.fontSample || DEFAULT_ROLLING.fontSample,
  }
}
