/**
 * AI 리딩 검증 — 실제로 Claude 를 불러보고, 실제 화면에서 뽑아본다.
 * 개발 서버가 떠 있어야 하고, .env.local 에 ANTHROPIC_API_KEY 가 있어야 한다.
 *
 *   node scripts/verify-ai.mjs <스크린샷 디렉터리>
 *
 * 키가 없으면 "꺼진 채로 도는지"만 확인하고 통과시킨다 — 그것도 정상 동작이다.
 */

import puppeteer from 'puppeteer-core'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const BASE = 'http://localhost:5174'


/**
 * 인증이 진짜라 실제 계정으로 들어간다 (supabase/seed.sql 의 씨앗 계정).
 * Supabase 를 안 붙였으면 local 어댑터가 아무 값이나 통과시키므로 이 값이 그대로 먹는다.
 */
const env = {}
try {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim())
    if (m) env[m[1]] = m[2]
  }
} catch {
  /* .env.local 이 없으면 local 어댑터 */
}
const OWNER_EMAIL = 'owner@example.com'
const ADMIN_PASSWORD = env.SEED_PASSWORD ?? 'tarot1234'

/**
 * AI 는 이제 **배포된 Edge Function** 이 부른다 — 개발도 배포와 같은 함수를 쓴다.
 * 구현이 하나여야 프롬프트·한도가 어긋나지 않는다 (개발 서버 미들웨어를 없앤 이유).
 */
const AI_BASE = env.VITE_AI_BASE ?? ''

/** 씨앗 계정 토큰 — 답변 생성·색 만들기는 권한이 있어야 부를 수 있다 */
const tokenFor = async (email, password = ADMIN_PASSWORD) => {
  const r = await fetch(`${env.VITE_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: env.VITE_SUPABASE_ANON_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  return r.ok ? (await r.json()).access_token : null
}

/**
 * 이 실행만의 표식 — 리딩 캐시가 **DB** 로 옮겨가서 같은 조합을 다시 부르면 캐시가 돌아온다.
 * 그러면 토큰을 못 재고 원가 측정(docs/PRICING.md 의 근거)이 죽는다. 질문에 표식을 달아 피한다.
 */
const RUN = Date.now().toString(36)

const checks = []
const check = (name, ok, detail = '') => {
  checks.push([name, ok])
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

/** SSE 를 읽어 전체 텍스트로 */
async function readStream(res) {
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let text = ''
  let cached = null
  let usage = null

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const chunks = buffer.split('\n\n')
    buffer = chunks.pop() ?? ''
    for (const chunk of chunks) {
      const event = /^event: (.+)$/m.exec(chunk)?.[1]
      const raw = /^data: (.+)$/m.exec(chunk)?.[1]
      if (!event || !raw) continue
      const data = JSON.parse(raw)
      if (event === 'error') throw new Error(data.error)
      if (event === 'text') text += data.text
      if (event === 'done') {
        cached = data.cached
        usage = data.usage
      }
    }
  }
  return { text, cached, usage }
}

/** 실측 토큰 — docs/PRICING.md 의 근거 */
const measured = { reading: [], answers: [] }
const report = (bucket, usage, extra = {}) => {
  if (usage) measured[bucket].push({ ...usage, ...extra })
}

const status = await (await fetch(`${AI_BASE}/status`)).json()
console.log(`AI 상태: ${status.ready ? `준비됨 (${status.model})` : '키 없음'}\n`)

if (!status.ready) {
  console.log('ANTHROPIC_API_KEY 가 없어 생성은 건너뜁니다 (.env.example 참고).')
  console.log('앱은 이 상태에서 "종합" 블록 없이 카드별 해석으로 정상 동작해야 합니다.')
  process.exit(0)
}

/**
 * ── 픽스처 — **이 검증이 직접 만들고 지운다** ──────────────────
 *
 * 예전엔 `demo`(프리미엄)·`sample-pink`(스탠다드) 슬롯이 DB 에 있다고 **가정**했다.
 * 체험 슬롯이 `demo-*` 로 갈리면서 그 둘이 사라졌고, 그러자 이 스크립트는
 * **"AI 리딩이 0자" 로 무너졌다** — 제품이 멀쩡한데 고장난 것처럼 보였다.
 * (`demo-tarot` 은 무료 플랜이라 리딩을 정상적으로 거절한다.)
 *
 * 그래서 다른 verify 들처럼 **자기 픽스처를 자기가 만든다.** 이름도 `demo` 를 피한다 —
 * DB 에 `demo` 를 되살리면 `/demo` 가 실제 주소가 되어 배포에 열린 문이 하나 생긴다.
 *
 * 설정값은 `src/data/slots.json` 의 그 두 슬롯에서 그대로 가져온다 (플랜·한도·애정운 3장).
 */
const SEED = (await import('../src/data/slots.json', { with: { type: 'json' } })).default
const PAID = SEED.find((s) => s.slug === 'demo') // 프리미엄 — 리딩·답변 생성
const LITE = SEED.find((s) => s.slug === 'sample-pink') // 스탠다드 — 애정운 3장 (폴백 확인용)
const SLUG = 'aitest'
const SLUG_LITE = 'aitest-lite'
const ORGANIZER = 'aitest-organizer@example.com'
const ORG_PASSWORD = 'verify-1234'

const { VITE_SUPABASE_URL: sbUrl, VITE_SUPABASE_ANON_KEY: sbKey } = env
if (!sbUrl || !sbKey) {
  console.log('⚠ 이 검증은 Supabase 가 붙은 빌드를 전제로 해요 (.env.local 의 VITE_SUPABASE_*).')
  console.log('  슬롯을 직접 심었다 지우기 때문입니다. 회귀가 아니라 설정이 없는 겁니다.')
  process.exit(0)
}

const ownerAuth = await fetch(`${sbUrl}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: sbKey, 'content-type': 'application/json' },
  body: JSON.stringify({ email: OWNER_EMAIL, password: ADMIN_PASSWORD }),
})
const { access_token: ownerToken } = await ownerAuth.json()
if (!ownerToken) {
  console.error('최고관리자 로그인 실패 — SEED_PASSWORD 를 확인하세요')
  process.exit(1)
}
const OWNER = { apikey: sbKey, authorization: `Bearer ${ownerToken}`, 'content-type': 'application/json' }
const rest = (p, i = {}) => fetch(`${sbUrl}/rest/v1/${p}`, { ...i, headers: { ...OWNER, ...(i.headers ?? {}) } })
/** 슬롯·주최자 계정·질문까지 통째로 — 수동 삭제와 같은 경로 (verify-admin 과 동일) */
const adminFn = (p, body) =>
  fetch(`${sbUrl}/functions/v1/admin/${p}`, { method: 'POST', headers: OWNER, body: JSON.stringify(body) })

