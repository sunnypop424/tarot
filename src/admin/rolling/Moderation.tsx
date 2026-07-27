import { useCallback, useEffect, useState } from 'react'
import { Eye, EyeOff, MessageSquareOff, Trash2 } from 'lucide-react'

import { repo } from '@/lib/repo'
import type { RollingMessage } from '@/lib/repo'
import { getSlotService } from '@/data/services'
import { useSlot } from '@/slot/SlotProvider'
import { confirmAction, toast } from '../AdminFeedback'
import styles from './Rolling.module.css'

/**
 * **이 화면은 롤링페이퍼와 소원나무가 같이 쓴다** (같은 테이블·같은 repo — `src/data/wish.ts`).
 * 하는 일은 같지만 주최자가 산 물건의 이름이 다르다. "롤링페이퍼" 라고 적힌 화면을 소원나무
 * 주최자가 보면 그건 그냥 틀린 화면이라, 부르는 말만 갈아 끼운다.
 */
const COPY = {
  rolling: { title: '롤링페이퍼', place: '벽', unit: '메시지' },
  wish: { title: '소원나무', place: '나무', unit: '소원' },
} as const

/**
 * 롤링페이퍼 후검수 — 주최자가 만지는 유일한 롤페 화면.
 *
 * **공개 벽 + 후검수**: 방문자가 남기면 곧장 벽에 뜬다 (검수를 기다리지 않는다).
 * 주최자는 여기서 **부적절한 것만 숨기거나 지운다** — 나머지는 그대로 벽에 남는다.
 * 그래서 즉시 저장이다 (질문 편집과 같은 결): 숨김·삭제가 바로 방문자 화면에 반영된다.
 */
export function Moderation() {
  const slot = useSlot()
  const slug = slot.slug
  const c = getSlotService(slot) === 'wish' ? COPY.wish : COPY.rolling

  const [list, setList] = useState<RollingMessage[] | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    // listAll — 숨긴 것까지 온다 (방문자 list 는 숨김을 못 본다)
    setList(await repo.rolling.listAll(slug))
  }, [slug])

  useEffect(() => {
    void load()
  }, [load])

  async function toggleHidden(m: RollingMessage) {
    setBusy(true)
    try {
      await repo.rolling.setHidden(slug, m.id, !m.hidden)
      await load()
      toast(m.hidden ? `다시 ${c.place}에 보여요` : `${c.place}에서 숨겼어요`)
    } finally {
      setBusy(false)
    }
  }

  async function remove(m: RollingMessage) {
    const ok = await confirmAction({
      title: `이 ${c.unit}을 삭제할까요?`,
      desc: '삭제하면 되돌릴 수 없어요. 숨기기만 해도 방문자에겐 안 보여요.',
      okLabel: '삭제',
      danger: true,
    })
    if (!ok) return
    setBusy(true)
    try {
      await repo.rolling.remove(slug, m.id)
      await load()
      toast('삭제했어요')
    } finally {
      setBusy(false)
    }
  }

  if (!list) return null

  const hiddenCount = list.filter((m) => m.hidden).length

  return (
    <div>
      <header className="admin__head">
        <div>
          <h1 className="t-title-l">{c.title}</h1>
          <p className="t-text-xs t-muted">
            {list.length}개 · 숨김 {hiddenCount}개 · 남긴 즉시 {c.place}에 보여요.{' '}
            <b>부적절한 것만 숨기거나 지우세요.</b>
          </p>
        </div>
      </header>

      {list.length === 0 ? (
        <div className="admin-empty">
          <MessageSquareOff size={44} strokeWidth={1.6} aria-hidden="true" />
          <div className="admin-empty__title">아직 남긴 {c.unit}이 없어요.</div>
        </div>
      ) : (
        <ul className={styles.list} data-rolling-mod>
          {list.map((m) => (
            <li
              key={m.id}
              className={styles.row}
              data-hidden={m.hidden}
              data-rolling-mod-row
            >
              {/* 쪽지 종이색을 왼쪽 띠로 — 방문자 벽에서 어떤 색인지 한눈에 (없으면 안 그린다) */}
              <span
                className={styles.tint}
                style={m.color ? { background: `var(--color-${m.color})` } : undefined}
                aria-hidden="true"
              />
              <div className={styles.body}>
                <p className={`t-text-m ${styles.text}`}>{m.body}</p>
                <p className="t-text-xs t-muted">
                  {m.nickname || '익명'} · {new Date(m.createdAt).toLocaleString('ko-KR')}
                  {m.hidden && <span className={styles.badge}>숨김</span>}
                </p>
              </div>
              <div className={styles.actions}>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={busy}
                  onClick={() => void toggleHidden(m)}
                >
                  {m.hidden ? (
                    <>
                      <Eye size={16} aria-hidden="true" /> 보이기
                    </>
                  ) : (
                    <>
                      <EyeOff size={16} aria-hidden="true" /> 숨기기
                    </>
                  )}
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={busy}
                  onClick={() => void remove(m)}
                  aria-label="삭제"
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
