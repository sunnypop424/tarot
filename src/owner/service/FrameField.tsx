import { useState } from 'react'
import { Upload, X } from 'lucide-react'

import type { PhotozoneFrame } from '@/data/photozone'
import { cssUrl } from '@/lib/image'
import { uploadAsset, deleteAsset, extOf, nameFromUrl } from '../upload'
import { CSS } from '../editorUi'
import styles from '../Owner.module.css'

/**
 * 포토존 프레임 세트 — `StickerField` 의 업로드 방식을 그대로 쓰되 **저장값이 URL 이 아니다.**
 *
 * 프레임은 이름표("정면컷")와 **비율**을 함께 들어야 한다. 비율이 필요한 이유는 합성 캔버스
 * 크기를 프레임 자연 크기로 잡기 때문이고, 그걸 방문자 화면에서 매번 재면 첫 그리기가 늦는다.
 * 그래서 **업로드하는 이 자리에서 한 번 재서 굳힌다.**
 *
 * 그래서 `StickerField`(URL 배열)를 못 쓰고 따로 만든다.
 */
export function FrameField({
  slug,
  value,
  onChange,
}: {
  slug: string
  value: PhotozoneFrame[]
  onChange: (next: PhotozoneFrame[]) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** 업로드한 이미지의 가로/세로 — 실패하면 3:4 세로로 둔다(프레임 대부분이 세로다) */
  function measure(url: string): Promise<number> {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => resolve(img.naturalHeight ? img.naturalWidth / img.naturalHeight : 3 / 4)
      img.onerror = () => resolve(3 / 4)
      img.src = url
    })
  }

  async function handleFiles(files: FileList) {
    setBusy(true)
    setError(null)
    try {
      const added: PhotozoneFrame[] = []
      for (const file of Array.from(files)) {
        // 이름이 겹치면 덮어써(upsert) 사라지므로 고유 id 를 준다 (StickerField 와 같은 규칙)
        const id = crypto.randomUUID().slice(0, 8)
        const src = await uploadAsset(slug, `photozone/${id}.${extOf(file)}`, file)
        added.push({
          id,
          // 파일명에서 확장자만 떼어 기본 이름으로 — 대개 "정면컷.png" 처럼 올린다
          name: file.name.replace(/\.[^.]+$/, '').slice(0, 20) || '프레임',
          src,
          ratio: await measure(src),
        })
      }
      onChange([...value, ...added])
    } catch (e) {
      setError(e instanceof Error ? e.message : '업로드 실패')
    } finally {
      setBusy(false)
    }
  }

  async function removeOne(f: PhotozoneFrame) {
    const file = nameFromUrl(f.src)
    if (file) await deleteAsset(slug, `photozone/${file}`).catch(() => {})
    onChange(value.filter((x) => x.id !== f.id))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={CSS.label}>프레임</span>

      {value.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }} data-frame-list>
          {value.map((f) => (
            <div key={f.id} style={{ width: 96, display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span className={styles.stickerSlot} style={{ position: 'relative', display: 'block' }}>
                {/**
                 * 투명 PNG 라 **체커보드가 있어야 투명 영역이 보인다** — 없으면 흰 프레임이
                 * 사라진 것처럼 보인다. 프레임 자체는 background-image (편집기 썸네일도 규칙이 같다).
                 */}
                <span
                  style={{
                    display: 'block',
                    width: '100%',
                    aspectRatio: String(f.ratio || 3 / 4),
                    borderRadius: 4,
                    border: '1px solid #eeeeee',
                    backgroundColor: '#fff',
                    backgroundImage: `${cssUrl(f.src)},
                      linear-gradient(45deg,#eee 25%,transparent 25%),
                      linear-gradient(-45deg,#eee 25%,transparent 25%),
                      linear-gradient(45deg,transparent 75%,#eee 75%),
                      linear-gradient(-45deg,transparent 75%,#eee 75%)`,
                    backgroundSize: 'contain, 10px 10px, 10px 10px, 10px 10px, 10px 10px',
                    backgroundPosition: 'center, 0 0, 0 5px, 5px -5px, -5px 0',
                    backgroundRepeat: 'no-repeat, repeat, repeat, repeat, repeat',
                  }}
                />
                <button
                  type="button"
                  className={`btn-icon ${styles.stickerRemove}`}
                  aria-label={`${f.name} 프레임 지우기`}
                  onClick={() => void removeOne(f)}
                >
                  <X size={14} strokeWidth={2} aria-hidden="true" />
                </button>
              </span>
              <input
                value={f.name}
                aria-label="프레임 이름"
                onChange={(e) =>
                  onChange(value.map((x) => (x.id === f.id ? { ...x, name: e.target.value } : x)))
                }
                style={{ ...CSS.input, height: 28, fontSize: 11.5 }}
              />
            </div>
          ))}
        </div>
      )}

      <label className={styles.uploadBtn}>
        <Upload size={16} strokeWidth={2} aria-hidden="true" />
        {busy ? '올리는 중…' : '프레임 추가'}
        <input
          type="file"
          accept="image/png,image/webp"
          multiple
          className="sr-only"
          data-frame-field
          onChange={(e) => e.target.files?.length && void handleFiles(e.target.files)}
        />
      </label>
      <span style={CSS.hint}>
        가운데가 뚫린 <b>투명 PNG</b> 로 올려 주세요. 사진이 그 구멍으로 비쳐요. 프레임 비율이
        곧 결과 사진 비율이에요.
      </span>
      {/**
       * **올리는 것과 저장하는 것이 다르다.** 파일은 올린 즉시 Storage 로 가지만 목록은 초안에만
       * 있어서, 저장 안 하고 나가면 목록만 날아가고 파일은 고아로 남는다 (실제로 그렇게 됐다).
       * 편집기 헤더의 "저장 안 됨" 배지만으로는 이 자리에서 안 보인다.
       */}
      {value.length > 0 && (
        <span style={{ ...CSS.hint, color: '#a15c17' }}>
          올린 프레임은 <b>저장하기</b>를 눌러야 손님 화면에 나가요. 저장 전에 나가면 목록이 사라져요.
        </span>
      )}
      {error && <span className="field__error">{error}</span>}
    </div>
  )
}
