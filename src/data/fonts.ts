/**
 * 웹폰트 레지스트리 — 슬롯이 고르는 글꼴을 **한 곳에서** 관리한다.
 *
 * 두 서비스가 쓴다: 럭키드로우(본문 폰트 하나)와 롤링페이퍼(벽 기본 폰트 + 방문자가 쪽지마다 고르는
 * 손글씨). 그래서 여기 모으고, 로딩 로직(`loadWebfont`)도 하나로 둔다 — 구현이 둘이면 어긋난다.
 *
 * 로딩 방식이 두 가지다:
 *  - `href`  : 스타일시트 한 장(`<link>`) — Google Fonts, fonts-archive dynamic-subset.css 등.
 *              (fonts-archive css 안의 상대경로 woff2 는 그 css 위치 기준으로 풀려 그대로 먹는다.)
 *  - `faces` : woff/woff2 파일을 직접 받아 `@font-face` 를 만든다 — projectnoonnu 단일 파일 등.
 *              이때 `family` 가 @font-face 이름이다 (stack 의 첫 글꼴과 같아야 한다).
 */
export interface WebFont {
  label: string
  /** font-family 값 (화면에 적용) */
  stack: string
  /** 손글씨 글꼴인가 — 방문자용 쪽지 폰트 목록은 이것만 추린다 */
  handwriting?: boolean
  /** 스타일시트로 받는 폰트 */
  href?: string
  /** @font-face 로 만드는 폰트의 패밀리 이름 */
  family?: string
  /** @font-face 로 만드는 폰트의 파일들 */
  faces?: { href: string; weight?: number; format?: string }[]
}

