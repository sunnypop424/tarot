import { useState } from 'react'
import { Upload, X } from 'lucide-react'

import { cssUrl } from '@/lib/image'
import { uploadAsset, deleteAsset, extOf, nameFromUrl } from './upload'
import styles from './Owner.module.css'

interface ImageFieldProps {
  slug: string
  label: string
  /** 슬롯 폴더 기준 저장 이름 (확장자 제외). 예: 'logo', 'background' */
  name: string
  /** 현재 값 (URL) */
  value: string | null
  onChange: (url: string | null) => void
  hint?: string
}

/** 로고·배경·뒷면처럼 한 장짜리 이미지 — 슬롯 이미지 저장소(`owner/upload`)에 올린다 */
export function ImageField({ slug, label, name, value, onChange, hint }: ImageFieldProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(file: File) {
    setBusy(true)
    setError(null)
    try {
      onChange(await uploadAsset(slug, `${name}.${extOf(file)}`, file))
    } catch (e) {
      setError(e instanceof Error ? e.message : '업로드 실패')
    } finally {
      setBusy(false)
    }
  }

  async function handleClear() {
    if (value) {
      // 저장된 값은 URL 이라 이름만 떼어낸다 (버전 쿼리 포함 — nameFromUrl 이 벗긴다)
      const file = nameFromUrl(value)
      if (file) await deleteAsset(slug, file).catch(() => {})
    }
    onChange(null)
  }

  return (
    <div className="field">
      <span className="field__label">{label}</span>

      {value ? (
        <div className={styles.imageRow}>
          <span className={styles.thumb}>
            <span className={styles.thumbImage} style={{ backgroundImage: cssUrl(value) }} />
          </span>
          <span className={`t-text-xs ${styles.imagePath}`}>{value}</span>
          <button type="button" className="btn-icon" aria-label={`${label} 지우기`} onClick={() => void handleClear()}>
            <X size={16} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <label className={styles.uploadBtn}>
          <Upload size={16} strokeWidth={2} aria-hidden="true" />
          {busy ? '올리는 중…' : '이미지 업로드'}
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            data-image-field={name}
            onChange={(e) => e.target.files?.[0] && void handleFile(e.target.files[0])}
          />
        </label>
      )}

      {hint && <span className="field__hint">{hint}</span>}
      {error && <span className="field__error">{error}</span>}
    </div>
  )
}
