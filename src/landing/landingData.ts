/**
 * 랜딩에 싣는 내용 — **화면과 분리해 둔다.**
 *
 * 서비스가 늘 때 고칠 자리를 하나로 모으기 위해서다. 여기 있는 주소는 전부 **체험 슬롯**
 * (`/demo-*`, `scripts/seed-demo.mjs`)이고, 고객 슬롯은 랜딩 어디에도 나오지 않는다
 * (배포 루트에 슬롯 목록을 노출하지 않는다 — CLAUDE.md).
 *
 * ── 어투가 앱과 다르다 (의도된 예외) ──
 *
 * `docs/DESIGN.md` 「화법」은 **전 화면 해요체**인데 이 파일과 `Landing.tsx` 만 **합니다체**다.
 * 읽는 사람이 다르다 — 앱은 이미 산 사람이 쓰고, 랜딩은 **아직 안 산 사람이 맡길지 말지를
 * 정하는 자리**다. 개인이 혼자 받는 커미션이라 그 판단에 필요한 건 친근함보다 신뢰다.
 * 문의 양식(`inquiry.ts`)도 같은 이유로 합니다체다.
 */

/** 미리보기 기기 — 실제로 그 화면을 띄우는 물건에 맞춘다 */
export type DeviceKind = 'phone' | 'tablet' | 'screen' | 'overlay'

/** 기기별 원본 해상도 — iframe 을 이 크기로 띄우고 `transform: scale` 로 줄인다 */
export const DEVICE_SIZE: Record<DeviceKind, [number, number]> = {
  phone: [390, 844],
  tablet: [1194, 834],
  screen: [1280, 720],
  overlay: [1280, 720],
}

/**
 * 글 단 최대 폭 — **`Landing.module.css` 가 아니라 여기가 원본이다.**
 *
 * 목업 크기가 이 폭에서 나오기 때문에 두 군데 적으면 반드시 어긋난다(한쪽만 고치게 된다).
 * 그래서 CSS 는 폭을 안 갖고 `Landing.tsx` 가 인라인으로 준다.
 *
 * **시안 그대로 690 이다.** 한때 목업이 잘려서 이걸 넓혀 보려 했는데, 잘린 진짜 원인은 폭이
 * 아니라 목업 테두리였다(`Landing.tsx` 의 `BEZEL`). 원인을 고치고 나서 되돌렸다 —
 * 넓히면 목업은 커지지만 글 한 줄이 한글 45자를 넘어가 눈이 다음 줄을 못 찾는다.
 */
export const PAGE_MAX = 690

/** 나란히 둔 기기가 이 높이 밑으로 내려가면 화면 안이 안 읽힌다 → 세로로 쌓는다 */
export const SIDE_MIN_H = 180

/** 쌓았을 때 기기별 높이 상한 — 폭을 다 쓰되 폰이 화면을 독차지하지 않게 */
export const STACK_MAX_H: Record<DeviceKind, number> = {
  phone: 380,
  tablet: 260,
  screen: 220,
  overlay: 220,
}

export interface DemoDevice {
  kind: DeviceKind
  label: string
  /** 체험 슬롯 주소 — **실재하는 라우트여야 한다** (아래 주석 참고) */
  path: string
}

export interface LandingService {
  key: string
  name: string
  desc: string
  /** 목록에서 "여기서 열어 보기" 로 걸리는 대표 주소 */
  slug: string
  devices: DemoDevice[]
}

/**
 * 서비스 열 가지.
 *
 * **주소는 실제 라우트다.** 롤페·소원나무의 스크린 화면은 `/{slug}` 자체이고 작성 화면이
 * `/{slug}/write` 다 — `/wall` 같은 주소는 없다(시안 초안엔 그렇게 적혀 있었다).
 * 스태프 화면(스탬프·모의고사)은 **로그인 뒤에 있어** 못 싣는다 — 걸면 잠긴 화면이 뜬다.
 */
