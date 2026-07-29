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
    desc: '궁금한 질문을 고르면 카드를 뽑고 해석을 보여줍니다.',
    slug: '/demo-tarot',
    devices: [{ kind: 'phone', label: '손님 폰', path: '/demo-tarot' }],
  },
  {
    key: 'luckydraw',
    name: '럭키드로우',
    // 노출어는 '뽑기' 다 — '추첨'·'가챠' 는 코드에만 (`docs/DESIGN.md` 「용어」)
    desc: '스태프가 직접 경품을 뽑습니다. 등수, 잔여 재고 확인, 스크래치 연출까지 모두 지원합니다.',
    slug: '/demo-luckydraw',
    devices: [{ kind: 'tablet', label: '스태프 기기', path: '/demo-luckydraw' }],
  },
  {
    key: 'photocard',
    name: '포토카드 뽑기',
    desc: '랜덤 포토카드 뽑기입니다. 이미지 저장용, 실물 1장 증정용, 판매용 등 세 가지 방식으로 운영할 수 있습니다.',
    slug: '/demo-photocard',
    devices: [
      { kind: 'phone', label: '손님 폰', path: '/demo-photocard' },
      { kind: 'tablet', label: '스태프 기기 (판매)', path: '/demo-photocard-sale/staff' },
    ],
  },
  {
    key: 'rolling',
    name: '롤링페이퍼',
    desc: '팬들이 남긴 소중한 축하 메시지가 화면에 한 장씩 채워집니다.',
    slug: '/demo-rolling',
    devices: [
      { kind: 'screen', label: '벽 스크린', path: '/demo-rolling' },
      { kind: 'phone', label: '손님 폰', path: '/demo-rolling/write' },
    ],
  },
  {
    key: 'wish',
    name: '소원 나무',
    desc: '소원을 적어 등불로 매다는, 감성적인 밤하늘 버전의 롤링페이퍼입니다.',
    slug: '/demo-wish',
    devices: [
      { kind: 'screen', label: '나무 스크린', path: '/demo-wish' },
      { kind: 'phone', label: '손님 폰', path: '/demo-wish/write' },
    ],
  },
  {
    key: 'photozone',
    name: '포토존 프레임',
    desc: '촬영한 사진에 행사 전용 프레임을 씌워 저장할 수 있습니다.',
    slug: '/demo-photozone',
    devices: [{ kind: 'phone', label: '손님 폰', path: '/demo-photozone' }],
  },
  {
    key: 'cheer',
    name: '영상회 응원',
    desc: '팬들이 남긴 응원 문구가 상영 스크린에 말풍선으로 떠오릅니다.',
    slug: '/demo-cheer',
    devices: [
      { kind: 'phone', label: '손님 폰', path: '/demo-cheer' },
      { kind: 'overlay', label: '상영 화면', path: '/demo-cheer/overlay' },
    ],
  },
  {
    key: 'poll',
    name: '실시간 투표',
    desc: '현장에서 진행되는 즉석 투표입니다. 결과가 실시간으로 반영되어 나타납니다.',
    slug: '/demo-poll',
    devices: [{ kind: 'phone', label: '손님 폰', path: '/demo-poll' }],
  },
  {
    key: 'stamp',
    name: '방문 스탬프',
    // 노출어는 '선물' 이다 — '리워드'·'보상' 은 코드에만 (`docs/DESIGN.md` 「용어」)
    desc: '현장 암호를 통해 스탬프를 모으고, 완성 시 선물로 교환할 수 있습니다.',
    slug: '/demo-stamp',
    devices: [{ kind: 'phone', label: '손님 폰', path: '/demo-stamp' }],
  },
  {
    key: 'quiz',
    name: '최애 모의고사',
    desc: '퀴즈를 풀고 점수에 따른 특별한 칭호를 획득합니다.',
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
    tag: '보통 24시간 내 답변',
    desc: '10가지 서비스 중 이번 행사에 필요한 것을 선택합니다. 손님용 스마트폰만 사용할지, 현장 스크린이나 스태프 기기를 병행할지 함께 결정합니다.',
  },
  {
    no: '02',
    name: '제작 · 검수',
    tag: '수정은 최대 두 번까지',
    mark: true,
    /*
     * **시안을 먼저 보내는 방식이 아니다.** 검수일에 완성된 사이트를 그대로 드리고 거기서
     * 고친다. 그래서 검수일과 행사일 사이에 여유가 없으면 수정 두 번이 안 돌아간다 —
     * 그 권고를 문의 창과 양식(`inquiry.ts`)에도 같이 적어 둔다.
     */
    desc: '행사의 컨셉에 맞춰 페이지를 제작합니다. 시안을 미리 보내 드리는 방식이 아니라, 검수일에 완성된 사이트를 직접 전달해 드립니다. 확인하신 후 수정 사항을 말씀해 주시면 꼼꼼히 반영하며, 수정할 시간이 남도록 검수일은 행사일보다 여유 있게 잡아 주시는 편을 권해 드립니다.',
  },
  {
    no: '03',
    name: 'QR 인쇄',
    tag: '직접 다운로드 후 인쇄',
    desc: '전달해 드리는 관리자 화면에서 고해상도 QR 코드를 다운로드하실 수 있습니다. 이를 포스터나 테이블 배너 등에 자유롭게 배치하여 인쇄하시면 됩니다.',
  },
  {
    no: '04',
    name: '현장 운영',
    tag: '',
    desc: '준비된 페이지를 현장에서 바로 사용하시면 됩니다. 운영 중 예기치 못한 문제가 발생하면 빠르게 해결해 드립니다.',
  },
]