async function dropFixtures() {
  for (const slug of [SLUG, SLUG_LITE]) {
    await adminFn('purge', { slug }).catch(() => {})
    await rest(`slots?slug=eq.${slug}`, { method: 'DELETE' }).catch(() => {})
  }
}

await dropFixtures() // 지난 실행이 죽으며 남긴 게 있으면 먼저 치운다
for (const [slug, src] of [
  [SLUG, PAID],
  [SLUG_LITE, LITE],
]) {
  const r = await rest('slots', {
    method: 'POST',
    headers: { prefer: 'return=minimal' },
    body: JSON.stringify({
      slug,
      name: `AI 검증 · ${slug}`,
      service: 'tarot',
      plan: src.plan,
      limits: src.limits,
      /* 메이저 22장으로 줄인다 — 화면 절이 '전체 생성' 을 실제로 눌러 보는데,
         78장이면 오래 걸리고 실제 비용이 든다. 검사는 덱 크기를 동적으로 읽는다 */
      deck: 'major',
      period: {},
      theme: src.theme,
      event: src.event,
    }),
  })
  check(`픽스처 슬롯을 만든다 (${slug})`, r.ok, r.ok ? `${src.plan}` : await r.text())
}

/**
 * 답변 생성은 **그 슬롯 주최자만** 부를 수 있다 (`manages_slot`). 그래서 계정도 만든다 —
 * `slot_admins.user_id` 가 PK 라 한 계정은 한 슬롯만 맡는다. 그게 곧 "남의 슬롯은 못 만든다"
 * 를 확인할 수 있는 이유다(이 계정은 `SLUG` 만 맡으므로 `SLUG_LITE` 에는 403 이 떨어진다).
 */
const madeOrg = await adminFn('organizers', { slug: SLUG, email: ORGANIZER, password: ORG_PASSWORD })
check('픽스처 주최자 계정을 만든다', madeOrg.ok, madeOrg.ok ? '' : await madeOrg.text())

/** 질문 하나 — 화면에서 "AI로 전체 생성" 을 눌러보는 절이 이걸 연다 (`/admin/questions/q-001`) */
const madeQ = await rest('questions', {
  method: 'POST',
  headers: { prefer: 'return=minimal' },
  body: JSON.stringify({
    id: 'q-001',
    slug: SLUG,
    published: true,
    data: {
      id: 'q-001',
      question: '올해 안에 좋은 일이 생길까요?',
      published: true,
      cardCount: 1,
      deck: 'major',
      spreadCount: null,
      allowReversed: true,
      fallbackAspect: 'general',
      answers: {},
    },
  }),
})
check('픽스처 질문을 만든다', madeQ.ok, madeQ.ok ? '' : await madeQ.text())

