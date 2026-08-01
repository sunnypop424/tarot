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

/**
 * **세 언어를 다 돈다.** 영어만 보면 zh·ja 에만 빠진 문장을 못 잡는다 — 사전이 없으면
 * 한국어로 폴백하므로 화면이 깨지지 않아 눈으로도 안 보인다.
 */
const LANGS = ['en', 'zh', 'ja']

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
    // `/draw/:categoryId` 는 카테고리 id (`src/data/categories.ts`) — 뽑기 화면이 여기다
    visitor: [
      '',
      '/fortune',
      '/cards',
      '/cards/major-0',
      '/draw/today',
      '/draw/love',
      '/draw/yesno',
    ],
    admin: ['', '/questions', '/qr', '/account', '/login'],
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

/**
 * **모든 슬롯에 있는 관리 화면** — 서비스마다 적지 않고 여기 한 번 적어 붙인다.
 * `staff-accounts` 는 체험 슬롯엔 라우트가 없다(`AdminRoutes` 의 `!slot.demo`) — 열면
 * 대시보드로 되돌아가므로 검사에 넣어도 해가 없고, 고객 슬롯에서 빠뜨리지 않게 남겨 둔다.
 */
const COMMON_ADMIN = ['', '/qr', '/login']

/** 슬롯 밖 화면 — 랜딩은 배포 루트다 */
const ROOT_PAGES = ['/']

const arg = process.argv[2]
const onlyVisitor = process.argv.includes('--visitor')
const onlyAdmin = process.argv.includes('--admin')
const targets = arg && !arg.startsWith('--') ? [arg] : Object.keys(SERVICES)

const HANGUL = /[\uac00-\ud7a3]/

const browser = await puppeteer.launch({ executablePath: exe, headless: 'new', args: ['--no-sandbox'] })
const page = await browser.newPage()

/**
 * **폭을 두 개 본다.**
 *
 * 420 만 보다가 **넓은 화면에서만 뜨는 줄**을 통째로 놓쳤다 — 소원나무의
 * "지금까지 걸린 소원 8" 은 900px 이상에서만 나와서, 검사는 0 인데 데스크톱 화면엔
 * 한국어가 떠 있었다. 데스크톱 CTA·부스 화면용 카운터가 다 이 부류다.
 *
 * 넓은 쪽은 **영어 한 번만** 돈다. 여기서 찾는 건 "사전에 물어보지도 않은 문장"(감싸기가
 * 빠진 자리)이고, 그건 어느 언어로 열든 똑같이 한국어로 뜬다. 사전에 키는 있는데 특정
 * 언어만 빈 경우는 `i18n-parity.mjs` 가 따로 본다 — 세 언어를 다 돌면 시간만 세 배다.
 */
const PASSES = [
  { width: 420, langs: LANGS },
  { width: 1280, langs: ['en'] },
]

const leaks = new Map() // 문장 → 나온 (언어·경로)들
let curLang = 'en'

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
    leaks.get(s).add(`${curLang}:${path}`)
  }
}

for (const { width, langs } of PASSES) {
  await page.setViewport({ width, height: 900 })
  for (const lang of langs) {
  curLang = lang
  // 언어를 먼저 심어 둔다 — 첫 렌더부터 그 언어여야 폴백과 구분된다
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await page.evaluate((l) => localStorage.setItem('tarot-pocket:lang', l), lang)

  if (!onlyAdmin && !arg) for (const p of ROOT_PAGES) await sweep(p)

  for (const key of targets) {
    const conf = SERVICES[key]
    if (!conf) {
      console.error(`모르는 서비스: ${key}`)
      continue
    }
    const slug = `demo-${key}`
    if (!onlyAdmin) for (const p of conf.visitor) await sweep(`/${slug}${p}`)
    if (!onlyVisitor) {
      // 공통 관리 화면은 서비스마다 안 적는다 — 여기서 합쳐 중복 없이 돈다
      for (const p of new Set([...COMMON_ADMIN, ...conf.admin])) {
        await sweep(`/${slug}/admin${p}`)
      }
    }
  }
  process.stderr.write(`· ${lang} @${width} 끝\n`)
  }
}

await browser.close()

const rows = [...leaks.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ko'))
for (const [text, paths] of rows) {
  console.log(text)
  console.log(`    ${[...paths].join(' · ')}`)
}
console.error(`\n${rows.length}종이 영어 화면에 한국어로 남아 있어요`)
process.exit(rows.length === 0 ? 0 : 1)
