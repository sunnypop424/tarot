import type { ServiceId } from '@/data/services'

/**
 * 편집기 미리보기에서 고를 수 있는 **화면 목록** — 서비스마다 다르다.
 *
 * 예전엔 럭키드로우(`draw`/`result`/`summary`)와 롤페·소원나무(`wall`/`write`)만 화면을
 * 고를 수 있었고, 그것도 각각 다른 방식이었다: 럭드는 postMessage 로 상태를 보내고
 * 롤페는 iframe 주소를 바꿨다. 나머지 서비스는 첫 화면 하나만 보였다 —
 * **색을 고르는 사람이 결과 화면·보상 화면을 못 보고 배포했다는 뜻이다.**
 *
 * 여기 한 곳에 모으고 두 방식을 다 담는다:
 *  - `path` — 주소가 다른 화면 (롤페의 `/write`, 포토카드의 `/staff`)
 *  - `state` — 같은 주소 안의 단계 (럭드의 당첨, 모의고사의 결과)
 *
 * **`state` 값은 각 앱의 내부 화면 이름(`View`)과 똑같이 쓴다.** 앱이 받아서 그대로
 * 그 화면에 고정하므로, 이름이 어긋나면 미리보기가 조용히 첫 화면으로 떨어진다.
 *
 * **`Record<ServiceId, …>` 라 서비스를 추가하면 여기가 컴파일 에러로 터진다** —
 * "미리보기에 화면을 안 넣었다" 를 조용히 지나가지 않게.
 *
 * **주최자 화면은 안 넣는다.** 그건 고정 라이트라 슬롯 색과 무관하고, 편집기에서 볼 이유가
 * 없다. 반대로 **스태프 화면은 넣는다** — 슬롯 색을 쓰고 손님이 같이 보는 화면이라
 * 색을 고르는 자리에서 확인해야 한다.
 */
export interface PreviewScreen {
  /** postMessage 로 앱에 보내는 상태값. 앱이 이 값을 읽어 화면을 고정한다 */
  state: string
  label: string
  /** 주소가 다르면 여기에 (슬러그 뒤에 붙는다). 없으면 첫 화면 */
  path?: string
}

export const PREVIEW_SCREENS: Record<ServiceId, PreviewScreen[]> = {
  // 타로는 탭바로 움직이는 앱이라 화면 이동이 미리보기 안에서 그대로 된다
  tarot: [{ state: 'home', label: '홈' }],
  luckydraw: [
    { state: 'draw', label: '뽑기' },
    { state: 'result', label: '당첨' },
    { state: 'summary', label: '전체 결과' },
  ],
  rolling: [
    { state: 'wall', label: '벽' },
    { state: 'write', label: '작성 화면', path: '/write' },
  ],
  wish: [
    { state: 'wall', label: '나무' },
    { state: 'write', label: '소원 적기', path: '/write' },
  ],
  // 카메라는 미리보기에서 못 연다(권한) — 프레임 고르는 화면만 실제로 뜬다
  photozone: [{ state: 'ready', label: '프레임 고르기' }],
  poll: [
    { state: 'list', label: '투표 목록' },
    { state: 'vote', label: '투표하기' },
    { state: 'result', label: '결과' },
  ],
  stamp: [
    { state: 'board', label: '스탬프판' },
    { state: 'code', label: '암호 입력' },
    { state: 'reward', label: '교환권' },
    { state: 'entered', label: '응모 완료' },
  ],
  quiz: [
    { state: 'start', label: '시작' },
    { state: 'run', label: '문항' },
    { state: 'grading', label: '채점 중' },
    { state: 'result', label: '결과' },
    { state: 'reward', label: '교환권' },
    { state: 'entered', label: '응모 완료' },
  ],
  cheer: [
    { state: 'write', label: '한마디 입력' },
    { state: 'overlay', label: '오버레이', path: '/overlay' },
    { state: 'credits', label: '엔딩크레딧', path: '/credits' },
  ],
  photocard: [
    { state: 'deck', label: '덱' },
    { state: 'drawing', label: '뽑는 중' },
    { state: 'result', label: '결과' },
    { state: 'locker', label: '보관함' },
    { state: 'ticketIntro', label: '뽑기권 받기' },
    { state: 'ticket', label: '뽑기권 (발급 후)' },
    { state: 'staff', label: '스태프 화면', path: '/staff' },
  ],
}
