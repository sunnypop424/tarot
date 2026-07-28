import type { Slot } from '@/types/slot'
import type { FontId } from './fonts'

/**
 * 소원 나무 **겉모습** — 최고관리자가 슬롯 편집기에서 정한다 (주최자는 못 건드린다).
 *
 * ── 이 서비스가 다른 서비스와 다른 점 ──
 *
 * **데이터를 롤링페이퍼와 공유한다.** `rolling_messages` 테이블과 `repo.rolling` 을 그대로 쓰고,
 * 주최자 후검수 화면(`admin/rolling/Moderation.tsx`)도 같은 것을 쓴다. 새 테이블도 새 repo 도
 * 없다 — 데이터 모양이 정확히 같기 때문이다(닉네임 + 본문 + 색 + 글꼴 + 장식 + 숨김).
 *
 * 그런데도 **독립 서비스로 등록하는 이유**는 이 플랫폼이 서비스 단위로 팔리기 때문이다.
 * 편집기 카드·배지·주최자 안내문이 전부 서비스로 갈리므로, 롤페 안에 `variant` 로 넣으면
 * 소원나무를 산 고객이 "롤링페이퍼" 라는 이름으로 안내를 받게 된다.
 *
 * 그래서 `RollingMessage` 의 필드 셋을 **재해석**한다 (스키마 변경 0):
 *   `color`   → 등불 색   (롤페의 종이색 자리)
 *   `font`    → 손글씨    (그대로)
 *   `sticker` → 매다는 장식 (롤페의 스티커 자리)
 */
export interface WishDisplay {
  /** 나무 화면 제목 (편집 가능, 고정 아님) */
  treeTitle: string
  showTitle: boolean
  treeSubtitle: string
  showSubtitle: boolean
  /** 입력 안내 — 작성 화면 소원칸에 흐리게 */
  wishPrompt: string
  /** 소원 거는 버튼 문구 */
  hangLabel: string

  /** 기본 글꼴 (제목·UI·작성 폼) — 등불 글씨체는 방문자가 따로 고른다 */
  font: FontId
  /** 작성 화면 글씨체 고르기에 뜨는 예시 문구 */
  fontSample: string

  headText: string
  subText: string
  /** 등불 본문 글자색 */
  wishBody: string
  /** 등불 이름 글자색 */
  wishName: string
  /** 밤하늘 배경색 — 배경 이미지가 없을 때 */
  skyBg: string
  buttonColor: string

  /**
   * 등불 색 **팔레트** — hex 목록. 방문자가 소원을 쓸 때 이 중 하나를 고른다.
   * (`RollingMessage.color` 에 저장된다 — 롤페 `papers` 와 같은 자리.)
   * 비면 색 선택이 없고 전부 첫 색.
   */
  lanterns: string[]

  /**
   * 매달 수 있는 장식 — 업로드된 이미지 **URL** 목록. 최고관리자가 올린다.
   * (`RollingMessage.sticker` 에 저장된다 — 롤페 `stickers` 와 같은 자리.)
   */
  charms: string[]

  /** 나무·밤하늘 배경 이미지 **URL** — 비면 배경색을 쓴다 */
  treeBg: string
  /** 배경을 타일로 반복할지 — false 면 화면을 꽉 채운다(cover) */
  treeBgRepeat: boolean
  /**
   * 등불 실루엣 이미지 **URL** — 팔레트 색이 이 모양 안에 채워진다.
   * 비면 CSS 로 그린 기본 등불(둥근 몸통 + 위아래 갓)을 쓴다.
   */
  lanternShape: string
  /**
   * 실루엣을 쓸 때 **글자를 어디에 둘지** — 위·오른쪽·아래·왼쪽 여백을 등불 크기의 %로.
   *
   * 실루엣은 가장자리가 좁아지는 모양이 많아서, 글자 상자가 등불 전체를 쓰면 **글자 밑이
   * 투명해져 등불 밖으로 나간 것처럼 보인다.** 모양은 PNG 마다 달라 코드가 짐작할 수 없으니
   * (호리병·원형·사각형이 다 다르다) 올리는 사람이 눈으로 보고 맞춘다.
   *
   * **실루엣이 없으면 안 쓴다** — 기본 등불은 CSS 로 그려서 모양을 이미 안다.
   */
  shapePad: { top: number; right: number; bottom: number; left: number }
  /**
   * 이름 줄의 여백 — 본문과 **따로** 잡는다.
   *
   * 이름은 본문 아래 오른쪽에 작게 붙어서, 실루엣이 아래로 좁아지는 모양이면 본문은
   * 멀쩡한데 이름만 밖으로 삐진다. 한 값으로 묶으면 이름을 넣으려다 본문까지 밀려
   * 등불 위쪽이 텅 빈다. **표시되는 이름에만** 적용된다 (닉네임이 없으면 줄 자체가 없다).
   */
  shapeNamePad: { top: number; right: number; bottom: number; left: number }
  /** 등불이 바람에 흔들릴지 — 끄면 정적 (움직임에 민감한 사람도 있다) */
  sway: boolean

