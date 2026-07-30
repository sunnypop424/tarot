import { useCallback, useEffect, useState } from 'react'

import { repo } from '@/lib/repo'
import type { QuizQuestionFull, QuizSettings } from '@/lib/repo/types'
import { useSlot } from '@/slot/SlotProvider'
import { confirmAction, toast } from '../AdminFeedback'
import { BulkPaste, splitCells, toLines, type BulkResult } from '../BulkPaste'
import { useT } from '@/i18n'

/**
 * 붙여넣기 한 줄 → 문항 하나.
 *
 * 두 모양을 받는다:
 *
 *   문제 | 보기1 | 보기2 | 보기3 | 보기4 | 2   ← 객관식 (마지막 칸이 정답 **번호**)
 *   문제 | 정답                                 ← 주관식 (보기가 없다)
 *
 * **정답을 번호로 받는다.** 정답 텍스트를 그대로 받으면 보기와 글자가 한 자만 달라도
 * (띄어쓰기·따옴표) 못 찾고, 그러면 정답이 빈 문항이 조용히 만들어진다.
 *
 * **정답이 없거나 범위를 벗어나면 못 읽은 줄로 돌려준다.** 정답 없는 문항은 아무도 못 맞히고,
 * 이미 푼 사람 점수까지 어긋나게 만든다 — 조용히 넣느니 안 넣는 게 낫다.
 * (`readiness.ts` 도 정답 없는 문항을 출시 전 점검에서 막는다.)
 */
function parseQuestions(text: string, startOrder: number): BulkResult<QuizQuestionFull> {
  const items: QuizQuestionFull[] = []
  const skipped: string[] = []

  for (const line of toLines(text)) {
    const cells = splitCells(line).filter((c) => c !== '')
    const body = cells[0] ?? ''
    if (!body || cells.length < 2) {
      skipped.push(line)
      continue
    }

    // 칸이 둘뿐이면 주관식 — 보기가 없으니 정답 번호랄 게 없다
    if (cells.length === 2) {
      items.push({
        id: crypto.randomUUID(),
        order: startOrder + items.length + 1,
        kind: 'short',
        body,
        choices: [],
        points: 1,
        hidden: true,
        answers: [cells[1]],
      })
      continue
    }

    const answerCell = cells[cells.length - 1]
    const choices = cells.slice(1, -1)
    const answerNo = Number(answerCell)
    if (!Number.isInteger(answerNo) || answerNo < 1 || answerNo > choices.length || choices.length < 2) {
      skipped.push(line)
      continue
    }
    items.push({
      id: crypto.randomUUID(),
      order: startOrder + items.length + 1,
      kind: 'choice',
      body,
      choices,
      points: 1,
      hidden: true,
      // 서버·화면 모두 **보기 인덱스 문자열**로 든다 (`QuizQuestionFull.answers` 주석)
      answers: [String(answerNo - 1)],
    })
  }
  return { items, skipped }
}

/**
 * 문항 관리 — **주최자의 자리다.**
 *
 * 칭호·색·문구는 최고관리자가 편집기에서 정하고, 여기서는 **문제와 정답과 커트라인**을 만든다.
 *
 * **새 문항은 비공개로 시작한다.** 정답을 채우기 전에 방문자에게 보이면 그 문항은 아무도 못
 * 맞히고, 이미 푼 사람들의 점수가 통째로 어긋난다. 정답이 빈 문항은 목록에서 눈에 띄게 그린다.
 */
