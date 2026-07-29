import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Download,
  ExternalLink,
  LayoutGrid,
  LogOut,
  Copy,
  Plus,
  Search,
  SquarePen,
  Trash2,
  Upload,
  User,
} from 'lucide-react'

import { createSlot, getSlotDeck, isSlotExpired, isSlotOpen } from '@/data/slots'
import { getSlotService, serviceLabel } from '@/data/services'
import type { ServiceId } from '@/data/services'
import { PLANS, getPlan, type PlanId } from '@/data/plans'
import { repo } from '@/lib/repo'
import { hasSupabase } from '@/lib/repo/client'
import { cssUrl } from '@/lib/image'
import type { Slot, SlotPeriod } from '@/types/slot'
import { useOwnerAuth } from './useOwnerAuth'
import { validateSlug } from './slug'
import { exportSlots, importSlots } from './slotsFile'
import { PeriodFields } from './PeriodFields'
import { periodLabel } from './period'

/**
 * 슬롯 목록(테마 에디터 홈) — claude.ai/design 시안 "테마 에디터 홈" 을 그대로 옮긴다.
 * 마크업·스타일은 시안 그대로, 값·동작만 우리 데이터에 연결한다 (`.owner` 고정 라이트 토큰 위에서).
 */

// ── 시안 색 (도구 chrome — 슬롯 테마와 무관, 고정) ──
const BORDER = '#eeeeee'
const LINE = '#dddddd'
const INK = '#121212'
const INK2 = '#505050'
const INK3 = '#8a8a8a'
const PURPLE = '#816bff'
const PURPLE_HOVER = '#6e58ff'
const MONO = "Pretendard, ui-monospace, Menlo, monospace"

/**
 * 서비스 배지 색 — **`Record<ServiceId, …>` 라 모든 서비스가 필수다.**
 * `Record<string, …>` 였을 땐 새 서비스가 조용히 타로 보라 배지를 받았다(아래 `?? SVC.tarot`).
 * 이제 `SERVICES` 에 한 줄 넣으면 여기가 컴파일 에러로 터진다.
 */
const SVC: Record<ServiceId, { bg: string; fg: string }> = {
  tarot: { bg: '#efeafb', fg: '#5b3fa8' },
  luckydraw: { bg: '#fdf0e3', fg: '#a15c17' },
  rolling: { bg: '#e6f4ec', fg: '#22694a' },
  photozone: { bg: '#e7eefb', fg: '#28518f' },
  wish: { bg: '#fbf0dd', fg: '#8a5c17' },
  poll: { bg: '#e9eaf3', fg: '#3c4276' },
  stamp: { bg: '#fbeaea', fg: '#8d3540' },
  quiz: { bg: '#eaf1ef', fg: '#2c5f56' },
  cheer: { bg: '#eef7ff', fg: '#2f6f9e' },
  photocard: { bg: '#efe9f6', fg: '#5a3f83' },
}

function slotStatus(s: Slot): { label: string; dot: string } {
  if (isSlotExpired(s)) return { label: '종료', dot: INK3 }
  if (isSlotOpen(s)) return { label: '대여중', dot: PURPLE }
  return { label: '시작 전', dot: '#f5a623' }
}

// 재사용 인풋/버튼 스타일 (시안 값 그대로)
const inputStyle: React.CSSProperties = {
  height: 38,
  border: `1px solid ${LINE}`,
  borderRadius: 4,
  padding: '0 11px',
  fontSize: 13.5,
  outline: 'none',
  background: '#fff',
  color: INK,
  minWidth: 0,
  width: '100%',
  boxSizing: 'border-box',
}
// 기본 select 화살표는 브라우저마다 제각각이라 chevron 을 직접 그린다 (SlotEditor 와 같은 모양)
const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
  padding: '0 30px 0 9px',
  appearance: 'none',
  WebkitAppearance: 'none',
  MozAppearance: 'none',
  backgroundImage:
    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238a8a8a' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\")",
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 9px center',
}
const labelStyle: React.CSSProperties = { fontSize: 11.5, fontWeight: 650, color: INK2 }
const ghostBtn: React.CSSProperties = {
  height: 31,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '0 11px',
  border: `1px solid ${LINE}`,
  background: '#fff',
  borderRadius: 4,
  fontSize: 12.5,
  fontWeight: 550,
  color: INK2,
  cursor: 'pointer',
}

