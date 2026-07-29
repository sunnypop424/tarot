import { filledTheme } from '@/lib/theme'
import type { Slot } from '@/types/slot'

/**
 * 홈 화면에 추가했을 때 **무엇으로 열릴지**를 가르는 축.
 *
 * 손님은 QR 로 들어와 한 번 쓰고 말지만, **스태프는 기기를 들고 하루를 난다** — 그래서
 * 스태프 기기에는 전날 미리 붙여 두시라고 안내한다(랜딩 FAQ · `owner/guide.ts`).
 */
export type PwaArea = 'visitor' | 'admin' | 'staff'

/** 영역별 진입 경로와 앱 이름 꼬리표 — 셋이 한 줄에 있어야 어긋나지 않는다 */
const AREA = {
  visitor: { path: '', suffix: '' },
  admin: { path: '/admin', suffix: ' 관리자' },
  staff: { path: '/staff', suffix: ' 스태프' },
} as const

/**
 * 슬롯별 **웹앱 매니페스트 + iOS 메타**를 문서에 심는다.
 *
 * 브라우저의 "홈 화면에 추가" 를 누르면, 이 이벤트의 **이름·아이콘**으로 열리는 웹앱이 된다.
 * 별도 설치 버튼은 두지 않는다(브라우저 기본을 쓴다). 서비스워커·오프라인 캐시는 없다 —
 * "홈 화면 추가" 만 목적이다.
 *
 * **지금 보고 있는 영역으로 열린다.** 예전엔 어디서 추가하든 `start_url` 이 손님 화면이라,
 * 스태프가 뽑기 화면을 붙여 놓고 눌러도 손님 화면이 떴다 — 붙여 두는 이유가 사라지는 버그였다.
 * `scope` 는 셋 다 `/{slug}` 로 둔다(관리 화면이 손님 화면으로 넘어가도 앱 안에 머문다).
 *
 * **매니페스트가 슬롯마다 다르다** → 정적 파일로 못 둔다. Blob 으로 만들어 `<link rel="manifest">`
 * 에 건다. 이때 **URL 은 절대경로**여야 한다 — blob: 매니페스트엔 기준 경로가 없어 상대 start_url
 * 이 안 풀린다. iOS 는 매니페스트를 거의 무시하므로 apple-touch-icon·메타를 따로 심는다.
 *
 * 편집기 미리보기(iframe)에선 부르지 않는다 — 미리보기가 부모의 매니페스트를 갈아치우면 안 된다.
 */
export function applyPwaHead(slot: Slot, area: PwaArea = 'visitor'): () => void {
  const origin = window.location.origin
  const abs = (u: string) => {
    try {
      return new URL(u, origin).href
    } catch {
      return u
    }
  }
  /**
   * 손으로(SQL·API) 만든 슬롯엔 `theme: {}` 라 `assets`·`colors` 가 통째로 없다 —
   * 여기서 읽다 **앱이 죽었다**(하얀 화면). 이 함수는 슬롯을 그대로 받으므로 여기서도 채운다
   * (SlotProvider 가 이미 채워 넘기지만, 부르는 곳이 늘면 그 보장이 깨진다).
   */
  const theme = filledTheme(slot.theme)
  /**
   * 슬롯이 앱 아이콘을 안 올렸으면 **기본 아이콘으로 떨어진다.**
   *
   * 없으면 그냥 안 붙였었는데, 아이콘이 없는 매니페스트는 크롬이 '설치' 를 아예 안 띄우고
   * iOS 는 홈 화면에 **화면 캡처**를 박아 넣는다 — 스태프 기기를 붙여 두라고 안내하는
   * 마당에 그건 안 된다. 파일은 `scripts/make-app-icon.mjs` 가 만든다(손으로 만든
   * 바이너리를 두지 않는다).
   */
  const custom = theme.assets.appIcon ? abs(theme.assets.appIcon) : null
  const icon = custom ?? abs('/app-icon-192.png')
  const icons = custom
    ? [
        { src: custom, sizes: '192x192', purpose: 'any' },
        { src: custom, sizes: '512x512', purpose: 'any' },
        { src: custom, sizes: '512x512', purpose: 'maskable' },
      ]
    : [
        { src: abs('/app-icon-192.png'), sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: abs('/app-icon-512.png'), sizes: '512x512', type: 'image/png', purpose: 'any' },
        // 기본 아이콘은 가장자리까지 배경이라 마스크로 잘려도 마크가 안 잘린다
        { src: abs('/app-icon-512.png'), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ]
  const { path, suffix } = AREA[area]
  const name = `${slot.name || '이벤트'}${suffix}`
  const canvas = theme.colors.canvas || '#0f1020'

  const manifest: Record<string, unknown> = {
    name,
    short_name: name.slice(0, 12),
    start_url: `${origin}/${slot.slug}${path}`,
    scope: `${origin}/${slot.slug}`,
    display: 'standalone',
    background_color: canvas,
    theme_color: canvas,
    icons,
  }

  const created: Element[] = []
  const blobUrl = URL.createObjectURL(
    new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' })
  )

  const manifestLink = document.createElement('link')
  manifestLink.rel = 'manifest'
  manifestLink.href = blobUrl
  document.head.appendChild(manifestLink)
  created.push(manifestLink)

  // iOS 는 이게 없으면 홈 화면에 화면 캡처를 박는다 — 기본 아이콘이라도 반드시 건다
  const appleIcon = document.createElement('link')
  appleIcon.rel = 'apple-touch-icon'
  appleIcon.href = icon
  document.head.appendChild(appleIcon)
  created.push(appleIcon)

  const appleTitle = document.createElement('meta')
  appleTitle.name = 'apple-mobile-web-app-title'
  appleTitle.content = name
  document.head.appendChild(appleTitle)
  created.push(appleTitle)

  return () => {
    for (const el of created) el.remove()
    URL.revokeObjectURL(blobUrl)
  }
}
