import { useCallback, useEffect, useState } from 'react'
import { ClipboardList, Eye, EyeOff, Lock, Plus, Trash2, Unlock } from 'lucide-react'

import { repo } from '@/lib/repo'
import type { Poll } from '@/lib/repo/types'
import { useSlot } from '@/slot/SlotProvider'
import { confirmAction, toast } from '../AdminFeedback'

/**
 * 설문 관리 — **주최자의 운영 데이터다** (럭드 상품표와 같은 자리).
 * 색·문구 같은 겉모습은 최고관리자가 슬롯 편집기에서 정한다.
 *
 * **저장 버튼이 있다** (질문 편집의 즉시 저장과 반대). 선택지를 여러 줄 고치는 동안
 * 매 글자마다 저장하면 방문자 화면이 그 중간 상태를 본다 — 투표는 진행 중에 고치는 일이 잦다.
 */
export function Polls() {
  const slot = useSlot()
  const slug = slot.slug
  const [list, setList] = useState<Poll[] | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setList(await repo.poll.listAll(slug))
  }, [slug])

  useEffect(() => {
    void load()
  }, [load])

  if (!repo.poll.ready()) {
    return (
      <div className="admin-empty">
        <ClipboardList size={44} strokeWidth={1.6} aria-hidden="true" />
        <div className="admin-empty__title">지금 빌드에서는 투표를 쓸 수 없어요</div>
        <div className="t-text-s t-muted">서버가 붙어야 집계가 정확해요. 담당자에게 문의해 주세요.</div>
      </div>
    )
  }

  async function save(p: Poll) {
    setBusy(true)
    try {
      await repo.poll.savePoll(slug, p)
      await load()
      toast('저장했어요')
    } catch (e) {
      toast(e instanceof Error ? e.message : '저장하지 못했어요')
    } finally {
      setBusy(false)
    }
  }

  async function remove(p: Poll) {
    const ok = await confirmAction({
      title: '이 설문을 지울까요?',
      desc: '지금까지 받은 표도 함께 사라져요. 되돌릴 수 없어요.',
      okLabel: '삭제',
      danger: true,
    })
    if (!ok) return
    await repo.poll.removePoll(slug, p.id)
    await load()
    toast('지웠어요')
  }

  async function add() {
    await save({
      id: crypto.randomUUID(),
      title: '새 설문',
      kind: 'single',
      maxPick: 1,
      closed: false,
      // **처음엔 숨김이다.** 만들자마자 손님에게 빈 설문이 보이면 안 된다
      hidden: true,
      order: (list?.length ?? 0) + 1,
      options: [
        { id: crypto.randomUUID(), order: 1, label: '선택지 1', votes: 0 },
        { id: crypto.randomUUID(), order: 2, label: '선택지 2', votes: 0 },
      ],
    })
  }

  if (!list) return null

  return (
    <div>
      <header className="admin__head">
        <div>
          <h1 className="t-title-l">설문</h1>
          <p className="t-text-xs t-muted">
            {list.length}개 · 공개하면 손님 화면에 바로 나와요. 표는 실시간으로 쌓입니다.
          </p>
        </div>
        <button type="button" className="btn btn--primary" onClick={() => void add()} disabled={busy} data-add-poll>
          <Plus size={16} strokeWidth={2} aria-hidden="true" />
          설문 추가
        </button>
      </header>

      {list.length === 0 ? (
        <div className="admin-empty">
          <ClipboardList size={44} strokeWidth={1.6} aria-hidden="true" />
          <div className="admin-empty__title">아직 설문이 없어요.</div>
          <div className="t-text-s t-muted">'설문 추가' 로 첫 설문을 만들어 보세요.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }} data-poll-admin>
          {list.map((p) => (
            <PollEditor key={p.id} poll={p} busy={busy} onSave={save} onRemove={remove} />
          ))}
        </div>
      )}
    </div>
  )
}

