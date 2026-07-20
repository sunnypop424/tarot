/**
 * 럭키드로우 화면 검증 — **실제로 뽑아본다.**
 *
 *   node scripts/verify-luckydraw-ui.mjs <스크린샷 디렉터리>
 *
 * 개발 서버(5174)가 떠 있어야 한다.
 *
 * `verify-luckydraw.mjs` 가 RPC·격리를 본다면 여기서는 **셸이 서비스로 갈리는가**를 본다:
 *  - 럭키드로우 슬롯에 탭바·카드도감이 안 붙는가 (타로 셸이 새면 안 된다)
 *  - 로그인 안 한 사람에게 DRAW 가 없는가 (스태프만 뽑는다 — 주소가 새도 재고가 안 탄다)
 *  - 로그인하면 실제로 뽑히는가
 *  - 주최자 메뉴가 럭키드로우용으로 갈리는가 (질문 타로가 아니라 상품·수량)
 *
 * 실제 DB 에 슬롯과 **주최자 계정**을 만들었다 지운다 — 끝나면 purge 로 계정째 정리한다.
 */

import puppeteer from 'puppeteer-core'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const chrome = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p))
if (!chrome) {
  console.error('Chrome/Edge 를 찾지 못했어요')
  process.exit(1)
}

const env = {}
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim())
  if (m) env[m[1]] = m[2]
}
const URL_ = env.VITE_SUPABASE_URL
const ANON = env.VITE_SUPABASE_ANON_KEY
const OWNER_PASSWORD = env.SEED_PASSWORD ?? 'tarot1234'

/**
 * **테마는 씨앗에서 통째로 가져온다.**
 *
 * 처음엔 `{colors:{},shape:{},assets:{}}` 를 넣었는데 화면이 통째로 하얗게 떴다:
 * `applyTheme` 이 `withAlpha(theme.colors.primary, …)` 를 부르고, primary 가 undefined 라
 * 거기서 죽는다. 그런데 그때 검증은 "탭바가 없다 / DRAW 가 없다" 를 **통과**시켰다 —
 * 빈 화면에선 없는 게 당연하기 때문이다. **부정 단언만 있으면 크래시가 통과로 보인다.**
 * 그래서 아래에 "무언가 그려졌나" 를 먼저 확인하는 검사를 넣었다.
 */
const SEED_THEME = JSON.parse(readFileSync('src/data/slots.json', 'utf8'))[0].theme

const BASE = 'http://localhost:5174'
const SLUG = 'luckydraw-ui-verify'
const ORGANIZER = 'luckydraw-ui-verify@example.com'
const ORG_PASSWORD = 'verify-1234'
const outDir = process.argv[2] ?? '.'

let failed = 0
const check = (name, ok, detail = '') => {
  if (!ok) failed++
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

// ── 준비 ──────────────────────────────────────────
const auth = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: ANON, 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'owner@example.com', password: OWNER_PASSWORD }),
})
const { access_token } = await auth.json()
const OWNER = { apikey: ANON, authorization: `Bearer ${access_token}`, 'content-type': 'application/json' }

const rest = (p, i = {}) => fetch(`${URL_}/rest/v1/${p}`, i)
const fn = (p, body) =>
  fetch(`${URL_}/functions/v1/admin/${p}`, {
    method: 'POST',
    headers: OWNER,
    body: JSON.stringify(body),
  })

/** 슬롯·주최자 계정·이미지까지 통째로 (수동 삭제와 같은 경로) */
async function cleanup() {
  await fn('purge', { slug: SLUG }).catch(() => {})
  await rest(`slots?slug=eq.${SLUG}`, { method: 'DELETE', headers: OWNER }).catch(() => {})
}

await cleanup()