export const SERVICES: LandingService[] = [
  {
    key: 'tarot',
    name: '타로카드',
    desc: '궁금한 것을 고르면 카드를 뽑고 해석이 나옵니다.',
    slug: '/demo-tarot',
    devices: [{ kind: 'phone', label: '손님 폰', path: '/demo-tarot' }],
  },
  {
    key: 'luckydraw',
    name: '럭키드로우',
    desc: '스태프가 경품을 뽑습니다. 등수·재고·스크래치 연출까지 들어 있습니다.',
    slug: '/demo-luckydraw',
    devices: [{ kind: 'tablet', label: '스태프 기기', path: '/demo-luckydraw' }],
  },
  {
    key: 'photocard',
    name: '포토카드 뽑기',
    desc: '레어도 뽑기입니다. 저장용·1장 증정·판매 세 가지로 운영합니다.',
    slug: '/demo-photocard',
    devices: [
      { kind: 'phone', label: '손님 폰', path: '/demo-photocard' },
      { kind: 'tablet', label: '스태프 기기 (판매)', path: '/demo-photocard-sale/staff' },
    ],
  },
  {
    key: 'rolling',
    name: '롤링페이퍼',
    desc: '팬들이 남긴 응원이 벽에 한 장씩 붙습니다.',
    slug: '/demo-rolling',
    devices: [
      { kind: 'screen', label: '벽 스크린', path: '/demo-rolling' },
      { kind: 'phone', label: '손님 폰', path: '/demo-rolling/write' },
    ],
  },
  {
    key: 'wish',
    name: '소원 나무',
    desc: '소원을 적어 등불로 매답니다. 밤하늘 버전 롤링페이퍼입니다.',
    slug: '/demo-wish',
    devices: [
      { kind: 'screen', label: '나무 스크린', path: '/demo-wish' },
      { kind: 'phone', label: '손님 폰', path: '/demo-wish/write' },
    ],
  },
  {
    key: 'photozone',
    name: '포토존 프레임',
    desc: '사진에 그날의 프레임을 씌워 저장합니다.',
    slug: '/demo-photozone',
    devices: [{ kind: 'phone', label: '손님 폰', path: '/demo-photozone' }],
  },
  {
    key: 'cheer',
    name: '영상회 응원',
    desc: '한마디가 상영 화면에 말풍선으로 뜹니다.',
    slug: '/demo-cheer',
    devices: [
      { kind: 'phone', label: '손님 폰', path: '/demo-cheer' },
      { kind: 'overlay', label: '상영 화면', path: '/demo-cheer/overlay' },
    ],
  },
  {
    key: 'poll',
    name: '실시간 투표',
    desc: '즉석 투표입니다. 결과가 그 자리에서 차오릅니다.',
    slug: '/demo-poll',
    devices: [{ kind: 'phone', label: '손님 폰', path: '/demo-poll' }],
  },
  {
    key: 'stamp',
    name: '방문 스탬프',
    desc: '현장 암호로 도장을 모으고 다 모으면 선물로 바꿉니다.',
    slug: '/demo-stamp',
    devices: [{ kind: 'phone', label: '손님 폰', path: '/demo-stamp' }],
  },
  {
    key: 'quiz',
    name: '최애 모의고사',
    desc: '문제를 풀고 점수와 칭호를 받습니다.',
    slug: '/demo-quiz',
    devices: [{ kind: 'phone', label: '손님 폰', path: '/demo-quiz' }],
  },
]

export interface Step {
  no: string
  name: string
  /** 오른쪽에 붙는 한 줄 — **약속이라 사실만 적는다** (수정 횟수처럼) */
  tag: string
  /** 형광펜을 칠할 만큼 중요한 단계인가 (수정 횟수) */
  mark?: boolean
  desc: string
}

export const STEPS: Step[] = [
  {
    no: '01',
    name: '서비스 고르기',
    tag: '보통 하루 안에 답합니다',
    desc: '열 가지 중 이번 행사에 쓸 것만 고르시면 됩니다. 손님 폰만 쓸지, 스크린이나 스태프 기기를 함께 둘지도 이때 같이 정합니다.',
  },
  {
    no: '02',
    name: '디자인',
    tag: '수정은 두 번까지',
    mark: true,
    desc: '그날의 컨셉에 맞춰 페이지를 새로 그려서 보내 드립니다. 보시고 고칠 곳을 말씀해 주시면 반영합니다.',
  },
  {
    no: '03',
    name: 'QR 인쇄',
    tag: '직접 내려받아 뽑습니다',
    desc: '관리 화면에서 QR을 인쇄용 크기로 내려받아 포스터나 테이블 안내에 붙이시면 됩니다. 제가 파일을 보내 드리는 방식이 아닙니다.',
  },
  {
    no: '04',
    name: '현장 운영',
    tag: '',
    desc: '당일에는 그대로 쓰시면 됩니다. 이상한 것이 보이면 바로 알려 주세요.',
  },
]

