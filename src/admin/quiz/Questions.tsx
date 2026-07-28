import { useCallback, useEffect, useState } from 'react'
import { Eye, EyeOff, GraduationCap, Pencil, Plus, SlidersHorizontal, Trash2, X } from 'lucide-react'

import { repo } from '@/lib/repo'
import type { QuizQuestionFull, QuizSettings } from '@/lib/repo/types'
import { useSlot } from '@/slot/SlotProvider'
import { confirmAction, toast } from '../AdminFeedback'
import styles from './Quiz.module.css'

/**
 * 문항 관리 — **주최자의 자리다.**
 *
 * 칭호·색·문구는 최고관리자가 편집기에서 정하고, 여기서는 **문제와 정답과 커트라인**을 만든다.
 *
 * **새 문항은 비공개로 시작한다.** 정답을 채우기 전에 손님에게 보이면 그 문항은 아무도 못
 * 맞히고, 이미 푼 사람들의 점수가 통째로 어긋난다. 정답이 빈 문항은 목록에서 눈에 띄게 그린다.
 */
export function Questions() {
  const slot = useSlot()
  const slug = slot.slug
  const [list, setList] = useState<QuizQuestionFull[] | null>(null)
  const [settings, setSettings] = useState<QuizSettings | null>(null)
  const [editing, setEditing] = useState<QuizQuestionFull | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [qs, st] = await Promise.all([repo.quiz.listAll(slug), repo.quiz.settings(slug)])
    setList(qs)
    setSettings(st)
  }, [slug])

  useEffect(() => {
    void load()
  }, [load])

  if (!repo.quiz.ready()) {
    return (
      <div className="admin-empty">
        <GraduationCap size={44} strokeWidth={1.6} aria-hidden="true" />
        <div className="admin-empty__title">지금 빌드에서는 모의고사를 쓸 수 없어요</div>
      </div>
    )
  }
  if (!list || !settings) return null

  const save = async (q: QuizQuestionFull) => {
    setBusy(true)
    try {
      await repo.quiz.saveQuestion(slug, q)
      setEditing(null)
      await load()
      toast('저장했어요')
    } catch (e) {
      toast(e instanceof Error ? e.message : '저장하지 못했어요')
    } finally {
      setBusy(false)
    }
  }

  const saveSettings = async (next: QuizSettings) => {
    setBusy(true)
    try {
      await repo.quiz.saveSettings(slug, next)
      // 서버가 값을 고칠 수 있다 (보상이 있으면 재응시가 강제로 꺼진다) — 되읽어서 화면을 맞춘다
      setSettings(await repo.quiz.settings(slug))
      toast('저장했어요')
    } finally {
      setBusy(false)
    }
  }

  if (editing) {
    return <Editor q={editing} busy={busy} onCancel={() => setEditing(null)} onSave={save} />
  }

  const open = list.filter((q) => !q.hidden)
  const maxScore = open.reduce((n, q) => n + q.points, 0)

  return (
    <div>
      <header className="admin__head">
        <div>
          <h1 className="t-title-l">모의고사</h1>
          <p className="t-text-xs t-muted">
            공개 {open.length}문항 · 만점 {maxScore}점 · 전체 {list.length}문항
          </p>
        </div>
        <button
          type="button"
          className="btn btn--primary btn--sm"
          onClick={() =>
            setEditing({
              id: crypto.randomUUID(),
              order: list.length + 1,
              kind: 'choice',
              body: '',
              choices: ['', '', '', ''],
              points: 1,
              hidden: true,
              answers: [],
            })
          }
          data-add-question
        >
          <Plus size={15} aria-hidden="true" />
          문항 추가
        </button>
      </header>

      {list.length === 0 ? (
        <div className="admin-empty">
          <GraduationCap size={44} strokeWidth={1.6} aria-hidden="true" />
          <div className="admin-empty__title">아직 문항이 없어요</div>
          <div className="t-text-s t-muted">문항을 만들고 정답을 채운 뒤 '공개' 로 바꿔 주세요.</div>
        </div>
      ) : (
        <div className={styles.list} data-questions>
          {list.map((q, i) => (
            <div
              key={q.id}
              className={styles.row}
              data-hidden={q.hidden || undefined}
              data-noanswer={q.answers.length === 0 || undefined}
            >
              <div className={styles.rowNum}>{i + 1}</div>
              <div className={styles.rowMain}>
                <div className={styles.rowBody}>{q.body || '(내용 없음)'}</div>
                <div className={styles.rowMeta}>
                  <span className={styles.tag}>{q.kind === 'choice' ? '객관식' : '주관식'}</span>
                  <span>{q.points}점</span>
                  {q.kind === 'choice' && <span>보기 {q.choices.length}개</span>}
                  {q.answers.length === 0 ? (
                    <span className={styles.warn}>정답이 비었어요 — 아무도 못 맞혀요</span>
                  ) : (
                    <span>정답 {q.answers.length}개</span>
                  )}
                  {q.hidden && <span>비공개</span>}
                </div>
              </div>
              <div className={styles.rowActions}>
                <button
                  type="button"
                  className="btn btn--state btn--sm"
                  data-on={!q.hidden || undefined}
                  disabled={busy || (q.hidden && q.answers.length === 0)}
                  title={q.hidden && q.answers.length === 0 ? '정답을 먼저 채워 주세요' : undefined}
                  onClick={() => void save({ ...q, hidden: !q.hidden })}
                >
                  {q.hidden ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
                  {q.hidden ? '비공개' : '공개'}
                </button>
                <button type="button" className="btn btn--quiet btn--sm" onClick={() => setEditing(q)}>
                  <Pencil size={14} aria-hidden="true" />
                  고치기
                </button>
                <button
                  type="button"
                  className="btn btn--kill btn--sm btn--iconOnly"
                  disabled={busy}
                  onClick={async () => {
                    if (
                      !(await confirmAction({
                        title: '이 문항을 지울까요?',
                        desc: '이미 응시한 분들의 점수는 그대로 남아요.',
                        okLabel: '삭제',
                        danger: true,
                      }))
                    )
                      return
                    await repo.quiz.removeQuestion(slug, q.id)
                    await load()
                    toast('지웠어요')
                  }}
                  aria-label="삭제"
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <section className="admin-section">
        <h2 className="admin-section__title">
          <SlidersHorizontal size={15} strokeWidth={2} aria-hidden="true" />
          운영 설정
        </h2>
        <div className="form-grid">
          <label className="field">
            <span className="field__label">보상</span>
            <select
              className="select"
              value={settings.rewardMode}
              disabled={busy}
              onChange={(e) =>
                void saveSettings({ ...settings, rewardMode: e.target.value as QuizSettings['rewardMode'] })
              }
              data-reward-mode
            >
              <option value="none">없음 (점수·칭호만)</option>
              <option value="threshold">기준 점수 이상 확정 선물</option>
              <option value="raffle">응모 (나중에 추첨)</option>
            </select>
          </label>

          {settings.rewardMode === 'threshold' && (
            <label className="field">
              <span className="field__label">기준 점수</span>
              <input
                className="input"
                type="number"
                min={0}
                max={Math.max(0, maxScore)}
                value={settings.rewardMinScore}
                disabled={busy}
                onChange={(e) => setSettings({ ...settings, rewardMinScore: Number(e.target.value) || 0 })}
                onBlur={() => void saveSettings(settings)}
                data-min-score
              />
              <span className="field__hint">지금 만점은 {maxScore}점이에요.</span>
            </label>
          )}

          {settings.rewardMode !== 'none' && (
            <label className="field">
              <span className="field__label">선물 이름</span>
              <input
                className="input"
                value={settings.rewardLabel}
                disabled={busy}
                onChange={(e) => setSettings({ ...settings, rewardLabel: e.target.value })}
                onBlur={() => void saveSettings(settings)}
              />
            </label>
          )}

          <label className="field">
            <span className="field__label">제한시간</span>
            <select
              className="select"
              value={String(settings.timeLimitSec)}
              disabled={busy}
              onChange={(e) => void saveSettings({ ...settings, timeLimitSec: Number(e.target.value) })}
            >
              <option value="0">없음</option>
              <option value="180">3분</option>
              <option value="300">5분</option>
              <option value="600">10분</option>
            </select>
          </label>

          <label className="field">
            <span className="field__label">정답 공개</span>
            <select
              className="select"
              value={settings.showAnswers}
              disabled={busy}
              onChange={(e) =>
                void saveSettings({ ...settings, showAnswers: e.target.value as QuizSettings['showAnswers'] })
              }
            >
              <option value="wrongOnly">틀린 문제만</option>
              <option value="after">다 보여줘요</option>
              <option value="none">안 보여줘요</option>
            </select>
            <span className="field__hint">
              카페에서 앞사람이 답을 알려주는 게 걱정되면 '안 보여줘요' 로 두세요.
            </span>
          </label>

          <label className="field">
            <span className="field__label">다시 풀기</span>
            <select
              className="select"
              value={settings.allowRetry ? 'on' : 'off'}
              disabled={busy || settings.rewardMode !== 'none'}
              onChange={(e) => void saveSettings({ ...settings, allowRetry: e.target.value === 'on' })}
            >
              <option value="on">여러 번 풀 수 있어요</option>
              <option value="off">한 번만</option>
            </select>
            {settings.rewardMode !== 'none' && (
              <span className="field__hint">
                <b>보상이 있으면 다시 풀 수 없어요.</b> 될 때까지 다시 풀면 모두가 당첨되니까요.
              </span>
            )}
          </label>

          <label className="field">
            <span className="field__label">마감</span>
            <select
              className="select"
              value={settings.closed ? 'on' : 'off'}
              disabled={busy}
              onChange={(e) => void saveSettings({ ...settings, closed: e.target.value === 'on' })}
            >
              <option value="off">진행 중</option>
              <option value="on">마감</option>
            </select>
          </label>
        </div>

        {settings.rewardMode === 'raffle' && (
          <div className="admin-subsection">
            <div className="admin-subsection__title">응모 때 받을 정보</div>
            <p className="admin-note">
              <b>안 켠 항목은 받지 않습니다.</b> 닉네임은 항상 받아요.
            </p>
            <div className="check-row">
              {(
                [
                  ['handle', '트위터 아이디'],
                  ['contact', '연락처'],
                  ['address', '주소 (배송할 때만)'],
                ] as ['handle' | 'contact' | 'address', string][]
              ).map(([key, label]) => (
                <label key={key} className="check">
                  <input
                    type="checkbox"
                    checked={settings.entryFields[key]}
                    disabled={busy}
                    onChange={(e) =>
                      void saveSettings({
                        ...settings,
                        entryFields: { ...settings.entryFields, [key]: e.target.checked },
                      })
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

/* ── 문항 편집 ─────────────────────────────────── */

function Editor({
  q: initial,
  busy,
  onCancel,
  onSave,
}: {
  q: QuizQuestionFull
  busy: boolean
  onCancel: () => void
  onSave: (q: QuizQuestionFull) => void
}) {
  const [q, setQ] = useState(initial)
  const [extra, setExtra] = useState('')

  const set = (change: Partial<QuizQuestionFull>) => setQ({ ...q, ...change })

  const canSave = q.body.trim() && (q.kind === 'short' ? q.answers.length > 0 : q.answers.length > 0)

  return (
    <div>
      <header className="admin__head">
        <div>
          <h1 className="t-title-l">문항 {initial.body ? '고치기' : '추가'}</h1>
          <p className="t-text-xs t-muted">
            정답은 <b>손님 화면에 한 번도 내려가지 않아요</b> — 채점은 서버가 합니다.
          </p>
        </div>
      </header>

      <section className="admin-section">
        <h2 className="admin-section__title">문항</h2>
        <div className={styles.editor}>
          <label className="field">
            <span className="field__label">문제</span>
            <textarea
              className="textarea"
              value={q.body}
              onChange={(e) => set({ body: e.target.value })}
              data-q-body
            />
          </label>

          <div className="form-grid">
            <label className="field">
              <span className="field__label">유형</span>
              <select
                className="select"
                value={q.kind}
                onChange={(e) => {
                  const kind = e.target.value as 'choice' | 'short'
                  // 유형을 바꾸면 정답의 뜻이 달라진다 (인덱스 ↔ 문자열) — 비우는 게 맞다
                  set({ kind, answers: [], choices: kind === 'choice' ? ['', '', '', ''] : [] })
                }}
                data-q-kind
              >
                <option value="choice">객관식</option>
                <option value="short">주관식</option>
              </select>
            </label>
            <label className="field">
              <span className="field__label">배점</span>
              <input
                className="input"
                type="number"
                min={0}
                max={100}
                value={q.points}
                onChange={(e) => set({ points: Math.max(0, Number(e.target.value) || 0) })}
              />
            </label>
            <label className="field">
              <span className="field__label">사진 (선택)</span>
              <input
                className="input"
                value={q.image ?? ''}
                placeholder="이미지 주소"
                onChange={(e) => set({ image: e.target.value || undefined })}
              />
            </label>
          </div>

          {q.kind === 'choice' ? (
            <div className="field">
              <span className="field__label">보기 · 정답 하나를 골라 주세요</span>
              <div className="choice-list">
                {q.choices.map((c, i) => (
                  <div key={i} className={styles.choiceRow}>
                    <input
                      type="radio"
                      name="answer"
                      checked={q.answers[0] === String(i)}
                      onChange={() => set({ answers: [String(i)] })}
                      aria-label={`${i + 1}번을 정답으로`}
                    />
                    <input
                      className="input"
                      value={c}
                      placeholder={`${i + 1}번 보기`}
                      onChange={(e) => set({ choices: q.choices.map((x, n) => (n === i ? e.target.value : x)) })}
                      data-choice-input
                    />
                    <button
                      type="button"
                      className="btn btn--kill btn--sm btn--iconOnly"
                      disabled={q.choices.length <= 2}
                      aria-label="보기 삭제"
                      onClick={() =>
                        set({
                          choices: q.choices.filter((_, n) => n !== i),
                          // 정답 뒤의 보기를 지우면 인덱스가 밀린다 — 정답을 다시 고르게 비운다
                          answers: [],
                        })
                      }
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="btn btn--outline btn--sm"
                style={{ marginTop: 10 }}
                onClick={() => set({ choices: [...q.choices, ''] })}
              >
                <Plus size={14} aria-hidden="true" />
                보기 추가
              </button>
            </div>
          ) : (
            <div className="field">
              <span className="field__label">정답 · 여러 개를 인정할 수 있어요</span>
              <p className="admin-note" style={{ margin: '4px 0 8px' }}>
                띄어쓰기·문장부호·대소문자는 채점에서 무시돼요. 손님이 다르게 쓸 만한 표현을
                미리 넣어두면 문의가 줄어요.
              </p>
              <div className={styles.answerList} data-answers>
                {q.answers.map((a) => (
                  <span key={a} className={styles.chip}>
                    {a}
                    <button
                      type="button"
                      aria-label={`${a} 삭제`}
                      onClick={() => set({ answers: q.answers.filter((x) => x !== a) })}
                    >
                      <X size={13} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="admin-inline-form" style={{ marginTop: 10 }}>
                <input
                  className="input"
                  value={extra}
                  placeholder="인정할 답을 적고 추가"
                  onChange={(e) => setExtra(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' || !extra.trim()) return
                    e.preventDefault()
                    if (!q.answers.includes(extra.trim())) set({ answers: [...q.answers, extra.trim()] })
                    setExtra('')
                  }}
                  data-answer-input
                />
                <button
                  type="button"
                  className="btn btn--outline btn--sm"
                  disabled={!extra.trim()}
                  onClick={() => {
                    if (!q.answers.includes(extra.trim())) set({ answers: [...q.answers, extra.trim()] })
                    setExtra('')
                  }}
                >
                  추가
                </button>
              </div>
            </div>
          )}

          <label className="check">
            <input type="checkbox" checked={!q.hidden} onChange={(e) => set({ hidden: !e.target.checked })} />
            손님에게 공개
          </label>
        </div>

        <div className="admin-actions">
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy || !canSave}
            onClick={() => onSave(q)}
            data-save-question
          >
            저장하기
          </button>
          <button type="button" className="btn btn--quiet" onClick={onCancel}>
            취소
          </button>
          {!canSave && (
            <span className="t-text-xs t-muted">
              문제와 정답을 채워 주세요.
            </span>
          )}
        </div>
      </section>
    </div>
  )
}
