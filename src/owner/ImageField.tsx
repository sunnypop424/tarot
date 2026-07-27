import { useState } from 'react'
import { Image as ImageIcon } from 'lucide-react'

import { cssUrl } from '@/lib/image'
import { uploadAsset, deleteAsset, extOf, nameFromUrl } from './upload'

interface ImageFieldProps {
  slug: string
  label: string
  /** 슬롯 폴더 기준 저장 이름 (확장자 제외). 예: 'logo', 'background' */
  name: string
  /** 현재 값 (URL) */
  value: string | null
  onChange: (url: string | null) => void
  hint?: string
  /** 카드 안에 함께 뜨는 제목 (시안: 카드뒷면·수정구슬·앱아이콘). 없으면 바깥 라벨을 caller 가 단다. */
  title?: string
  /** 썸네일 크기·모양 (시안: 로고 46, 카드뒷면 52×78, 수정구슬 원형 56, 앱아이콘 60) */
  thumbW?: number
  thumbH?: number
  thumbRadius?: number
}

/**
 * 한 장짜리 이미지 업로드 — 시안 그대로 **썸네일 미리보기 + 흰 알약 "파일 선택" 버튼**.
 * 저장은 슬롯 이미지 저장소(`owner/upload`)에. 올린 이미지는 썸네일에 배경으로 그린다
 * (`<img>` 는 모바일에서 길게 눌러 저장되니 안 쓴다 — CLAUDE.md).
 */
export function ImageField({
  slug,
  label,
  name,
  value,
  onChange,
  hint,
  title,
  thumbW = 46,
  thumbH = 46,
  thumbRadius = 4,
}: ImageFieldProps) {
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

  const iconSize = Math.round(Math.min(thumbW, thumbH) * 0.34)

  return (
    <div style={{ display: 'flex', gap: 11, alignItems: 'center', minWidth: 0 }}>
      <span
        aria-hidden="true"
        style={{
          width: thumbW,
          height: thumbH,
          flexShrink: 0,
          borderRadius: thumbRadius,
          border: '1px solid #eeeeee',
          backgroundColor: '#f7f7f7',
          color: '#8a8a8a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          ...(value ? { backgroundImage: cssUrl(value), backgroundSize: 'cover', backgroundPosition: 'center' } : null),
        }}
      >
        {!value && <ImageIcon size={iconSize} strokeWidth={1.8} aria-hidden="true" />}
      </span>
      <div style={{ minWidth: 0 }}>
        {title && <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>{title}</div>}
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          <label
            style={{
              height: 28,
              display: 'inline-flex',
              alignItems: 'center',
              padding: '0 10px',
              border: '1px solid #dddddd',
              background: '#fff',
              borderRadius: 9999,
              fontSize: 11.5,
              fontWeight: 700,
              color: '#505050',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {busy ? '올리는 중…' : '파일 선택'}
            <input
              type="file"
              accept="image/*"
              style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', border: 0 }}
              data-image-field={name}
              onChange={(e) => e.target.files?.[0] && void handleFile(e.target.files[0])}
            />
          </label>
          {value && (
            <button
              type="button"
              aria-label={`${label} 지우기`}
              onClick={() => void handleClear()}
              style={{
                height: 28,
                padding: '0 10px',
                border: '1px solid #f7d5d4',
                background: '#fff',
                borderRadius: 9999,
                fontSize: 11.5,
                fontWeight: 700,
                color: '#f16361',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              제거
            </button>
          )}
        </div>
        {hint && <div style={{ fontSize: 11, color: '#8a8a8a', marginTop: 6, lineHeight: 1.5 }}>{hint}</div>}
        {error && <div style={{ fontSize: 11, color: '#f16361', marginTop: 4 }}>{error}</div>}
      </div>
    </div>
  )
}
