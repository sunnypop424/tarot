import { useEffect, useMemo, useState } from 'react'

import { useSlotState } from '@/slot/SlotProvider'
import { rollingDisplay, type RollingDisplay } from '@/data/rolling'
import { repo } from '@/lib/repo'
import { cssUrl } from '@/lib/image'
import type { RollingMessage } from '@/lib/repo/types'
import type { Slot } from '@/types/slot'
import styles from './Rolling.module.css'

/**
 * 롤링페이퍼 (세 번째 서비스) — 방문자가 자기 폰으로 응원 메시지를 남기고,
 * 남긴 즉시 **공개 벽**에 뜬다 (후검수: 부적절한 건 주최자가 나중에 숨긴다).
 *
 * 럭키드로우와 **반대**다: 스태프 로그인 게이트가 없다 — 손님이 직접 쓴다.
 * 벽은 실시간(watch)이라 옆 사람이 남긴 것도 새로고침 없이 올라온다.
 */
export default function RollingApp() {
  // SlotLayout 이 이미 로딩·없음을 걸렀지만, 이 화면도 SlotProvider 아래라 방어적으로 한 번 더 본다
  const state = useSlotState()
  if (state.status === 'loading') return <div className="app" aria-busy="true" />
  if (state.status === 'missing') return null
  return <Wall slot={state.slot} />
}

function Wall({ slot }: { slot: Slot }) {
  const { slug } = slot
  const display = useMemo(() => rollingDisplay(slot), [slot])
  const [messages, setMessages] = useState<RollingMessage[]>([])

  useEffect(() => {
    let alive = true
    const load = () => {
      // 조회 실패(예: 마이그레이션 전 테이블 없음)면 빈 벽으로 — 화면이 던지지는 않게
      void repo.rolling
        .list(slug)
        .then((m) => {
          if (alive) setMessages(m)
        })
        .catch(() => {})
    }
    load()
    // 다른 기기·탭이 남기면 다시 읽는다 (payload 는 안 본다 — 늘 서버가 맞다)
    const stop = repo.rolling.watch(slug, load)
    return () => {
      alive = false
      stop()
    }
  }, [slug])

  // 벽 전용 배경 — 업로드 URL 을 background-image 로 그린다 (모바일 저장 방지). 없으면 테마 배경
  return (
    <div
      className={`app ${styles.wall}`}
      style={display.wallBg ? { backgroundImage: cssUrl(display.wallBg) } : undefined}
    >
      <header className={styles.head}>
        <h1 className="t-title-l">{display.wallTitle}</h1>
      </header>

      <main className={`app__scroll ${styles.scroll}`}>
        <Composer
          slug={slug}
          display={display}
          onPosted={() => void repo.rolling.list(slug).then(setMessages).catch(() => {})}
        />

        {messages.length === 0 ? (
          <p className={`t-text-m t-muted ${styles.empty}`}>첫 메시지를 남겨 보세요</p>
        ) : (
          <ul className={styles.grid} data-rolling-wall>
            {messages.map((m) => (
              <MessageCard key={m.id} message={m} />
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}

function Composer({
  slug,
  display,
  onPosted,
}: {
  slug: string
  display: RollingDisplay
  onPosted: () => void
}) {
  const [nickname, setNickname] = useState('')
  const [body, setBody] = useState('')
  const [color, setColor] = useState(display.cardColors[0] ?? '')
  const [sticker, setSticker] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)

  const canPost = body.trim().length > 0 && !busy

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!canPost) return
    setBusy(true)
    try {
      await repo.rolling.add(slug, {
        nickname: nickname.trim(),
        body: body.trim(),
        color,
        sticker,
      })
      // 남기고 나면 본문·스티커만 비운다 — 이름은 이어 남길 수 있게 둔다
      setBody('')
      setSticker(undefined)
      onPosted()
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className={styles.composer} onSubmit={submit} data-rolling-composer>
      <input
        className={styles.nickname}
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
        placeholder="이름 (선택)"
        maxLength={20}
        aria-label="이름"
      />
      <textarea
        className={styles.body}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={display.prompt}
        maxLength={200}
        rows={3}
        aria-label="메시지"
      />

      {display.cardColors.length > 0 && (
        <div className={styles.colors} role="radiogroup" aria-label="카드 색">
          {display.cardColors.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={color === c}
              className={styles.swatch}
              data-active={color === c}
              style={{ background: `var(--color-${c})` }}
              onClick={() => setColor(c)}
              aria-label={`색 ${c}`}
            />
          ))}
        </div>
      )}

      {display.stickers.length > 0 && (
        <div className={styles.stickers} role="radiogroup" aria-label="스티커">
          {display.stickers.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={sticker === s}
              className={styles.sticker}
              data-active={sticker === s}
              style={{ backgroundImage: cssUrl(s) }}
              onClick={() => setSticker(sticker === s ? undefined : s)}
              aria-label="스티커"
            />
          ))}
        </div>
      )}

      <button type="submit" className="btn btn--primary" disabled={!canPost}>
        {display.postLabel}
      </button>
    </form>
  )
}

function MessageCard({ message }: { message: RollingMessage }) {
  // 카드 배경은 고른 색을 **표면색 위에 옅게 섞는다** — 토큰만 쓰고(hex 밖에 안 둔다) 글자 대비를 지킨다
  const tint = message.color
    ? {
        background: `color-mix(in srgb, var(--color-${message.color}) 16%, var(--color-surface-raised))`,
      }
    : undefined

  return (
    <li className={styles.card} style={tint} data-rolling-card>
      {message.sticker && (
        <span
          className={styles.cardSticker}
          style={{ backgroundImage: cssUrl(message.sticker) }}
          aria-hidden="true"
        />
      )}
      <p className={`t-text-m ${styles.cardBody}`}>{message.body}</p>
      {message.nickname && (
        <p className={`t-text-xs t-muted ${styles.cardName}`}>— {message.nickname}</p>
      )}
    </li>
  )
}
