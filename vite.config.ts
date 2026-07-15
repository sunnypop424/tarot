import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
// @ts-expect-error — 개발 전용 플러그인 (JS)
import { slotAssets } from './scripts/vite-slot-assets.mjs'

export default defineConfig({
  // slotAssets 는 apply:'serve' 라 프로덕션 빌드엔 관여하지 않는다
  plugins: [react(), slotAssets()],
  base: './',
  server: {
    port: 5174,
    strictPort: true,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