await rest('slots', {
  method: 'POST',
  headers: { ...OWNER, prefer: 'return=minimal' },
  body: JSON.stringify({
    slug: SLUG,
    name: '럭키드로우 화면검증',
    service: 'luckydraw',
    period: {},
    // 반투명 박스 — 원본 인상의 핵심이라 검증도 그 상태로 한다
    theme: { ...SEED_THEME, colors: { ...SEED_THEME.colors, surface: 'rgba(255, 255, 255, 0.85)' } },
    event: {},
  }),
})
await rest('prizes', {
  method: 'POST',
  headers: OWNER,
  body: JSON.stringify([
    { slug: SLUG, rank: 1, name: '1등 상품', remaining: 3, requires_shipping: false },
    { slug: SLUG, rank: 2, name: '2등 상품', remaining: 10, requires_shipping: false },
    { slug: SLUG, rank: 3, name: '3등 상품', remaining: 60, requires_shipping: false },
  ]),
})
// 리허설로 둔다 — 검증이 재고를 태울 이유가 없다
await rest('luckydraw_settings', {
  method: 'POST',
  headers: { ...OWNER, prefer: 'resolution=merge-duplicates' },
  body: JSON.stringify({ slug: SLUG, rehearsal: true, closed: false }),
})

/** 겸업 경로를 그대로 탄다 — 이미 있는 이메일이면 연결, 없으면 생성 (0006) */
const made = await fn('organizers', { slug: SLUG, email: ORGANIZER, password: ORG_PASSWORD })
check('주최자 계정을 만든다', made.ok, made.ok ? '' : await made.text())

await mkdir(outDir, { recursive: true })
const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: 'new',
  args: ['--no-sandbox'],
})
const page = await browser.newPage()
await page.setViewport({ width: 430, height: 900, deviceScaleFactor: 2 })

/** 화면이 죽으면 검사가 아니라 **여기서** 드러나야 한다 */
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(String(e)))
page.on('console', (m) => {
  if (m.type() === 'error') pageErrors.push(m.text())
})