/**
 * 누가 무엇을 하나 — **표가 아니라 문단으로 쓴다.**
 * 두 칸으로 갈라 놓으면 계약서처럼 보이고, 그게 개인 커미션의 인상과 어긋난다.
 */
export const ROLE_MINE = {
  label: '제가 해드리는 일',
  body: '행사에 맞는 서비스 세팅, 맞춤형 페이지 디자인, 전용 웹 주소 및 관리자 계정 발급, 그리고 행사 중 발생하는 기술적 문제에 최대한 빠르게 대응하는 일입니다.',
}
export const ROLE_YOURS = {
  label: '주최자께서 준비해 주실 일',
  body: '페이지에 들어갈 텍스트(문항, 카드 내용 등) 작성, 디자인에 활용될 원본 로고 및 배경 이미지 제공, 경품 준비 및 재고 관리, 그리고 현장에서의 암호 안내와 실제 뽑기 진행입니다.',
}
/** 이 한 줄이 없으면 시안 단계에서 멈춘다 — 그래서 따로 세워 둔다 */
export const ROLE_NOTE =
  '웹페이지의 전체적인 디자인과 레이아웃은 제가 구성하지만, 베이스가 되는 로고와 배경 이미지 원본은 주최자께서 직접 제공해 주셔야 합니다.'

/**
 * 자주 묻는 것 — **없는 사실을 적지 않는다.**
 * 기간이 끝난 뒤 동작은 실제 구현(`slot_visible`)대로 적었다: 슬롯 행 자체가 안 읽혀
 * "페이지를 찾을 수 없다" 가 뜬다. '종료 안내 화면' 같은 건 아직 없다.
 */
export const FAQS = [
  {
    q: '문의는 어떻게 하나요?',
    a: "카카오톡 오픈채팅을 통해 문의를 받고 있습니다. '문의하기'를 누르시면 선택하신 서비스에 맞는 맞춤형 양식이 생성됩니다. 해당 양식을 복사하여 채팅방에 남겨주시면, 확인 후 정확한 견적과 일정을 안내해 드립니다.",
  },
  {
    /* 커미션에서 제일 많이 받는 질문이다. **숫자는 안 적는다** — 문의를 받아 알려 준다 */
    q: '비용은 어떻게 되나요?',
    a: '선택하신 서비스 종류와 운영 기간에 따라 정해진 기준 단가가 있습니다. 문의해 주시면 상세히 안내해 드립니다.',
  },
  {
    q: '별도의 앱을 설치해야 하나요?',
    a: '아닙니다. 제공해 드리는 QR 코드를 스캔하면 기본 브라우저에서 바로 열립니다. 카페를 방문하신 팬분들은 어떤 앱도 설치할 필요가 없습니다.',
  },
  {
    q: '행사 기간이 끝나면 페이지는 어떻게 되나요?',
    a: '접속 주소가 닫히며 페이지를 더 이상 찾을 수 없게 됩니다. 단, 럭키드로우처럼 행사 종료 후 확인이 필요한 데이터가 있는 서비스는 종료일 기준 14일 동안 다운로드하실 수 있으며, 그 이후에는 안전하게 영구 삭제됩니다.',
  },
  {
    q: '손님이 촬영한 사진은 서버에 저장되나요?',
    a: '포토존 서비스는 사진 촬영부터 프레임 합성, 기기 저장까지 모두 손님의 스마트폰 기기 내에서 처리됩니다. 따라서 손님의 사진은 저희 서버로 전송되거나 저장되지 않습니다.',
  },
  {
    q: '여러 서비스를 동시에 사용할 수 있나요?',
    a: '하나의 웹 주소에는 하나의 서비스만 배정됩니다. 여러 서비스가 필요하신 경우 주소를 여러 개 생성하여 하나의 행사로 묶어드리며, QR 코드 역시 서비스 개수만큼 발급됩니다.',
  },
  {
    q: '체험용 페이지에서 입력한 데이터는 어떻게 되나요?',
    a: '체험 주소는 기능 확인을 위한 샘플 전용 페이지입니다. 쪽지나 투표 등 다른 사람에게 보일 수 있는 기능들도 실제 서버에 기록이 남지 않도록 차단해 두었으니 안심하고 테스트해 보셔도 됩니다.',
  },
]