// ── 3장 리딩 — 순서대로 이어지는가 ──────────────────
const spread = {
  slug: SLUG,
  category: '애정운',
  aspect: 'love',
  // 캐시(이제 DB에 산다)를 피해 실제로 생성시킨다 — 안 그러면 토큰을 못 잰다
  question: `검증 실행 ${RUN}`,
  drawn: [
    { cardId: 'cups-2', orientation: 'upright', position: '나의 마음' },
    { cardId: 'swords-7', orientation: 'reversed', position: '상대의 마음' },
    { cardId: 'major-6', orientation: 'upright', position: '관계의 흐름' },
  ],
}

const t0 = Date.now()
const first = await readStream(
  await fetch(`${AI_BASE}/reading`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(spread),
  })
)
const ms = Date.now() - t0

report('reading', first.usage, { ms })

console.log('── 애정운 3장 (나의 마음 · 상대의 마음 · 관계의 흐름) ──')
console.log(first.text)
console.log(
  `── ${first.text.length}자 / ${(ms / 1000).toFixed(1)}초 / ` +
    `입력 ${first.usage?.input} + 출력 ${first.usage?.output} 토큰 ──\n`
)

check('리딩이 생성됨', first.text.length > 80, `${first.text.length}자`)
check('길이가 화면에 맞음 (150~600자)', first.text.length >= 150 && first.text.length <= 600)
check(
  '카드를 나열하지 않고 이어 읽음',
  /그리고|그런데|이어|흐름|다만|그러면서|하지만/.test(first.text)
)
check('마크다운·제목 없음', !/^#|\*\*|^- /m.test(first.text))
check('단정하지 않음', !/반드시|틀림없이|무조건/.test(first.text))

// 같은 조합은 두 번 만들지 않는다
const second = await readStream(
  await fetch(`${AI_BASE}/reading`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(spread),
  })
)
check('같은 카드 조합은 캐시됨', second.cached === true && second.text === first.text)

// 순서를 바꾸면 다른 리딩이어야 한다 — 순서가 곧 흐름이니까
const swapped = await readStream(
  await fetch(`${AI_BASE}/reading`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ...spread,
      drawn: [spread.drawn[1], spread.drawn[0], spread.drawn[2]].map((d, i) => ({
        ...d,
        position: ['나의 마음', '상대의 마음', '관계의 흐름'][i],
      })),
    }),
  })
)
check('순서가 바뀌면 다른 리딩', swapped.text !== first.text)

// ── 방어 ────────────────────────────────────────────
const bogus = await fetch(`${AI_BASE}/reading`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ ...spread, drawn: [{ cardId: '../etc/passwd', orientation: 'upright', position: 'x' }] }),
})
check('모르는 카드 거부', bogus.status === 400, `${bogus.status}`)

const tooMany = await fetch(`${AI_BASE}/reading`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ ...spread, drawn: [...spread.drawn, ...spread.drawn] }),
})
check('4장 이상 거부', tooMany.status === 400, `${tooMany.status}`)

// ── 플랜 한도는 서버가 지킨다 ────────────────────────
// 화면에서 버튼을 감추는 건 안내지 방어가 아니다 — curl 로 부르면 그만이라
// 서버가 저장소에서 플랜·한도를 직접 읽어 막아야 한다.
const freeSlot = await fetch(`${AI_BASE}/reading`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ ...spread, slug: 'no-such-slot', drawn: spread.drawn.slice(0, 2) }),
})
check('플랜 없는 슬롯(=무료)은 AI 리딩 거부', freeSlot.status === 402, `${freeSlot.status}`)

/**
 * ── 권한 — **78장 = 183원짜리 버튼이다** ──
 *
 * 개발 서버 미들웨어 시절엔 누구나 curl 로 부를 수 있었다 (docs/BACKEND.md §4-3 이 지목한 구멍).
 * 이제 그 슬롯 주최자만 부른다. 판정은 DB 의 manages_slot() 이 한다 — 서버가 우기는 게 아니라.
 */
/* 픽스처 주최자로 — 이 계정이 SLUG 하나만 맡는다 (위 픽스처 절) */
const adminToken = await tokenFor(ORGANIZER, ORG_PASSWORD)

