import { useCallback, useEffect, useState } from 'react'
import { Upload } from 'lucide-react'

import { getDeck, type DeckRange } from '@/data/cards'
import { uploadAsset, listAssets, extOf } from './upload'
import styles from './ThemeEditor.module.css'

interface CardUploaderProps {
  slug: string
  /** 이 슬롯이 쓰는 덱 — 메이저만이면 22장, 전체면 78장 */
  deck: DeckRange
  ext: string
  onExtChange: (ext: string) => void
  /** 앞면 경로가 정해지면 알린다 (`/slots/{slug}/cards`) */
  onBaseChange: (base: string | null) => void
}

/**
 * 카드 앞면 업로드 — 카드마다 한 장씩, 최대 78장.
 * `cards/{cardId}.{ext}` 로 저장하면 CardFace 의 경로 규칙과 그대로 맞는다.
 */
export function CardUploader({ slug, deck, ext, onExtChange, onBaseChange }: CardUploaderProps) {
  const cards = getDeck(deck)
  const [files, setFiles] = useState<string[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setFiles(await listAssets(slug))
  }, [slug])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const uploaded = (cardId: string) => files.includes(`cards/${cardId}.${ext}`)
  const doneCount = cards.filter((c) => uploaded(c.id)).length

  async function handleFile(cardId: string, file: File) {
    setBusy(cardId)
    try {
      // 확장자는 첫 업로드를 따라간다 — 카드마다 형식이 섞이면 경로 규칙이 깨진다
      const useExt = files.length === 0 ? extOf(file) : ext
      if (useExt !== ext) onExtChange(useExt)
      await uploadAsset(slug, `cards/${cardId}.${useExt}`, file)
      onBaseChange(`/slots/${slug}/cards`)
      await refresh()
    } finally {
      setBusy(null)
    }
  }

  /** 여러 장 한 번에 — 파일명이 카드 id 와 같으면 자동 매칭 */
  async function handleBulk(fileList: FileList) {
    const byId = new Map(cards.map((c) => [c.id, c]))
    for (const file of Array.from(fileList)) {
      const id = file.name.replace(/\.[^.]+$/, '')
      if (!byId.has(id)) continue
      await handleFile(id, file)
    }
  }

  return (
    <>
      <div className={styles.cardHead}>
        <div>
          <p className="t-text-s">
            {doneCount} / {cards.length}장 업로드됨
          </p>
          <p className="field__hint">
            파일명을 카드 id 로 맞추면(예: major-0.webp) 한 번에 올릴 수 있어요. 확장자: .{ext}
          </p>
        </div>
        <label className="btn btn--sm btn--primary">
          <Upload size={16} strokeWidth={2} aria-hidden="true" />
          여러 장 한 번에
          <input
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={(e) => e.target.files && void handleBulk(e.target.files)}
          />
        </label>
      </div>

      <ul className={styles.cardGrid}>
        {cards.map((card) => {
          const src = uploaded(card.id) ? `/slots/${slug}/cards/${card.id}.${ext}` : null
          return (
            <li key={card.id}>
              <label className={styles.cardSlot}>
                {src ? (
                  <img src={src} alt="" className={styles.cardThumb} />
                ) : (
                  <span className={styles.cardEmpty}>
                    {busy === card.id ? '…' : <Upload size={16} strokeWidth={2} aria-hidden="true" />}
                  </span>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => e.target.files?.[0] && void handleFile(card.id, e.target.files[0])}
                />
              </label>
              <span className={`t-text-xxs ${styles.cardName}`}>{card.name}</span>
            </li>
          )
        })}
      </ul>
    </>
  )
}
