import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
// @ts-expect-error — 개발 전용 플러그인 (JS)
import { slotAssets } from './scripts/vite-slot-assets.mjs'

/**
 * ANTHROPIC_API_KEY 는 **여기 없다.** AI 는 배포된 Edge Function 이 부르고,
 * 키는 그 함수 secret 으로만 산다 (docs/BACKEND.md §4). 개발도 같은 함수를 쓴다 —
 * 구현이 둘이면 프롬프트·한도가 어긋난다. 클라이언트는 VITE_AI_BASE 만 안다.
 */
export default defineConfig(() => {
  return {
    // slotAssets 는 apply:'serve' 라 프로덕션 빌드엔 관여하지 않는다
    plugins: [
      react(),
      slotAssets(),
    ],
    /**
     * **절대 경로여야 한다.** 이 앱은 슬러그로 직접 들어온다(QR 이 곧 `/seventeen-dino`).
     * SPA 리라이트가 그 주소에 index.html 을 주는데, 자산이 `./assets/…` 면 브라우저는
     * `/seventeen-dino/assets/…` 를 찾아 404 → 빈 화면이다. `/` 면 어느 깊이에서 들어와도 맞는다.
     */
    base: '/',
    server: {
      port: 5174,
      strictPort: true,
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  }
})