export function SlotList() {
  const navigate = useNavigate()
  const { user, signOut } = useOwnerAuth()
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [slug, setSlug] = useState('')
  const [name, setName] = useState('')
  const [plan, setPlan] = useState<PlanId>('free')
  const [period, setPeriod] = useState<SlotPeriod>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')

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
    if (reason) return setError(reason)
    if (!name.trim()) return setError('이벤트명을 입력해 주세요.')
    setBusy(true)
    try {
      await repo.slots.save(createSlot(slug, name.trim(), plan, period))
      navigate(`/theme-editor/${slug}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : '슬롯을 못 만들었어요')
    } finally {
      setBusy(false)
    }
  }

  /**
   * 슬롯 복제 — **꾸민 것만 가져온다.**
   *
   * 같은 카페의 2차 이벤트를 처음부터 다시 꾸미고 있었다. 색·형태·이미지 주소·서비스 설정은
   * 그대로 쓰고 싶고, **데이터는 절대 따라오면 안 된다**(질문·카드·응모·기록은 그 행사의 것이다).
   * 슬롯 행 하나만 복사하는 게 정확히 그 경계다 — 다른 테이블은 slug 로 매여 있어 안 따라온다.
   *
   * 이미지는 **주소를 공유한다**(파일을 복사하지 않는다). 원본 슬롯을 지우면 그 이미지도
   * 지워지므로, 그때는 새 슬롯에서 다시 올려야 한다 — 그 사실을 물어볼 때 같이 말한다.
   */
  async function handleDuplicate(source: Slot) {
    const next = prompt(
      `'${source.name}' 을 복제해요.
색·이미지·서비스 설정만 가져오고 데이터(질문·카드·응모·기록)는 안 따라와요.
` +
        `이미지는 원본과 같은 파일을 가리켜요 — 원본을 지우면 새 슬롯에서 다시 올려야 해요.

새 슬러그를 적어 주세요:`,
      `${source.slug}-2`
    )
    if (!next) return
    const slugValue = next.trim().toLowerCase()
    const reason = validateSlug(slugValue, slots ?? [])
    if (reason) return setError(reason)
    setBusy(true)
    try {
      /** 기간은 안 가져온다 — 2차 이벤트는 날짜가 다르다(그대로면 열리자마자 끝난 슬롯이 된다) */
      const { period: _period, ...rest } = source
      await repo.slots.save({
        ...structuredClone(rest),
        slug: slugValue,
        name: `${source.name} (복제)`,
      })
      navigate(`/theme-editor/${slugValue}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : '복제하지 못했어요')
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove(target: Slot) {
    const deep = repo.organizers.ready()
    if (
      !confirm(
        `${target.name} (/${target.slug}) 슬롯을 지울까요?\n` +
          (deep
            ? `질문·답변, 주최자 계정, 올린 이미지까지 전부 지워져요.\n되돌릴 수 없어요.`
            : `질문·답변도 함께 지워져요.\n올린 이미지 파일은 public/slots/${target.slug}/ 에 그대로 남아요.`)
      )
    )
      return
    try {
      if (deep) await repo.organizers.purgeSlot(target.slug)
      else await repo.slots.remove(target.slug)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : '슬롯을 못 지웠어요')
    }
  }

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

  async function handleSignOut() {
    await signOut()
    navigate('/theme-editor/login', { replace: true })
  }

  const counts = useMemo(() => {
    const c = { active: 0, test: 0, ended: 0 }
    for (const s of slots ?? []) {
      if (isSlotExpired(s)) c.ended++
      else if (isSlotOpen(s)) c.active++
      else c.test++
    }
    return c
  }, [slots])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q || !slots) return slots ?? []
    return slots.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.slug.toLowerCase().includes(q) ||
        (s.group ?? '').toLowerCase().includes(q)
    )
  }, [slots, query])

  /**
   * 묶음별로 갈라 놓는다 — **한 행사가 슬롯 여러 개를 쓴다**(포토카드 + 스탬프 + 모의고사).
   * 묶음이 없는 슬롯은 맨 아래 한 덩어리로 (묶음을 안 쓰는 사람에겐 지금과 똑같이 보인다).
   */
  const groups = useMemo(() => {
    const map = new Map<string, Slot[]>()
    for (const s of filtered) {
      const key = s.group?.trim() || ''
      const list = map.get(key)
      if (list) list.push(s)
      else map.set(key, [s])
    }
    return [...map.entries()]
      .sort((a, b) => (a[0] === '' ? 1 : b[0] === '' ? -1 : a[0].localeCompare(b[0], 'ko')))
  }, [filtered])

  return (
    <div className="owner" style={{ minHeight: '100vh', background: '#f7f7f7', color: INK }}>
      {/* ── 상단 바 ── */}
      <div
        style={{
          height: 52,
          background: '#fff',
          borderBottom: `1px solid ${BORDER}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 22px',
          position: 'sticky',
          top: 0,
          zIndex: 5,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: 4,
              background: INK,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <LayoutGrid size={13} strokeWidth={2.2} color="#fff" aria-hidden="true" />
          </div>
          <span style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: '-0.01em' }}>OLUCKY!</span>
          <span
            style={{ fontSize: 11.5, color: INK3, borderLeft: `1px solid ${BORDER}`, paddingLeft: 9, marginLeft: 2 }}
          >
            슬롯 편집기
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ ...ghostBtn }}>
            <Upload size={14} strokeWidth={2} aria-hidden="true" />
            불러오기
            <input
              type="file"
              accept="application/json"
              className="sr-only"
              onChange={(e) => e.target.files?.[0] && void handleImport(e.target.files[0])}
            />
          </label>
          <button
            type="button"
            style={ghostBtn}
            disabled={!slots?.length}
            onClick={() => slots && exportSlots(slots)}
          >
            <Download size={14} strokeWidth={2} aria-hidden="true" />
            내보내기
          </button>
          <div style={{ width: 1, height: 20, background: BORDER, margin: '0 3px' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: '50%',
                background: BORDER,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <User size={14} strokeWidth={2} color={INK2} aria-hidden="true" />
            </div>
            {user && <span style={{ fontSize: 12.5, color: INK2 }}>{user.email}</span>}
            <button
              type="button"
              onClick={() => void handleSignOut()}
              data-signout
              aria-label="로그아웃"
              style={{ border: 'none', background: 'none', padding: 4, cursor: 'pointer', color: INK3, display: 'flex' }}
            >
              <LogOut size={15} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* ── 본문 ── */}
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '30px 22px 70px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 20,
            marginBottom: 22,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h1 style={{ margin: '0 0 5px', fontSize: 23, fontWeight: 700, letterSpacing: '-0.02em' }}>슬롯</h1>
            <p style={{ margin: 0, fontSize: 13, color: INK3 }}>
              {hasSupabase
                ? '만들거나 고치면 바로 반영돼요 — 손님이 그 주소로 들어올 수 있어요.'
                : '지금은 이 브라우저에만 저장돼요 (Supabase 미설정). 내보낸 slots.json 을 레포에 넣어야 배포돼요.'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 14, fontSize: 12, color: INK3 }}>
            <span>
              <strong style={{ color: INK, fontWeight: 650 }}>{counts.active}</strong> 대여중
            </span>
            <span>
              <strong style={{ color: INK, fontWeight: 650 }}>{counts.test}</strong> 시작 전
            </span>
            <span>
              <strong style={{ color: INK, fontWeight: 650 }}>{counts.ended}</strong> 종료
            </span>
          </div>
        </div>

        {/* ── 새 슬롯 만들기 ── */}
        <form
          onSubmit={handleCreate}
          style={{
            background: '#fff',
            border: '1.5px solid #d9d3ff',
            borderRadius: 8,
            boxShadow: '0 2px 10px rgba(129,107,255,.07)',
            overflow: 'hidden',
            marginBottom: 30,
          }}
        >
          <div
            style={{
              background: '#f0edff',
              borderBottom: '1px solid #d9d3ff',
              padding: '13px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            <Plus size={16} strokeWidth={2.2} color={PURPLE} aria-hidden="true" />
            <span style={{ fontSize: 14, fontWeight: 700, color: '#5a45c9' }}>새 슬롯 만들기</span>
            <span style={{ fontSize: 11.5, color: '#9184e3' }}>만들면 바로 편집 화면으로 들어가요</span>
          </div>
          <div style={{ padding: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.3fr 0.85fr', gap: 16 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={labelStyle}>슬러그 (URL)</span>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    height: 38,
                    border: `1px solid ${LINE}`,
                    borderRadius: 4,
                    background: '#fff',
                    overflow: 'hidden',
                  }}
                >
                  <span style={{ padding: '0 2px 0 11px', fontSize: 13, color: INK3 }}>/</span>
                  <input
                    id="new-slug"
                    value={slug}
                    placeholder="starlit-rian"
                    onChange={(e) => {
                      setSlug(e.target.value)
                      setError(null)
                    }}
                    style={{ flex: 1, border: 'none', outline: 'none', height: '100%', fontSize: 13.5, padding: '0 10px 0 0', fontWeight: 550, minWidth: 0 }}
                  />
                </div>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={labelStyle}>행사명</span>
                <input
                  id="new-name"
                  value={name}
                  placeholder="스타릿 리안 생일카페"
                  onChange={(e) => {
                    setName(e.target.value)
                    setError(null)
                  }}
                  style={inputStyle}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={labelStyle}>플랜</span>
                <select
                  value={plan}
                  onChange={(e) => setPlan(e.target.value as PlanId)}
                  style={selectStyle}
                >
                  {PLANS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {/*
              * 버튼을 `alignItems:'end'` 로 붙이면 기간 필드의 **힌트 줄 아래**에 서서 날짜 칸과
              * 밑선이 어긋난다. 위에서부터 맞추고, 라벨 자리만큼 빈 줄을 둬 입력칸과 나란히 세운다.
              */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, marginTop: 16, alignItems: 'start' }}>
              <PeriodFields period={period} onChange={setPeriod} disabled={busy} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={labelStyle} aria-hidden="true">
                  &nbsp;
                </span>
                <button
                  type="submit"
                  disabled={busy || !slots}
                  style={{
                    height: 38,
                    border: 'none',
                    borderRadius: 4,
                    background: PURPLE,
                    color: '#fff',
                    fontSize: 13.5,
                    fontWeight: 650,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 7,
                    padding: '0 18px',
                    opacity: busy || !slots ? 0.6 : 1,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = PURPLE_HOVER)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = PURPLE)}
                >
                  <Plus size={15} strokeWidth={2.2} aria-hidden="true" />
                  만들기
                </button>
              </div>
            </div>
            {error && (
              <p className="field__error" style={{ margin: '10px 0 0', fontSize: 12, color: '#cc3b39' }}>
                {error}
              </p>
            )}
          </div>
        </form>

        {/* ── 전체 슬롯 헤더 ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11, gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 14.5, fontWeight: 700 }}>전체 슬롯</h2>
            <span style={{ fontSize: 12, color: INK3 }}>{slots ? `${slots.length}개` : ''}</span>
          </div>
          <div
            style={{ display: 'flex', alignItems: 'center', height: 30, border: `1px solid ${LINE}`, borderRadius: 4, background: '#fff', padding: '0 9px', gap: 6 }}
          >
            <Search size={13} strokeWidth={2} color={INK3} aria-hidden="true" />
            <input
              placeholder="슬롯 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ border: 'none', outline: 'none', fontSize: 12.5, width: 130 }}
            />
          </div>
        </div>

        {/* ── 슬롯 목록 ── */}
        {slots === null ? (
          <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8, padding: 40, textAlign: 'center', color: INK3, fontSize: 13 }}>
            불러오는 중…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ background: '#fff', border: `1px dashed ${LINE}`, borderRadius: 8, padding: '52px 24px', textAlign: 'center' }}>
            <div style={{ width: 44, height: 44, borderRadius: 8, background: '#f7f7f7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', color: INK3 }}>
              <LayoutGrid size={21} strokeWidth={1.8} aria-hidden="true" />
            </div>
            <div style={{ fontSize: 14, fontWeight: 650, marginBottom: 5 }}>
              {query ? '검색 결과가 없어요' : '아직 슬롯이 없어요'}
            </div>
            <div style={{ fontSize: 12.5, color: INK3 }}>
              {query ? '다른 검색어로 찾아보세요.' : '위에서 슬러그와 행사명을 넣고 첫 슬롯을 만들어 보세요.'}
            </div>
          </div>
        ) : (
          <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden' }} data-slot-list>
            {groups.map(([groupName, rows]) => (
              <div key={groupName || '__none'} data-group={groupName || undefined}>
                {/* 묶음이 하나도 없으면 제목 줄을 아예 안 그린다 — 안 쓰는 사람에겐 예전 그대로 */}
                {groups.length > 1 && (
                  <div
                    style={{
                      padding: '9px 16px',
                      background: '#fafafa',
                      borderBottom: `1px solid ${BORDER}`,
                      fontSize: 11.5,
                      fontWeight: 700,
                      color: groupName ? INK2 : INK3,
                      letterSpacing: '0.01em',
                    }}
                  >
                    {groupName || '묶음 없음'}
                    <span style={{ color: INK3, fontWeight: 500 }}> · {rows.length}</span>
                  </div>
                )}
                {rows.map((s) => {
              const svc = SVC[getSlotService(s)]
              const st = slotStatus(s)
              const expired = isSlotExpired(s)
              return (
                <div
                  key={s.slug}
                  data-slot={s.slug}
                  data-expired={expired || undefined}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    gap: 16,
                    alignItems: 'center',
                    padding: '14px 18px',
                    borderBottom: `1px solid ${BORDER}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
                    <span
                      aria-hidden="true"
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 8,
                        flexShrink: 0,
                        border: `1px solid ${BORDER}`,
                        background: s.theme.assets.appIcon ? `#eee ${cssUrl(s.theme.assets.appIcon)} center/cover no-repeat` : '#eee',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: INK3,
                      }}
                    >
                      {!s.theme.assets.appIcon && <LayoutGrid size={16} strokeWidth={1.8} aria-hidden="true" />}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 14, fontWeight: 650, letterSpacing: '-0.01em' }}>{s.name}</span>
                        <span style={{ fontSize: 10.5, fontWeight: 650, padding: '2.5px 7px', borderRadius: 4, background: svc.bg, color: svc.fg }}>
                          {serviceLabel(getSlotService(s))}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: INK3, flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: MONO, color: INK2 }}>/{s.slug}</span>
                        <span style={{ color: LINE }}>·</span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.dot, display: 'inline-block' }} />
                          {st.label}
                        </span>
                        <span style={{ color: LINE }}>·</span>
                        <span>{getPlan(s).label}</span>
                        <span style={{ color: LINE }}>·</span>
                        <span>{getSlotDeck(s) === 'major' ? '메이저 22장' : '전체 78장'}</span>
                        <span style={{ color: LINE }}>·</span>
                        <span>{periodLabel(s)}</span>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <a href={`/${s.slug}`} target="_blank" rel="noreferrer" style={{ ...ghostBtn, textDecoration: 'none' }}>
                      <ExternalLink size={13} strokeWidth={2} aria-hidden="true" />
                      열기
                    </a>
                    {/* 주최자 화면 — 손님 화면과 다른 물건이라 새 탭으로 나란히 연다 */}
                    <a
                      href={`/${s.slug}/admin`}
                      target="_blank"
                      rel="noreferrer"
                      data-slot-admin
                      style={{ ...ghostBtn, textDecoration: 'none' }}
                    >
                      <ExternalLink size={13} strokeWidth={2} aria-hidden="true" />
                      주최
                    </a>
                    <button
                      type="button"
                      style={{ ...ghostBtn, fontWeight: 600, color: INK2 }}
                      onClick={() => navigate(`/theme-editor/${s.slug}`)}
                    >
                      <SquarePen size={13} strokeWidth={2} aria-hidden="true" />
                      편집
                    </button>
                    <button
                      type="button"
                      data-slot-duplicate
                      style={{ ...ghostBtn, fontWeight: 600, color: INK2 }}
                      disabled={busy}
                      onClick={() => void handleDuplicate(s)}
                    >
                      <Copy size={13} strokeWidth={2} aria-hidden="true" />
                      복제
                    </button>
                    <button
                      type="button"
                      data-slot-delete
                      aria-label={`${s.name} 슬롯 지우기`}
                      onClick={() => handleRemove(s)}
                      style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #f7d5d4', background: '#fff', borderRadius: 4, color: '#f16361', cursor: 'pointer' }}
                    >
                      <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              )
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
