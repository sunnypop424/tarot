import { useState } from 'react'
import { Upload, X } from 'lucide-react'

import { cssUrl } from '@/lib/image'
import { uploadAsset, deleteAsset, extOf, nameFromUrl } from './upload'
import styles from './Owner.module.css'

interface StickerFieldProps {
  slug: string
  label: string
  /** 올라간 스티커 URL 목록 (`slot.rolling.stickers`) */
  value: string[]
  onChange: (next: string[]) => void
  hint?: string
}

/**
 * 스티커 세트 — 여러 장짜리 이미지 (`ImageField` 의 다중 버전).
 *
 * 최고관리자가 올리고 방문자가 그중에서 골라 카드에 붙인다 (주최자가 원본을 넘긴다 — 업로드 권한은
 * owner-only Storage 라 최고관리자에게만 있다). 로고·배경처럼 **저장값은 전체 URL** 이고 화면이
 * 그대로 background-image 로 그린다.
 */
export function StickerField({ slug, label, value, onChange, hint }: StickerFieldProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFiles(files: FileList) {
    setBusy(true)
    setError(null)
    try {
      const added: string[] = []
      for (const file of Array.from(files)) {
        // 슬롯 폴더의 rolling/ 아래에. 이름이 겹치면 덮어써(upsert) 사라지므로 고유 이름을 준다
        const name = `rolling/${crypto.randomUUID().slice(0, 8)}.${extOf(file)}`
        added.push(await uploadAsset(slug, name, file))
      }
      onChange([...value, ...added])
    } catch (e) {
      setError(e instanceof Error ? e.message : '업로드 실패')
    } finally {
      setBusy(false)
    }
  }

  async function removeOne(url: string) {
    // 저장값은 URL 이라 이름만 떼어낸다 (버전 쿼리 포함 — nameFromUrl 이 벗긴다). rolling/ 폴더 기준
    const file = nameFromUrl(url)
    if (file) await deleteAsset(slug, `rolling/${file}`).catch(() => {})
    onChange(value.filter((u) => u !== url))
  }

  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <div className={styles.cardGrid}>
        {value.map((url) => (
          <span key={url} className={styles.cardSlot}>
            <span className={styles.cardThumb} style={{ backgroundImage: cssUrl(url) }} />
            <button
              type="button"
              className="btn-icon"
              aria-label="스티커 지우기"
              onClick={() => void removeOne(url)}
            >
              <X size={14} strokeWidth={2} aria-hidden="true" />
            </button>
          </span>
        ))}
        <label className={styles.uploadBtn}>
          <Upload size={16} strokeWidth={2} aria-hidden="true" />
          {busy ? '올리는 중…' : '스티커 추가'}
          <input
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            data-sticker-field
            onChange={(e) => e.target.files?.length && void handleFiles(e.target.files)}
          />
        </label>
      </div>
      {hint && <span className="field__hint">{hint}</span>}
      {error && <span className="field__error">{error}</span>}
    </div>
  )
}
