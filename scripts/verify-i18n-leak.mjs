/**
 * **번역이 새는 자리를 화면에서 직접 찾는다.**
 *
 *   node scripts/verify-i18n-leak.mjs                 ← 전 서비스 · 방문자 + 관리
 *   node scripts/verify-i18n-leak.mjs luckydraw       ← 한 서비스만
 *   node scripts/verify-i18n-leak.mjs --visitor       ← 방문자 화면만
 *
 * `i18n-scan` · `i18n-unwrapped` 는 **소스를 읽는다.** 그래서 못 보는 게 하나 있다:
 * 문장이 조각나 있고 **조각 하나만** 감싼 자리다.
 *
 *     {t('메이저 22장')}의 의미를 살펴보세요.      →  화면엔 "All 78의 의미를 살펴보세요."
 *
 * 소스만 보면 `t()` 가 있으니 감싼 걸로 세어지고, 사전에도 다 있으니 빠진 것도 없다.
 * 그런데 **화면엔 한국어가 남는다.** 이건 렌더된 글자를 봐야만 잡힌다.
 *
 * 그래서 영어로 바꿔 놓고 화면을 돌면서 **한글이 남아 있는 텍스트 노드**를 긁는다.
 * 한글이 하나라도 보이면 그 자리가 번역이 안 된 자리다 — 조각이든 통문장이든.
 *
 * **주최자가 입력한 값은 뺀다.** 경품 이름·질문·쪽지 같은 건 슬롯 주인이 한국어로 적은
 * 것이라 번역 대상이 아니다 (그건 `docs/` 의 주최자 다국어 입력이 따로 푼다).
 * `data-user-text` 가 붙은 자리와 그 안쪽은 통째로 건너뛴다.
 */
import puppeteer from 'puppeteer-core'
import { existsSync } from 'node:fs'

const BASE = 'http://localhost:5174'
const LANG = 'en'

const exe = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p))
if (!exe) {
  console.error('크롬을 못 찾았어요')
  process.exit(1)
}

/**
 * 슬롯마다 볼 화면 — 방문자 경로와 관리 경로를 따로 둔다.
 *
 * **관리 경로는 `AdminRoutes.tsx` 를 그대로 옮긴다.** 예전엔 서비스마다 두세 개만 돌았고,
 * 그래서 포토카드 카드 관리·뽑기권처럼 **안 도는 화면의 미번역이 통째로 안 보였다**
 * (검사는 0 인데 화면엔 스무 줄이 한국어였다). 라우트가 늘면 여기도 같이 늘려야 한다 —
 * 기계가 못 하는 일이라 이 주석이 그 자리다.
 */
const SERVICES = {
  tarot: {
    visitor: ['', '/cards', '/cards/major-0', '/question', '/fortune'],
    admin: ['', '/questions', '/qr', '/account'],
  },
  luckydraw: { visitor: [''], admin: ['', '/overview', '/shipping', '/qr'] },
  rolling: { visitor: ['', '/write'], admin: ['', '/messages', '/qr'] },
  wish: { visitor: ['', '/write'], admin: ['', '/messages', '/qr'] },
  photozone: { visitor: [''], admin: ['', '/photozone', '/qr'] },
  poll: { visitor: [''], admin: ['', '/polls', '/live', '/qr'] },
  stamp: {
    visitor: [''],
    admin: ['', '/stamp', '/redeem', '/picker', '/entries', '/qr'],
  },
  quiz: {
    visitor: [''],
    admin: ['', '/quiz', '/stats', '/redeem', '/picker', '/entries', '/qr'],
  },
  photocard: { visitor: [''], admin: ['', '/photocard', '/tickets', '/qr'] },
  'photocard-sale': {
    visitor: ['', '/staff'],
    admin: ['', '/photocard', '/tickets', '/qr'],
  },
  cheer: { visitor: ['', '/overlay'], admin: ['', '/cheer', '/messages', '/qr'] },
}

const arg = process.argv[2]
const onlyVisitor = process.argv.includes('--visitor')
const onlyAdmin = process.argv.includes('--admin')
const targets = arg && !arg.startsWith('--') ? [arg] : Object.keys(SERVICES)

const HANGUL = /[\uac00-\ud7a3]/

const browser = await puppeteer.launch({ executablePath: exe, headless: 'new', args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 420, height: 900 })

// 언어를 먼저 심어 둔다 — 첫 렌더부터 영어여야 폴백과 구분된다
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
await page.evaluate((l) => localStorage.setItem('tarot-pocket:lang', l), LANG)

const leaks = new Map() // 문장 → 나온 경로들

async function sweep(path) {
  try {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle0', timeout: 20000 })
  } catch {
    return
  }
  await new Promise((r) => setTimeout(r, 700))
  const found = await page.evaluate(() => {
    const HAN = /[\uac00-\ud7a3]/
    const out = []
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = (n.nodeValue ?? '').trim()
      if (!text || !HAN.test(text)) continue
      const el = n.parentElement
      if (!el) continue
      // 안 보이는 글자는 건너뛴다 (숨긴 라벨·스크린리더 전용은 따로 볼 일)
      const r = el.getBoundingClientRect()
      if (r.width === 0 && r.height === 0) continue
      // 주최자가 적은 값은 번역 대상이 아니다
      if (el.closest('[data-user-text]')) continue
      out.push(text)
    }
    return out
  })
  for (const s of found) {
    if (!leaks.has(s)) leaks.set(s, new Set())
    leaks.get(s).add(path)
  }
}

for (const key of targets) {
  const conf = SERVICES[key]
  if (!conf) {
    console.error(`모르는 서비스: ${key}`)
    continue
  }
  const slug = `demo-${key}`
  if (!onlyAdmin) for (const p of conf.visitor) await sweep(`/${slug}${p}`)
  if (!onlyVisitor) for (const p of conf.admin) await sweep(`/${slug}/admin${p}`)
  process.stderr.write(`· ${slug}\n`)
}

await browser.close()

const rows = [...leaks.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ko'))
for (const [text, paths] of rows) {
  console.log(text)
  console.log(`    ${[...paths].join(' · ')}`)
}
console.error(`\n${rows.length}종이 영어 화면에 한국어로 남아 있어요`)
process.exit(rows.length === 0 ? 0 : 1)
