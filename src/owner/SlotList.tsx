import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Download, ExternalLink, LogOut, Plus, Trash2, Upload } from 'lucide-react'

import { createSlot, getSlotDeck } from '@/data/slots'
import { getSlotService, serviceLabel } from '@/data/services'
import { PLANS, getPlan, type PlanId } from '@/data/plans'
import { repo } from '@/lib/repo'
import { hasSupabase } from '@/lib/repo/client'
import type { Slot } from '@/types/slot'
import { useOwnerAuth } from './useOwnerAuth'
import { validateSlug } from './slug'
import { exportSlots, importSlots } from './slotsFile'
import styles from './Owner.module.css'

/**
 * 슬롯 목록 — 최고관리자가 이벤트 슬롯을 만들고 지우는 자리 (`/theme-editor`).
 * 슬롯 하나의 색·이미지·이벤트 설정은 SlotEditor(`/theme-editor/:slug`) 가 맡는다.
 *
 * **만들면 바로 생긴다.** 저장소가 DB 면 저장이 곧 배포다 — 방문자가 그 슬러그로 들어올 수 있다.
 * (Supabase 없이 띄웠으면 이 브라우저에만 남는다 — 화면이 그 사실을 밝힌다)
 */
export function SlotList() {
  const navigate = useNavigate()
  const { user, signOut } = useOwnerAuth()
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [slug, setSlug] = useState('')
  const [name, setName] = useState('')
  const [plan, setPlan] = useState<PlanId>('free')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setSlots(await repo.slots.list())
    } catch (e) {
      setError(e instanceof Error ? e.message : '슬롯을 못 불러왔어요')
      setSlots([])
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    const reason = validateSlug(slug, slots ?? [])
    if (reason) {
      setError(reason)
      return
    }
    if (!name.trim()) {
      setError('이벤트명을 입력해 주세요.')
      return
    }

    setBusy(true)
    try {
      await repo.slots.save(createSlot(slug, name.trim(), plan))
      // 만들자마자 편집으로 — 슬롯은 색을 입혀야 슬롯이 된다
      navigate(`/theme-editor/${slug}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : '슬롯을 못 만들었어요')
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove(target: Slot) {
    if (
      !confirm(
        `${target.name} (/${target.slug}) 슬롯을 지울까요?\n` +
          `질문·답변도 함께 지워지고, 방문자는 이 주소로 못 들어옵니다.\n` +
          (hasSupabase
            ? `올린 이미지는 저장소에 그대로 남습니다.`
            : `올린 이미지 파일은 public/slots/${target.slug}/ 에 그대로 남습니다.`)
      )
    )
      return
    try {
      await repo.slots.remove(target.slug)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : '슬롯을 못 지웠어요')
    }
  }

  /** 가져오기 — 백업에서 되살릴 때. 슬롯마다 저장하므로 있으면 덮어쓴다 */
  async function handleImport(file: File) {
    setBusy(true)
    try {
      for (const s of await importSlots(file)) await repo.slots.save(s)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'JSON 을 읽지 못했어요')
    } finally {
      setBusy(false)
    }
  }

  /**
   * 로그아웃하면 **바로** 나간다.
   * `useOwnerAuth` 는 부르는 곳마다 상태가 따로라(여기와 RequireOwner 가 각각 부른다),
   * 세션만 지우면 가드는 그걸 모르고 화면이 그대로 남는다 — 직접 로그인으로 보낸다.
   */
  async function handleSignOut() {
    await signOut()
    navigate('/theme-editor/login', { replace: true })
  }

  return (
    // 라이트 — 편집 중인 슬롯 색과 섞이면 안 되는 도구 화면
    <div className="owner">
      <div className="admin__main">
        <div className={styles.head}>
          <div>
            <h1 className="t-title-l">슬롯</h1>
            {/* 저장이 곧 배포인지 아닌지는 저장소가 정한다 — 화면이 거짓말하면 안 된다 */}
            <p className="t-text-xs t-muted">
              최고관리자 전용 · 개발 모드에서만 열려요.{' '}
              {hasSupabase
                ? '만들거나 고치면 바로 반영돼요 — 방문자가 그 주소로 들어올 수 있습니다.'
                : '지금은 이 브라우저에만 저장돼요 (Supabase 미설정). 내보낸 slots.json 을 레포에 넣어야 배포됩니다.'}
            </p>
          </div>
          <div className={styles.actions}>
            <label className="btn btn--sm btn--slight">
              <Upload size={18} strokeWidth={2} aria-hidden="true" />
              가져오기
              <input
                type="file"
                accept="application/json"
                className="sr-only"
                onChange={(e) => e.target.files?.[0] && void handleImport(e.target.files[0])}
              />
            </label>
            <button
              type="button"
              className="btn btn--sm btn--primary"
              disabled={!slots?.length}
              onClick={() => slots && exportSlots(slots)}
            >
              <Download size={18} strokeWidth={2} aria-hidden="true" />
              {hasSupabase ? '백업 내보내기' : 'slots.json 내보내기'}
            </button>
            <button
              type="button"
              className="btn btn--sm btn--slight"
              onClick={() => void handleSignOut()}
              data-signout
            >
              <LogOut size={18} strokeWidth={2} aria-hidden="true" />
              로그아웃
            </button>
          </div>
        </div>

        <section className="admin-section">
          <h2 className="t-title-s admin-section__title">새 슬롯</h2>
          <form onSubmit={handleCreate}>
            <div className="form-grid">
              <div className="field">
                <label className="field__label" htmlFor="new-slug">
                  슬러그 (URL 경로)
                </label>
                <input
                  id="new-slug"
                  className="input"
                  value={slug}
                  placeholder="seventeen-dino"
                  onChange={(e) => {
                    setSlug(e.target.value)
                    setError(null)
                  }}
                />
                <span className="field__hint">/{slug || 'seventeen-dino'} 가 이 이벤트의 루트가 돼요.</span>
              </div>
              <div className="field">
                <label className="field__label" htmlFor="new-name">
                  이벤트명
                </label>
                <input
                  id="new-name"
                  className="input"
                  value={name}
                  placeholder="세븐틴 디노 생일카페"
                  onChange={(e) => {
                    setName(e.target.value)
                    setError(null)
                  }}
                />
              </div>
              <div className="field">
                <label className="field__label" htmlFor="new-plan">
                  플랜
                </label>
                <select
                  id="new-plan"
                  className="select"
                  value={plan}
                  onChange={(e) => setPlan(e.target.value as PlanId)}
                >
                  {PLANS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <span className="field__hint">나중에 편집기에서 바꿀 수 있어요.</span>
              </div>

              <div className="field">
                {/* 라벨 자리를 비워 옆 입력칸과 높이를 맞춘다 */}
                <span className="field__label" aria-hidden="true">
                  &nbsp;
                </span>
                {/* 크기 수식자를 안 쓴다 — .btn 기본 높이(--tap-min)가 .input 과 같다 */}
                <button type="submit" className="btn btn--primary" disabled={busy || !slots}>
                  <Plus size={18} strokeWidth={2} aria-hidden="true" />
                  슬롯 만들기
                </button>
              </div>
            </div>
            {error && <p className="field__error" style={{ marginTop: 'var(--space-sm)' }}>{error}</p>}
          </form>
        </section>

        <section className="admin-section">
          <h2 className="t-title-s admin-section__title">
            슬롯 {slots ? `${slots.length}개` : ''}
          </h2>
          {slots === null ? (
            <div className="row-list" aria-busy="true">
              {[0, 1].map((i) => (
                <div key={i} className="skeleton" style={{ height: 64 }} />
              ))}
            </div>
          ) : slots.length === 0 ? (
            <p className="t-text-s t-muted">아직 슬롯이 없어요. 위에서 만들어 주세요.</p>
          ) : (
            <ul className="row-list" data-slot-list>
              {slots.map((s) => (
                <li key={s.slug} className="row-item" data-slot={s.slug}>
                  {/* 슬롯을 색으로 먼저 알아본다 — 이름보다 빠르다 */}
                  <span className={styles.swatch} aria-hidden="true">
                    {[s.theme.colors.canvas, s.theme.colors.primary, s.theme.colors.accent].map(
                      (c) => (
                        <span key={c} style={{ background: c }} />
                      )
                    )}
                  </span>

                  <span className="row-item__grow">
                    <span className="t-text-m">{s.name}</span>
                    <span className={`t-text-xs ${styles.slotMeta}`}>
                      /{s.slug} · {getPlan(s).label} · {serviceLabel(getSlotService(s))} ·{' '}
                      {getSlotDeck(s) === 'major' ? '메이저 22장' : '전체 78장'}
                    </span>
                  </span>

                  <a
                    className="btn btn--sm btn--slight"
                    href={`/${s.slug}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink size={16} strokeWidth={2} aria-hidden="true" />
                    열기
                  </a>
                  <Link className="btn btn--sm btn--slight" to={`/theme-editor/${s.slug}`}>
                    편집
                  </Link>
                  <button
                    type="button"
                    className="btn-icon"
                    aria-label={`${s.name} 슬롯 지우기`}
                    onClick={() => handleRemove(s)}
                  >
                    <Trash2 size={18} strokeWidth={2} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {user && <p className="t-text-xs t-muted">{user.email} 로 로그인됨</p>}
      </div>
    </div>
  )
}
