import type { Slot } from '@/types/slot'

/**
 * 슬롯별 **웹앱 매니페스트 + iOS 메타**를 문서에 심는다.
 *
 * 방문자가 브라우저의 "홈 화면에 추가" 를 누르면, 이 이벤트의 **이름·아이콘**으로,
 * 이 슬롯(`/{slug}`)으로 열리는 웹앱이 된다. 별도 설치 버튼은 두지 않는다(브라우저 기본을 쓴다).
 * 서비스워커·오프라인 캐시는 없다 — "홈 화면 추가" 만 목적이다.
 *
 * **매니페스트가 슬롯마다 다르다** → 정적 파일로 못 둔다. Blob 으로 만들어 `<link rel="manifest">`
 * 에 건다. 이때 **URL 은 절대경로**여야 한다 — blob: 매니페스트엔 기준 경로가 없어 상대 start_url
 * 이 안 풀린다. iOS 는 매니페스트를 거의 무시하므로 apple-touch-icon·메타를 따로 심는다.
 *
 * 편집기 미리보기(iframe)에선 부르지 않는다 — 미리보기가 부모의 매니페스트를 갈아치우면 안 된다.
 */
export function applyPwaHead(slot: Slot): () => void {
  const origin = window.location.origin
  const abs = (u: string) => {
    try {
      return new URL(u, origin).href
    } catch {
      return u
    }
  }
  const icon = slot.theme.assets.appIcon ? abs(slot.theme.assets.appIcon) : null
  const name = slot.name || '이벤트'
  const canvas = slot.theme.colors.canvas || '#0f1020'

  const manifest: Record<string, unknown> = {
    name,
    short_name: name.slice(0, 12),
    start_url: `${origin}/${slot.slug}`,
    scope: `${origin}/${slot.slug}`,
    display: 'standalone',
    background_color: canvas,
    theme_color: canvas,
    ...(icon && {
      icons: [
        { src: icon, sizes: '192x192', purpose: 'any' },
        { src: icon, sizes: '512x512', purpose: 'any' },
        { src: icon, sizes: '512x512', purpose: 'maskable' },
      ],
    }),
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

  if (icon) {
    const appleIcon = document.createElement('link')
    appleIcon.rel = 'apple-touch-icon'
    appleIcon.href = icon
    document.head.appendChild(appleIcon)
    created.push(appleIcon)
  }

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