  /**
   * 헤더 로고 이미지 **URL** — 비면 제목 텍스트만.
   * 롤페와 같은 규칙이다: 로고가 있으면 제목을 **대신**하고, 정렬·위 여백도 같은 이름을 쓴다.
   */
  logo: string
  logoAlign: 'left' | 'center' | 'right'
  /** 로고·제목 위 여백(px) — 배경 이미지의 나무 위치에 맞춰 내릴 때 쓴다 (롤페와 같은 짝) */
  logoMarginTop: number
}

/**
 * 기본 등불색 — **연한 한지 톤** (시안 그대로). 편집기에서 갈아끼운다.
 *
 * 진한 색을 쓰지 않는 이유: 등불 안에 소원 글자가 들어간다. 몸통이 진하면 글씨가 안 읽히고,
 * 밤하늘 위에서 빛나는 종이 등불이라는 인상도 사라진다 — 색종이처럼 보인다.
 */
const DEFAULT_LANTERNS = ['#efe8cd', '#e9d3c4', '#d8dfd0', '#dcd4e6', '#e4dcc2', '#dfe3ea']

export const DEFAULT_WISH: WishDisplay = {
  treeTitle: '소원 나무',
  showTitle: true,
  treeSubtitle: '소원을 적어 나무에 걸어 주세요',
  showSubtitle: true,
  wishPrompt: '이루고 싶은 소원을 적어 주세요',
  hangLabel: '소원 걸기',
  font: 'pretendard',
  fontSample: '소원이 이루어지길',
  headText: '#f2f1ee',
  subText: '#93959f',
  // 등불 몸통이 연한 한지색이라 글자는 어둡다 — 이 짝을 깨면 소원이 안 읽힌다
  wishBody: '#3b3830',
  wishName: '#7a7461',
  skyBg: '#1b1c22',
  buttonColor: '#f2f1ee',
  lanterns: DEFAULT_LANTERNS,
  charms: [],
  treeBg: '',
  treeBgRepeat: false,
  lanternShape: '',
  // 가운데가 넓은 흔한 등불 모양 기준 — 올린 그림에 맞춰 편집기에서 조정한다
  shapePad: { top: 22, right: 19, bottom: 4, left: 19 },
  shapeNamePad: { top: 0, right: 22, bottom: 20, left: 19 },
  sway: true,
  logo: '',
  logoAlign: 'left',
  logoMarginTop: 0,
}

/**
 * 슬롯 설정 + 기본값 — **키 단위로 채운다** (`rollingDisplay` 와 같은 이유).
 * `slot.wish ?? DEFAULT` 로 뭉뚱그리면 한 값만 저장한 슬롯에서 나머지가 빈다.
 */
export function wishDisplay(slot: Slot): WishDisplay {
  const saved = (slot.wish ?? {}) as Partial<WishDisplay>
  return {
    treeTitle: saved.treeTitle || DEFAULT_WISH.treeTitle,
    showTitle: saved.showTitle ?? DEFAULT_WISH.showTitle,
    treeSubtitle: saved.treeSubtitle ?? DEFAULT_WISH.treeSubtitle,
    showSubtitle: saved.showSubtitle ?? DEFAULT_WISH.showSubtitle,
    wishPrompt: saved.wishPrompt || DEFAULT_WISH.wishPrompt,
    hangLabel: saved.hangLabel || DEFAULT_WISH.hangLabel,
    font: saved.font || DEFAULT_WISH.font,
    fontSample: saved.fontSample || DEFAULT_WISH.fontSample,
    headText: saved.headText || DEFAULT_WISH.headText,
    subText: saved.subText || DEFAULT_WISH.subText,
    wishBody: saved.wishBody || DEFAULT_WISH.wishBody,
    wishName: saved.wishName || DEFAULT_WISH.wishName,
    skyBg: saved.skyBg || DEFAULT_WISH.skyBg,
    buttonColor: saved.buttonColor || DEFAULT_WISH.buttonColor,
    // 빈 배열은 "색 선택 없음"·"장식 없음" 이라는 뜻이라 살린다
    lanterns: saved.lanterns ?? DEFAULT_WISH.lanterns,
    charms: saved.charms ?? DEFAULT_WISH.charms,
    // 빈 문자열은 "이미지 없음(색/기본 모양을 쓴다)" 는 뜻이라 살린다
    treeBg: saved.treeBg ?? DEFAULT_WISH.treeBg,
    treeBgRepeat: saved.treeBgRepeat ?? DEFAULT_WISH.treeBgRepeat,
    lanternShape: saved.lanternShape ?? DEFAULT_WISH.lanternShape,
    // 네 값이 다 있어야 CSS 가 온전하다 — 한 면만 저장된 옛 슬롯도 나머지가 채워진다
    shapePad: { ...DEFAULT_WISH.shapePad, ...(saved.shapePad ?? {}) },
    shapeNamePad: { ...DEFAULT_WISH.shapeNamePad, ...(saved.shapeNamePad ?? {}) },
    sway: saved.sway ?? DEFAULT_WISH.sway,
    logo: saved.logo ?? DEFAULT_WISH.logo,
    logoAlign: saved.logoAlign || DEFAULT_WISH.logoAlign,
    logoMarginTop: saved.logoMarginTop ?? DEFAULT_WISH.logoMarginTop,
  }
}