const genBody = (slug) => ({
  slug,
  question: '테스트',
  aspect: 'general',
  allowReversed: false,
  cardIds: ['major-0'],
  batchIndex: 0,
})
const postAs = (path, body, tok) =>
  fetch(`${AI_BASE}/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}) },
    body: JSON.stringify(body),
  })

const genNoAuth = await postAs('answers', genBody(SLUG))
check('로그인 없이는 답변 생성 거부', genNoAuth.status === 403, `${genNoAuth.status}`)

const genOther = await postAs('answers', genBody(SLUG_LITE), adminToken)
check('남의 슬롯 답변은 못 만든다', genOther.status === 403, `${genOther.status}`)

const themeNoAuth = await postAs('theme', { baseColor: '#FF6BA8', mode: 'dark' })
check('로그인 없이는 색 만들기 거부', themeNoAuth.status === 403, `${themeNoAuth.status}`)

const themeAsAdmin = await postAs('theme', { baseColor: '#FF6BA8', mode: 'dark' }, adminToken)
check('주최자는 색을 못 만든다 (최고관리자 전용)', themeAsAdmin.status === 403, `${themeAsAdmin.status}`)

/**
 * **예산 상한 — 돈이 새는 걸 막는 유일한 자리.**
 *
 * 한도를 화면에서만 지키면 curl 한 방에 뚫린다. 서버가 슬롯 행의 limits 를 직접 읽어
 * 막아야 하고, 그 증거는 "DB 값을 바꾸면 서버 판단이 바뀐다" 뿐이다.
 * 커밋된 slots.json 은 6000 그대로 두고 DB 에만 0 을 넣어 막히는지 본다.
 *
 * 사용량은 **DB 에서 원자적으로** 깎인다 (claim_ai_usage) — 프로세스 메모리였을 땐
 * 재시작마다 예산이 리셋됐고, 읽고-검사-쓰기라 새로고침 연타에 뚫렸다.
 */
{
  // 최고관리자 토큰·sbUrl·sbKey 는 위 픽스처 절에서 이미 받았다
  const token = ownerToken
  const setLimits = (limits) =>
    fetch(`${sbUrl}/rest/v1/slots?slug=eq.${SLUG}`, {
      method: 'PATCH',
      headers: {
        apikey: sbKey,
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ limits }),
    })

  const before = (await (await fetch(`${sbUrl}/rest/v1/slots?slug=eq.${SLUG}&select=limits`, {
    headers: { apikey: sbKey, authorization: `Bearer ${token}` },
  })).json())[0].limits

  await setLimits({ ...before, reading: 0 })
  // 함수는 슬롯을 요청마다 읽는다 — 기다릴 캐시가 없다
  const capped = await fetch(`${AI_BASE}/reading`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...spread, question: `한도 ${RUN}`, drawn: spread.drawn.slice(0, 1) }),
  })
  check(
    '한도를 DB 에서 읽는다 (slots.json 이 아니라)',
    capped.status === 402,
    `${capped.status} — DB 한도 0, 심은 값은 ${PAID.limits.reading}`
  )

  // 뒷정리 — 검증이 실제 슬롯의 한도를 바꿔놓고 가면 안 된다
  await setLimits(before)
  const restored = (await (await fetch(`${sbUrl}/rest/v1/slots?slug=eq.${SLUG}&select=limits`, {
    headers: { apikey: sbKey, authorization: `Bearer ${token}` },
  })).json())[0].limits
  check('뒷정리: 한도를 되돌림', restored.reading === before.reading, `reading=${restored.reading}`)
}

// ── 질문 × 카드 답변 생성 ───────────────────────────
// demo 주최자로 — 이 버튼은 이제 권한이 있어야 눌린다
const answersRes = await postAs(
  'answers',
  {
    slug: SLUG,
    question: '지금 이직해도 괜찮을까요?',
    aspect: 'career',
    allowReversed: true,
    cardIds: ['major-0', 'major-10', 'swords-3'],
  },
  adminToken
)

if (!answersRes.ok) {
  check('답변 생성', false, await answersRes.text())
} else {
  const { answers, usage } = await answersRes.json()
  report('answers', usage, { cards: 3 })
  console.log('\n── 질문 "지금 이직해도 괜찮을까요?" × 카드 ──')
  for (const a of answers) {
    console.log(`\n[${a.cardId}]`)
    console.log(`  정: ${a.upright}`)
    console.log(`  역: ${a.reversed}`)
  }
  console.log()

  check('요청한 3장이 모두 생성됨', answers.length === 3, `${answers.length}장`)
  check(
    '정·역방향이 모두 채워짐',
    answers.every((a) => a.upright?.trim() && a.reversed?.trim())
  )
  check(
    '정·역방향이 서로 다름',
    answers.every((a) => a.upright !== a.reversed)
  )
  check(
    '길이가 카드에 맞음 (40~250자)',
    answers.every((a) => a.upright.length >= 40 && a.upright.length <= 250),
    answers.map((a) => a.upright.length).join(', ')
  )
  check(
    '카드 id 가 요청과 일치',
    answers.every((a) => ['major-0', 'major-10', 'swords-3'].includes(a.cardId))
  )
}

// ── 실제 화면 — 뽑고 나서 종합이 뜨는가 ──────────────
// 픽스처 LITE 슬롯은 애정운이 3장으로 설정돼 있다 (slots.json 의 sample-pink 를 복사)
const outDir = process.argv[2] ?? '.'
const chrome = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p))

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
})
const page = await browser.newPage()
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true })

const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * 리딩 응답을 일부러 늦춘다 — 수정구슬 로더는 첫 글자가 오면 사라지므로
 * 늦추지 않으면 있는지 없는지 확인할 틈이 없다 (스크린샷도 못 잡는다).
 */
let stall = 2500
await page.setRequestInterception(true)
page.on('request', async (req) => {
  // 주소가 어긋나면 지연이 안 걸려 로더를 못 잡는다 (AI 는 이제 Edge Function 이다)
  if (req.url().startsWith(`${AI_BASE}/reading`) && stall) await wait(stall)
  void req.continue()
})

await page.goto(`${BASE}/${SLUG_LITE}/draw/love`, { waitUntil: 'networkidle0' })
await wait(400)

const slots = await page.$$eval('[class*="slotEmpty"]', (e) => e.length)
check('애정운 3장 슬롯', slots === 3, `${slots}개`)

// 카드는 겹쳐 있다 — 맨 뒤(=맨 위) 것부터 집는다
for (let i = 0; i < slots; i++) {
  const cards = await page.$$('button[aria-label$="카드 고르기"]:not([disabled])')
  await cards[cards.length - 1 - i].click()
  await wait(500)
}

// 선택 완료 → 결과가 아니라 **전면 로더**로 간다
await page.$$eval('button', (bs) => bs.find((b) => b.textContent.includes('결과 보기'))?.click())
await page.waitForSelector('[data-reading-loader]', { timeout: 10000 })

const loader = await page.evaluate(() => {
  const el = document.querySelector('[data-reading-loader]')
  const tab = document.querySelector('.tabbar')
  const r = el.getBoundingClientRect()
  const z = (n) => Number(getComputedStyle(n).zIndex) || 0
  return {
    label: el.querySelector('[role="status"]')?.textContent ?? '',
    ball: Boolean(el.querySelector('svg') || el.querySelector('[role="img"]')),
    coversScreen: r.width >= innerWidth && r.height >= innerHeight,
    aboveTabbar: tab ? z(el) > z(tab) : false,
    // 로더가 떠 있는 동안 결과(카드·종합)는 아직 없다
    resultHidden: !document.querySelector('[data-synthesis]'),
  }
})
check('선택 완료 → 전면 로더', loader.coversScreen, `${loader.coversScreen}`)
check('로더가 탭바를 덮음', loader.aboveTabbar)
check('로더에 수정구슬', loader.ball)
check('로더가 뭘 하는 중인지 말함', loader.label.includes('카드를 읽고 있어요'), loader.label.trim())
check('로더 중엔 결과가 안 보임', loader.resultHidden)
await page.screenshot({ path: join(outDir, 'ai-loading.png') })

// 리딩이 끝나면 카드와 종합이 **함께** 등장
await page.waitForSelector('[data-synthesis]', { timeout: 30000 })
const shown = await page.evaluate(() => ({
  loaderGone: !document.querySelector('[data-reading-loader]'),
  cards: document.querySelectorAll('[data-card-name]').length,
  text: document.querySelector('[data-synthesis]')?.textContent ?? '',
}))
check('리딩이 끝나면 로더가 사라짐', shown.loaderGone)
check('카드와 종합이 함께 등장', shown.cards === 3 && shown.text.length > 100, `카드 ${shown.cards}장`)
await page.evaluate(() => document.querySelector('.app__scroll')?.scrollTo(0, 99999))
await wait(400)
await page.screenshot({ path: join(outDir, 'ai-synthesis.png') })

// 1장짜리는 AI 를 아예 부르지 않는다 — 로더도 종합도 없이 바로 결과
stall = 0
let calledAi = false
page.on('request', (req) => {
  // AI 는 이제 Edge Function 이다 — 옛 주소(/__ai)를 보면 무조건 통과하는 가짜 검사가 된다
  if (req.url().startsWith(`${AI_BASE}/reading`)) calledAi = true
})
await page.goto(`${BASE}/${SLUG_LITE}/draw/money`, { waitUntil: 'networkidle0' })
await wait(400)
const oneCard = await page.$$eval('[class*="slotEmpty"]', (e) => e.length)
const cards1 = await page.$$('button[aria-label$="카드 고르기"]:not([disabled])')
await cards1[cards1.length - 1].click()
await wait(500)
await page.$$eval('button', (bs) => bs.find((b) => b.textContent.includes('결과 보기'))?.click())
await wait(1500)
check('1장 뽑기엔 로더 없음', (await page.$('[data-reading-loader]')) === null, `슬롯 ${oneCard}개`)
check('1장 뽑기엔 종합 없음', (await page.$('[data-synthesis]')) === null)
check('1장 뽑기는 AI 를 아예 안 부름', !calledAi)

/**
 * ── **AI 가 실패해도 앱은 안 멈춘다** ──
 *
 * 이게 플랜 한도의 전제다: "넘으면 AI 종합만 빠지고 카드별 해석으로 돈다"
 * (src/data/plans.ts). 방문자는 고장난 서비스가 아니라 종합이 없는 화면을 볼 뿐이어야 한다.
 * 상류 과부하(overloaded_error)도 같은 경로를 탄다 — 실제로 검증 중에 여러 번 맞았다.
 * 한도를 0 으로 낮춰 402 를 확정적으로 만들어 확인한다.
 */
if (sbUrl && sbKey && ownerToken) {
  const patch = (limits) =>
    fetch(`${sbUrl}/rest/v1/slots?slug=eq.${SLUG_LITE}`, {
      method: 'PATCH',
      headers: { apikey: sbKey, authorization: `Bearer ${ownerToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ limits }),
    })
  const read = async () =>
    (await (await fetch(`${sbUrl}/rest/v1/slots?slug=eq.${SLUG_LITE}&select=limits`, {
      headers: { apikey: sbKey, authorization: `Bearer ${ownerToken}` },
    })).json())[0].limits

  const kept = await read()
  await patch({ ...kept, reading: 0 })

  /**
   * **반드시 되돌린다.** 여기서 죽으면 픽스처는 한도 0 인 채로 남고,
   * 그 다음 실행은 "종합이 안 뜬다"로 엉뚱하게 무너진다 — 실제로 그렇게 무너져서 이 try 가 생겼다.
   */
  try {
  const fail = await browser.newPage()
  await fail.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true })
  await fail.goto(`${BASE}/${SLUG_LITE}/draw/love`, { waitUntil: 'networkidle0' })
  await wait(600)
  // 카드는 겹쳐 있다 — 맨 뒤(=맨 위) 것부터 집는다 (위 3장 흐름과 같은 규칙)
  for (let i = 0; i < 3; i++) {
    const pick = await fail.$$('button[aria-label$="카드 고르기"]:not([disabled])')
    if (!pick.length) break
    await pick[pick.length - 1 - i].click()
    await wait(500)
  }
  await fail.$$eval('button', (bs) => bs.find((b) => b.textContent.includes('결과 보기'))?.click())
  await fail.waitForSelector('[data-card-name]', { timeout: 30000 })
  await wait(800)
  const degraded = await fail.evaluate(() => ({
    cards: document.querySelectorAll('[data-card-name]').length,
    synthesis: !!document.querySelector('[data-synthesis]'),
    loader: !!document.querySelector('[data-reading-loader]'),
  }))
  check('AI 가 막혀도 카드 결과는 나온다', degraded.cards === 3, `카드 ${degraded.cards}장`)
  check('AI 가 막히면 종합만 빠진다', !degraded.synthesis)
  check('AI 가 막혀도 로더에 갇히지 않는다', !degraded.loader)
  await fail.screenshot({ path: join(outDir, 'ai-degraded.png') })
  await fail.close()
  } finally {
    await patch(kept)
    const back = await read()
    check('뒷정리: 픽스처 한도 되돌림', back.reading === kept.reading, `reading=${back.reading}`)
  }
}