/**
 * 누가 무엇을 하나 — **표가 아니라 문단으로 쓴다.**
 * 두 칸으로 갈라 놓으면 계약서처럼 보이고, 그게 개인 커미션의 인상과 어긋난다.
 */
export const ROLE_MINE =
  '제가 하는 것은 서비스를 고르고 슬롯을 만드는 일, 그날의 페이지를 디자인하는 일, 주소를 내고 주최자 계정을 만들어 드리는 일, 그리고 행사 동안 문제가 생기면 손보는 일입니다.'
export const ROLE_YOURS =
  '주최자께서 하실 일은 문항과 카드에 들어갈 내용을 준비하는 것, 로고와 배경 이미지를 준비하는 것, 선물을 고르고 재고를 보시는 것, 현장에서 암호를 안내하고 추첨과 발표를 하시는 것입니다.'
/** 이 한 줄이 없으면 시안 단계에서 멈춘다 — 그래서 따로 세워 둔다 */
export const ROLE_NOTE =
  '로고와 배경 이미지는 주최자께서 준비해 주셔야 합니다. 페이지는 제가 그리지만 그 안에 들어갈 이미지 원본은 주최자에게서 옵니다.'

/**
 * 자주 묻는 것 — **없는 사실을 적지 않는다.**
 * 기간이 끝난 뒤 동작은 실제 구현(`slot_visible`)대로 적었다: 슬롯 행 자체가 안 읽혀
 * "페이지를 찾을 수 없다" 가 뜬다. '종료 안내 화면' 같은 건 아직 없다.
 */
export const FAQS = [
  {
    q: '문의는 어떻게 하나요?',
    a: '카카오 오픈채팅으로 받고 있습니다. 문의하기를 누르시면 고르신 서비스에 맞는 양식이 만들어집니다. 복사해 붙여넣고 채워 보내 주시면 금액과 일정을 알려 드립니다.',
  },
  {
    /* 커미션에서 제일 많이 받는 질문이다. **숫자는 안 적는다** — 문의를 받아 알려 준다 */
    q: '얼마인가요?',
    a: '고르신 서비스와 기간에 따라 정해진 금액이 있습니다. 문의 주시면 바로 알려 드립니다.',
  },
  {
    q: '앱을 설치해야 하나요?',
    a: '아닙니다. QR을 찍으면 브라우저에서 바로 열립니다. 카페에 오신 분들은 아무것도 설치하지 않으셔도 됩니다.',
  },
  {
    q: '기간이 끝나면 어떻게 되나요?',
    a: '주소가 닫혀 페이지를 찾을 수 없다고 나옵니다. 럭키드로우처럼 행사 뒤에 꺼낼 자료가 있는 서비스는 종료 +14일까지 내려받으실 수 있고, 그 뒤에는 지워집니다.',
  },
  {
    q: '손님 사진은 서버에 저장되나요?',
    a: '포토존은 찍은 폰 안에서 합성하고 저장까지 끝납니다. 손님 사진은 서버에 올라가지 않습니다.',
  },
  {
    q: '여러 서비스를 같이 쓸 수 있나요?',
    a: '한 주소에는 서비스 하나입니다. 여러 개가 필요하시면 주소를 여러 개 열어 같은 행사로 묶습니다. QR도 그만큼 나갑니다.',
  },
  {
    q: '체험 페이지에서 남긴 것은 어떻게 되나요?',
    a: '체험 주소는 샘플이 든 전용 페이지입니다. 마음껏 눌러 보셔도 되고, 쪽지·투표처럼 남에게 보이는 것은 저장되지 않게 막아 두었습니다.',
  },
]
