import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  ChevronLeft,
  CircleCheck,
  Clock,
  Download,
  Info,
  Share2,
} from 'lucide-react'

import { useSlotState } from '@/slot/SlotProvider'
import { useLivePreview } from '@/slot/preview'
import { quizDisplay, titleFor, type QuizDisplay } from '@/data/quiz'
import { fontStack, loadWebfont } from '@/data/fonts'
import { repo } from '@/lib/repo'
import { isLight, mix } from '@/lib/color'
import { cssUrl } from '@/lib/image'
import { visitorId } from '@/lib/visitor'
import { releaseResult, saveResult, shareResult, type ResultImage } from '@/lib/compose'
import { SavableImage } from '@/components/SavableImage'
import type { MyReward, QuizQuestion, QuizResult, QuizSettings } from '@/lib/repo/types'
import type { Slot } from '@/types/slot'
import { drawTitleCard } from './titleCard'
import { AdminEntry } from '@/components/AdminEntry'
import styles from './Quiz.module.css'
import { useT } from '@/i18n'
import { LangBar } from '@/components/LangBar'

/**
 * 최애 모의고사 — 문제를 풀고 칭호를 받는다.
 * 화면은 claude.ai/design 시안 '최애 모의고사 방문자' 를 옮긴 것이다.
 *
 * **URL 로 안 가른다** — 응시 중에 뒤로가기가 답을 통째로 날리는 게 더 나쁘다.
 * (롤페는 `/write` 로 갈랐지만 거기는 한 화면짜리 글쓰기다.)
 *
 * **정답은 이 파일에 한 번도 안 온다.** 채점은 서버가 하고, 결과 화면이 보여주는 정답도
 * `showAnswers` 정책에 따라 **서버가 잘라서** 준 것이다 (0024). 클라이언트가 걸러 보여주기로
 * 하면 그건 안 가린 것이다 — 응답 본문에 있으면 개발자도구로 읽힌다.
 */
export default function QuizApp() {
  const state = useSlotState()
  if (state.status === 'loading') return <div className="app" aria-busy="true" />
  if (state.status === 'missing') return null
  return <Quiz slot={state.slot} />
}

type View = 'start' | 'run' | 'grading' | 'result' | 'reward' | 'entered'

/**
 * 편집기 미리보기용 **표본** — 미리보기에서는 진짜로 제출할 수 없다(응모가 쌓이고 응시가 남는다).
 * 색을 고르는 사람이 문항·결과·교환권 화면을 보려면 뭔가는 그려져 있어야 한다.
 */
const SAMPLE_Q: QuizQuestion = {
  id: 'preview',
  order: 1,
  kind: 'choice',
  body: '우리 최애가 데뷔한 해는?',
  choices: ['2015년', '2016년', '2017년', '2018년'],
  points: 10,
  hidden: false,
}
const SAMPLE_RESULT: QuizResult = {
  attemptId: 'preview',
  score: 80,
  total: 100,
  correct: 8,
  count: 10,
  detail: [],
  rewardCode: null,
  rewardKind: null,
}
const SAMPLE_REWARD: MyReward = {
  code: 'XK4T-9P2M',
  label: '스페셜 포토카드 1장',
  kind: 'guaranteed',
  redeemedAt: null,
  entered: false,
  createdAt: '2026-01-01T00:00:00.000Z',
}

