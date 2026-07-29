import { useCallback, useEffect, useState } from 'react'

import { repo } from '@/lib/repo'
import type { RollingMessage } from '@/lib/repo'
import { getSlotService } from '@/data/services'
import { useSlot } from '@/slot/SlotProvider'
import { confirmAction, toast } from '../AdminFeedback'

/**
 * **이 화면은 롤링페이퍼·소원나무·영상회 한마디가 같이 쓴다** (같은 테이블·같은 repo).
 * 하는 일은 같지만 주최자가 산 물건의 이름이 다르다. "롤링페이퍼" 라고 적힌 화면을 소원나무
 * 주최자가 보면 그건 그냥 틀린 화면이라, 부르는 말만 갈아 끼운다.
 */
const COPY = {
  rolling: { title: '롤링페이퍼', place: '벽', unit: '쪽지' },
  wish: { title: '소원나무', place: '나무', unit: '소원' },
  cheer: { title: '한마디', place: '상영 화면', unit: '한마디' },
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
  const service = getSlotService(slot)
  const c = service === 'wish' ? COPY.wish : service === 'cheer' ? COPY.cheer : COPY.rolling

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
      toast(m.hidden ? `다시 ${c.place}에 보여요` : `숨겼어요 · 손님 화면에 바로 반영돼요`)
    } finally {
      setBusy(false)
    }
  }

  async function remove(m: RollingMessage) {
    const ok = await confirmAction({
      title: `이 ${c.unit}를 지울까요?`,
      desc: '숨기기만 해도 손님에겐 보이지 않습니다.',
      okLabel: '지우기',
      danger: true,
    })
    if (!ok) return
    setBusy(true)
    try {
      await repo.rolling.remove(slug, m.id)
      await load()
      toast('지웠어요')
    } finally {
      setBusy(false)
    }
  }

  if (!list) return null

  const hiddenCount = list.filter((m) => m.hidden).length

  return (
    <>
      <header className="ad-head">
        <div className="ad-head__row">
          <h1 className="ad-head__title">{c.title}</h1>
          <span className="ad-head__count tnum">
            {list.length}개 · 숨김 {hiddenCount}개
          </span>
        </div>
        <p className="ad-head__desc">
          남긴 즉시 손님 화면에 보입니다. 부적절한 것만 숨기거나 지워 주세요.
        </p>
      </header>

      <div className="ad-stack">
        <div className="ad-banner ad-banner--info">
          남긴 즉시 {c.place}에 보여요. 부적절한 것만 숨기거나 지워 주세요.
        </div>

        <div className="ad-card">
          <div className="ad-card__head">
            <div className="ad-card__titleRow">
              <span className="ad-card__title">전체</span>
              <span className="ad-card__num tnum">
                {list.length}개 · 숨김 {hiddenCount}개
              </span>
            </div>
          </div>

          {list.length === 0 ? (
            <div className="ad-empty">
              <div className="ad-empty__title">아직 아무도 남기지 않았어요</div>
              <div className="ad-empty__sub">손님이 남기면 여기에 바로 올라와요.</div>
            </div>
          ) : (
            <div className="ad-rows" data-rolling-mod>
              {list.map((m) => (
                <div
                  key={m.id}
                  className="ad-row"
                  style={{ alignItems: 'flex-start' }}
                  data-off={m.hidden || undefined}
                  data-rolling-mod-row
                >
                  {/**
                   * 쪽지 종이색 — 방문자 벽에서 어떤 색인지 한눈에.
                   * `color` 는 팔레트 이름이 아니라 **hex 그 자체**다 (`RollingDisplay.papers`).
                   * 예전엔 `var(--color-…)` 로 감싸서 늘 폴백 회색이 나왔다.
                   */}
                  <span
                    className="ad-swatch"
                    style={m.color ? { background: m.color } : undefined}
                    aria-hidden="true"
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 14,
                        lineHeight: 1.65,
                        color: m.hidden ? 'var(--ad-ink-4)' : 'var(--ad-ink)',
                        textWrap: 'pretty',
                      }}
                    >
                      {m.body}
                    </div>
                    <div className="ad-row__meta">
                      <span style={{ fontWeight: 700 }}>{m.nickname || '익명'}</span>
                      <span className="tnum" style={{ color: 'var(--ad-ink-4)' }}>
                        {new Date(m.createdAt).toLocaleString('ko-KR')}
                      </span>
                      {m.hidden && <span className="ad-tag ad-tag--sm">숨김</span>}
                    </div>
                  </div>
                  <div className="ad-btnrow" style={{ flexShrink: 0 }}>
                    <button
                      type="button"
                      className={`ad-btn ad-btn--xs ${m.hidden ? 'ad-btn--soft' : 'ad-btn--line'}`}
                      disabled={busy}
                      onClick={() => void toggleHidden(m)}
                    >
                      {m.hidden ? '다시 보이기' : '숨기기'}
                    </button>
                    <button
                      type="button"
                      className="ad-x"
                      disabled={busy}
                      onClick={() => void remove(m)}
                      aria-label="삭제"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
