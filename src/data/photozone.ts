import { serviceTheme } from './serviceTheme'
import type { Slot } from '@/types/slot'
import type { FontId } from './fonts'
import type { DisplayI18n } from './multilingual'

/**
 * 포토존 **겉모습** — 최고관리자가 슬롯 편집기에서 정한다 (주최자는 못 건드린다).
 *
 * 롤링페이퍼(`rollingDisplay`)·럭키드로우(`luckydrawDisplay`)와 같은 짝이다.
 *
 * **이 서비스는 서버에 아무것도 저장하지 않는다** — 설정은 여기(슬롯 jsonb), 프레임 PNG 는
 * Storage, 방문자 사진은 폰에서 합성해 바로 내려받는다. `repo` 가 없는 유일한 서비스라
 * 어떤 어댑터에서도 100% 동작한다.
 */
export interface PhotozoneDisplay {
  /**
   * 주최자가 언어별로 적어 둔 값 — 키는 이 설정의 필드 이름이다.
   * `useLocalizedDisplay` 가 화면을 그리기 전에 갈아 끼운다 (`src/i18n/display.ts`).
   */
  i18n?: DisplayI18n

  /** 화면 제목 (편집 가능, 고정 아님) */
  title: string
  showTitle: boolean
  /** 제목 아래 한 줄 안내 */
  subtitle: string
  showSubtitle: boolean

  /**
   * 씌울 프레임들 — **URL 배열이 아니라 객체 배열이다** (롤페 `stickers: string[]` 과 다르다).
   *
   * 이름표가 필요하고("정면컷"), 무엇보다 **출력 비율**을 알아야 한다: 합성 캔버스 크기를
   * 프레임 자연 크기로 잡는데, 그걸 런타임에 재면 첫 그리기가 눈에 띄게 늦는다.
   * 업로드할 때 `useImageAsset` 이 잰 값을 굳혀 저장한다.
   */
  frames: PhotozoneFrame[]

  /**
   * 사진을 어떻게 받을지.
   *
   * **`upload` 폴백은 항상 살아 있어야 한다** — 카메라가 막히는 환경이 실재한다
   * (비-secure origin, 권한 거부, 카메라 없는 기기). `camera` 로 정해도 화면은 실패 시
   * 업로드로 떨어진다. 이 값은 "무엇을 먼저 권할지" 에 가깝다.
   */
  captureMode: 'camera' | 'upload' | 'both'
  /** 어느 쪽 카메라로 시작할지 — 인생네컷은 전면, 포토존 배경 찍기는 후면 */
  facing: 'user' | 'environment'

  /** 결과물 구석에 얹을 이벤트 로고 **URL** — 확산 장치이자 출처 표시. 비면 안 얹는다 */
  watermark: string
  watermarkPos: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'

  /** 촬영 화면 상단 안내 */
  guide: string
  saveLabel: string
  retakeLabel: string
  shootLabel: string
  uploadLabel: string

  /** 화면 기본 글꼴 */
  font: FontId
  headText: string
  subText: string
  buttonColor: string
  /** 배경색 — 배경 이미지가 없을 때 */
  bg: string
  /** 배경 이미지 **URL** — 비면 배경색 */
  bgImage: string
  bgRepeat: boolean
  /** 헤더 로고 **URL** — 비면 제목 텍스트만 */
  logo: string
  logoAlign: 'left' | 'center' | 'right'
}

export interface PhotozoneFrame {
  /** 업로드 시 만든 고유 id — 파일명과 같다 (`{slug}/photozone/{id}.{ext}`) */
  id: string
  /** 방문자에게 보이는 이름 — "정면컷", "네컷" */
  name: string
  /** 업로드 URL (투명 PNG) */
  src: string
  /** 가로 / 세로 — 업로드할 때 재서 굳힌다 (위 `frames` 주석) */
  ratio: number
}

