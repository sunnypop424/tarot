/**
 * 랜딩에 싣는 내용 — **화면과 분리해 둔다.**
 *
 * 서비스가 늘 때 고칠 자리를 하나로 모으기 위해서다. 여기 있는 주소는 전부 **체험 슬롯**
 * (`/demo-*`, `scripts/seed-demo.mjs`)이고, 고객 슬롯은 랜딩 어디에도 나오지 않는다
 * (배포 루트에 슬롯 목록을 노출하지 않는다 — CLAUDE.md).
 */

/** 미리보기 기기 — 실제로 그 화면을 띄우는 물건에 맞춘다 */
export interface DemoDevice {
  label: string
  w: number
  h: number
  radius: number
}

export const DEVICES = {
  phone: { label: '손님 폰', w: 390, h: 844, radius: 42 },
  tablet: { label: '스태프 태블릿', w: 1194, h: 834, radius: 26 },
  board: { label: '현장 스크린', w: 1194, h: 834, radius: 22 },
  screen: { label: '상영 화면', w: 1280, h: 720, radius: 12 },
} satisfies Record<string, DemoDevice>

export type DeviceId = keyof typeof DEVICES

/**
 * 한 서비스가 보여줄 화면 — **둘 이상이면 나란히 띄운다** (기기가 여럿인 서비스가 있다).
 *
 * 한 기기가 **여러 화면**을 돌아가며 쓰기도 한다(영상회 상영 화면 = 오버레이 / 엔딩크레딧).
 * 그건 기기를 늘리는 게 아니라 그 기기 안에서 고르는 것이라 `variants` 로 둔다 —
 * 기기를 셋으로 늘리면 무대가 좁아져 셋 다 작아진다.
 */
export interface DemoVariant {
  label: string
  path: string
}

export interface DemoScreen {
  label: string
  device: DeviceId
  variants: DemoVariant[]
  /** 상영 화면처럼 배경이 투명하면 뒤에 어두운 판을 깔아야 보인다 */
  transparent?: boolean
}

export interface LandingService {
  key: string
  name: string
  desc: string
  /** 카드에 적는 기기 한 줄 */
  deviceNote: string
  group: 0 | 1 | 2
  screens: DemoScreen[]
}

/**
 * 서비스 열 개.
 *
 * **여러 기기를 쓰는 서비스는 화면을 여러 개 든다:**
 *  · 영상회 — 손님 폰 + 상영 화면(투명 오버레이)
 *  · 롤페·소원나무 — 스크린(벽·나무) + 손님 폰(작성)
 * 나머지는 화면 하나다. 스태프 화면(포토카드·스탬프·모의고사)은 **로그인 뒤에 있어** 못 싣는다 —
 * 랜딩에 걸면 손님이 잠긴 화면을 본다.
 */
