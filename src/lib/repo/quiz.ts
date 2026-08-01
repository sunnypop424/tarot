import { db } from './client'
import { clean, cleanList, type I18nText } from '@/data/multilingual'
import type { Lang } from '@/i18n'
import type {
  MyReward,
  QuizQuestion,
  QuizQuestionFull,
  QuizRepo,
  QuizResult,
  QuizSettings,
  QuizStat,
} from './types'

/**
 * 최애 모의고사 어댑터.
 *
 * **local 짝을 만들지 않는다** (`ready()` = false). 채점이 서버여야 의미가 있다 —
 * 정답이 localStorage 에 있으면 개발자도구로 100점이 나온다.
 *
 * **방문자용 `list` 는 `quiz_questions` 만 읽는다.** 정답은 다른 테이블(`quiz_answers`)에
 * 있고 anon grant 가 없어서 애초에 못 읽는다 — 여기서 컬럼을 고르는 건 화면 편의일 뿐
 * 보안 장치가 아니다. 보안은 DB 에 있다 (0024 주석).
 */

interface QRow {
  id: string
  order: number
  kind: 'choice' | 'short'
  body: string
  body_i18n: I18nText
  image: string | null
  choices: string[]
  choices_i18n: Partial<Record<Lang, string[]>> | null
  points: number
  hidden: boolean
}

const toQuestion = (r: QRow): QuizQuestion => ({
  id: r.id,
  order: r.order,
  kind: r.kind,
  body: r.body,
  bodyI18n: r.body_i18n ?? undefined,
  image: r.image ?? undefined,
  choices: r.choices ?? [],
  choicesI18n: r.choices_i18n ?? undefined,
  points: r.points,
  hidden: r.hidden,
})

const DEFAULTS: QuizSettings = {
  rewardMode: 'none',
  rewardMinScore: 0,
  rewardLabel: '선물',
  entryFields: { handle: true, contact: false, address: false },
  timeLimitSec: 0,
  allowRetry: true,
  showAnswers: 'wrongOnly',
  closed: false,
}

const COLS =
  'id, "order", kind, body, body_i18n, image, choices, choices_i18n, points, hidden'

