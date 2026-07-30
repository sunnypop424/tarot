/**
 * 여러 개 붙여넣기 검증 — **붙여 넣은 게 실제로 들어가는가** (`src/admin/BulkPaste.tsx`).
 *
 *   node scripts/verify-bulk.mjs
 *
 * 개발 서버(5174)가 떠 있어야 한다. **체험 슬롯에 넣는다** — 매시간 기준값으로 되돌아가므로
 * 남겨도 되고, 로그인 없이 관리 화면이 열려 검증이 짧아진다 (0034).
 *
 * 파싱 규칙이 화면 안에 있어서(서비스마다 줄의 뜻이 다르다) **화면을 실제로 몰아 봐야** 한다:
 *
 *  · 객관식 · 주관식이 섞인 목록이 한 번에 들어간다
 *  · **정답 번호가 범위를 벗어난 줄은 안 들어간다** — 정답 없는 문항이 조용히 생기면
 *    아무도 못 맞히고 이미 푼 사람 점수까지 어긋난다
 *  · 넣은 문항은 **전부 비공개** — 확인 전에 방문자에게 나가면 안 된다
 */
import puppeteer from 'puppeteer-core'
import { existsSync, readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)
const URL_ = env.VITE_SUPABASE_URL
const KEY = env.VITE_SUPABASE_ANON_KEY
const PW = env.SEED_PASSWORD ?? 'tarot1234'
const BASE = 'http://localhost:5174'
const SLUG = 'demo-quiz'

let failed = 0
const check = (label, ok, note = '') => {
  console.log(`${ok ? '✓' : '✗'} ${label}${note ? ` — ${note}` : ''}`)
  if (!ok) failed++
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const auth = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: KEY, 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'owner@example.com', password: PW }),
})
const { access_token } = await auth.json()
const owner = { apikey: KEY, authorization: `Bearer ${access_token}` }

/** 지금 문항 수 — 화면 말고 DB 를 센다 (화면이 거짓말해도 잡히게) */
const countQuestions = async () => {
  const res = await fetch(`${URL_}/rest/v1/quiz_questions?slug=eq.${SLUG}&select=id,hidden`, {
    headers: owner,
  })
  return res.ok ? await res.json() : []
}

const exe = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p))
if (!exe) {
  console.error('Chrome/Edge 를 찾지 못했습니다.')
  process.exit(1)
}

const before = await countQuestions()

const browser = await puppeteer.launch({ executablePath: exe, headless: 'new', args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 1000 })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

/**
 * 객관식 둘 · 주관식 하나 · **못 읽을 줄 둘**.
 * 못 읽을 줄을 일부러 섞는다 — 그게 안 걸러지면 정답 없는 문항이 조용히 생긴다.
 */
const GOOD = 3
const PASTE = [
  '데뷔 연도는? | 2015 | 2016 | 2017 | 2018 | 2', // 객관식 (정답 2016)
  '응원봉 색은? | 라벤더 | 민트 | 1', // 객관식 (정답 라벤더)
  '최애 포지션은? | 메인보컬', // 주관식
  '정답이 범위 밖 | 가 | 나 | 9', // ✗ 보기 2개인데 9번
  '문제만 있고 정답이 없음', // ✗ 칸이 하나
].join('\n')

try {
  /**
   * **로그인하고 들어간다.** 체험 슬롯은 관리 *화면*이 로그인 없이 열리지만(0034),
   * 문항 목록은 정답이 붙어 있어 `listAll` 이 권한을 본다 — 세션이 없으면 목록을 못 읽고
   * 화면이 아무것도 안 그린다. 진짜 주최자도 로그인해서 쓰므로 그 상태로 확인하는 게 맞다.
   */
  await page.goto(`${BASE}/${SLUG}/admin/login`, { waitUntil: 'networkidle0' })
  if (await page.$('#admin-email')) {
    await page.type('#admin-email', 'owner@example.com')
    await page.type('#admin-password', PW)
    await page.click('button[type="submit"]')
    await wait(2200)
  }

  await page.goto(`${BASE}/${SLUG}/admin/quiz`, { waitUntil: 'networkidle0' })
  /*
   * `networkidle0` 은 **React 가 그리기 전에** 끝난다 — 슬롯·문항을 다 받고 나서야 화면이 선다.
   * 고정 대기로 맞추면 느린 날 거짓 실패가 나므로 버튼이 뜰 때까지 기다린다.
   */
  const opened = await page.waitForSelector('[data-bulk-open]', { timeout: 15000 }).catch(() => null)
  check('붙여넣기 버튼이 있다', Boolean(opened))
  if (!opened) throw new Error('버튼 없음')
  await opened.click()
  await wait(300)

  await page.type('[data-bulk-input]', PASTE)
  await wait(500)

  // 미리보기가 몇 개인지 먼저 말해야 한다 — 눌러 보고 아는 건 늦다
  const applyLabel = await page.$eval('[data-bulk-apply]', (b) => b.textContent ?? '')
  check('미리보기가 넣을 개수를 말한다', applyLabel.includes(`${GOOD}개`), `버튼: "${applyLabel.trim()}"`)

  const skipped = await page.$$eval('[data-bulk] .ad-bulk__list--bad li', (ns) => ns.length)
  check('못 읽은 줄을 그대로 보여준다', skipped >= 2, `${skipped}줄 표시`)

  await page.click('[data-bulk-apply]')
  await wait(2500)

  const after = await countQuestions()
  const added = after.length - before.length
  check('붙여넣은 문항이 실제로 저장된다', added === GOOD, `${added}개 늘었다 (기대 ${GOOD})`)

  /**
   * **정답 번호가 범위를 벗어난 줄은 안 들어가야 한다.**
   * 들어가면 정답이 빈 문항이 생기고, 그건 아무도 못 맞히는 문제가 된다.
   */
  const answers = await fetch(
    `${URL_}/rest/v1/quiz_answers?slug=eq.${SLUG}&select=question_id,answers`,
    { headers: owner }
  )
  const rows = answers.ok ? await answers.json() : []
  const empty = rows.filter((r) => !r.answers || r.answers.length === 0).length
  check('정답이 빈 문항이 안 생긴다', empty === 0, `${empty}개`)

  const newOnes = after.filter((q) => !before.some((b) => b.id === q.id))
  check(
    '넣은 문항은 전부 비공개다',
    newOnes.length > 0 && newOnes.every((q) => q.hidden === true),
    `공개 ${newOnes.filter((q) => !q.hidden).length}개`
  )

  check('화면 오류가 없다', errors.length === 0, errors.slice(0, 2).join(' / '))
} finally {
  await browser.close()
  // 넣은 문항은 지운다 — 체험 슬롯이 매시간 되돌아가지만 그 사이에 랜딩에서 보인다
  const after = await countQuestions()
  const mine = after.filter((q) => !before.some((b) => b.id === q.id)).map((q) => q.id)
  if (mine.length > 0) {
    await fetch(`${URL_}/rest/v1/quiz_questions?id=in.(${mine.join(',')})`, {
      method: 'DELETE',
      headers: owner,
    })
  }
  const left = await countQuestions()
  check('검증이 남긴 게 없다', left.length === before.length, `${left.length - before.length}개 남음`)
}

console.log(failed === 0 ? '\n전부 통과' : `\n${failed}개 실패`)
process.exit(failed === 0 ? 0 : 1)