function PollEditor({
  poll,
  busy,
  onSave,
  onRemove,
}: {
  poll: Poll
  busy: boolean
  onSave: (p: Poll) => void
  onRemove: (p: Poll) => void
}) {
  const [d, setD] = useState<Poll>(poll)
  // 밖에서 새로 읽어오면(표가 쌓여 다시 그릴 때) 편집 중이 아닌 값만 맞춘다
  useEffect(() => setD(poll), [poll])

  const total = d.options.reduce((n, o) => n + o.votes, 0)
  const dirty = JSON.stringify(d) !== JSON.stringify(poll)

  return (
    <section className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <input
          className="input"
          style={{ flex: 1, minWidth: 200, fontWeight: 700 }}
          value={d.title}
          onChange={(e) => setD({ ...d, title: e.target.value })}
          aria-label="설문 제목"
        />
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => onSave({ ...d, hidden: !d.hidden })}
          title={d.hidden ? '공개하기' : '숨기기'}
        >
          {d.hidden ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
          {d.hidden ? '준비 중' : '공개'}
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => onSave({ ...d, closed: !d.closed })}
          title={d.closed ? '다시 열기' : '마감하기'}
        >
          {d.closed ? <Lock size={16} aria-hidden="true" /> : <Unlock size={16} aria-hidden="true" />}
          {d.closed ? '마감됨' : '진행 중'}
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => onRemove(d)} aria-label="설문 지우기">
          <Trash2 size={16} aria-hidden="true" />
        </button>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label className="field" style={{ minWidth: 150 }}>
          <span className="field__label">고르는 방식</span>
          <select
            className="select"
            value={d.kind}
            onChange={(e) => {
              const kind = e.target.value as Poll['kind']
              setD({ ...d, kind, maxPick: kind === 'single' ? 1 : Math.max(2, d.maxPick) })
            }}
          >
            <option value="single">하나만</option>
            <option value="multi">여러 개</option>
          </select>
        </label>
        {d.kind === 'multi' && (
          <label className="field" style={{ maxWidth: 120 }}>
            <span className="field__label">최대 개수</span>
            <input
              className="input"
              type="number"
              min={2}
              max={Math.max(2, d.options.length)}
              value={d.maxPick}
              onChange={(e) => setD({ ...d, maxPick: Math.max(2, Number(e.target.value) || 2) })}
            />
          </label>
        )}
        <span className="t-text-xs t-muted" style={{ marginLeft: 'auto' }}>
          지금까지 {total.toLocaleString('ko-KR')}표
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {d.options.map((o, i) => (
          <div key={o.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              className="input"
              style={{ flex: 1 }}
              value={o.label}
              onChange={(e) =>
                setD({ ...d, options: d.options.map((x) => (x.id === o.id ? { ...x, label: e.target.value } : x)) })
              }
              aria-label={`선택지 ${i + 1}`}
            />
            <span className="t-text-xs t-muted" style={{ width: 64, textAlign: 'right' }}>
              {o.votes.toLocaleString('ko-KR')}표
            </span>
            <button
              type="button"
              className="btn-icon"
              aria-label={`선택지 ${i + 1} 지우기`}
              onClick={() => setD({ ...d, options: d.options.filter((x) => x.id !== o.id) })}
            >
              <Trash2 size={14} aria-hidden="true" />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          style={{ alignSelf: 'flex-start' }}
          onClick={() =>
            setD({
              ...d,
              options: [
                ...d.options,
                { id: crypto.randomUUID(), order: d.options.length + 1, label: '', votes: 0 },
              ],
            })
          }
        >
          <Plus size={14} aria-hidden="true" />
          선택지 추가
        </button>
      </div>

      {/**
       * 표가 있는 선택지를 지우면 그 표도 사라진다 — 되돌릴 수 없어서 미리 말해준다.
       * (어댑터가 선택지를 지울 때 `poll_votes` 가 cascade 로 같이 지워진다.)
       */}
      {dirty && d.options.some((o) => o.votes > 0 && !poll.options.find((x) => x.id === o.id)) && (
        <p className="field__error">표가 있는 선택지를 지우면 그 표도 함께 사라져요.</p>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          className="btn btn--primary"
          disabled={busy || !dirty}
          onClick={() => onSave({ ...d, options: d.options.map((o, i) => ({ ...o, order: i + 1 })) })}
        >
          저장하기
        </button>
        {dirty && (
          <button type="button" className="btn btn--ghost" onClick={() => setD(poll)}>
            되돌리기
          </button>
        )}
      </div>
    </section>
  )
}