export const SERVICES: LandingService[] = [
  {
    key: 'tarot',
    name: '타로카드',
    desc: '궁금한 걸 고르면 카드를 뽑고 해석이 나와요.',
    deviceNote: '손님 폰',
    group: 0,
    screens: [{ label: '손님', device: 'phone', variants: [{ label: '손님', path: '/demo-tarot' }] }],
  },
  {
    key: 'luckydraw',
    name: '럭키드로우',
    desc: '스태프가 경품을 추첨해요. 등수·재고·스크래치 연출까지.',
    deviceNote: '스태프 태블릿',
    group: 0,
    screens: [{ label: '스태프 기기', device: 'tablet', variants: [{ label: '추첨', path: '/demo-luckydraw' }] }],
  },
  {
    key: 'photocard',
    name: '포토카드 뽑기',
    desc: '레어도 뽑기. 저장용·1장 증정·판매 세 가지로 굴려요.',
    deviceNote: '손님 폰 + 스태프 기기',
    group: 0,
    /**
     * 운영 방식마다 **뽑는 사람이 다르다** — 저장용은 손님 폰, 판매는 스태프 기기다.
     * 그래서 체험 슬롯도 둘이다(`demo-photocard` · `demo-photocard-sale`).
     */
    screens: [
      { label: '손님 (저장용)', device: 'phone', variants: [{ label: '저장용', path: '/demo-photocard' }] },
      { label: '스태프 (판매)', device: 'tablet', variants: [{ label: '판매 N연차', path: '/demo-photocard-sale/staff' }] },
    ],
  },
  {
    key: 'rolling',
    name: '롤링페이퍼',
    desc: '팬들이 남긴 응원이 벽에 한 장씩 붙어요.',
    deviceNote: '스크린 + 손님 폰',
    group: 1,
    screens: [
      { label: '벽', device: 'board', variants: [{ label: '벽', path: '/demo-rolling' }] },
      { label: '남기기', device: 'phone', variants: [{ label: '남기기', path: '/demo-rolling/write' }] },
    ],
  },
  {
    key: 'wish',
    name: '소원 나무',
    desc: '소원을 적어 등불로 매달아요. 밤하늘 버전 롤링페이퍼.',
    deviceNote: '스크린 + 손님 폰',
    group: 1,
    screens: [
      { label: '나무', device: 'board', variants: [{ label: '나무', path: '/demo-wish' }] },
      { label: '소원 적기', device: 'phone', variants: [{ label: '소원 적기', path: '/demo-wish/write' }] },
    ],
  },
  {
    key: 'photozone',
    name: '포토존 프레임',
    desc: '사진에 그날의 프레임을 씌워 저장해요.',
    deviceNote: '손님 폰',
    group: 1,
    screens: [{ label: '손님', device: 'phone', variants: [{ label: '손님', path: '/demo-photozone' }] }],
  },
  {
    key: 'cheer',
    name: '영상회 응원',
    desc: '한마디가 상영 화면에 말풍선으로 떠요.',
    deviceNote: '손님 폰 + 상영 화면',
    group: 1,
    screens: [
      { label: '한마디', device: 'phone', variants: [{ label: '한마디', path: '/demo-cheer' }] },
      {
        label: '상영 화면',
        device: 'screen',
        transparent: true,
        // 상영 중엔 오버레이, 끝나면 엔딩크레딧 — 같은 기기에서 갈아탄다
        variants: [
          { label: '상영 중 (오버레이)', path: '/demo-cheer/overlay' },
          { label: '상영 후 (엔딩크레딧)', path: '/demo-cheer/credits' },
        ],
      },
    ],
  },
  {
    key: 'poll',
    name: '실시간 투표',
    desc: '즉석 투표. 결과가 그 자리에서 차올라요.',
    deviceNote: '손님 폰 · 스크린',
    group: 2,
    screens: [{ label: '손님', device: 'phone', variants: [{ label: '손님', path: '/demo-poll' }] }],
  },
  {
    key: 'stamp',
    name: '방문 스탬프',
    desc: '현장 암호로 도장을 모으고 다 모으면 선물로 바꿔요.',
    deviceNote: '손님 폰 · 스태프 기기',
    group: 2,
    screens: [{ label: '손님', device: 'phone', variants: [{ label: '손님', path: '/demo-stamp' }] }],
  },
  {
    key: 'quiz',
    name: '최애 모의고사',
    desc: '문제를 풀고 점수와 칭호를 받아요. 칭호 카드는 저장·공유까지.',
    deviceNote: '손님 폰',
    group: 2,
    screens: [{ label: '손님', device: 'phone', variants: [{ label: '손님', path: '/demo-quiz' }] }],
  },
]

export const GROUPS = [
  { name: '뽑는 것', hint: '그날의 운이 한 장으로 남아요' },
  { name: '남기는 것', hint: '팬들의 말과 사진이 쌓여요' },
  { name: '참여하고 모으는 것', hint: '카페 안에서 계속 움직여요' },
]

