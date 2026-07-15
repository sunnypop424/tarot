/**
 * 슬롯 이미지 업로드 — 개발 서버의 미들웨어(scripts/vite-slot-assets.mjs)와 짝.
 * 파일은 `public/slots/{slug}/` 에 실제로 저장되므로, 그대로 커밋하면 배포된다.
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

/** `name` 은 슬롯 폴더 기준 상대 경로. 예: 'logo.png', 'cards/major-0.webp' */
export async function uploadAsset(slug: string, name: string, file: File): Promise<string> {
  const dataUrl = await readAsDataUrl(file)
  const { url } = await post<{ url: string }>('/__slot-upload', { slug, name, dataUrl })
  return url
}

export async function deleteAsset(slug: string, name: string): Promise<void> {
  await post('/__slot-delete', { slug, name })
}

/** 이미 올라간 파일 목록 (슬롯 폴더 기준 상대 경로) */
export async function listAssets(slug: string): Promise<string[]> {
  const res = await fetch(`/__slot-assets?slug=${encodeURIComponent(slug)}`)
  if (!res.ok) return []
  const { files } = (await res.json()) as { files: string[] }
  return files
}

/** 업로드 파일의 확장자 (소문자, 점 없음) */
export function extOf(file: File): string {
  const m = /\.([a-z0-9]+)$/i.exec(file.name)
  return m ? m[1].toLowerCase() : 'png'
}