export const supabaseQuiz: QuizRepo = {
  ready: () => true,

  async list(slug) {
    const { data, error } = await (await db())
      .from('quiz_questions')
      .select(COLS)
      .eq('slug', slug)
      .eq('hidden', false)
      .order('order')
    if (error) throw new Error(error.message)
    return (data as unknown as QRow[]).map(toQuestion)
  },

  async listAll(slug) {
    const { data, error } = await (await db())
      .from('quiz_questions')
      .select(`${COLS}, quiz_answers(answers, answers_i18n)`)
      .eq('slug', slug)
      .order('order')
    if (error) throw new Error(error.message)
    type Ans = { answers: string[]; answers_i18n: I18nText }
    return (data as unknown as (QRow & { quiz_answers: Ans | null })[]).map((r) => ({
      ...toQuestion(r),
      answers: r.quiz_answers?.answers ?? [],
      answersI18n: r.quiz_answers?.answers_i18n ?? undefined,
    })) satisfies QuizQuestionFull[]
  },

  async saveQuestion(slug, q) {
    const db_ = await db()
    const { error } = await db_.from('quiz_questions').upsert({
      id: q.id,
      slug,
      order: q.order,
      kind: q.kind,
      body: q.body,
      body_i18n: clean(q.bodyI18n),
      image: q.image ?? null,
      choices: q.choices,
      // 빈 배열만 든 묶음은 안 넣는다 — 저장된 JSON 이 지저분해질 뿐 화면은 원문으로 떨어진다
      choices_i18n: cleanList(q.choicesI18n, q.choices.length),
      points: q.points,
      hidden: q.hidden,
    })
    if (error) throw new Error(error.message)
    // 정답은 항상 별도 테이블 — 문항과 같은 왕복에 실으면 그 컬럼이 다시 생긴다
    const { error: e2 } = await db_.from('quiz_answers').upsert({
      question_id: q.id,
      slug,
      answers: q.answers,
      answers_i18n: clean(q.answersI18n),
      updated_at: new Date().toISOString(),
    })
    if (e2) throw new Error(e2.message)
  },

  async removeQuestion(slug, id) {
    const { error } = await (await db()).from('quiz_questions').delete().eq('slug', slug).eq('id', id)
    if (error) throw new Error(error.message)
  },

  async settings(slug) {
    const { data, error } = await (await db())
      .from('quiz_settings')
      .select(
        'reward_mode, reward_min_score, reward_label, reward_label_i18n, entry_fields, time_limit_sec, allow_retry, show_answers, closed'
      )
      .eq('slug', slug)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return DEFAULTS
    const r = data as never as {
      reward_mode: QuizSettings['rewardMode']
      reward_min_score: number
      reward_label: string
      reward_label_i18n: I18nText
      entry_fields: QuizSettings['entryFields']
      time_limit_sec: number
      allow_retry: boolean
      show_answers: QuizSettings['showAnswers']
      closed: boolean
    }
    return {
      rewardMode: r.reward_mode,
      rewardMinScore: r.reward_min_score,
      rewardLabel: r.reward_label,
      rewardLabelI18n: r.reward_label_i18n ?? undefined,
      entryFields: r.entry_fields,
      timeLimitSec: r.time_limit_sec,
      allowRetry: r.allow_retry,
      showAnswers: r.show_answers,
      closed: r.closed,
    }
  },

  async saveSettings(slug, s) {
    const { error } = await (await db()).from('quiz_settings').upsert({
      slug,
      reward_mode: s.rewardMode,
      reward_min_score: s.rewardMinScore,
      reward_label: s.rewardLabel,
      reward_label_i18n: clean(s.rewardLabelI18n),
      entry_fields: s.entryFields,
      time_limit_sec: s.timeLimitSec,
      allow_retry: s.allowRetry,
      show_answers: s.showAnswers,
      closed: s.closed,
      updated_at: new Date().toISOString(),
    })
    if (error) throw new Error(error.message)
  },

  async submit(slug, subject, answers, lang) {
    const { data, error } = await (await db()).rpc('quiz_submit', {
      target: slug,
      subj: subject,
      payload: answers,
      /**
       * **결과에 담길 글자를 서버가 그 언어로 골라 준다** (`0047_quiz_i18n.sql`).
       *
       * 문항·보기는 화면이 직접 옮길 수도 있지만(공개된 값이다), **주관식 모범답안은
       * 숨긴 표에 있어서** 화면이 손댈 수가 없다 — 서버만 고를 수 있다.
       * 채점 자체는 언어를 안 탄다 (같은 답이 언어에 따라 갈리면 안 된다).
       */
      lang,
    })
    if (error) throw new Error(error.message)
    return data as QuizResult
  },

  async mine(slug, subject) {
    const { count, error } = await (await db())
      .from('quiz_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('slug', slug)
      .eq('subject', subject)
    /*
     * **anon 은 `quiz_attempts` 를 못 읽는다** (정책도 grant 도 없다) — 그래서 방문자
     * 브라우저에서는 여기가 늘 0 이다. 그게 맞다: 재응시 차단의 진짜 판정은 `quiz_submit`
     * 안에 있고, 이 값은 주최자 화면과 "이미 하셨어요" 안내에만 쓴다.
     * 실패를 던지지 않는 이유도 그것이다 — 못 읽는 게 정상 경로다.
     */
    if (error) return { attempts: 0 }
    return { attempts: count ?? 0 }
  },

  async stats(slug) {
    const db_ = await db()
    const [{ data: qs, error: e1 }, { data: at, error: e2 }] = await Promise.all([
      db_.from('quiz_questions').select('id, body').eq('slug', slug).order('order'),
      db_.from('quiz_attempts').select('score, total, detail').eq('slug', slug),
    ])
    if (e1) throw new Error(e1.message)
    if (e2) throw new Error(e2.message)

    const rows = (at ?? []) as unknown as { score: number; total: number; detail: { id: string; ok: boolean }[] }[]
    const tally = new Map<string, { tried: number; correct: number }>()
    for (const a of rows) {
      for (const d of a.detail ?? []) {
        const t = tally.get(d.id) ?? { tried: 0, correct: 0 }
        t.tried += 1
        if (d.ok) t.correct += 1
        tally.set(d.id, t)
      }
    }
    const questions = ((qs ?? []) as unknown as { id: string; body: string }[]).map(
      (q): QuizStat => ({
        questionId: q.id,
        body: q.body,
        tried: tally.get(q.id)?.tried ?? 0,
        correct: tally.get(q.id)?.correct ?? 0,
      })
    )
    // 평균은 **백분율**로 — 문항을 늘리면 절대 점수가 뛰어서 이벤트끼리 비교가 안 된다
    const avg = rows.length
      ? Math.round(rows.reduce((n, a) => n + (a.total > 0 ? a.score / a.total : 0), 0) * 100 / rows.length)
      : 0
    return { attempts: rows.length, avg, questions }
  },

  async regrade(slug) {
    const { data, error } = await (await db()).rpc('quiz_regrade', { target: slug })
    if (error) throw new Error(error.message)
    return (data as number) ?? 0
  },

  async myReward(slug, subject) {
    const { data, error } = await (await db()).rpc('reward_mine', {
      target: slug,
      src: 'quiz',
      subj: subject,
    })
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as {
      code: string
      label: string
      kind: 'guaranteed' | 'raffle'
      redeemed_at: string | null
      entered: boolean
      created_at: string
    }[]
    if (!rows.length) return null
    const r = rows[0]
    /*
     * 선물 이름의 번역은 **설정 행**에 있다 (`MyReward.labelI18n` 주석 — 보상 행에
     * 박으면 세 서비스가 같이 쓰는 `reward_claim` 을 고쳐야 한다). 원문이 그새 바뀌었으면
     * 안 붙인다 — 딴 선물의 번역이 붙는 게 안 붙는 것보다 나쁘다.
     */
    const { data: cfg } = await (await db())
      .from('quiz_settings')
      .select('reward_label, reward_label_i18n')
      .eq('slug', slug)
      .maybeSingle()
    const c = cfg as { reward_label: string; reward_label_i18n: I18nText } | null
    return {
      code: r.code,
      label: r.label,
      labelI18n: c && c.reward_label === r.label ? (c.reward_label_i18n ?? undefined) : undefined,
      kind: r.kind,
      redeemedAt: r.redeemed_at,
      entered: r.entered,
      createdAt: r.created_at,
    } satisfies MyReward
  },

  async enter(slug, code, form) {
    const { error } = await (await db()).rpc('reward_enter', {
      target: slug,
      raw_code: code,
      nick: form.nickname,
      tw: form.handle ?? null,
      ct: form.contact ?? null,
      addr: form.address ?? null,
    })
    if (error) throw new Error(error.message)
  },
}

const nope = (): never => {
  throw new Error('모의고사는 Supabase 가 붙어야 동작해요')
}

export const localQuiz: QuizRepo = {
  ready: () => false,
  list: nope,
  listAll: nope,
  saveQuestion: nope,
  removeQuestion: nope,
  settings: nope,
  saveSettings: nope,
  submit: nope,
  mine: nope,
  stats: nope,
  regrade: nope,
  myReward: nope,
  enter: nope,
}