// ── 관리자 — 질문 × 카드 답변 생성 → 검수 → 저장 ──────
const admin = await browser.newPage()
await admin.setViewport({ width: 1280, height: 900 })
admin.on('pageerror', (e) => errors.push(String(e)))
admin.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

/**
 * 저장된 답변 수 — **저장소를 직접 본다.**
 * 화면이 "저장됐다"고 말하는 걸 믿으면 안 된다. 그게 이 검사의 요점이다.
 * Supabase 가 붙어 있으면 DB, 아니면 localStorage (어느 쪽이든 진실은 저장소에 있다).
 */
const savedAnswers = async () => {
  if (env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY) {
    const { createClient } = await import('@supabase/supabase-js')
    const db = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    })
    await db.auth.signInWithPassword({ email: ORGANIZER, password: ORG_PASSWORD })
    const { data } = await db.from('questions').select('data').eq('id', 'q-001').maybeSingle()
    return Object.keys(data?.data?.answers ?? {}).length
  }
  return admin.evaluate(() => {
    const raw = localStorage.getItem(`tarot-pocket:admin:questions:${SLUG}`)
    if (!raw) return 0
    const q = JSON.parse(raw).find((x) => x.id === 'q-001')
    return Object.keys(q?.answers ?? {}).length
  })
}

