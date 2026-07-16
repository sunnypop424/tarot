import { hasSupabase } from '@/lib/repo/client'
import { devAssets } from './dev'
import { storageAssets } from './storage'
import type { AssetStore } from './types'

/**
 * 슬롯 이미지 저장소 — **어댑터 선택은 여기 한 줄뿐** (`repo/index.ts` 와 같은 규칙).
 *
 * Supabase 가 있으면 Storage 로, 없으면 개발 서버 미들웨어로. 편집기 화면은 어느 쪽인지 모른다.
 */
export const assets: AssetStore = hasSupabase ? storageAssets : devAssets

export type { AssetStore }

/** `name` 은 슬롯 폴더 기준 상대 경로. 예: `logo.png`, `cards/major-0.webp` */
export const uploadAsset = (slug: string, name: string, file: File) =>
  assets.upload(slug, name, file)

export const deleteAsset = (slug: string, name: string) => assets.remove(slug, name)

/** 이미 올라간 파일 목록 (슬롯 폴더 기준 상대 경로) */
export const listAssets = (slug: string) => assets.list(slug)

/** 카드 앞면들이 사는 곳 — `cardFrontBase` 에 그대로 들어간다 */
export const cardsBase = (slug: string) => assets.urlFor(slug, 'cards')

/** 업로드 파일의 확장자 (소문자, 점 없음) */
export function extOf(file: File): string {
  const m = /\.([a-z0-9]+)$/i.exec(file.name)
  return m ? m[1].toLowerCase() : 'png'
}

/**
 * URL 에서 저장 이름만 빼낸다 — 지울 때 쓴다.
 *
 * 저장된 값은 URL 이고(`.../logo.png?v=abc`), 지울 땐 경로가 필요하다.
 * **버전 쿼리를 안 떼면 지우기가 조용히 실패한다** — 그런 파일은 없으니까.
 */
export function nameFromUrl(url: string): string | null {
  const file = url.split('?')[0].split('/').pop()
  return file || null
}
