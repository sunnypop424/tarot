import type { AssetStore } from './types'

/**
 * 개발 서버 어댑터 — `scripts/vite-slot-assets.mjs` 미들웨어와 짝.
 *
 * 파일이 `public/slots/{slug}/` 에 실제로 떨어지므로 커밋하면 배포된다.
 * Supabase Storage 를 안 붙였을 때(=`.env.local` 이 없을 때)만 쓰인다.
 */

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('파일을 읽지 못했어요'))
    reader.readAsDataURL(file)
  })
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? '업로드 실패')
  return json as T
}

export const devAssets: AssetStore = {
  async upload(slug, name, file) {
    const dataUrl = await readAsDataUrl(file)
    const { url } = await post<{ url: string }>('/__slot-upload', { slug, name, dataUrl })
    return url
  },

  async remove(slug, name) {
    await post('/__slot-delete', { slug, name })
  },

  async list(slug) {
    const res = await fetch(`/__slot-assets?slug=${encodeURIComponent(slug)}`)
    if (!res.ok) return []
    const { files } = (await res.json()) as { files: string[] }
    return files
  },

  urlFor(slug, name) {
    return `/slots/${slug}/${name}`
  },
}