await admin.goto(`${BASE}/${SLUG}/admin/login`, { waitUntil: 'networkidle0' })
// 인증이 진짜라 씨앗 계정으로 들어간다 (supabase/seed.sql · .env.local 의 SEED_PASSWORD)
await admin.type('#admin-email', ORGANIZER)
await admin.type('#admin-password', ORG_PASSWORD)
await admin.click('button[type=submit]')
// 진짜 인증은 왕복이 있다 — 로컬 어댑터 때보다 넉넉히 기다린다
await wait(2500)

await admin.goto(`${BASE}/${SLUG}/admin/questions/q-001`, { waitUntil: 'networkidle0' })
await wait(900)

const genBtn = await admin.$('[data-generate]')
check('"AI로 전체 생성" 버튼이 켜짐', genBtn !== null && !(await genBtn.evaluate((b) => b.disabled)))

await genBtn.click()
await wait(600)
const busy = await admin.evaluate(
  () => document.querySelector('[role="status"]')?.textContent ?? ''
)
check('생성 중 진행률을 보여줌', /카드를 읽고 있어요/.test(busy), busy.trim())
await admin.screenshot({ path: join(outDir, 'ai-admin-generating.png') })

/**
 * 78장 = 12장씩 7묶음. 묶음마다 Claude 왕복이라 몇 분 걸린다 —
 * 개발 서버 미들웨어(같은 기계)일 땐 짧았는데 이제 배포된 함수를 거친다.
 * 실패하면 화면이 에러를 띄우므로, 기다리다 죽지 말고 **왜 안 나오는지**를 남긴다.
 */
