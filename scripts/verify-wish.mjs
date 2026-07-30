/**
 * 소원나무 검증 — **화면이 실제로 그려지는가.**
 *
 *   node scripts/verify-wish.mjs
 *
 * 개발 서버(5174)가 떠 있어야 한다.
 *
 * **데이터 계약은 여기서 안 본다.** 소원나무는 롤링페이퍼와 같은 테이블·같은 정책을 쓰고,
 * 그건 `SERVICE=wish node scripts/verify-rolling.mjs` 가 이미 실제 DB 에 대고 확인한다.
 *
 * 여기서 보는 건 **그 데이터가 등불로 그려지는 부분**이다. 그게 두 서비스의 유일한 차이인데,
 * 지금까지 아무도 안 보고 있었다 — 롤페 CSS 를 고치다 등불이 깨져도 검증이 통과한다.
 * (실제로 `docs/완성도-점검-역할별.md` 가 이 구멍을 지적했다.)
 *
 *  · 나무에 등불이 걸린다 (소원 수만큼)
 *  · 등불이 **저마다 다른 자리·다른 색**이다 — 한 점에 뭉치면 나무가 아니다
 *  · 소원 적기 화면이 뜨고 색·글씨체·장식을 고를 수 있다
 *  · 밤하늘이 실제로 칠해진다 (테마가 화면까지 닿는가)
 *  · **가로 스크롤이 없다** — 등불을 절대 좌표로 놓는 화면이라 여기가 제일 잘 샌다
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

let failed = 0
const check = (label, ok, note = '') => {
  console.log(`${ok ? '✓' : '✗'} ${label}${note ? ` — ${note}` : ''}`)
  if (!ok) failed++
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

// ── 준비: 검증용 슬롯 + 소원 여럿 ──────────────────
const auth = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: KEY, 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'owner@example.com', password: PW }),
})
if (!auth.ok) {
  console.error('최고관리자 로그인 실패 — supabase/seed.sql 의 씨앗 계정과 SEED_PASSWORD 를 확인하세요')
  process.exit(1)
}
const { access_token } = await auth.json()
const owner = { apikey: KEY, Authorization: `Bearer ${access_token}`, 'content-type': 'application/json' }

const SLUG = `wishcheck-${Date.now().toString(36)}`
const LANTERNS = ['#efe8cd', '#f6c9a0', '#cfe3f2']

/**
 * 등불 색을 슬롯이 정하게 해 둔다 — 기본값으로 두면 "색이 다르다" 검사가
 * **테마가 화면에 닿는지**가 아니라 폴백이 도는지를 보게 된다.
 */
const made = await fetch(`${URL_}/rest/v1/slots`, {
  method: 'POST',
  headers: { ...owner, Prefer: 'return=minimal' },
  body: JSON.stringify({
    slug: SLUG,
    name: '소원나무 검증',
    service: 'wish',
    theme: { colors: {}, shape: {}, assets: {} },
    event: {},
    wish: { lanterns: LANTERNS, skyBg: '#0d1b2a' },
  }),
})
check('준비: 검증용 슬롯을 만든다', made.ok, made.ok ? '' : `HTTP ${made.status} ${(await made.text()).slice(0, 160)}`)
if (!made.ok) process.exit(1)

const WISHES = [
  '올해도 건강하기를',
  '무대에서 늘 빛나기를',
  '좋은 사람들만 만나기를',
  '하고 싶은 일 다 이루기를',
  '오래오래 함께하기를',
  '내년에도 여기서 만나기를',
]
await fetch(`${URL_}/rest/v1/rolling_messages`, {
  method: 'POST',
  headers: { ...owner, Prefer: 'return=minimal' },
  body: JSON.stringify(
    WISHES.map((body, i) => ({
      slug: SLUG,
      nickname: `방문자${i + 1}`,
      body,
      // 색을 돌려 쓴다 — 등불이 전부 같은 색이면 팔레트가 안 닿는 걸 못 잡는다
      color: LANTERNS[i % LANTERNS.length],
      font: '',
    }))
  ),
})

