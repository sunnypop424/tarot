import type { Slot } from '@/types/slot'

/**
 * 슬러그 규칙 — 슬러그는 URL 경로이자 이미지 폴더 이름(`public/slots/{slug}/`)이다.
 * scripts/vite-slot-assets.mjs 의 SAFE_SLUG 와 맞춘다 (거기서 걸리면 업로드가 통째로 실패한다).
 * 소문자만 받는 건 대소문자를 안 가리는 파일시스템에서 두 슬롯이 한 폴더를 쓰게 되는 걸 막기 위해서다.
 */
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/

/** 라우터가 먼저 잡아가는 경로 — 이런 슬러그는 열리지 않는다 */
const RESERVED = ['theme-editor', 'login']

/** 통과면 null, 아니면 사람이 읽을 이유 */
export function validateSlug(slug: string, slots: Slot[], current?: string): string | null {
  if (!slug) return '슬러그를 입력해 주세요.'
  if (!SLUG_PATTERN.test(slug)) {
    return '영문 소문자 · 숫자 · 하이픈만 쓸 수 있어요 (시작은 문자나 숫자).'
  }
  if (RESERVED.includes(slug)) return `/${slug} 는 시스템이 쓰는 주소예요.`
  if (slots.some((s) => s.slug === slug && s.slug !== current)) {
    return '이미 있는 슬러그예요.'
  }
  return null
}
