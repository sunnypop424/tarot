import { db, supabaseUrl } from '@/lib/repo/client'
import type { AssetStore } from './types'

/**
 * Supabase Storage 어댑터 — 슬롯 이미지가 브라우저 밖으로 나간다.
 *
 * 버킷 `slots` 는 **public read** (방문자가 로고·카드를 봐야 한다),
 * 쓰기는 최고관리자만 (정책은 `supabase/migrations/0002_storage.sql`).
 * 경로 규칙은 개발 서버 어댑터와 같다 — `{slug}/logo.png`, `{slug}/cards/major-0.webp`.
 */

const BUCKET = 'slots'

/**
 * 방문자 캐시는 길게, 편집자 눈에는 즉시.
 *
 * 같은 경로에 덮어쓰면(`upsert`) URL 이 그대로라 **브라우저가 옛 이미지를 계속 보여준다**
 * — 올렸는데 안 바뀌는 것처럼 보인다. Supabase Smart CDN 은 스스로 무효화하지만
 * 그건 유료 플랜 기능이고, 브라우저 캐시(TTL 1시간)까지 지워주지는 않는다.
 * 그래서 URL 에 버전을 붙여 **다른 URL 로 만든다** — 캐시를 지우는 대신 비껴간다.
 */
const CACHE_SECONDS = '3600'
const version = () => Date.now().toString(36)

/** `{프로젝트}/storage/v1/object/public/{버킷}/{경로}` — 공개 버킷의 고정 규칙 */
const publicUrl = (path: string) =>
  `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`

export const storageAssets: AssetStore = {
  async upload(slug, name, file) {
    const { error } = await (await db()).storage
      .from(BUCKET)
      .upload(`${slug}/${name}`, file, {
        upsert: true,
        cacheControl: CACHE_SECONDS,
        contentType: file.type || undefined,
      })
    if (error) throw new Error(error.message)
    return `${publicUrl(`${slug}/${name}`)}?v=${version()}`
  },

  async remove(slug, name) {
    const { error } = await (await db()).storage.from(BUCKET).remove([`${slug}/${name}`])
    if (error) throw new Error(error.message)
  },

  async list(slug) {
    const client = await db()
    // 한 번에 한 폴더만 준다 — 앞면은 cards/ 아래라 따로 훑는다 (규칙상 이 둘이 전부다)
    const [root, cards] = await Promise.all([
      client.storage.from(BUCKET).list(slug, { limit: 200 }),
      client.storage.from(BUCKET).list(`${slug}/cards`, { limit: 200 }),
    ])
    const files = (root.data ?? [])
      // 하위 폴더는 id 가 없는 자리표시자로 온다 — 파일만 남긴다
      .filter((f) => f.id)
      .map((f) => f.name)
    const cardFiles = (cards.data ?? []).filter((f) => f.id).map((f) => `cards/${f.name}`)
    return [...files, ...cardFiles]
  },

  urlFor(slug, name) {
    return publicUrl(`${slug}/${name}`)
  },
}
