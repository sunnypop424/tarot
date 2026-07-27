/**
 * 최애 모의고사 검증 — **이 서비스는 "정답이 안 새는 것" 이 전부다.**
 *
 *   node scripts/verify-quiz.mjs
 *
 * 보는 것:
 *  - **anon 이 `quiz_answers` 를 못 읽는다** — 이 한 줄이 서비스의 존재 이유다
 *  - 비공개 문항이 방문자에게 안 온다 · anon 이 `quiz_attempts` 를 못 읽는다
 *  - 틀린 답으로 만점이 안 나온다 · **안 보낸 문항이 채점에서 안 빠진다**
 *    (payload 를 기준으로 돌면 한 문제만 보내고 만점이 된다 — 0024 주석)
 *  - 주관식은 띄어쓰기·대소문자·문장부호를 무시한다
 *  - `showAnswers='none'` 이면 응답 본문에 정답이 아예 없다
 *  - **보상을 켜면 재응시가 서버에서 강제로 꺼진다** (안 그러면 될 때까지 눌러 전원 당첨)
 *  - 커트라인을 넘으면 교환코드, 못 넘으면 안 나온다 · 응모는 점수가 함께 저장된다
 *  - **점수순 추첨에서 동점자는 정원만큼만, 그 안에선 무작위**
 *  - 다시 채점이 기존 응시분의 점수를 고친다
 */

import { readFileSync } from 'node:fs'
import { exec } from './db.mjs'

const env = {}
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim())
  if (m) env[m[1]] = m[2]
}
const URL_ = env.VITE_SUPABASE_URL
const ANON = env.VITE_SUPABASE_ANON_KEY
const SLUG = 'quiz-verify'
const SLUG_TAROT = 'quiz-verify-tarot'