try {
  await admin.waitForSelector('[data-review]', { timeout: 420000 })
} catch {
  const state = await admin.evaluate(() => ({
    status: document.querySelector('[role="status"]')?.textContent?.trim() ?? '',
    error: [...document.querySelectorAll('.field__error, [role="alert"]')]
      .map((e) => e.textContent.trim())
      .join(' / '),
  }))
  check('78장 생성 → 검수 바', false, `상태="${state.status}" 에러="${state.error}"`)
  await admin.screenshot({ path: join(outDir, 'ai-admin-stuck.png') })
  throw new Error(`검수 바가 안 떴다 — ${JSON.stringify(state)}`)
}
const pendingRows = await admin.$$eval('[data-pending]', (e) => e.length)
// 몇 장이 나와야 하는지는 **슬롯의 카드 범위**가 정한다 (질문이 정하지 않는다)
const deckSize = await admin.$$eval('[data-answer-row]', (e) => e.length)
check('슬롯 카드 범위만큼 검수 대기로 채워짐', pendingRows === deckSize, `${pendingRows}/${deckSize}장`)
check('검수 전엔 저장되지 않음', (await savedAnswers()) === 0, `저장된 카드 ${await savedAnswers()}장`)
await admin.screenshot({ path: join(outDir, 'ai-admin-review.png') })

// 생성된 답변을 눈으로
const sample = await admin.evaluate(() => {
  document.querySelector('[data-pending] button')?.click()
  return null
})
void sample
await wait(300)
const firstAnswer = await admin.evaluate(
  () => document.querySelector('[data-pending] textarea')?.value ?? ''
)
console.log(`\n첫 카드 답변: ${firstAnswer}\n`)
check('검수칸에 생성된 답변이 들어 있음', firstAnswer.length > 30, `${firstAnswer.length}자`)

await admin.click('[data-apply]')
await wait(800)
check('저장하면 answers 에 들어감', (await savedAnswers()) === deckSize, `${await savedAnswers()}/${deckSize}장`)
check('저장 후 검수 바가 사라짐', (await admin.$('[data-review]')) === null)
await admin.screenshot({ path: join(outDir, 'ai-admin-saved.png') })

// 방문자에게 그 답변이 나가는가 (카드 기본 의미 폴백이 아니라)
// 새 탭으로 — 앞의 탭은 요청 가로채기가 걸려 있어 섞이면 안 된다
const visitor = await browser.newPage()
await visitor.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true })
await visitor.goto(`${BASE}/${SLUG}/question/q-001`, { waitUntil: 'networkidle0' })
await wait(500)

const qCards = await visitor.$$('button[aria-label$="카드 고르기"]:not([disabled])')
check('질문 타로는 한 장만 뽑음', (await visitor.$$eval('[class*="slotEmpty"]', (e) => e.length)) === 1)
await qCards[qCards.length - 1].click()
await wait(500)
await visitor.$$eval('button', (bs) => bs.find((b) => b.textContent.includes('결과 보기'))?.click())
await wait(1200)

