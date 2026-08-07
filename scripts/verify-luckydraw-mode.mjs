/**
 * '당첨 결과 표시' 설정이 **전체 결과·배송 모달까지 따라가는가** — 실제 화면에서 본다.
 *
 *   node scripts/verify-luckydraw-mode.mjs [스크린샷 디렉터리]
 *
 * 개발 서버(5174)와 `.env.local`(최고관리자 계정)이 필요하다.
 *
 * 주최자가 '상품명만'을 고르는 이유는 **등수를 안 보이게 하려는 것**이다. 그런데 등수는
 * 당첨 화면에서만 빠지고 전체 결과 목록·배송 모달에는 "1등" 이 그대로 남아 있었다 —
 * 감춘 게 한 번 눌러 들어간 자리에서 도로 나오면 감춘 게 아니다.
 *
 * **편집기 미리보기로 본다.** 실제로 뽑으면 살아 있는 슬롯의 재고가 탄다 — 미리보기는
 * 가짜 결과(`sampleResult`)를 쓰고 DB 를 건드리지 않으면서, 화면 자체는 방문자와 같은
 * `ResultReveal` 이다. 확인하려는 게 그 컴포넌트의 분기라 이걸로 충분하다.
 *
 * 등수는 **클래스로** 찾는다(`summaryBadge`). 미리보기 샘플의 상품 이름이 "1등 상품" 이라
 * 글자로 "등" 을 찾으면 이름에 걸려 늘 실패한다.
 */
import puppeteer from 'puppeteer-core'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)
const PW = env.SEED_PASSWORD ?? 'tarot1234'
/** 기본은 개발 서버. 배포된 걸 그대로 찔러보려면 `BASE=https://www.olucky.me` */
const BASE = process.env.BASE ?? 'http://localhost:5174'
const DIR = process.argv[2] ?? '.'

/** 어떤 슬롯을 어떤 기대로 볼지 — display_mode 는 DB 에 이미 그렇게 저장돼 있다 */
const CASES = [
  { slug: 'luckytest', mode: 'prize', rank: false },
  { slug: 'demo-luckydraw', mode: 'both', rank: true },
]

const exe = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p))
if (!exe) {
  console.error('Chrome/Edge 를 찾지 못했어요')
  process.exit(1)
}

let failed = 0
const check = (name, ok, detail = '') => {
  if (!ok) failed++
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

await mkdir(DIR, { recursive: true })
const browser = await puppeteer.launch({ executablePath: exe, headless: 'new', args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 1400, height: 1100 })

await page.goto(`${BASE}/theme-editor`, { waitUntil: 'networkidle0' })
await wait(500)
if (await page.$('#owner-email')) {
  await page.type('#owner-email', 'owner@example.com')
  await page.type('#owner-password', PW)
  await Promise.all([page.click('button[type="submit"]'), wait(2500)])
}

/** 미리보기 iframe 안의 문서 — 방문자 화면 그 자체다 */
async function previewFrame() {
  const handle = await page.$('iframe[title="미리보기"]')
  if (!handle) return null
  return await handle.contentFrame()
}

for (const c of CASES) {
  await page.goto(`${BASE}/theme-editor/${c.slug}`, { waitUntil: 'networkidle0' })
  await wait(2500)

  const pill = await page.$('[data-preview-screen="summary"]')
  if (!pill) {
    check(`${c.slug} 전체 결과 미리보기`, false, '화면 pill 을 못 찾았어요')
    continue
  }
  await pill.click()
  await wait(1800)

  const frame = await previewFrame()
  if (!frame) {
    check(`${c.slug} 미리보기 iframe`, false)
    continue
  }

  // 전체 결과가 실제로 그려졌나 — 부정 단언만 있으면 빈 화면이 통과로 보인다
  const rows = await frame.$$eval('[class*="summaryRow"]', (els) => els.length)
  check(`${c.slug} 전체 결과가 그려짐`, rows > 0, `${rows}줄`)

  const badges = await frame.$$eval('[class*="summaryBadge"]', (els) => els.map((e) => e.textContent))
  check(
    `${c.slug}(${c.mode}) 전체 결과 등수 배지 ${c.rank ? '있음' : '없음'}`,
    c.rank ? badges.length > 0 : badges.length === 0,
    badges.join(' ') || '(없음)'
  )

  const box = await page.$('iframe[title="미리보기"]')
  await box.screenshot({ path: join(DIR, `mode-${c.mode}-summary.png`) })

  /*
   * 배송 모달 — 전체 결과에서 한 번 눌러 들어가는 자리라 여기도 같은 규칙이어야 한다.
   *
   * **누르는 건 DOM 으로 한다.** 편집기는 미리보기 iframe 을 기기 크기에 맞춰 `transform`
   * 으로 줄여 놓는데, puppeteer 의 `click()` 은 좌표로 누르기 때문에 그 축소를 타고
   * 엉뚱한 데를 누른다 — 실제로 모달이 안 열린 채 "줄이 없다" 로 통과했었다.
   */
  const clicked = await frame.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((e) =>
      (e.textContent ?? '').includes('배송지 입력')
    )
    btn?.click()
    return Boolean(btn)
  })
  if (!clicked) {
    check(`${c.slug} 배송지 입력 버튼`, false, '샘플 결과에 배송 상품이 없어요')
    continue
  }
  await wait(900)

  const shipLines = await frame.$$eval('[class*="shipItem"]', (els) =>
    els.map((e) => e.textContent ?? '')
  )
  // 모달이 안 열렸는데 "등수가 없다" 로 통과하지 않게 — 줄이 있어야 판정한다
  check(`${c.slug} 배송 모달이 열림`, shipLines.length > 0, `${shipLines.length}줄`)
  const hasRank = shipLines.some((s) => /\d+등\s*·/.test(s))
  check(
    `${c.slug}(${c.mode}) 배송 모달 등수 ${c.rank ? '있음' : '없음'}`,
    shipLines.length > 0 && (c.rank ? hasRank : !hasRank),
    shipLines.join(' | ') || '(줄 없음)'
  )
  await box.screenshot({ path: join(DIR, `mode-${c.mode}-shipping.png`) })
}

await browser.close()
console.log(failed ? `\n${failed}건 실패` : '\n모두 통과')
process.exit(failed ? 1 : 0)