export const HERO_FACTS = [
  { k: '설치', v: '앱 없이 브라우저에서' },
  { k: '주소', v: '행사 하나에 하나' },
  { k: '기기', v: '폰 · 태블릿 · 스크린' },
  { k: '기간', v: '여는 날부터 닫는 날까지' },
]

export const STEPS = [
  {
    no: '01',
    name: '서비스 고르기',
    desc: '열 개 중 이번 행사에 쓸 것만 고르면 돼요. 기기 구성도 이때 같이 정해요.',
    meta: '문의 후 하루 이내',
  },
  {
    no: '02',
    name: '디자인',
    desc: '그날의 컨셉에 맞춰 페이지 전체를 새로 그려 시안으로 보내요.',
    meta: '시안 확인 후 수정',
  },
  {
    no: '03',
    name: 'QR 인쇄',
    desc: '완성된 주소의 QR을 받아 포스터나 테이블 안내에 붙이면 준비 끝이에요.',
    meta: '인쇄용 파일 전달',
  },
  {
    no: '04',
    name: '현장 운영',
    desc: '당일엔 주최자가 그대로 운영해요. 페이지가 잘 도는지는 계속 지켜보고 있어요.',
    meta: '행사 기간 내내',
  },
]

export const OURS = ['슬롯 제작과 서비스 구성', '그날의 페이지 디자인', '주소 발급과 QR 만들기', '행사 기간 내내 페이지 지키기']
export const THEIRS = ['문항과 카드 내용 준비', '경품 고르기와 재고 관리', '현장 암호 안내와 추첨 진행', '팬 응대와 당첨자 발표']

/**
 * 자주 묻는 것 — **없는 사실을 적지 않는다.**
 * 기간이 끝난 뒤 동작은 실제 구현(`slot_visible`)대로 적었다: 슬롯 행 자체가 안 읽혀
 * "페이지를 찾을 수 없다" 가 뜬다. '종료 안내 화면' 같은 건 아직 없다.
 */
export const FAQS = [
  {
    q: '문의는 어떻게 하나요?',
    a: '카카오 오픈채팅으로 받아요. 페이지의 문의하기를 누르면 고른 서비스에 맞는 양식이 만들어져요 — 복사해서 채팅방에 붙여넣고 채워 보내 주시면 금액과 일정을 확정해 드려요. 들어오시면 방 별명을 "행사기간 / 멤버이름" 으로 바꿔 주세요.',
  },
  {
    q: '앱을 설치해야 하나요?',
    a: '아니요. QR을 찍으면 브라우저에서 바로 열려요. 카페에 온 팬들은 아무것도 설치하지 않아요.',
  },
  {
    q: '기간이 끝나면 어떻게 되나요?',
    a: '대여 기간이 지나면 그 주소는 닫혀서 페이지를 찾을 수 없다고 나와요. 럭키드로우처럼 행사 뒤에 꺼낼 자료가 있는 서비스는 종료 +14일까지 주최자가 내려받을 수 있고, 그 뒤엔 슬롯째 지워져요.',
  },
  {
    q: '사진은 서버에 저장되나요?',
    a: '포토존 프레임은 찍은 폰 안에서 합성하고 저장까지 끝나요. 팬들의 사진은 서버에 올라가지 않아요.',
  },
  {
    q: '여러 서비스를 같이 쓸 수 있나요?',
    a: '한 주소에는 서비스 하나만 담아요. 여러 개가 필요하면 슬롯을 여러 개 열어 같은 행사로 묶어요 — QR도 그만큼 나가요.',
  },
  {
    q: '체험 페이지에서 남긴 건 어떻게 되나요?',
    a: '체험 주소는 샘플 데이터가 들어 있는 전용 슬롯이에요. 마음껏 눌러 보셔도 되고, 쪽지·투표처럼 남에게 보이는 건 저장되지 않게 막아 뒀어요.',
  },
]