export function Questions() {
  const t = useT()
  const slot = useSlot()
  const slug = slot.slug
  const [list, setList] = useState<QuizQuestionFull[] | null>(null)
  const [settings, setSettings] = useState<QuizSettings | null>(null)
  const [editing, setEditing] = useState<QuizQuestionFull | null>(null)
  const [busy, setBusy] = useState(false)
  /** 못 읽은 이유 — 0건과 구분해야 한다 (아래 `if (!list)` 가 영원히 빈 화면이 되던 자리) */
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    /**
     * **못 읽으면 그 사실을 화면에 남긴다.**
     *
     * `listAll` 은 정답이 붙어 있어 권한을 본다(`quiz_answers` 에 anon 권한이 없다 —
     * 그건 열면 안 되는 자리다). 로그인 없이 들어오면 여기서 던지는데, 예전엔 그 예외가
     * 아무 데도 안 잡혀 `list` 가 `null` 로 남았고 아래 `if (!list) return null` 이
     * **아무것도 안 그렸다** — 하얀 화면이다. 체험 슬롯(`/demo-quiz/admin/quiz`)은 로그인
     * 없이 열리므로 랜딩에서 이 서비스만 빈 화면으로 보였다.
     */
    try {
      const [qs, st] = await Promise.all([repo.quiz.listAll(slug), repo.quiz.settings(slug)])
      setList(qs)
      setSettings(st)
      setLoadError(null)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : '문항을 읽지 못했어요')
      setList([])
    }
  }, [slug])

  useEffect(() => {
    void load()
  }, [load])

  if (!repo.quiz.ready()) {
    return (
      <>
        <header className="ad-head">
          <div className="ad-head__row">
            <h1 className="ad-head__title">모의고사</h1>
          </div>
        </header>
        <div className="ad-card">
          <div className="ad-empty">
            <div className="ad-empty__title">지금 빌드에서는 모의고사를 쓸 수 없어요</div>
          </div>
        </div>
      </>
    )
  }
  /**
   * **못 읽었으면 이유를 보여준다.** 예전엔 여기서 `null` 을 돌려줘 하얀 화면이었다 —
   * "고장났나" 와 "로그인이 필요하다" 를 구분할 방법이 없었다.
   */
  if (loadError) {
    return (
      <>
        <header className="ad-head">
          <div className="ad-head__row">
            <h1 className="ad-head__title">모의고사</h1>
          </div>
        </header>
        <div className="ad-card">
          <div className="ad-empty">
            <div className="ad-empty__title">문항을 읽지 못했어요</div>
            <div className="ad-empty__sub">
              문항과 정답은 로그인한 주최자만 볼 수 있어요. 로그인하고 다시 열어 주세요.
            </div>
            <div className="ad-fine" style={{ marginTop: 10 }}>
              {loadError}
            </div>
          </div>
        </div>
      </>
    )
  }
  if (!list || !settings) return null

  /**
   * 붙여넣은 문항을 한꺼번에 — **한 개씩 저장한다** (일괄 저장 RPC 가 없다).
   *
   * 중간에 실패하면 **거기서 멈추고 몇 개가 들어갔는지 말한다.** 끝까지 밀어붙이면
   * 어디까지 됐는지 알 수 없고, 통째로 되돌리면 스무 개를 다시 붙여 넣어야 한다.
   * 순서대로 저장하므로 앞의 것들은 그대로 남고, 주최자는 남은 줄만 다시 넣으면 된다.
   */
  const addMany = async (items: QuizQuestionFull[]) => {
    setBusy(true)
    let done = 0
    try {
      for (const q of items) {
        await repo.quiz.saveQuestion(slug, q)
        done++
      }
      toast(`${done}문항을 넣었어요 · 전부 비공개예요`)
    } catch (e) {
      toast(`${done}문항까지 넣었어요 — ${e instanceof Error ? e.message : '나머지는 실패했어요'}`)
    } finally {
      await load()
      setBusy(false)
    }
  }

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
  const rewardOn = settings.rewardMode !== 'none'

  const choice = <T extends string>(
    label: string,
    hint: string,
    value: T,
    options: { v: T; n: string }[],
    onPick: (v: T) => void,
    lockMsg?: string
  ) => (
    <div style={lockMsg ? { opacity: 0.55 } : undefined}>
      <div className="ad-card__titleRow">
        <span className="ad-card__title">{label}</span>
        {lockMsg && <span className="ad-tag ad-tag--sm">지금은 바꿀 수 없어요</span>}
      </div>
      {hint && <p className="ad-card__desc">{hint}</p>}
      <div className="ad-choices" style={{ marginTop: 12 }}>
        {options.map((o) => (
          <button
            key={o.v}
            type="button"
            className="ad-choice"
            data-on={value === o.v || undefined}
            disabled={busy}
            onClick={() => (lockMsg ? toast(lockMsg) : onPick(o.v))}
          >
            {o.n}
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <>
      <header className="ad-head">
        <div className="ad-head__row">
          <h1 className="ad-head__title">모의고사</h1>
          <span className="ad-head__count tnum">
            공개 {open.length}문항 · 만점 {maxScore}점
          </span>
        </div>
        <p className="ad-head__desc">문항과 운영 방식을 관리해요.</p>
      </header>

      <div className="ad-stack">
        <div className="ad-card">
          <div className="ad-card__head">
            <span className="ad-card__title">
              공개 {open.length}문항 · 만점 {maxScore}점 · 전체 {list.length}문항
            </span>
            <div className="ad-btnrow">
              {/*
                * **문항 20개를 20번 만들지 않게.** 주최자는 그 목록을 이미 어딘가에 갖고 있다 —
                * 여기 붙여 넣으면 정답까지 한 번에 들어간다. 들어간 문항은 **비공개로 시작한다**
                * (아래 `addMany` 주석 — 손으로 만드는 것과 같은 규칙이다).
                */}
              <BulkPaste
                label="문항"
                disabled={busy}
                placeholder={
                  '우리 최애 데뷔 연도는? | 2015 | 2016 | 2017 | 2018 | 2\n최애 포지션은? | 메인보컬\n응원봉 색은? | 라벤더 | 민트 | 코랄 | 1'
                }
                hint={
                  <>
                    한 줄에 한 문항씩 <b>문제 | 보기1 | 보기2 | … | 정답번호</b> 순서로 적어 주세요.
                    보기 없이 <b>문제 | 정답</b> 만 적으면 주관식이 돼요. 탭·쉼표·세로줄 다 돼요.
                    <br />
                    배점은 1점으로 들어가고, <b>전부 비공개</b>로 만들어져요 — 확인하고 공개해 주세요.
                  </>
                }
                parse={(text) => parseQuestions(text, list.length)}
                preview={(q) =>
                  q.kind === 'choice'
                    ? `${q.body} → ${q.choices[Number(q.answers[0])] ?? '?'}`
                    : `${q.body} → ${q.answers[0] ?? '?'} (주관식)`
                }
                onApply={addMany}
              />
              <button
                type="button"
                className="ad-btn ad-btn--soft ad-btn--sm"
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
                + 문항 추가
              </button>
            </div>
          </div>

          {list.length === 0 ? (
            <div className="ad-empty">
              <div className="ad-empty__title">아직 문항이 없어요</div>
              <div className="ad-empty__sub">문항을 만들고 정답을 채운 뒤 공개해 주세요.</div>
            </div>
          ) : (
            <div className="ad-rows" data-questions>
              {list.map((q, i) => (
                <div
                  key={q.id}
                  className="ad-row"
                  data-off={q.hidden || undefined}
                  data-noanswer={q.answers.length === 0 || undefined}
                >
                  <span className="ad-row__no tnum">{i + 1}</span>
                  <button type="button" className="ad-row__grow" onClick={() => setEditing(q)}>
                    <div className="ad-row__title">{q.body || '(내용 없음)'}</div>
                    <div className="ad-row__meta">
                      <span>
                        {q.kind === 'choice' ? '객관식' : '주관식'} · {q.points}점 ·{' '}
                        {q.kind === 'choice'
                          ? `보기 ${q.choices.length}개 · 정답 ${q.answers.length}개`
                          : `인정 답 ${q.answers.length}개`}
                      </span>
                      {q.answers.length === 0 && (
                        <span className="ad-tag ad-tag--sm" data-tone="warn">
                          아무도 못 맞혀요
                        </span>
                      )}
                    </div>
                  </button>
                  <button
                    type="button"
                    className="ad-toggle-pill"
                    data-on={!q.hidden || undefined}
                    disabled={busy}
                    onClick={() => {
                      if (q.hidden && q.answers.length === 0) {
                        toast('정답이 비어 있어 공개할 수 없어요')
                        return
                      }
                      void save({ ...q, hidden: !q.hidden })
                    }}
                  >
                    {q.hidden ? '비공개' : '공개'}
                  </button>
                  <button
                    type="button"
                    className="ad-x"
                    disabled={busy}
                    aria-label="삭제"
                    onClick={async () => {
                      if (
                        !(await confirmAction({
                          title: '이 문항을 지울까요?',
                          desc: '이미 응시한 분들의 점수는 그대로 남아요. 문항만 사라져요.',
                          okLabel: '지우기',
                          danger: true,
                        }))
                      )
                        return
                      await repo.quiz.removeQuestion(slug, q.id)
                      await load()
                      toast('문항을 지웠어요')
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <span className="ad-note">아래 운영 설정은 고르면 바로 저장돼요</span>
        </div>

        <div className="ad-card ad-card--form">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            {choice(
              '선물',
              '응모로 정하면 응모 때 받을 정보를 고를 수 있어요.',
              settings.rewardMode,
              [
                { v: 'none' as const, n: '없음 (점수·칭호만)' },
                { v: 'threshold' as const, n: '기준 점수 이상 확정 선물' },
                { v: 'raffle' as const, n: '응모 (나중에 추첨)' },
              ],
              (v) => void saveSettings({ ...settings, rewardMode: v })
            )}

            {settings.rewardMode === 'threshold' && (
              <div>
                <div className="ad-card__title">기준 점수</div>
                <div className="ad-inline" style={{ marginTop: 12 }}>
                  <input
                    className="ad-input ad-input--num"
                    inputMode="numeric"
                    value={settings.rewardMinScore}
                    disabled={busy}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        rewardMinScore: Number(e.target.value.replace(/[^0-9]/g, '')) || 0,
                      })
                    }
                    onBlur={() => void saveSettings(settings)}
                    data-min-score
                  />
                  <span className="ad-unit">점 이상</span>
                  <span className="ad-range">지금 만점은 {maxScore}점이에요</span>
                </div>
              </div>
            )}

            {rewardOn && (
              <div>
                <div className="ad-card__title">선물 이름</div>
                <input
                  className="ad-input"
                  style={{ marginTop: 12 }}
                  value={settings.rewardLabel}
                  placeholder="예: 아크릴 스탠드"
                  disabled={busy}
                  onChange={(e) => setSettings({ ...settings, rewardLabel: e.target.value })}
                  onBlur={() => void saveSettings(settings)}
                />
              </div>
            )}

            {choice(
              '제한시간',
              '',
              String(settings.timeLimitSec),
              [
                { v: '0', n: t('없음') },
                { v: '180', n: '3분' },
                { v: '300', n: '5분' },
                { v: '600', n: '10분' },
              ],
              (v) => void saveSettings({ ...settings, timeLimitSec: Number(v) })
            )}

            {choice(
              '정답 공개',
              '카페에서 앞사람이 답을 알려주는 게 걱정되면 ‘안 보여줘요’ 로 두세요.',
              settings.showAnswers,
              [
                { v: 'wrongOnly' as const, n: '틀린 문제만' },
                { v: 'after' as const, n: '다 보여줘요' },
                { v: 'none' as const, n: '안 보여줘요' },
              ],
              (v) => void saveSettings({ ...settings, showAnswers: v })
            )}

            {choice(
              '다시 풀기',
              rewardOn ? '선물이 있으면 켤 수 없어요. 될 때까지 풀면 모두가 당첨돼요.' : '',
              settings.allowRetry ? 'on' : 'off',
              [
                { v: 'on' as const, n: '여러 번 풀 수 있어요' },
                { v: 'off' as const, n: t('한 번만') },
              ],
              (v) => void saveSettings({ ...settings, allowRetry: v === 'on' }),
              rewardOn ? '선물이 있으면 다시 풀기를 켤 수 없어요' : undefined
            )}

            {choice(
              '마감',
              '',
              settings.closed ? 'on' : 'off',
              [
                { v: 'off' as const, n: t('진행 중') },
                { v: 'on' as const, n: t('마감') },
              ],
              (v) => void saveSettings({ ...settings, closed: v === 'on' })
            )}

            {settings.rewardMode === 'raffle' && (
              <div className="ad-subset">
                <div className="ad-subset__title">응모 때 받을 정보</div>
                <div className="ad-checks">
                  {(
                    [
                      ['handle', '트위터 아이디', '당첨 안내용 · 선택'],
                      ['contact', '연락처', '꼭 필요할 때만 받아 주세요'],
                      ['address', '주소', '배송이 필요한 선물일 때만'],
                    ] as ['handle' | 'contact' | 'address', string, string][]
                  ).map(([key, label, hint]) => {
                    const on = settings.entryFields[key]
                    return (
                      <button
                        key={key}
                        type="button"
                        className="ad-check"
                        data-on={on || undefined}
                        disabled={busy}
                        onClick={() =>
                          void saveSettings({
                            ...settings,
                            entryFields: { ...settings.entryFields, [key]: !on },
                          })
                        }
                      >
                        <span className="ad-check__box">{on ? '✓' : ''}</span>
                        <span>
                          <span className="ad-check__name">{label}</span>
                          <span className="ad-check__hint">{hint}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
                <p className="ad-fine" style={{ marginTop: 12 }}>
                  안 켠 항목은 아예 받지 않아요. 닉네임은 항상 받아요.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
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

  const blockers: string[] = []
  if (!q.body.trim()) blockers.push('문제 문구가 비어 있어요')
  if (q.kind === 'choice' && q.answers.length === 0) blockers.push('정답으로 고른 보기가 없어요')
  if (q.kind === 'short' && q.answers.length === 0) blockers.push('인정할 답이 하나도 없어요')
  const canSave = blockers.length === 0

  const addAccept = () => {
    const v = extra.trim()
    if (!v) return
    if (!q.answers.includes(v)) set({ answers: [...q.answers, v] })
    setExtra('')
  }

  return (
    <>
      <header className="ad-head">
        <button type="button" className="ad-head__back" onClick={onCancel}>
          ‹ 문항 목록
        </button>
        <div className="ad-head__row">
          <h1 className="ad-head__title">문항 {initial.body ? '고치기' : '추가'}</h1>
        </div>
        <p className="ad-head__desc">
          정답은 방문자 화면에 한 번도 내려가지 않아요. 채점은 서버가 해요.
        </p>
      </header>

      <div className="ad-stack">
        <div className="ad-banner ad-banner--info">
          정답은 방문자 화면에 한 번도 내려가지 않아요. 채점은 서버가 해요.
        </div>

        <div className="ad-card ad-card--form">
          <span className="ad-field__label">문제</span>
          <input
            className="ad-input ad-input--lg"
            value={q.body}
            placeholder="문제 문구"
            onChange={(e) => set({ body: e.target.value })}
            data-q-body
          />

          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 18 }}>
            <div>
              <span className="ad-field__label">유형</span>
              {/* 옆의 배점 입력칸과 같은 높이 — 나란히 서는 두 컨트롤은 밑선이 맞아야 한다 */}
              <div className="ad-seg ad-seg--tall" data-q-kind>
                {(
                  [
                    ['choice', '객관식'],
                    ['short', '주관식'],
                  ] as const
                ).map(([kind, label]) => (
                  <button
                    key={kind}
                    type="button"
                    className="ad-seg__btn"
                    data-on={q.kind === kind || undefined}
                    onClick={() =>
                      // 유형을 바꾸면 정답의 뜻이 달라진다 (인덱스 ↔ 문자열) — 비우는 게 맞다
                      set({ kind, answers: [], choices: kind === 'choice' ? ['', '', '', ''] : [] })
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="ad-field__label">배점</span>
              <input
                className="ad-input ad-input--num"
                inputMode="numeric"
                value={q.points}
                onChange={(e) => set({ points: Math.max(0, Number(e.target.value.replace(/[^0-9]/g, '')) || 0) })}
              />
            </div>
          </div>

          <div className="ad-empty ad-empty--sm" style={{ marginTop: 20, padding: 18 }}>
            <div className="ad-empty__title" style={{ fontSize: 13, color: 'var(--ad-ink-3)' }}>
              사진 (선택)
            </div>
            <div className="ad-fine" style={{ marginTop: 5 }}>
              문제에 붙일 이미지가 있으면 담당자에게 보내 주세요
            </div>
          </div>

          {q.kind === 'choice' ? (
            <div style={{ marginTop: 22 }}>
              <span className="ad-field__label">보기 · 정답 하나 고르기</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* 보기 입력칸은 문제·사진 칸과 **같은 폭**이다 — 정답 표시와 지우기는 칸 안쪽에 얹는다 */}
                {q.choices.map((c, i) => (
                  <div key={i} className="ad-choicerow">
                    <button
                      type="button"
                      className="ad-pick"
                      data-on={q.answers[0] === String(i) || undefined}
                      aria-label={`${i + 1}번을 정답으로`}
                      onClick={() => set({ answers: [String(i)] })}
                    >
                      {q.answers[0] === String(i) ? '✓' : ''}
                    </button>
                    <input
                      className="ad-input ad-input--sm"
                      value={c}
                      placeholder={`${i + 1}번 보기`}
                      onChange={(e) => set({ choices: q.choices.map((x, n) => (n === i ? e.target.value : x)) })}
                      data-choice-input
                    />
                    <button
                      type="button"
                      className="ad-x"
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
                      ×
                    </button>
                  </div>
                ))}
              </div>
              {q.answers.length === 0 && (
                <div className="ad-field__hint ad-field__hint--bad">
                  정답으로 고른 보기가 없어요. 정답을 골라 주세요.
                </div>
              )}
              <button
                type="button"
                className="ad-btn ad-btn--line ad-btn--sm"
                style={{ marginTop: 12 }}
                onClick={() => set({ choices: [...q.choices, ''] })}
              >
                + 보기 추가
              </button>
            </div>
          ) : (
            <div style={{ marginTop: 22 }}>
              <span className="ad-field__label">인정할 답</span>
              <p className="ad-fine" style={{ margin: '-2px 0 10px' }}>
                띄어쓰기·문장부호·대소문자는 채점에서 무시돼요. 방문자가 다르게 쓸 표현을 미리 넣어
                두면 문의가 줄어요.
              </p>
              <div className="ad-chips ad-chips--tight" style={{ marginBottom: 10 }} data-answers>
                {q.answers.map((a) => (
                  <span key={a} className="ad-chip ad-chip--key">
                    {a}
                    <button
                      type="button"
                      className="ad-chip__x"
                      aria-label={`${a} 삭제`}
                      onClick={() => set({ answers: q.answers.filter((x) => x !== a) })}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div className="ad-inline">
                <input
                  className="ad-input ad-input--sm ad-input--grow"
                  value={extra}
                  placeholder="인정할 표현을 적고 추가"
                  onChange={(e) => setExtra(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return
                    e.preventDefault()
                    addAccept()
                  }}
                  data-answer-input
                />
                <button
                  type="button"
                  className="ad-btn ad-btn--soft ad-btn--sm"
                  disabled={!extra.trim()}
                  onClick={addAccept}
                >
                  추가
                </button>
              </div>
            </div>
          )}

          <button
            type="button"
            className="ad-checkbare"
            style={{ marginTop: 22 }}
            onClick={() => set({ hidden: !q.hidden })}
          >
            <span className="ad-check__box" data-on={!q.hidden || undefined}>
              {q.hidden ? '' : '✓'}
            </span>
            <span className="ad-checkbare__label">방문자에게 공개</span>
          </button>

          {blockers.length > 0 && (
            <div className="ad-banner ad-banner--warn ad-banner--pad" style={{ marginTop: 18 }}>
              <div className="ad-banner__title">아직 저장할 수 없어요</div>
              {blockers.map((b) => (
                <div key={b} className="ad-banner__body" style={{ marginTop: 4 }}>
                  · {b}
                </div>
              ))}
            </div>
          )}

          <div className="ad-btnrow" style={{ marginTop: 22 }}>
            <button
              type="button"
              className="ad-btn ad-btn--primary ad-btn--2xl"
              disabled={busy || !canSave}
              onClick={() => onSave(q)}
              data-save-question
            >
              저장하기
            </button>
            <button type="button" className="ad-btn ad-btn--line ad-btn--2xl" onClick={onCancel}>
              취소
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
