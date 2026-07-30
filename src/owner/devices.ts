import type { ServiceId } from '@/data/services'

/**
 * 미리보기 기기 — **어느 서비스든 고를 수 있다.**
 *
 * 예전엔 럭키드로우만 아이패드를 골랐다. 그런데 부스에 세워두는 화면은 럭드만이 아니다 —
 * 포토카드 스태프 기기·투표 스크린도 태블릿이고, 방문자 폰으로 여는 화면도 기기마다 다르다.
 * 실제로 쓸 기기로 맞춰 봐야 여백·글자 크기가 어긋나지 않는다.
 */
export const DEVICES = [
  { id: 'phone', w: 390, h: 844, label: '폰 세로 (390×844)' },
  { id: 'phone-l', w: 430, h: 932, label: '큰 폰 세로 (430×932)' },
  { id: 'pad-mini', w: 1024, h: 768, label: '아이패드 미니 가로' },
  { id: 'pad-air', w: 1180, h: 820, label: '아이패드 에어 가로' },
  { id: 'pad-pro', w: 1366, h: 1024, label: '아이패드 프로 가로' },
  { id: 'pad-port', w: 820, h: 1180, label: '아이패드 세로' },
  /*
   * 상영 화면(영상회 오버레이·엔딩크레딧)은 기기가 아니라 **영상 비율**로 본다 —
   * 프로젝터·모니터·OBS 캔버스가 다 다르지만 결국 16:9 아니면 4:3 이다.
   */
  { id: 'screen-169', w: 1280, h: 720, label: '상영 화면 16:9' },
  { id: 'screen-43', w: 1024, h: 768, label: '상영 화면 4:3' },
] as const

export type DeviceId = (typeof DEVICES)[number]['id']

/** 서비스마다 **실제로 쓰는 기기**가 다르다 — 처음 열 때 그걸로 맞춰 준다 */
export const DEFAULT_DEVICE: Record<ServiceId, DeviceId> = {
  tarot: 'phone',
  // 부스에 세워두는 아이패드 가로 (원본 빌더가 그렇게 쓰였다)
  luckydraw: 'pad-pro',
  rolling: 'phone',
  wish: 'phone',
  photozone: 'phone',
  // 스크린이 태블릿이다 (방문자 투표는 폰이라 바꿔 볼 수 있어야 한다)
  poll: 'pad-air',
  stamp: 'phone',
  quiz: 'phone',
  photocard: 'phone',
  // 상영 화면이 이 서비스의 본체다 — 기본을 16:9 로 (입력 화면은 폰으로 바꿔 본다)
  cheer: 'screen-169',
}

