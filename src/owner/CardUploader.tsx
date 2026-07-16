import { useCallback, useEffect, useState } from 'react'
import { Upload } from 'lucide-react'

import { getDeck, type DeckRange } from '@/data/cards'
import { cssUrl } from '@/lib/image'
import { uploadAsset, listAssets, extOf, cardsBase } from './upload'
import styles from './Owner.module.css'

interface CardUploaderProps {
  slug: string
  /** 이 슬롯이 쓰는 덱 — 메이저만이면 22장, 전체면 78장 */
  deck: DeckRange
  ext: string
  onExtChange: (ext: string) => void
  /** 앞면 경로가 정해지면 알린다 — 값은 저장소가 정한다 (`cardsBase`) */
  onBaseChange: (base: string | null) => void
  /**
   * 앞면 캐시 버전. 같은 경로에 덮어쓰면 URL 이 그대로라 브라우저가 옛 그림을 계속 쓴다 —
   * 올릴 때마다 이 값을 바꿔 **다른 URL** 로 만든다 (`cardFrontSrc` 가 붙인다).
   */
  version: string | null
  onVersionChange: (v: string) => void
}

/**
 * 카드 앞면 업로드 — 카드마다 한 장씩, 최대 78장.
 * `cards/{cardId}.{ext}` 로 저장하면 CardFace 의 경로 규칙과 그대로 맞는다.
 */
export function CardUploader({ slug, deck, ext, onExtChange, onBaseChange, version, onVersionChange }: CardUploaderProps) {
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
      // 확장자는 첫 앞면 업로드를 따라간다 — 카드마다 형식이 섞이면 경로 규칙이 깨진다.
      // 로고·뒷면은 경로 규칙과 무관하니 세지 않는다 (세면 로고를 먼저 올린 슬롯에서
      // 앞면 확장자가 기본값에 묶여 실제 파일과 어긋난다)
      const useExt = files.some((f) => f.startsWith('cards/')) ? ext : extOf(file)
      if (useExt !== ext) onExtChange(useExt)
      await uploadAsset(slug, `cards/${cardId}.${useExt}`, file)
      onBaseChange(cardsBase(slug))
      onVersionChange(Date.now().toString(36))
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
          // 방문자 화면과 같은 규칙으로 만든다 — 여기만 다르면 편집기가 거짓말한다
          const src = uploaded(card.id)
            ? `${cardsBase(slug)}/${card.id}.${ext}${version ? `?v=${version}` : ''}`
            : null
          return (
            <li key={card.id}>
              <label className={styles.cardSlot}>
                {src ? (
                  <span className={styles.cardThumb} style={{ backgroundImage: cssUrl(src) }} />
                ) : (
                  <span className={styles.cardEmpty}>
                    {busy === card.id ? '…' : <Upload size={16} strokeWidth={2} aria-hidden="true" />}
                  </span>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  data-card-upload={card.id}
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