const cleanup = () =>
  fetch(`${URL_}/rest/v1/slots?slug=eq.${SLUG}`, { method: 'DELETE', headers: owner })

// ── 화면 ───────────────────────────────────────────
const exe = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p))
if (!exe) {
  console.error('Chrome/Edge 를 찾지 못했습니다.')
  await cleanup()
  process.exit(1)
}

const browser = await puppeteer.launch({ executablePath: exe, headless: 'new', args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

try {
  // ── 1. 나무 ─────────────────────────────────────
  await page.goto(`${BASE}/${SLUG}`, { waitUntil: 'networkidle0' })
  // 등불은 화면에 들어올 때 살아나므로(IntersectionObserver) 한 박자 준다
  await wait(1500)

  const tree = await page.$('[data-wish-tree]')
  check('나무(캐노피)가 그려진다', Boolean(tree))

  const items = await page.$$('[data-wish-item]')
  check('소원이 등불로 걸린다', items.length === WISHES.length, `${items.length}/${WISHES.length}개`)

  /**
   * **자리와 색이 저마다 달라야 한다.** 배치는 해시에서 파생되는데, 그 계산이 깨지면
   * 등불이 한 점에 뭉치거나 전부 같은 색이 된다 — 화면은 "떠 있긴 하다" 라 눈으로만 보면
   * 통과처럼 보인다. 실제 좌표와 색을 세어 본다.
   */
  const spread = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('[data-wish-item]')]
    const lefts = new Set(nodes.map((n) => n.style.left))
    const colors = new Set(nodes.map((n) => n.style.getPropertyValue('--lantern').trim()))
    return { lefts: lefts.size, colors: colors.size, total: nodes.length }
  })
  check('등불이 저마다 다른 자리에 걸린다', spread.lefts > 1, `자리 ${spread.lefts}가지 / ${spread.total}개`)
  check('슬롯이 정한 등불 색이 닿는다', spread.colors === LANTERNS.length, `색 ${spread.colors}가지`)

  // 밤하늘 — 슬롯이 정한 색이 실제로 칠해졌나 (테마가 화면까지 닿는지)
  const sky = await page.evaluate(() =>
    getComputedStyle(document.querySelector('.app')).getPropertyValue('--wt-sky').trim()
  )
  check('밤하늘 색이 슬롯 값으로 칠해진다', sky === '#0d1b2a', `--wt-sky=${sky || '(없음)'}`)

  const wide = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  )
  check('나무에 가로 스크롤이 없다', wide <= 0, `${wide}px 넘침`)

  // ── 2. 소원 적기 ────────────────────────────────
  await page.goto(`${BASE}/${SLUG}/write`, { waitUntil: 'networkidle0' })
  await wait(600)

  check('소원 적기 화면이 뜬다', Boolean(await page.$('[data-wish-composer]')))

  const swatches = await page.$$('[role="radiogroup"] [role="radio"]')
  check('등불 색·글씨체·장식을 고를 수 있다', swatches.length >= LANTERNS.length, `선택지 ${swatches.length}개`)

  const wideWrite = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  )
  check('적기 화면에 가로 스크롤이 없다', wideWrite <= 0, `${wideWrite}px 넘침`)

  check('화면 오류가 없다', errors.length === 0, errors.slice(0, 2).join(' / '))
} finally {
  await browser.close()
  await cleanup()
  const left = await fetch(`${URL_}/rest/v1/slots?slug=eq.${SLUG}&select=slug`, { headers: owner })
  check('검증이 남긴 게 없다', left.ok && (await left.json()).length === 0)
}

console.log(failed === 0 ? '\n전부 통과' : `\n${failed}개 실패`)
process.exit(failed === 0 ? 0 : 1)
