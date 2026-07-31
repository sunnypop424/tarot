import { useCallback, useEffect, useState } from 'react'

import { repo } from '@/lib/repo'
import type { RollingMessage } from '@/lib/repo'
import { getSlotService } from '@/data/services'
import { useSlot } from '@/slot/SlotProvider'
import { confirmAction, toast } from '../AdminFeedback'
import { useT } from '@/i18n'

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
  const t = useT()
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
      toast(m.hidden ? `다시 ${c.place}에 보여요` : `숨겼어요 · 방문자 화면에 바로 반영돼요`)
    } finally {
      setBusy(false)
    }
  }

  async function remove(m: RollingMessage) {
    const ok = await confirmAction({
      title: `이 ${c.unit}를 지울까요?`,
      desc: '숨기기만 해도 방문자에겐 보이지 않아요.',
      okLabel: t('지우기'),
      danger: true,
    })
    if (!ok) return
    setBusy(true)
    try {
      await repo.rolling.remove(slug, m.id)
      await load()
      toast(t('지웠어요'))
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
          <h1 className="ad-head__title">{t(c.title)}</h1>
          <span className="ad-head__count tnum">
            {list.length}개 · 숨김 {hiddenCount}개
          </span>
        </div>
        <p className="ad-head__desc">
          남긴 즉시 방문자 화면에 보여요. 부적절한 것만 숨기거나 지워 주세요.
        </p>
      </header>

      <div className="ad-stack">
        <div className="ad-banner ad-banner--info">
          남긴 즉시 {c.place}에 보여요. 부적절한 것만 숨기거나 지워 주세요.
        </div>

        <BannedWords slug={slug} unit={c.unit} />

        <div className="ad-card">
          <div className="ad-card__head">
            <div className="ad-card__titleRow">
              <span className="ad-card__title">{t('전체')}</span>
              <span className="ad-card__num tnum">
                {list.length}개 · 숨김 {hiddenCount}개
              </span>
            </div>
          </div>

          {list.length === 0 ? (
            <div className="ad-empty">
              <div className="ad-empty__title">아직 아무도 남기지 않았어요</div>
              <div className="ad-empty__sub">방문자가 남기면 여기에 바로 올라와요.</div>
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
                      <span style={{ fontWeight: 700 }}>{m.nickname || t('익명')}</span>
                      <span className="tnum" style={{ color: 'var(--ad-ink-4)' }}>
                        {new Date(m.createdAt).toLocaleString('ko-KR')}
                      </span>
                      {m.hidden && <span className="ad-tag ad-tag--sm">{t('숨김')}</span>}
                    </div>
                  </div>
                  <div className="ad-btnrow" style={{ flexShrink: 0 }}>
                    <button
                      type="button"
                      className={`ad-btn ad-btn--xs ${m.hidden ? 'ad-btn--soft' : 'ad-btn--line'}`}
                      disabled={busy}
                      onClick={() => void toggleHidden(m)}
                    >
                      {m.hidden ? t('다시 보이기') : t('숨기기')}
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

/**
 * 금칙어 — **후검수 앞에 서는 1차 필터** (`0041_banned_words.sql`).
 *
 * 이 세 서비스는 남긴 글이 **즉시 남에게 보인다.** 주최자가 볼 때까지 몇 시간이 걸릴 수 있고,
 * 영상회는 그 사이에 상영 화면에 뜬다. 그래서 사람이 보기 전에 한 번 거른다 —
 * **검수를 없애는 게 아니라 사람이 볼 때까지의 시간을 줄이는** 장치다.
 *
 * **기본 목록은 안 보여준다.** 흔한 욕설 몇 개가 전역으로 이미 걸려 있는데, 그걸 화면에 늘어놓으면
 * (1) 관리 화면이 욕설 목록이 되고 (2) 무엇을 피해 쓰면 되는지 알려주는 셈이 된다.
 * 여기서 관리하는 건 **이 행사에서만 막고 싶은 말**이다 (다른 아이돌 이름·특정 사건 등).
 */
function BannedWords({ slug, unit }: { slug: string; unit: string }) {
  const t = useT()
  const [words, setWords] = useState<string[] | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)

  const load = useCallback(async () => {
    setWords(await repo.rolling.bannedWords(slug).catch(() => []))
  }, [slug])

  useEffect(() => {
    void load()
  }, [load])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    const word = draft.trim()
    if (!word || busy) return
    // 이미 있는 말을 또 넣으면 DB 가 거절한다 — 그 전에 화면이 말해 준다
    if (words?.includes(word)) {
      toast('이미 넣은 말이에요')
      return
    }
    setBusy(true)
    try {
      await repo.rolling.addBannedWord(slug, word)
      setDraft('')
      await load()
      toast('이제 이 말이 든 글은 안 올라와요')
    } catch (e) {
      toast(e instanceof Error ? e.message : t('넣지 못했어요'))
    } finally {
      setBusy(false)
    }
  }

  async function remove(word: string) {
    setBusy(true)
    try {
      await repo.rolling.removeBannedWord(slug, word)
      await load()
      toast(t('뺐어요'))
    } finally {
      setBusy(false)
    }
  }

  const count = words?.length ?? 0

  return (
    <div className="ad-card">
      <div className="ad-card__head">
        <div className="ad-card__titleRow">
          <span className="ad-card__title">금칙어</span>
          <span className="ad-card__num tnum">{count}개</span>
        </div>
        <button
          type="button"
          className="ad-btn ad-btn--line ad-btn--sm"
          onClick={() => setOpen((v) => !v)}
          data-banned-toggle
        >
          {open ? t('접기') : t('관리')}
        </button>
      </div>

      {open && (
        <div style={{ marginTop: 16 }} data-banned>
          <p className="ad-fine" style={{ marginBottom: 12 }}>
            흔한 욕설은 <b>이미 막고 있어요.</b> 여기에는 이 행사에서만 막고 싶은 말을 넣어 주세요.
            띄어쓰기와 문장부호는 무시하고 찾으니 <b>붙여 쓴 형태</b>로 한 번만 넣으면 돼요.
            {/*
              * 한계를 적어 둔다 — 이걸 안 적으면 주최자가 "필터가 있으니 검수는 안 해도 되겠다"
              * 로 읽는다. 이 필터는 검수를 대신하지 않는다.
              */}
            <br />
            작정하고 돌려 쓰는 건 못 막아요 — 검수는 그대로 해 주세요.
          </p>

          <form onSubmit={(e) => void add(e)} className="ad-btnrow" style={{ marginBottom: 12 }}>
            <input
              className="ad-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="막을 말"
              maxLength={40}
              style={{ flex: 1, minWidth: 0 }}
              data-banned-input
            />
            <button
              type="submit"
              className="ad-btn ad-btn--soft ad-btn--sm"
              disabled={busy || !draft.trim()}
            >
              넣기
            </button>
          </form>

          {count === 0 ? (
            <div className="ad-fine">아직 넣은 말이 없어요. 기본 목록만 걸려 있어요.</div>
          ) : (
            <div className="ad-btnrow" style={{ flexWrap: 'wrap' }}>
              {words!.map((w) => (
                <span key={w} className="ad-word" data-banned-word>
                  {w}
                  <button
                    type="button"
                    className="ad-word__x"
                    onClick={() => void remove(w)}
                    disabled={busy}
                    aria-label={`${w} 빼기`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          <p className="ad-fine" style={{ marginTop: 12 }}>
            이미 올라온 {unit}에는 적용되지 않아요 — 그건 아래에서 숨기거나 지워 주세요.
          </p>
        </div>
      )}
    </div>
  )
}