export const DEFAULT_PHOTOZONE: PhotozoneDisplay = {
  title: '포토존',
  showTitle: true,
  subtitle: '프레임을 골라 인증샷을 남겨 보세요',
  showSubtitle: true,
  frames: [],
  captureMode: 'both',
  facing: 'user',
  watermark: '',
  watermarkPos: 'bottom-right',
  guide: '프레임에 맞춰 찍어 주세요',
  saveLabel: '저장',
  retakeLabel: '다시 찍기',
  shootLabel: '바로 찍기',
  uploadLabel: '사진 올리기',
  font: 'pretendard',
  /*
   * 색은 비워 둔다 — 안 고르면 **슬롯 테마에서 파생한다** (`serviceTheme.ts`).
   * **촬영·실패 화면은 여기 없다** — 그 둘은 어느 이벤트든 검다(프리뷰가 주인공이라 주변이
   * 밝으면 눈이 그리로 간다). 그 고정색은 `Photozone.module.css` 의 `[data-stage='live']` 에 있다.
   */
  headText: '',
  subText: '',
  buttonColor: '',
  bg: '',
  bgImage: '',
  bgRepeat: false,
  logo: '',
  logoAlign: 'left',
}

/**
 * 슬롯 설정 + 기본값 — **키 단위로 채운다** (`rollingDisplay` 와 같은 이유).
 * `slot.photozone ?? DEFAULT` 로 뭉뚱그리면 한 값만 저장한 슬롯에서 나머지가 빈다.
 */
export function photozoneDisplay(slot: Slot): PhotozoneDisplay {
  const saved = (slot.photozone ?? {}) as Partial<PhotozoneDisplay>
  const base = serviceTheme(slot)
  return {
    /** 주최자가 언어별로 적어 둔 값 — 기본값이 없다 (안 적으면 없는 게 맞다) */
    i18n: saved.i18n,
    title: saved.title || DEFAULT_PHOTOZONE.title,
    showTitle: saved.showTitle ?? DEFAULT_PHOTOZONE.showTitle,
    subtitle: saved.subtitle ?? DEFAULT_PHOTOZONE.subtitle,
    showSubtitle: saved.showSubtitle ?? DEFAULT_PHOTOZONE.showSubtitle,
    // 빈 배열은 "프레임 없음(원본 그대로 찍는다)" 이라는 뜻이라 살린다
    frames: saved.frames ?? DEFAULT_PHOTOZONE.frames,
    captureMode: saved.captureMode || DEFAULT_PHOTOZONE.captureMode,
    facing: saved.facing || DEFAULT_PHOTOZONE.facing,
    // 빈 문자열은 "이미지 없음" 이라는 뜻이라 살린다
    watermark: saved.watermark ?? DEFAULT_PHOTOZONE.watermark,
    watermarkPos: saved.watermarkPos || DEFAULT_PHOTOZONE.watermarkPos,
    guide: saved.guide ?? DEFAULT_PHOTOZONE.guide,
    saveLabel: saved.saveLabel || DEFAULT_PHOTOZONE.saveLabel,
    retakeLabel: saved.retakeLabel || DEFAULT_PHOTOZONE.retakeLabel,
    shootLabel: saved.shootLabel || DEFAULT_PHOTOZONE.shootLabel,
    uploadLabel: saved.uploadLabel || DEFAULT_PHOTOZONE.uploadLabel,
    font: saved.font || DEFAULT_PHOTOZONE.font,
    // 색은 고른 값이 늘 이기고, 안 골랐으면 슬롯 테마를 따른다 (`serviceTheme.ts`)
    headText: saved.headText || base.headText,
    subText: saved.subText || base.subText,
    buttonColor: saved.buttonColor || base.button,
    bg: saved.bg || base.bg,
    bgImage: saved.bgImage ?? DEFAULT_PHOTOZONE.bgImage,
    bgRepeat: saved.bgRepeat ?? DEFAULT_PHOTOZONE.bgRepeat,
    logo: saved.logo ?? DEFAULT_PHOTOZONE.logo,
    logoAlign: saved.logoAlign || DEFAULT_PHOTOZONE.logoAlign,
  }
}
