import type { Slot } from '@/types/slot'
import type { FontId } from './fonts'

/**
 * 롤링페이퍼 **겉모습** — 최고관리자가 슬롯 편집기에서 정한다 (주최자는 못 건드린다).
 *
 * 럭키드로우(`luckydrawDisplay`)와 같은 짝이다: 서비스별 룩은 여기, 색은 hex 로 직접 든다
 * (포스트잇 파스텔은 테마 토큰이 아니라 이 서비스만의 색이라 — 럭드 모달색과 같은 예외).
 * 화면은 이 값들을 `--rp-*` CSS 변수로 주입해 그린다. 이미지(벽 배경·로고·스티커)는 업로드 URL.
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
  /** 벽 헤더 로고 이미지 **URL** — 비면 제목 텍스트만. */
  logo: string
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
  headText: '#3b3833',
  subText: '#8c877e',
  noteBody: '#3b3833',
  noteName: '#8c877e',
  boardBg: '#efeae0',
  buttonColor: '#7d7364',
  papers: DEFAULT_PAPERS,
  stickers: [],
  wallBg: '',
  logo: '',
}

/**
 * 슬롯 설정 + 기본값 — **키 단위로 채운다** (`luckydrawDisplay` 와 같은 이유).
 * `slot.rolling ?? DEFAULT` 로 뭉뚱그리면 한 값만 저장한 슬롯에서 나머지가 빈다.
 */
export function rollingDisplay(slot: Slot): RollingDisplay {
  const saved = (slot.rolling ?? {}) as Partial<RollingDisplay>
  return {
    wallTitle: saved.wallTitle || DEFAULT_ROLLING.wallTitle,
    showTitle: saved.showTitle ?? DEFAULT_ROLLING.showTitle,
    wallSubtitle: saved.wallSubtitle ?? DEFAULT_ROLLING.wallSubtitle,
    showSubtitle: saved.showSubtitle ?? DEFAULT_ROLLING.showSubtitle,
    prompt: saved.prompt || DEFAULT_ROLLING.prompt,
    postLabel: saved.postLabel || DEFAULT_ROLLING.postLabel,
    font: saved.font || DEFAULT_ROLLING.font,
    headText: saved.headText || DEFAULT_ROLLING.headText,
    subText: saved.subText || DEFAULT_ROLLING.subText,
    noteBody: saved.noteBody || DEFAULT_ROLLING.noteBody,
    noteName: saved.noteName || DEFAULT_ROLLING.noteName,
    boardBg: saved.boardBg || DEFAULT_ROLLING.boardBg,
    buttonColor: saved.buttonColor || DEFAULT_ROLLING.buttonColor,
    // 빈 배열은 "색 선택 없음" 이라는 뜻이라 살린다
    papers: saved.papers ?? DEFAULT_ROLLING.papers,
    stickers: saved.stickers ?? DEFAULT_ROLLING.stickers,
    // 빈 문자열은 "이미지 없음(색/텍스트를 쓴다)" 는 뜻이라 살린다
    wallBg: saved.wallBg ?? DEFAULT_ROLLING.wallBg,
    logo: saved.logo ?? DEFAULT_ROLLING.logo,
  }
}