let failed = 0
const check = (name, ok, detail = '') => {
  if (!ok) failed++
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const auth = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: ANON, 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'owner@example.com', password: env.SEED_PASSWORD ?? 'tarot1234' }),
})
if (!auth.ok) {
  console.error('최고관리자 로그인 실패')
  process.exit(1)
}
const { access_token } = await auth.json()
const OWNER = { apikey: ANON, authorization: `Bearer ${access_token}`, 'content-type': 'application/json' }
const ANONH = { apikey: ANON, 'content-type': 'application/json' }
const rest = (p, i = {}) => fetch(`${URL_}/rest/v1/${p}`, i)
const rpc = (fn, body, headers = ANONH) =>
  rest(`rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(body) })

const cleanup = async () => {
  await exec(`delete from public.slots where slug in ('${SLUG}','${SLUG_TAROT}');`)
  await exec(`delete from public.rate_events where slug in ('${SLUG}','${SLUG_TAROT}');`)
}
await cleanup()

await exec(`insert into public.slots(slug,name,service,theme,event) values
  ('${SLUG}','모의고사 검증','quiz','{"colors":{},"shape":{},"assets":{}}','{}'),
  ('${SLUG_TAROT}','타로 검증','tarot','{"colors":{},"shape":{},"assets":{}}','{}');`)

/** 문항 + 정답을 심는다 (주최자가 관리 화면에서 하는 일) */
const mkQ = async (order, kind, body, choices, answers, { hidden = false, points = 10 } = {}) => {
  const id = (
    await exec(`insert into public.quiz_questions(slug,"order",kind,body,choices,points,hidden)
      values ('${SLUG}',${order},'${kind}','${body}','${JSON.stringify(choices)}',${points},${hidden})
      returning id;`)
  )[0].id
  await exec(`insert into public.quiz_answers(question_id,slug,answers)
    values ('${id}','${SLUG}','${JSON.stringify(answers)}');`)
  return id
}

const q1 = await mkQ(1, 'choice', '객관식 하나', ['가', '나', '다'], ['1'])
const q2 = await mkQ(2, 'choice', '객관식 둘', ['가', '나'], ['0'])
const q3 = await mkQ(3, 'short', '주관식', [], ['부산'])
const qHidden = await mkQ(4, 'choice', '비공개 문항', ['가'], ['0'], { hidden: true })

const setSettings = (p) =>
  exec(`insert into public.quiz_settings(slug, reward_mode, reward_min_score, reward_label, show_answers, allow_retry, closed, time_limit_sec)
        values ('${SLUG}','${p.rewardMode ?? 'none'}',${p.rewardMinScore ?? 0},'${p.rewardLabel ?? '선물'}',
                '${p.showAnswers ?? 'wrongOnly'}',${p.allowRetry ?? true},${p.closed ?? false},0)
        on conflict (slug) do update set reward_mode=excluded.reward_mode,
          reward_min_score=excluded.reward_min_score, reward_label=excluded.reward_label,
          show_answers=excluded.show_answers, allow_retry=excluded.allow_retry, closed=excluded.closed;`)

await setSettings({})

// ── 1. 비밀 ───────────────────────────────────────
{
  const r = await rest(`quiz_answers?slug=eq.${SLUG}&select=answers`, { headers: ANONH })
  const rows = r.ok ? await r.json() : []
  check('**anon 은 정답을 못 읽는다**', rows.length === 0, `HTTP ${r.status} · ${rows.length}행`)
}
{
  // 조인으로 우회하는 길도 막혔는지 — 관계 임베딩은 대상 테이블 권한을 그대로 따른다
  const r = await rest(`quiz_questions?slug=eq.${SLUG}&select=id,quiz_answers(answers)`, { headers: ANONH })
  const rows = r.ok ? await r.json() : []
  const leaked = rows.some((x) => x.quiz_answers?.answers?.length)
  check('**조인으로도 정답이 안 샌다**', !r.ok || !leaked, `HTTP ${r.status}`)
}
{
  const r = await rest(`quiz_questions?slug=eq.${SLUG}&select=id,hidden`, { headers: ANONH })
  const rows = r.ok ? await r.json() : []
  check('비공개 문항이 방문자에게 안 온다', rows.length === 3 && rows.every((x) => !x.hidden), `${rows.length}개`)
}
{
  const r = await rest(`quiz_attempts?slug=eq.${SLUG}&select=score`, { headers: ANONH })
  const rows = r.ok ? await r.json() : []
  check('anon 은 응시 기록을 못 읽는다 (남의 점수)', rows.length === 0, `${rows.length}행`)
}

// ── 2. 채점 ───────────────────────────────────────
{
  const r = await rpc('quiz_submit', {
    target: SLUG,
    subj: 'a-1',
    payload: [
      { id: q1, value: '1' },
      { id: q2, value: '0' },
      { id: q3, value: '부산' },
    ],
  })
  const d = r.ok ? await r.json() : null
  check('다 맞히면 만점', d?.score === 30 && d?.correct === 3, JSON.stringify(d?.score))
  check('비공개 문항은 채점에 안 들어간다', d?.count === 3 && d?.total === 30, `${d?.count}문항 / ${d?.total}점`)
}
{
  const r = await rpc('quiz_submit', {
    target: SLUG,
    subj: 'a-2',
    payload: [
      { id: q1, value: '0' },
      { id: q2, value: '1' },
      { id: q3, value: '서울' },
    ],
  })
  const d = r.ok ? await r.json() : null
  check('틀린 답으로 만점이 안 나온다', d?.score === 0, `${d?.score}점`)
}
{
  // **payload 를 기준으로 채점하면 여기서 만점이 나온다** (0024 주석의 함정)
  const r = await rpc('quiz_submit', { target: SLUG, subj: 'a-3', payload: [{ id: q1, value: '1' }] })
  const d = r.ok ? await r.json() : null
  check(
    '**안 보낸 문항이 채점에서 안 빠진다** (한 문제만 보내도 만점이 아니다)',
    d?.score === 10 && d?.count === 3,
    `${d?.score}/${d?.total}점 · ${d?.count}문항`
  )
}
{
  const r = await rpc('quiz_submit', {
    target: SLUG,
    subj: 'a-4',
    payload: [{ id: q3, value: ' 부 산! ' }],
  })
  const d = r.ok ? await r.json() : null
  check('주관식은 띄어쓰기·문장부호를 무시한다', d?.score === 10, `${d?.score}점`)
}
{
  const r = await rpc('quiz_submit', { target: SLUG, subj: 'a-5', payload: [{ id: q3, value: '' }] })
  const d = r.ok ? await r.json() : null
  check('주관식 빈 답은 정답이 아니다', d?.score === 0, `${d?.score}점`)
}
{
  const r = await rpc('quiz_submit', {
    target: SLUG,
    subj: 'a-6',
    payload: [{ id: qHidden, value: '0' }],
  })
  const d = r.ok ? await r.json() : null
  check('비공개 문항을 보내도 점수가 안 붙는다', d?.score === 0, `${d?.score}점`)
}

// ── 3. 정답 공개 정책 ─────────────────────────────
{
  await setSettings({ showAnswers: 'none' })
  const r = await rpc('quiz_submit', { target: SLUG, subj: 'sa-1', payload: [{ id: q1, value: '0' }] })
  const d = r.ok ? await r.json() : null
  const clean = (d?.detail ?? []).every((x) => x.answer === null && x.body === null && x.given === null)
  check("**'안 보여줘요' 면 응답 본문에 정답이 아예 없다**", clean, JSON.stringify(d?.detail?.[0]))
}
{
  await setSettings({ showAnswers: 'wrongOnly' })
  const r = await rpc('quiz_submit', {
    target: SLUG,
    subj: 'sa-2',
    payload: [
      { id: q1, value: '1' },
      { id: q2, value: '1' },
    ],
  })
  const d = r.ok ? await r.json() : null
  const right = (d?.detail ?? []).find((x) => x.id === q1)
  const wrong = (d?.detail ?? []).find((x) => x.id === q2)
  check("'틀린 문제만' 이면 맞힌 문항의 정답은 안 온다", right?.answer === null, JSON.stringify(right))
  check("'틀린 문제만' 이면 틀린 문항의 정답은 온다", wrong?.answer === '가', JSON.stringify(wrong))
  // **"내 답" 도 보기 글자여야 한다** — 인덱스를 그대로 내려보내면 "내 답 2 / 정답 가" 가 뜬다
  check('객관식 "내 답" 이 숫자가 아니라 보기 글자다', wrong?.given === '나', JSON.stringify(wrong?.given))
}

// ── 4. 보상 ───────────────────────────────────────
{
  await setSettings({ rewardMode: 'threshold', rewardMinScore: 20, rewardLabel: '스페셜 엽서', allowRetry: true })
  const on = (await exec(`select allow_retry from public.quiz_settings where slug='${SLUG}';`))[0].allow_retry
  check('**보상을 켜면 재응시가 서버에서 강제로 꺼진다**', on === false, `allow_retry=${on}`)
}
{
  const r = await rpc('quiz_submit', {
    target: SLUG,
    subj: 'rw-1',
    payload: [
      { id: q1, value: '1' },
      { id: q2, value: '0' },
      { id: q3, value: '부산' },
    ],
  })
  const d = r.ok ? await r.json() : null
  check('커트라인을 넘으면 교환코드가 나온다', !!d?.rewardCode && d?.rewardKind === 'guaranteed', d?.rewardCode ?? '없음')
}
{
  const r = await rpc('quiz_submit', { target: SLUG, subj: 'rw-2', payload: [{ id: q1, value: '0' }] })
  const d = r.ok ? await r.json() : null
  check('커트라인을 못 넘으면 코드가 안 나온다', !d?.rewardCode, d?.rewardCode ?? '없음')
}
{
  const r = await rpc('quiz_submit', { target: SLUG, subj: 'rw-1', payload: [{ id: q1, value: '1' }] })
  check('재응시가 막힌다', !r.ok, `HTTP ${r.status}`)
}

// ── 5. 응모 · 점수순 추첨 ─────────────────────────
{
  await setSettings({ rewardMode: 'raffle', rewardLabel: '추첨 선물' })
  // 동점자 4명 + 낮은 점수 2명 — 점수순으로 2명을 뽑으면 동점 4명 중에서만 갈려야 한다
  const codes = []
  for (const [i, v] of ['1', '1', '1', '1', '0', '0'].entries()) {
    const r = await rpc('quiz_submit', {
      target: SLUG,
      subj: `raf-${i}`,
      payload: [
        { id: q1, value: v },
        { id: q2, value: v === '1' ? '0' : '1' },
      ],
    })
    const d = r.ok ? await r.json() : null
    if (d?.rewardCode) codes.push({ code: d.rewardCode, subj: `raf-${i}`, score: d.score })
  }
  check('응모 모드는 점수와 상관없이 모두 응모 대상이다', codes.length === 6, `${codes.length}명`)

  // 앞 절의 확정(threshold) 보상도 같은 테이블에 남아 있으므로 **응모 행만** 본다
  const scored = (
    await exec(
      `select score from public.rewards where slug='${SLUG}' and source='quiz' and kind='raffle' order by score desc;`
    )
  ).map((r) => r.score)
  check(
    '**보상 행에 점수가 함께 저장된다** (추첨이 서비스를 몰라도 점수순이 된다)',
    scored.length === 6 && scored[0] === 20 && scored.at(-1) === 0,
    JSON.stringify(scored)
  )

  for (const c of codes) {
    await rpc('reward_enter', { target: SLUG, raw_code: c.code, nick: c.subj, tw: c.subj, ct: null, addr: null })
  }

  const p = await rpc('reward_pick', { target: SLUG, src: 'quiz', cnt: 2, method: 'score' }, OWNER)
  const won = p.ok ? await p.json() : []
  check('점수순 추첨이 정원만큼만 뽑는다', won.length === 2, `${won.length}명`)
  check('**동점 커트라인 위에서만 뽑힌다** (낮은 점수는 안 들어온다)', won.every((w) => w.score === 20), JSON.stringify(won.map((w) => w.score)))
}

// ── 6. 다시 채점 ──────────────────────────────────
{
  // "서울" 도 정답으로 인정 → 이미 0점으로 낸 a-2 의 점수가 올라야 한다
  const before = (await exec(`select score from public.quiz_attempts where slug='${SLUG}' and subject='a-2';`))[0].score
  await exec(`update public.quiz_answers set answers='["부산","서울"]'::jsonb where question_id='${q3}';`)
  const r = await rpc('quiz_regrade', { target: SLUG }, OWNER)
  const n = r.ok ? await r.json() : 0
  const after = (await exec(`select score from public.quiz_attempts where slug='${SLUG}' and subject='a-2';`))[0].score
  check('다시 채점이 기존 응시분을 고친다', after > before, `${before} → ${after} (${n}명)`)

  const anonTry = await rpc('quiz_regrade', { target: SLUG })
  check('**anon 은 다시 채점을 못 부른다**', !anonTry.ok, `HTTP ${anonTry.status}`)
}

// ── 7. 게이트 ─────────────────────────────────────
{
  const r = await rpc('quiz_submit', { target: SLUG_TAROT, subj: 'g-1', payload: [{ id: q1, value: '1' }] })
  check('**다른 서비스 슬롯엔 제출할 수 없다**', !r.ok, `HTTP ${r.status}`)
}
{
  await setSettings({ rewardMode: 'none', closed: true })
  const r = await rpc('quiz_submit', { target: SLUG, subj: 'g-2', payload: [{ id: q1, value: '1' }] })
  check('마감하면 제출을 못 한다', !r.ok, `HTTP ${r.status}`)
  await setSettings({ rewardMode: 'none', closed: false })
}
{
  const r = await rest(`quiz_questions?slug=eq.${SLUG}`, {
    method: 'PATCH',
    headers: ANONH,
    body: JSON.stringify({ hidden: false }),
  })
  const n = (await exec(`select count(*)::int n from public.quiz_questions where slug='${SLUG}' and hidden=true;`))[0].n
  check('anon 은 문항을 고칠 수 없다', n === 1, `HTTP ${r.status} · 비공개 ${n}개`)
}

// ── 8. 정리 ───────────────────────────────────────
await cleanup()
{
  const n = (await exec(`select count(*)::int n from public.quiz_questions where slug='${SLUG}';`))[0].n
  const m = (await exec(`select count(*)::int n from public.quiz_answers where slug='${SLUG}';`))[0].n
  const k = (await exec(`select count(*)::int n from public.rewards where slug='${SLUG}';`))[0].n
  check('슬롯을 지우면 문항·정답·보상도 같이 지워진다 (cascade)', n === 0 && m === 0 && k === 0, `${n}/${m}/${k}`)
}

console.log(failed === 0 ? '\n전부 통과' : `\n${failed}개 실패`)
process.exit(failed === 0 ? 0 : 1)