export const WEBFONTS = {
  pretendard: {
    label: 'Pretendard (깔끔함 · 기본)',
    stack: "'Pretendard', system-ui, sans-serif",
    href: 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css',
  },
  paperlogy: {
    label: 'Paperlogy (또렷함)',
    stack: "'Paperlogy', 'Pretendard', sans-serif",
    family: 'Paperlogy',
    /** 굵기별로 파일이 따로다 — 하나만 받으면 가짜 볼드로 획이 뭉갠다 */
    faces: [
      { href: 'https://fastly.jsdelivr.net/gh/projectnoonnu/2408-3@1.0/Paperlogy-4Regular.woff2', weight: 400 },
      { href: 'https://fastly.jsdelivr.net/gh/projectnoonnu/2408-3@1.0/Paperlogy-8ExtraBold.woff2', weight: 800 },
    ],
  },
  noto: {
    label: 'Noto Sans KR (무난함)',
    stack: "'Noto Sans KR', sans-serif",
    href: 'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&display=swap',
  },

  // ── 손글씨 (롤링페이퍼 쪽지용 — 방문자가 고른다) ──────────────
  nanumPen: {
    label: '나눔손글씨 펜',
    stack: "'Nanum Pen Script', cursive",
    handwriting: true,
    href: 'https://fonts.googleapis.com/css2?family=Nanum+Pen+Script&display=swap',
  },
  gaegu: {
    label: '개구',
    stack: "'Gaegu', cursive",
    handwriting: true,
    href: 'https://fonts.googleapis.com/css2?family=Gaegu:wght@300;400;700&display=swap',
  },
  leeSeoyun: {
    label: '이서윤체',
    stack: "'IsYun', cursive",
    handwriting: true,
    family: 'IsYun',
    faces: [{ href: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2202-2@1.0/LeeSeoyun.woff', weight: 400, format: 'woff' }],
  },
  gangwonSaeeum: {
    label: '강원교육새음체',
    stack: "'GangwonEdu Saeeum', cursive",
    handwriting: true,
    href: 'https://cdn.jsdelivr.net/gh/fonts-archive/GangwonEduSaeeum/subsets/GangwonEduSaeeum-dynamic-subset.css',
  },
  hakgyoansimKkokkoma: {
    label: '학교안심 꼬꼬마체',
    stack: "'Hakgyoansim Kkokkoma', cursive",
    handwriting: true,
    href: 'https://cdn.jsdelivr.net/gh/fonts-archive/HakgyoansimKkokkoma/subsets/HakgyoansimKkokkoma-dynamic-subset.css',
  },
  yoonMinguk: {
    label: '윤초록우산어린이 민국체',
    stack: "'YunChorokwoosanEoriniMinguk', cursive",
    handwriting: true,
    family: 'YunChorokwoosanEoriniMinguk',
    faces: [{ href: 'https://cdn.jsdelivr.net/gh/projectnoonnu/2408@1.0/YoonChildfundkoreaMinGuk.woff2', weight: 400 }],
  },
  munmakHaeban: {
    label: '문막초 해반체',
    stack: "'MunmakchoHaeban', cursive",
    handwriting: true,
    family: 'MunmakchoHaeban',
    faces: [{ href: 'https://cdn.jsdelivr.net/gh/projectnoonnu/2604-1@1.0/MUNMAK_HAEBANCHE.woff2', weight: 400 }],
  },
  griunDahl: {
    label: '그리운X국한박 다흘체',
    stack: "'GeuriunXGukhanbakDaheul', cursive",
    handwriting: true,
    family: 'GeuriunXGukhanbakDaheul',
    faces: [{ href: 'https://cdn.jsdelivr.net/gh/Project-Noonnu/2607161334@x/x/GriunXHangeul_DAHL-Rg.woff2', weight: 400 }],
  },
  griunTture: {
    label: '그리운X국한박 뚜레체',
    stack: "'GeuriunXKukhanbakTture', cursive",
    handwriting: true,
    family: 'GeuriunXKukhanbakTture',
    faces: [{ href: 'https://cdn.jsdelivr.net/gh/Project-Noonnu/2607161334@x-7/x/GriunXHangeulDDURAE-Regular.woff2', weight: 400 }],
  },
  griunSarang: {
    label: '그리운X국한박 사랑스러운체',
    stack: "'NostalgicGukhanbakLovely', cursive",
    handwriting: true,
    family: 'NostalgicGukhanbakLovely',
    faces: [{ href: 'https://cdn.jsdelivr.net/gh/Project-Noonnu/2607161334@x-10/x/GriunXHangeulSarangseureoun-Regular.woff2', weight: 400 }],
  },
} as const satisfies Record<string, WebFont>

export type FontId = keyof typeof WEBFONTS

/** 방문자가 쪽지에 고를 수 있는 손글씨 글꼴 id 들 (레지스트리에서 추린다) */
export const HANDWRITING_FONTS = (Object.keys(WEBFONTS) as FontId[]).filter(
  (id) => (WEBFONTS[id] as WebFont).handwriting
)

/** id → font-family 값 (없는 id 는 기본 산세리프로 폴백) */
export function fontStack(id: string | undefined): string {
  const f = id ? (WEBFONTS as Record<string, WebFont>)[id] : undefined
  return f?.stack ?? "'Pretendard', system-ui, sans-serif"
}

/**
 * 글꼴을 문서에 로드한다 — **한 번만** (id 로 중복을 막는다).
 * href 면 `<link>`, faces 면 `@font-face` 를 굵기별로 만든다.
 */
export function loadWebfont(id: string | undefined): void {
  if (!id) return
  const font = (WEBFONTS as Record<string, WebFont>)[id]
  if (!font) return
  const domId = `webfont-${id}`
  if (document.getElementById(domId)) return

  if (font.faces && font.family) {
    const el = document.createElement('style')
    el.id = domId
    el.textContent = font.faces
      .map(
        (f) =>
          `@font-face{font-family:'${font.family}';src:url('${f.href}') format('${f.format ?? 'woff2'}');font-weight:${f.weight ?? 400};font-display:swap}`
      )
      .join('')
    document.head.appendChild(el)
  } else if (font.href) {
    const el = document.createElement('link')
    el.id = domId
    el.rel = 'stylesheet'
    el.href = font.href
    document.head.appendChild(el)
  }
}