/** 저장된 답변 텍스트 — 저장소에서 직접 (savedAnswers 와 같은 이유) */
const generatedTexts = await (async () => {
  if (env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY) {
    const { createClient } = await import('@supabase/supabase-js')
    const db = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    })
    await db.auth.signInWithPassword({ email: ORGANIZER, password: ORG_PASSWORD })
    const { data } = await db.from('questions').select('data').eq('id', 'q-001').maybeSingle()
    return Object.values(data?.data?.answers ?? {}).flatMap((a) => Object.values(a))
  }
  return admin.evaluate(() => {
    const raw = localStorage.getItem(`tarot-pocket:admin:questions:${SLUG}`)
    const q = JSON.parse(raw).find((x) => x.id === 'q-001')
    return Object.values(q.answers).flatMap((a) => Object.values(a))
  })
})()
const visitorText = await visitor.evaluate(() => document.body.textContent ?? '')
check(
  '방문자 화면에 생성된 답변이 나감',
  generatedTexts.some((t) => visitorText.includes(t.slice(0, 20)))
)
check('질문 타로엔 종합이 없음', (await visitor.$('[data-synthesis]')) === null)
await visitor.screenshot({ path: join(outDir, 'ai-question-answer.png') })

/**
 * 뒷정리 — 이 검증은 **진짜 DB** 에 답변 156개를 썼다.
 * localStorage 때는 다음 실행이 덮어써서 그냥 뒀지만, 이제는 지워야 씨앗 상태로 돌아간다.
 */
if (env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY) {
  const { createClient } = await import('@supabase/supabase-js')
  const db = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  })
  await db.auth.signInWithPassword({ email: ORGANIZER, password: ORG_PASSWORD })
  const { data: row } = await db.from('questions').select('data').eq('id', 'q-001').maybeSingle()
  if (row) {
    await db
      .from('questions')
      .update({ data: { ...row.data, answers: {} } })
      .eq('id', 'q-001')
    const { data: after } = await db.from('questions').select('data').eq('id', 'q-001').maybeSingle()
    check('뒷정리: 답변을 씨앗 상태로 되돌림', Object.keys(after?.data?.answers ?? {}).length === 0)
  }
}

await browser.close()

if (errors.length) {
  console.error('\n콘솔 에러:')
  for (const e of errors) console.error(`  · ${e}`)
}

// ── 실측 토큰 · 원가 (docs/PRICING.md 의 근거) ────────
// Haiku 4.5: 입력 $1 / 출력 $5 per 1M
const PRICE = { input: 1 / 1_000_000, output: 5 / 1_000_000 }
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const cost = (u) => u.input * PRICE.input + u.output * PRICE.output

console.log('\n══ 실측 토큰 (claude-haiku-4-5) ══')
if (measured.reading.length) {
  const r = measured.reading
  const inAvg = avg(r.map((u) => u.input))
  const outAvg = avg(r.map((u) => u.output))
  const each = avg(r.map(cost))
  console.log(`3장 리딩 1회: 입력 ${Math.round(inAvg)} + 출력 ${Math.round(outAvg)} 토큰`)
  console.log(`  → 회당 $${each.toFixed(5)} (약 ${(each * 1400).toFixed(2)}원)`)
  console.log(`  → 1000회 $${(each * 1000).toFixed(2)} (약 ${Math.round(each * 1000 * 1400)}원)`)
}
if (measured.answers.length) {
  const a = measured.answers[0]
  const perCard = cost(a) / (a.cards ?? 3)
  console.log(`\n질문 답변 (정+역): 카드 3장에 입력 ${a.input} + 출력 ${a.output} 토큰`)
  console.log(`  → 카드당 $${perCard.toFixed(5)}`)
  console.log(`  → 22장 1회 생성 $${(perCard * 22).toFixed(4)} (약 ${Math.round(perCard * 22 * 1400)}원)`)
  console.log(`  → 78장 1회 생성 $${(perCard * 78).toFixed(4)} (약 ${Math.round(perCard * 78 * 1400)}원)`)
}
console.log('════════════════════════════════════')

/**
 * 뒷정리 — **심은 걸 두고 가면 다음 실행이 엉뚱하게 무너진다.**
 * (한도를 0 으로 낮춘 채 죽었던 적이 있어서 그 자리엔 이미 try/finally 가 있다.)
 */
await dropFixtures()
const left = await Promise.all(
  [SLUG, SLUG_LITE].map((slug) => rest(`slots?slug=eq.${slug}&select=slug`).then((r) => r.json()))
)
check('검증이 남긴 게 없다', left.every((rows) => rows.length === 0))

const failed = checks.filter(([, ok]) => !ok).length + (errors.length ? 1 : 0)
console.log(`\n${checks.length - checks.filter(([, ok]) => !ok).length} / ${checks.length} 통과`)
process.exit(failed ? 1 : 0)
