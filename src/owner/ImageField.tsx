import { useState } from 'react'
import { Image as ImageIcon, Upload } from 'lucide-react'

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

/**
 * 한 장짜리 이미지 업로드 — 시안 그대로 **썸네일 미리보기 + 흰 "파일 선택" 버튼**.
 * 저장은 슬롯 이미지 저장소(`owner/upload`)에. 올린 이미지는 썸네일에 그대로 뜬다.
 */
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
      const file = nameFromUrl(value)
      if (file) await deleteAsset(slug, file).catch(() => {})
    }
    onChange(null)
  }

  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <div className={styles.imgUpload}>
        <span
          className={styles.imgThumb}
          style={value ? { backgroundImage: cssUrl(value) } : undefined}
          aria-hidden="true"
        >
          {!value && <ImageIcon size={20} strokeWidth={1.8} aria-hidden="true" />}
        </span>
        <div className={styles.imgUploadBody}>
          <div className={styles.imgBtnRow}>
            <label className={styles.imgFileBtn}>
              <Upload size={13} strokeWidth={2} aria-hidden="true" />
              {busy ? '올리는 중…' : '파일 선택'}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                data-image-field={name}
                onChange={(e) => e.target.files?.[0] && void handleFile(e.target.files[0])}
              />
            </label>
            {value && (
              <button type="button" className={styles.imgRemove} onClick={() => void handleClear()}>
                제거
              </button>
            )}
          </div>
          {hint && (
            <span className="field__hint" style={{ display: 'block', marginTop: 6 }}>
              {hint}
            </span>
          )}
          {error && (
            <span className="field__error" style={{ display: 'block', marginTop: 4 }}>
              {error}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