function Quiz({ slot }: { slot: Slot }) {
  const t = useT()
  const { slug } = slot
  const display = useMemo(() => quizDisplay(slot), [slot])
  const subject = useMemo(() => visitorId(), [])

  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null)
  const [settings, setSettings] = useState<QuizSettings | null>(null)
  const [view, setView] = useState<View>('start')
  const [step, setStep] = useState(0)
  const [picks, setPicks] = useState<Record<string, string>>({})
  const [result, setResult] = useState<QuizResult | null>(null)
  const [reward, setReward] = useState<MyReward | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [left, setLeft] = useState<number | null>(null)
  /**
   * 편집기 미리보기가 고른 화면 — 있으면 **그 화면에 고정한다** (`src/owner/previewScreens.ts`).
   * 미리보기에서 진짜로 제출할 수는 없으니, 데이터가 비면 표본으로 그린다.
   */
  const preview = useLivePreview()
  const pinned = (preview?.state as View | undefined) ?? null

  useEffect(() => {
    loadWebfont(display.font)
  }, [display.font])

  const load = useCallback(async () => {
    if (!repo.quiz.ready()) return
    const [qs, st, rw] = await Promise.all([
      repo.quiz.list(slug),
      repo.quiz.settings(slug),
      repo.quiz.myReward(slug, subject).catch(() => null),
    ])
    setQuestions(qs)
    setSettings(st)
    setReward(rw)
  }, [slug, subject])

  useEffect(() => {
    void load()
  }, [load])

  /**
   * 섞기는 **한 번만** 정한다 — 매 렌더마다 섞으면 답을 고르는 순간 보기가 춤춘다.
   * `slot` 이 바뀌면(편집기 미리보기) 다시 섞는다.
   */
  const ordered = useMemo(
    () => (questions ? (display.shuffleQuestions ? shuffle(questions) : questions) : []),
    [questions, display.shuffleQuestions]
  )

  const submit = useCallback(async () => {
    setView('grading')
    setError(null)
    try {
      const payload = ordered.map((q) => ({ id: q.id, value: picks[q.id] ?? '' }))
      const r = await repo.quiz.submit(slug, subject, payload)
      setResult(r)
      if (r.rewardCode) setReward(await repo.quiz.myReward(slug, subject).catch(() => null))
      setView('result')
    } catch (e) {
      setError(e instanceof Error ? e.message : t('제출하지 못했어요'))
      setView('start')
    }
  }, [ordered, picks, slug, subject])

  /**
   * 제한시간 — **시간이 다 되면 그 자리에서 제출한다.** 남은 답을 버리고 시작 화면으로
   * 돌려보내면 푼 게 전부 사라진다.
   *
   * 폰 시계를 믿지 않아도 되는 이유: 이건 편의 장치고, 부정을 막는 판정이 아니다
   * (서버는 제출 시각만 본다). 그래서 클라이언트 타이머로 충분하다.
   */
  useEffect(() => {
    if (view !== 'run' || !settings?.timeLimitSec) return
    const until = Date.now() + settings.timeLimitSec * 1000
    setLeft(settings.timeLimitSec)
    const t = setInterval(() => {
      const s = Math.max(0, Math.round((until - Date.now()) / 1000))
      setLeft(s)
      if (s === 0) {
        clearInterval(t)
        void submit()
      }
    }, 250)
    return () => clearInterval(t)
    // submit 은 picks 를 물고 바뀐다 — 의존성에 넣으면 답을 고를 때마다 타이머가 되감긴다.
    // ref 없이 이렇게 두는 편이 낫다: 타이머는 view 가 'run' 이 된 순간 기준이면 맞다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, settings?.timeLimitSec])

  const vars = {
    ['--qz-font' as string]: fontStack(display.font),
    ['--qz-head' as string]: display.headText,
    ['--qz-sub' as string]: display.subText,
    ['--qz-btn' as string]: display.buttonColor,
    ['--qz-btnFg' as string]: isLight(display.buttonColor) ? '#1f1f1f' : '#ffffff',
    ['--qz-bg' as string]: display.bg,
    ['--qz-resultBg' as string]: display.resultBg,
    /*
     * **배경 밝기에서 파생한다** (CLAUDE.md 의 규칙). 밝은 슬롯용 연회색(#f7f6f4)을
     * 어두운 슬롯에 그대로 쓰면 판때기가 하얗게 뜬다 — 배경을 반대쪽으로 조금 민다.
     */
    ['--qz-wash' as string]: mix(display.bg, isLight(display.bg) ? 'black' : 'white', 0.045),
    ['--qz-line' as string]: mix(display.bg, isLight(display.bg) ? 'black' : 'white', 0.1),
  }

  if (!repo.quiz.ready()) {
    return (
      <div className={`app ${styles.root}`} style={vars}>
      {/* 이 서비스는 자기 무대를 그린다 — ServiceHeader 가 없어 여기서 얹는다 */}
      <LangBar />
        <div className={styles.empty}>{t('지금은 모의고사를 쓸 수 없어요.')}</div>
      </div>
    )
  }
  if (!questions || !settings) return <div className="app" aria-busy="true" />

  const at = pinned ?? view
  const shownQs = pinned && ordered.length === 0 ? [SAMPLE_Q] : ordered
  const shownResult = pinned && !result ? SAMPLE_RESULT : result
  const shownReward = pinned && !reward ? SAMPLE_REWARD : reward
  const rootClass = `app ${styles.root}${at === 'result' ? ` ${styles.resultRoot}` : ''}`

  return (
    <div className={rootClass} style={vars}>
      <div className={styles.phone}>
        {at === 'start' && (
          <Start
            display={display}
            settings={settings}
            count={shownQs.length}
            error={error}
            slug={slug}
            reward={shownReward}
            onStart={() => {
              setPicks({})
              setStep(0)
              setResult(null)
              setError(null)
              setView('run')
            }}
            onReward={() => setView('reward')}
          />
        )}

        {at === 'run' && shownQs.length > 0 && (
          <Run
            display={display}
            q={shownQs[Math.min(step, shownQs.length - 1)]}
            step={Math.min(step, shownQs.length - 1)}
            total={shownQs.length}
            left={left}
            value={picks[shownQs[Math.min(step, shownQs.length - 1)].id] ?? ''}
            onPick={(v) =>
              setPicks((p) => ({ ...p, [shownQs[Math.min(step, shownQs.length - 1)].id]: v }))
            }
            onNext={() => (step + 1 < shownQs.length ? setStep(step + 1) : void submit())}
          />
        )}

        {at === 'grading' && (
          <div className={styles.grading}>
            <div className={styles.spinner} aria-hidden="true" />
            <div className={styles.gradingText}>{t('채점하는 중…')}</div>
          </div>
        )}

        {at === 'result' && shownResult && (
          <Result
            display={display}
            result={shownResult}
            reward={shownReward}
            settings={settings}
            onReward={() => setView('reward')}
          />
        )}

        {at === 'reward' && (
          <Reward
            display={display}
            settings={settings}
            reward={shownReward}
            slug={slug}
            subject={subject}
            onBack={() => setView(result ? 'result' : 'start')}
            onEntered={async () => {
              setReward(await repo.quiz.myReward(slug, subject).catch(() => null))
              setView('entered')
            }}
          />
        )}

        {at === 'entered' && (
          <Entered display={display} onBack={() => setView(result ? 'result' : 'start')} />
        )}
      </div>
    </div>
  )
}

/* ── ① 시작 ───────────────────────────────────── */

function Start({
  display,
  settings,
  count,
  error,
  slug,
  reward,
  onStart,
  onReward,
}: {
  display: QuizDisplay
  settings: QuizSettings
  count: number
  error: string | null
  slug: string
  reward: MyReward | null
  onStart: () => void
  onReward: () => void
}) {
  const t = useT()
  const mins = Math.round(settings.timeLimitSec / 60)
  return (
    <>
      <div style={{ height: 32, flex: 'none' }} />
      <div className={styles.startWrap} data-align={display.logoAlign}>
        {display.logo && (
          <div
            className={styles.logo}
            style={{ backgroundImage: cssUrl(display.logo) }}
            role="img"
            aria-label={display.title}
          />
        )}
        {display.showTitle && <h1 className={styles.startTitle}>{display.title}</h1>}
        {display.showSubtitle && display.subtitle && <p className={styles.startIntro}>{display.subtitle}</p>}

        {count > 0 && (
          <div className={styles.facts}>
            <div className={styles.fact}>
              <div className={styles.factLabel}>{t('문항 수')}</div>
              <div className={`${styles.factValue} ${styles.tnum}`}>{count}문항</div>
            </div>
            <div className={styles.fact}>
              <div className={styles.factLabel}>{t('제한시간')}</div>
              <div className={`${styles.factValue} ${styles.tnum}`}>
                {settings.timeLimitSec ? `${mins}분` : t('없음')}
              </div>
            </div>
          </div>
        )}
        {error && <p className={styles.error} style={{ marginTop: 18 }}>{error}</p>}
      </div>

      <div className={styles.bottom}>
        {count === 0 ? (
          <div className={styles.empty} style={{ padding: '0 0 20px' }}>
            아직 문제가 준비되지 않았어요.
            <br />
            조금 뒤에 다시 와 주세요.
          </div>
        ) : reward ? (
          // 이미 낸 사람 — 보상이 있으면 그리로 보낸다 (다시 풀 수 없는 이벤트가 대부분이다)
          <button type="button" className={styles.cta} onClick={onReward} data-my-reward>
            내 결과 보기
          </button>
        ) : (
          <button
            type="button"
            className={styles.cta}
            onClick={onStart}
            disabled={settings.closed}
            data-start
          >
            {settings.closed ? t('마감됐어요') : display.startLabel}
          </button>
        )}
        <div className={styles.adminRow}>
          <AdminEntry slug={slug} className={styles.adminLink} />
        </div>
      </div>
    </>
  )
}

/* ── ② 문항 ───────────────────────────────────── */

function Run({
  display,
  q,
  step,
  total,
  left,
  value,
  onPick,
  onNext,
}: {
  display: QuizDisplay
  q: QuizQuestion
  step: number
  total: number
  left: number | null
  value: string
  onPick: (v: string) => void
  onNext: () => void
}) {
  const t = useT()
  const last = step + 1 >= total
  const scrollRef = useRef<HTMLDivElement>(null)

  // 문항이 바뀌면 맨 위로 — 긴 문항을 지나면 다음 문제가 중간부터 보인다
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [q.id])

  return (
    <>
      <div style={{ height: 32, flex: 'none' }} />
      <div className={styles.progressTop}>
        <div className={styles.progressRow}>
          <span className={`${styles.step} ${styles.tnum}`}>
            {step + 1} / {total}
          </span>
          {left !== null && (
            <span
              className={`${styles.clock} ${styles.tnum}`}
              data-hurry={left <= 60 || undefined}
              data-clock
            >
              <Clock size={16} strokeWidth={1.7} aria-hidden="true" />
              {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
            </span>
          )}
        </div>
        <div className={styles.track}>
          <div className={styles.bar} style={{ width: `${((step + 1) / total) * 100}%` }} />
        </div>
      </div>

      <div className={styles.qHead}>
        <h2 className={styles.qBody}>{q.body}</h2>
      </div>

      <div
        className={styles.qScroll}
        ref={scrollRef}
        data-choices={q.kind === 'choice' && !q.image ? '' : undefined}
      >
        {q.image && (
          <div
            className={styles.qImage}
            style={{ backgroundImage: cssUrl(q.image) }}
            role="img"
            aria-label={t('문제 사진')}
          />
        )}

        {q.kind === 'choice' ? (
          q.choices.map((label, i) => (
            <button
              key={i}
              type="button"
              className={styles.choice}
              data-on={value === String(i) || undefined}
              onClick={() => onPick(String(i))}
              data-choice
            >
              <span className={styles.choiceNum} aria-hidden="true">
                {i + 1}
              </span>
              <span className={styles.choiceLabel}>{label}</span>
            </button>
          ))
        ) : (
          <div>
            <input
              className={styles.shortInput}
              value={value}
              placeholder={t('답을 적어 주세요')}
              aria-label={t('답')}
              onChange={(e) => onPick(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && value.trim() && onNext()}
              data-short
            />
            <div className={styles.shortHint}>{t('띄어쓰기는 채점에 영향을 주지 않아요')}</div>
          </div>
        )}
      </div>

      <div className={styles.submitBar}>
        {/**
          * **답을 안 골라도 넘어갈 수 있다.** 모르는 문제에서 막히면 그 자리에서 이탈한다 —
          * 카페에서 줄 서서 푸는 화면이라 되돌아오지 않는다. 안 고른 건 오답으로 채점된다.
          */}
        <button type="button" className={styles.cta} onClick={onNext} data-next>
          {last ? display.submitLabel : display.nextLabel}
        </button>
      </div>
    </>
  )
}

/* ── ④ 결과 ───────────────────────────────────── */

function Result({
  display,
  result,
  reward,
  settings,
  onReward,
}: {
  display: QuizDisplay
  result: QuizResult
  reward: MyReward | null
  settings: QuizSettings
  onReward: () => void
}) {
  const t = useT()
  const [image, setImage] = useState<ResultImage | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const won = titleFor(display.titles, result.score, result.total)
  const title = won?.label ?? ''
  const fitRef = useFitText(title)
  const wrong = result.detail.filter((d) => !d.ok && d.body)
  const date = new Date().toLocaleDateString('sv-SE').replaceAll('-', '.')

  // 카드는 한 번만 만든다. 언마운트 때 blob URL 을 놓아준다 (안 놓으면 탭이 살아 있는 내내 남는다)
  useEffect(() => {
    let alive = true
    let made: ResultImage | null = null
    void drawTitleCard({
      eventTitle: display.title,
      kicker: display.resultKicker,
      title,
      correct: result.correct,
      count: result.count,
      date,
      footer: display.cardFooter,
      logo: display.logo || undefined,
      badge: won?.image || undefined,
      colors: {
        bg: display.bg,
        head: display.headText,
        sub: display.subText,
        line: mix(display.bg, isLight(display.bg) ? 'black' : 'white', 0.1),
      },
      fontFamily: fontStack(display.font),
    })
      .then((img) => {
        made = img
        if (alive) setImage(img)
        else releaseResult(img)
      })
      .catch(() => {
        /* 카드를 못 만들어도 결과는 보여준다 — 저장 버튼만 비활성이 된다 */
      })
    return () => {
      alive = false
      if (made) releaseResult(made)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * **'저장' 과 '공유' 는 다른 일을 한다.** 예전엔 두 버튼이 같은 함수를 불러서 글자만
   * 다르고 하는 일이 똑같았다 — 어느 쪽을 눌러도 공유 시트가 떴다 (compose.ts 주석).
   */
  async function run(kind: 'save' | 'share') {
    if (!image) return
    const name = `${display.title}-${title}.png`
    const how = kind === 'save' ? await saveResult(image, name) : await shareResult(image, name)
    // 새 탭까지 떨어지면 사용자가 직접 눌러 저장해야 한다 — 그걸 말해준다
    setNote(how === 'opened' ? t('새 탭에서 사진을 길게 눌러 저장해 주세요.') : null)
  }

  return (
    <>
      <div style={{ height: 32, flex: 'none' }} />
      <div className={styles.resultScroll}>
        {/**
          * 화면의 이 카드와 저장되는 캔버스는 **같은 값을 그린다.** 하나만 고치면 저장물과
          * 화면이 어긋나므로, 문구를 바꿀 땐 `titleCard.ts` 도 같이 본다.
          */}
        <div className={styles.card} data-title-card>
          <div className={styles.cardTop}>
            {display.logo && (
              <div className={styles.cardLogo} style={{ backgroundImage: cssUrl(display.logo) }} aria-hidden="true" />
            )}
            <span className={styles.cardTitle}>{display.title}</span>
          </div>
          <div className={styles.cardMid}>
            {/**
              * 칭호 그림 — **`background-image` 다** (슬롯 자산이라 길게 눌러 저장되면 안 된다).
              * 저장되는 카드에는 캔버스가 같이 그린다 (`titleCard.ts`).
              */}
            {won?.image && (
              <div
                className={styles.badge}
                style={{ backgroundImage: cssUrl(won.image) }}
                role="img"
                aria-label={title}
                data-title-badge
              />
            )}
            <div className={styles.kicker}>{display.resultKicker}</div>
            {/**
              * **칭호는 카드 밖으로 나가면 안 된다.** 저장되는 캔버스에는 글자를 줄이는 장치가
              * 있었는데(`titleCard.ts` 의 `fitFont`) 화면 카드엔 없어서, 긴 칭호가 카드를
              * 넘어 튀어나왔다 — 같은 값을 그리는 두 곳 중 한쪽만 방어한 셈이었다.
              */}
            <div className={styles.titleBig} data-my-title ref={fitRef}>
              {title}
            </div>
            <div className={styles.rule} />
            <div className={`${styles.scoreLine} ${styles.tnum}`} data-score>
              {result.count}문항 중 <b>{result.correct}문항</b> 정답
            </div>
          </div>
          <div className={styles.cardFoot}>
            <span>{date}</span>
            <span>{display.cardFooter}</span>
          </div>
        </div>

        <div className={styles.actions}>
          <button type="button" onClick={() => void run('save')} disabled={!image} data-save>
            <Download size={17} strokeWidth={1.9} aria-hidden="true" />
            {t('저장')}
          </button>
          <button
            type="button"
            className={styles.ghost}
            onClick={() => void run('share')}
            disabled={!image}
            data-share
          >
            <Share2 size={17} strokeWidth={1.9} aria-hidden="true" />
            {t('공유')}
          </button>
        </div>

        {/* 화면에 안 그리지만 저장·공유의 원본이다 — 코드베이스에서 <img> 가 나는 유일한 자리 */}
        {image && (
          <div style={{ display: 'none' }} aria-hidden="true">
            <SavableImage image={image} alt={`${title} 칭호 카드`} />
          </div>
        )}

        {note && (
          <div className={styles.saveNote}>
            <Info size={16} strokeWidth={1.7} aria-hidden="true" style={{ flex: 'none', marginTop: 1 }} />
            <span>{note}</span>
          </div>
        )}

        {reward && (
          <button
            type="button"
            className={styles.cta}
            style={{ marginTop: 16 }}
            onClick={onReward}
            data-open-reward
          >
            {reward.kind === 'guaranteed' ? t('교환권 보기') : reward.entered ? t('응모 확인') : t('선물 응모하기')}
          </button>
        )}
        {!reward && settings.rewardMode === 'threshold' && (
          <p className={styles.centerBody} style={{ textAlign: 'center', marginTop: 16 }}>
            아쉽게도 기준 점수에 닿지 못했어요.
          </p>
        )}

        {wrong.length > 0 && (
          <div className={styles.review} data-review>
            <div className={styles.reviewTop}>
              <div className={styles.reviewTitle}>{t('틀린 문제 다시보기')}</div>
              <span className={`${styles.reviewCount} ${styles.tnum}`}>{wrong.length}문항</span>
            </div>
            {wrong.map((d) => (
              <div key={d.id} className={styles.reviewItem}>
                <div className={styles.reviewQ}>{d.body}</div>
                {d.given !== null && d.given !== undefined && (
                  <div className={styles.reviewRow}>
                    <span>{t('내 답')}</span>
                    <span style={{ fontWeight: 700 }}>{d.given || '—'}</span>
                  </div>
                )}
                {d.answer && (
                  <div className={styles.reviewRow}>
                    <span>{t('정답')}</span>
                    <span style={{ fontWeight: 800 }}>{d.answer}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <div style={{ height: 30 }} />
      </div>
    </>
  )
}

/**
 * 글자가 상자를 넘으면 폰트를 줄인다 — **저장되는 카드의 `fitFont` 와 같은 일**을 화면에서 한다.
 *
 * CSS 만으로는 안 된다: `clamp()` 는 화면 폭만 보고 **글자 길이는 모른다.** "찐팬 인증" 은
 * 들어가는 크기가 "우주 최강 초통령 덕후" 는 안 들어간다.
 *
 * `useLayoutEffect` 인 이유: 페인트 전에 줄여야 큰 글자가 한 프레임 번쩍이지 않는다.
 * 폰트가 늦게 로드되면 폭이 변하므로 `document.fonts.ready` 뒤에 한 번 더 잰다.
 */
function useFitText(text: string) {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    const box = el?.parentElement
    if (!el || !box) return

    const fit = () => {
      el.style.fontSize = ''
      const start = parseFloat(getComputedStyle(el).fontSize) || 40
      const limit = box.clientWidth
      let size = start
      // 넘치는 동안 2px 씩 — 40px 에서 시작해 최소 18px 까지. 그보다 작으면 어차피 안 읽힌다
      while (size > 18 && (el.scrollWidth > limit || el.scrollHeight > el.clientHeight + 1)) {
        size -= 2
        el.style.fontSize = `${size}px`
      }
    }

    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(box)
    void document.fonts?.ready.then(fit)
    return () => ro.disconnect()
  }, [text])

  return ref
}

/* ── ⑤ 보상 ───────────────────────────────────── */

function Reward({
  display,
  settings,
  reward,
  slug,
  subject,
  onBack,
  onEntered,
}: {
  display: QuizDisplay
  settings: QuizSettings
  reward: MyReward | null
  slug: string
  subject: string
  onBack: () => void
  onEntered: () => void
}) {
  const t = useT()
  if (!reward) {
    return (
      <>
        <Top onBack={onBack} />
        <div className={styles.center}>
          <div className={styles.bigIcon}>
            <CircleCheck size={30} strokeWidth={1.8} aria-hidden="true" />
          </div>
          <div className={styles.centerTitle}>{t('참여해 주셔서 고마워요')}</div>
          <p className={styles.centerBody}>
            이 이벤트에는 따로 드리는 선물이 없어요.
            <br />
            칭호 카드를 저장해 자랑해 주세요.
          </p>
          <button type="button" className={styles.ghostBtn} onClick={onBack}>
            결과 다시 보기
          </button>
        </div>
      </>
    )
  }

  if (reward.kind === 'guaranteed') return <Ticket display={display} reward={reward} onBack={onBack} />
  if (reward.entered) return <Entered display={display} onBack={onBack} />
  return (
    <EntryForm
      settings={settings}
      reward={reward}
      slug={slug}
      subject={subject}
      onBack={onBack}
      onDone={onEntered}
    />
  )
}

function Top({ onBack }: { onBack: () => void }) {
  const t = useT()
  return (
    <div className={styles.topBar}>
      <button type="button" className={styles.backBtn} onClick={onBack} aria-label={t('돌아가기')}>
        <ChevronLeft size={18} strokeWidth={1.7} aria-hidden="true" />
      </button>
    </div>
  )
}

function Ticket({
  display,
  reward,
  onBack,
}: {
  display: QuizDisplay
  reward: MyReward
  onBack: () => void
}) {
  const t = useT()
  const redeemed = !!reward.redeemedAt
  return (
    <>
      <Top onBack={onBack} />
      <div style={{ padding: '14px 22px 0', textAlign: 'center' }}>
        {!redeemed && <div className={styles.formKicker}>{t('기준 점수를 넘었어요')}</div>}
        <div style={{ marginTop: 6, fontSize: 20, fontWeight: 800 }}>{reward.label} 교환권</div>
      </div>
      <div className={styles.ticketWrap}>
        <div className={styles.ticket} data-ticket>
          <div className={redeemed ? styles.faded : undefined}>
            <div className={styles.ticketLabel}>{t('카운터에서 이 코드를 보여 주세요')}</div>
            <div className={`${styles.code} ${styles.tnum}`} data-code>
              {reward.code}
            </div>
          </div>
          {redeemed && <div className={styles.redeemedMark}>{t('수령 완료')}</div>}
        </div>

        {redeemed && (
          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>
              {new Date(reward.redeemedAt!).toLocaleString('ko-KR', {
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
              에 수령했어요
            </div>
            <div className={styles.inputHint} style={{ textAlign: 'center' }}>{t('이미 사용한 코드예요')}</div>
          </div>
        )}

        <div className={styles.note} style={{ marginTop: 16 }}>
          <Info size={16} strokeWidth={1.7} aria-hidden="true" style={{ flex: 'none', marginTop: 1 }} />
          <span>{t('이 기기에만 저장돼요. 브라우저 기록을 지우면 교환권도 사라져요.')}</span>
        </div>
      </div>
      <div style={{ padding: '0 22px 30px', textAlign: 'center', fontSize: 12, color: display.subText }}>
        발급{' '}
        {new Date(reward.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
      </div>
    </>
  )
}

function EntryForm({
  settings,
  reward,
  slug,
  subject: _subject,
  onBack,
  onDone,
}: {
  settings: QuizSettings
  reward: MyReward
  slug: string
  subject: string
  onBack: () => void
  onDone: () => void
}) {
  const t = useT()
  const f = settings.entryFields
  const [nickname, setNickname] = useState('')
  const [handle, setHandle] = useState('')
  const [contact, setContact] = useState('')
  const [address, setAddress] = useState('')
  const [agree, setAgree] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // 안 켠 항목은 문구에도 안 넣는다 — 받지 않는 걸 받는다고 적으면 그게 거짓 고지다
  const items = [t('닉네임'), f.handle && t('트위터 아이디'), f.contact && t('연락처'), f.address && t('주소')]
    .filter(Boolean)
    .join(', ')

  async function go() {
    if (!nickname.trim() || !agree || busy) return
    setBusy(true)
    setErr(null)
    try {
      await repo.quiz.enter(slug, reward.code, {
        nickname: nickname.trim(),
        handle: f.handle ? handle.trim().replace(/^@/, '') || undefined : undefined,
        contact: f.contact ? contact.trim() || undefined : undefined,
        address: f.address ? address.trim() || undefined : undefined,
      })
      onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('응모하지 못했어요'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Top onBack={onBack} />
      <div className={styles.formHead}>
        <div className={styles.formKicker}>{t('기준 점수를 넘었어요')}</div>
        <h2 className={styles.formTitle}>{reward.label} 응모하기</h2>
        <p className={styles.formIntro}>{t('당첨자는 이벤트가 끝난 뒤 주최자가 따로 발표해요.')}</p>
      </div>

      <div className={styles.formScroll}>
        <div>
          <label className={styles.label} htmlFor="qz-nick">
            닉네임 <span className={styles.req}>*</span>
          </label>
          <input
            id="qz-nick"
            className={styles.input}
            value={nickname}
            placeholder={t('발표 때 쓸 닉네임')}
            maxLength={24}
            onChange={(e) => setNickname(e.target.value)}
            data-nickname
          />
          <div className={styles.inputHint}>{t('당첨자 발표에 이 닉네임이 그대로 올라가요.')}</div>
        </div>

        {f.handle && (
          <div>
            <label className={styles.label} htmlFor="qz-handle">{t('트위터 아이디')}</label>
            <div className={styles.atRow}>
              <span aria-hidden="true">@</span>
              <input
                id="qz-handle"
                value={handle}
                placeholder={t('아이디')}
                maxLength={20}
                onChange={(e) => setHandle(e.target.value)}
              />
            </div>
          </div>
        )}
        {f.contact && (
          <div>
            <label className={styles.label} htmlFor="qz-contact">{t('연락처')}</label>
            <input
              id="qz-contact"
              className={styles.input}
              value={contact}
              placeholder="010-0000-0000"
              inputMode="numeric"
              maxLength={20}
              onChange={(e) => setContact(e.target.value)}
            />
          </div>
        )}
        {f.address && (
          <div>
            <label className={styles.label} htmlFor="qz-addr">{t('주소')}</label>
            <input
              id="qz-addr"
              className={styles.input}
              value={address}
              placeholder={t('받으실 주소')}
              maxLength={200}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
        )}

        <div className={styles.consent}>
          <div className={styles.consentTitle}>{t('개인정보 수집·이용 안내')}</div>
          <div className={styles.consentBody}>
            수집 항목: {items} · 수집 목적: 당첨자 확인 및 안내 · 보관 기간: 이벤트 종료 후 14일 ·
            파기 시점: 보관 기간 만료 즉시 파기. 동의하지 않으면 응모할 수 없어요.
          </div>
          <label className={styles.consentCheck}>
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} data-agree />
            <span className={styles.box} aria-hidden="true">
              <Check size={13} strokeWidth={3} />
            </span>
            위 내용에 동의해요
          </label>
        </div>

        {err && <p className={styles.error}>{err}</p>}
      </div>

      <div className={styles.submitBar}>
        <button
          type="button"
          className={styles.cta}
          style={{ height: 56, fontSize: 17 }}
          disabled={!nickname.trim() || !agree || busy}
          onClick={() => void go()}
          data-enter
        >
          {busy ? t('보내는 중…') : t('응모하기')}
        </button>
      </div>
    </>
  )
}

function Entered({ display: _display, onBack }: { display: QuizDisplay; onBack: () => void }) {
  const t = useT()
  return (
    <>
      <Top onBack={onBack} />
      <div className={styles.center}>
        <div className={styles.bigIcon}>
          <CircleCheck size={30} strokeWidth={1.8} aria-hidden="true" />
        </div>
        <div className={styles.centerTitle}>{t('응모했어요')}</div>
        <p className={styles.centerBody}>
          {t('당첨자는 이벤트가 끝난 뒤 주최자가 따로 발표해요.')}
          <br />
          응모는 한 번만 할 수 있어요.
        </p>
        <button type="button" className={styles.ghostBtn} onClick={onBack}>
          칭호 카드 다시 보기
        </button>
      </div>
    </>
  )
}

/* ── 섞기 ─────────────────────────────────────── */

function shuffle<T>(list: T[]): T[] {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
