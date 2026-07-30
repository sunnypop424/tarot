/**
 * 타로 결과 저장 검증 — **그림이 실제로 만들어지는가** (`src/screens/resultCard.ts`).
 *
 *   node scripts/verify-tarot-save.mjs [카테고리] [출력파일] [슬러그]
 *
 * 개발 서버(5174)가 떠 있어야 한다.
 *
 * 캔버스 합성은 **화면에는 아무 티가 안 난다** — 버튼이 떠 있으면 다 된 것처럼 보인다.
 * 그런데 캔버스가 오염되면(`crossOrigin` 없이 그린 원격 이미지) `toBlob` 이 조용히 실패하고,
 * 그건 **저장을 눌러야** 드러난다. 그래서 여기서 실제 blob 을 꺼내 파일로 떨군다 —
 * 눈으로 볼 수 있어야 "그려지긴 했는데 글자가 겹친다" 같은 것도 잡힌다.
 */
import puppeteer from 'puppeteer-core'
import { existsSync, writeFileSync } from 'node:fs'

const CATEGORY = process.argv[2] ?? 'love'
const OUT = process.argv[3] ?? 'tarot-result.png'
const SLUG = process.argv[4] ?? 'demo-tarot'
const BASE = 'http://localhost:5174'

let failed = 0
const check = (label, ok, note = '') => {
  console.log(`${ok ? '✓' : '✗'} ${label}${note ? ` — ${note}` : ''}`)
  if (!ok) failed++
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const exe = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p))
if (!exe) {
  console.error('Chrome/Edge 를 찾지 못했습니다.')
  process.exit(1)
}

const browser = await puppeteer.launch({ executablePath: exe, headless: 'new', args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

try {
  await page.goto(`${BASE}/${SLUG}/draw/${CATEGORY}`, { waitUntil: 'networkidle0' })
  await wait(700)

  const empty = await page.$$eval('[class*="slotEmpty"]', (n) => n.length)
  const deck = await page.$$('button[aria-label$="카드 고르기"]')
  check('덱이 펼쳐진다', deck.length > 0, `${deck.length}장`)

  /**
   * **뒤에서부터 집는다** (`verify-draw.mjs` 와 같은 이유).
   * 카드가 부채꼴로 겹쳐 있어 앞쪽 카드의 중심은 뒤 카드에 덮인다 — 앞에서부터 누르면
   * 클릭이 뒤 카드로 가고 "0장 골랐어요" 인 채로 다음 단계가 진행된다.
   */
  for (let i = 0; i < Math.max(1, empty); i++) {
    const cards = await page.$$('button[aria-label$="카드 고르기"]:not([disabled])')
    await cards[cards.length - 1]?.click()
    await wait(800)
  }
  const picked = await page.$$eval('[class*="slotEmpty"]', (n) => n.length)
  check('카드를 골랐다', picked === 0, `빈 슬롯 ${picked}개`)

  // '결과 보기' 는 라벨로 찾는다 — 클래스 이름은 CSS 모듈이라 해시가 붙는다
  const go = await page.$$eval('button', (bs) => {
    const b = bs.find((x) => (x.textContent ?? '').includes('결과'))
    if (b) b.click()
    return Boolean(b)
  })
  check('결과 보기로 넘어간다', go)

  /**
   * 카드 이미지를 받아 캔버스에 그리는 시간 — 결과 화면에 들어오자마자 만들기 시작한다.
   * **고정 대기가 아니라 버튼이 뜰 때까지 기다린다** — 슬롯이 카드 78장짜리 이미지를 쓰면
   * 내려받는 데 시간이 걸리고, 고정 대기는 느린 날 거짓 실패가 된다.
   */
  const hasSave = await page.waitForSelector('[data-save]', { timeout: 20000 }).catch(() => null)
  check('저장 버튼이 뜬다 (그림이 만들어졌다)', Boolean(hasSave))
  // 실패하면 무슨 화면이었는지 남긴다 — 이 종류의 실패는 로그만 봐선 못 고친다
  if (!hasSave) await page.screenshot({ path: `${OUT}.fail.png`, fullPage: true })

  /**
   * **blob 을 실제로 꺼내 본다.** 버튼이 떠 있다는 건 `mint()` 가 성공했다는 뜻이지만,
   * 그 결과가 정말 읽히는 PNG 인지는 꺼내 봐야 안다.
   */
  const dataUrl = await page.evaluate(async () => {
    const img = document.querySelector('img[src^="blob:"]')
    if (!img) return null
    const res = await fetch(img.src)
    const blob = await res.blob()
    return await new Promise((r) => {
      const fr = new FileReader()
      fr.onload = () => r(fr.result)
      fr.readAsDataURL(blob)
    })
  })

  check('저장될 그림을 꺼낼 수 있다', typeof dataUrl === 'string' && dataUrl.startsWith('data:image/'))
  if (typeof dataUrl === 'string') {
    const bytes = Buffer.from(dataUrl.split(',')[1], 'base64')
    writeFileSync(OUT, bytes)
    // 1080 폭 PNG 는 아무리 단순해도 이보다 크다 — 너무 작으면 빈 캔버스를 저장한 것이다
    check('그림이 비어 있지 않다', bytes.length > 20_000, `${Math.round(bytes.length / 1024)}KB → ${OUT}`)
  }

  check('화면 오류가 없다', errors.length === 0, errors.slice(0, 2).join(' / '))
} finally {
  await browser.close()
}

console.log(failed === 0 ? '\n전부 통과' : `\n${failed}개 실패`)
process.exit(failed === 0 ? 0 : 1)