try {
  // ── 1. 방문자 화면 (로그인 전) ──────────────────
  await page.goto(`${BASE}/${SLUG}`, { waitUntil: 'networkidle0' })
  await wait(600)

  const shell = await page.evaluate(() => ({
    tabbar: !!document.querySelector('.tabbar'),
    draw: !!document.querySelector('[data-draw]'),
    drawDisabled: document.querySelector('[data-draw]')?.disabled === true,
    rehearsal: !!document.querySelector('[data-rehearsal]'),
    text: document.body.innerText,
  }))

  /**
   * **긍정 단언을 먼저 한다.** 아래 "탭바가 없다 / DRAW 가 없다" 는 부정 단언이라
   * 화면이 하얗게 죽어도 통과한다 — 실제로 그렇게 통과했었다. 무언가 그려졌는지,
   * 자바스크립트가 죽지 않았는지를 먼저 못 박아야 그 아래 검사들이 의미를 갖는다.
   */
  check('화면이 그려졌다', shell.text.trim().length > 0, `본문 ${shell.text.trim().length}자`)
  check('자바스크립트 오류가 없다', pageErrors.length === 0, pageErrors[0]?.slice(0, 120) ?? '')

  check('럭키드로우 셸에 탭바가 없다 (타로 셸이 안 샌다)', !shell.tabbar)
  /**
   * 버튼은 **있고 비활성**이다 (원본과 같다). 로그인 링크로 바꿔치우면 손님이 보는 화면의
   * 주인공이 로그인 버튼이 되고, 로그인 뒤엔 버튼 위치가 달라져 스태프가 한 번 더 헤맨다.
   */
  check('로그인 전에도 DRAW 버튼은 자리에 있다', shell.draw)
  check('로그인 전에는 DRAW 가 비활성이다', shell.drawDisabled)
  check('관리자로 로그인 링크로 유도한다', shell.text.includes('관리자로 로그인'), shell.text.slice(0, 60))
  check('리허설 안내가 뜬다', shell.rehearsal)

  /**
   * 원본 인상의 핵심 셋 — **화면에 실제로 먹혔는지**를 계산된 스타일로 잰다.
   * 설정값이 저장되는 것과 화면이 그걸 쓰는 것은 다른 문제다.
   */
  const look = await page.evaluate(() => {
    const box = document.querySelector('[data-draw]')?.closest('.surface')
    const link = document.querySelector('a[href*="/admin"]')
    const s = box ? getComputedStyle(box) : null
    return {
      boxBg: s?.backgroundColor ?? '',
      boxMarginTop: s?.marginTop ?? '',
      font: s?.fontFamily ?? '',
      linkColor: link ? getComputedStyle(link).color : '',
      centered: getComputedStyle(box?.parentElement).justifyContent,
    }
  })
  check('박스가 반투명하다 (사진이 비친다)', /rgba\([^)]+,\s*0?\.\d+\)/.test(look.boxBg), look.boxBg)
  check('박스가 세로 가운데 정렬이다', look.centered === 'center', look.centered)
  check('그 위에 상단 여백이 얹힌다', look.boxMarginTop === '160px', look.boxMarginTop)
  check('슬롯이 고른 폰트가 먹었다', /Pretendard|Paperlogy|Noto/.test(look.font), look.font)
  check('관리자 링크 색이 슬롯 값이다', look.linkColor.startsWith('rgba('), look.linkColor)
  await page.screenshot({ path: join(outDir, 'luckydraw-1-visitor.png') })

  // ── 2. 주최자 로그인 ────────────────────────────
  await page.goto(`${BASE}/${SLUG}/admin/login`, { waitUntil: 'networkidle0' })
  await page.type('#admin-email', ORGANIZER)
  await page.type('#admin-password', ORG_PASSWORD)
  await Promise.all([page.click('button[type="submit"]'), wait(2500)])

  const nav = await page.evaluate(() => document.body.innerText)
  const seen = `URL ${page.url().replace(BASE, '')} · 본문 "${nav.replace(/\s+/g, ' ').slice(0, 90)}"`
  check('관리 메뉴가 럭키드로우용이다', nav.includes('상품과 수량') && nav.includes('운영 설정'), seen)
  // 화면이 비어도 통과하는 부정 단언이라 위 검사가 통과할 때만 의미가 있다
  check('질문 타로 메뉴가 안 뜬다', !nav.includes('질문 타로'))
  check('배송 정보 메뉴가 있다', nav.includes('배송 정보'), seen)
  await page.screenshot({ path: join(outDir, 'luckydraw-2-admin.png'), fullPage: true })

  // ── 3. 로그인 상태로 실제 추첨 ──────────────────
  await page.goto(`${BASE}/${SLUG}`, { waitUntil: 'networkidle0' })
  await wait(800)
  check('로그인하면 DRAW 버튼이 산다', !!(await page.$('[data-draw]')))

  // 5개로 올려 뽑는다 — 하이라이트(1·2등)가 섞일 확률을 높인다
  await page.evaluate(() => {
    const input = document.querySelector('input[type="number"]')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, '5')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await wait(200)
  await page.click('[data-draw]')
  await wait(2500)

  const result = await page.evaluate(() => {
    const items = [...document.querySelectorAll('[data-results] li')]
    return {
      count: items.length,
      covered: items.filter((li) => li.querySelector('button')).length,
      high: items.filter((li) => li.hasAttribute('data-high')).length,
    }
  })
  check('5개가 뽑혀 화면에 뜬다', result.count === 5, `${result.count}개`)
  check(
    '하이라이트 등수는 덮여 있다 (긁어야 보인다)',
    result.high === 0 || result.covered === result.high,
    `high ${result.high} · 덮임 ${result.covered}`
  )
  await page.screenshot({ path: join(outDir, 'luckydraw-3-result.png') })

  // 덮인 게 있으면 긁어본다
  if (result.covered > 0) {
    await page.click('[data-results] li button')
    await wait(1200)
    const opened = await page.evaluate(
      () => document.querySelectorAll('[data-results] li[data-open]').length
    )
    check('긁으면 열린다', opened > 0, `${opened}개 열림`)
    await page.screenshot({ path: join(outDir, 'luckydraw-4-revealed.png') })
  }

  // ── 4. 리허설이라 재고가 안 줄었다 ──────────────
  const after = await rest(`prizes?slug=eq.${SLUG}&select=remaining`, { headers: OWNER })
  const total = (await after.json()).reduce((s, p) => s + p.remaining, 0)
  check('리허설이라 재고가 그대로다 (73)', total === 73, `실제 ${total}`)
} finally {
  await browser.close()
  await cleanup()
  const left = await rest(`slots?slug=eq.${SLUG}&select=slug`, { headers: OWNER })
  check('검증이 남긴 게 없다', (await left.json()).length === 0)
}

console.log(failed === 0 ? `\n전부 통과 — 스크린샷: ${outDir}` : `\n${failed}개 실패`)
process.exit(failed === 0 ? 0 : 1)
