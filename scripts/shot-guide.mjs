/**
 * 럭키드로우 실사용 가이드용 캡처 — **체험 슬롯 `demo-luckydraw` 전용.**
 *
 *   node scripts/shot-guide.mjs [--recon]
 *
 * 실사용 슬롯은 절대 열지 않는다 (캡처 한 장이 남의 행사 데이터다). 슬러그를 인자로 받지
 * 않는 것도 그 때문이다 — 손이 미끄러져 실제 슬러그를 넣을 자리를 아예 만들지 않는다.
 *
 * 체험 슬롯은 매시간 기준 상태로 되돌아가므로 **한 세션에서 몰아 찍는다.** 리허설이 켜져
 * 있어야 몇 번을 다시 찍어도 재고가 그대로다 — 시작할 때 확인하고, 꺼져 있으면 멈춘다.
 *
 * 캡처를 위해 체험 슬롯을 **잠깐 고쳤다가 되돌린다**: 1등을 '배송 필요' 로 켜고(배송 폼을
 * 찍으려면 배송 상품이 당첨돼야 한다), 마감을 켰다 끄고(마감 화면), 가짜 배송 정보를 한 건
 * 넣었다 지운다. 되돌리기는 마지막 단계에 있고, 실패해도 매시간 초기화가 같은 일을 한다.
 *
 * 셀렉트는 CSS 모듈 클래스가 아니라 `data-*` 속성·`aria-label`·버튼 문구로 한다
 * (클래스명은 빌드마다 바뀐다).
 */
import puppeteer from 'puppeteer-core'
import { existsSync, mkdirSync } from 'node:fs'

const SLUG = 'demo-luckydraw'
const BASE = `http://localhost:5174/${SLUG}`
const OUT = 'docs/guide/luckydraw'
const RECON = process.argv.includes('--recon')

/** 가짜 배송 정보 — 한눈에 예시임이 보여야 한다 (실제 사람의 값이 들어가면 안 된다) */
const FAKE = {
  name: '김체험',
  phone: '010-0000-0000',
  address: '서울특별시 마포구 체험로 12, 3층 (체험용 예시 주소)',
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

mkdirSync(OUT, { recursive: true })

/**
 * **방문자 화면도 아이패드 가로다.** 럭키드로우는 방문자가 자기 폰으로 여는 화면이 아니라
 * 부스에 세워둔 태블릿에서 스태프가 뽑는 화면이라, 폰 폭으로 찍으면 현장과 다른 배치가 나온다.
 */
const PAD = { width: 1180, height: 820, deviceScaleFactor: 2, hasTouch: true }
const DESK = { width: 1440, height: 1000, deviceScaleFactor: 2 }

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: 'new',
  args: ['--no-sandbox', '--hide-scrollbars'],
})
const page = await browser.newPage()
const errs = []
page.on('pageerror', (e) => errs.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()))

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const text = () => page.evaluate(() => document.body.innerText)
const shot = async (name, opts = {}) => {
  await page.screenshot({ path: `${OUT}/${name}.png`, ...opts })
  console.log(`  · ${name}.png`)
}

/** 문구로 버튼을 짚는다 — 결과 화면의 버튼엔 data-* 가 없다 (코드는 안 고친다) */
async function clickText(label, tag = 'button') {
  const ok = await page.evaluate(
    (label, tag) => {
      const el = [...document.querySelectorAll(tag)].find((e) => e.textContent.trim() === label)
      if (!el) return false
      el.click()
      return true
    },
    label,
    tag
  )
  if (!ok) throw new Error(`버튼을 못 찾았습니다: ${label}`)
  return ok
}
const hasText = (label, tag = 'button') =>
  page.evaluate(
    (label, tag) => [...document.querySelectorAll(tag)].some((e) => e.textContent.trim() === label),
    label,
    tag
  )

/** 관리 화면 확인 모달 — 되돌릴 수 없는 전환은 여기서 한 번 더 묻는다 */
async function confirmOk() {
  await page.waitForSelector('[data-confirm-ok]', { timeout: 5000 })
  await wait(350)
  await page.click('[data-confirm-ok]')
  await wait(450)
}

async function gotoAdmin(path = '') {
  await page.setViewport(DESK)
  await page.goto(`${BASE}/admin${path}`, { waitUntil: 'networkidle0' })
  await wait(1800)
}

/** 상품·운영 화면에서 저장 (변경이 없으면 버튼이 죽어 있어 그냥 지나간다) */
async function save() {
  const live = await page.evaluate(() => {
    const b = document.querySelector('[data-save]')
    if (!b || b.disabled) return false
    b.click()
    return true
  })
  if (!live) return false
  await wait(2000)
  const note = await page.$eval('.ad-savebar__note', (e) => e.textContent.trim())
  if (note !== '저장됐어요') console.log(`  ! 저장 바: ${note}`)
  return true
}

/**
 * 켜고 저장한 값이 **정말 남았는지** 다시 읽어 확인한다.
 *
 * 체험 슬롯은 매시간 기준 상태로 되돌아가므로, 캡처 도중 초기화가 지나가면 방금 켠 설정이
 * 조용히 사라진다 (실제로 한 번 그렇게 어긋났다). 저장은 됐는데 화면만 옛 값인 것과
 * 구분이 안 되니 **다시 읽어서** 본다.
 */
async function ensureShipping1(want) {
  for (let i = 1; i <= 3; i++) {
    await gotoAdmin('/overview')
    const now = await page.$eval('button[aria-label="1등 배송 필요"]', (e) => e.textContent.trim())
    if ((now === '필요') === want) return true
    console.log(`  1등 배송 필요 = ${now} — 다시 ${want ? '켠다' : '끈다'} (${i}/3)`)
    await page.click('button[aria-label="1등 배송 필요"]')
    await wait(400)
    await save()
  }
  return false
}

/** 방문자 화면을 처음부터 (연출이 다시 돌게) */
async function visitor(vp = PAD) {
  await page.setViewport(vp)
  await page.goto(BASE, { waitUntil: 'networkidle0' })
  await wait(1500)
}

/**
 * 부스 화면에서 **내용이 있는 자리만** 잘라 찍는다.
 *
 * 아이패드 가로는 화면이 넓어 박스 좌우로 배경이 넓게 남는다. 그대로 A4 에 넣으면
 * 한 장이 페이지 절반을 먹으면서 정작 글자는 못 읽을 만큼 작아진다. 박스(모달이 떠 있으면
 * 모달)와 언어 고르개를 감싸는 자리만 남긴다 — 배경은 여백만큼만 보인다.
 */
async function shotStage(name, pad = 40) {
  const b = await page.evaluate((pad) => {
    /**
     * 아래 여백만 좁게 — 박스 밑에 '관리자 페이지로 이동' 링크가 흐릿하게 있어서,
     * 넉넉히 잡으면 글자가 **반쯤 잘린 채로** 들어온다. 아예 빼는 게 깔끔하다.
     */
    const padBottom = 16
    const targets = []
    const dialog = document.querySelector('[role="dialog"]')
    targets.push(dialog?.firstElementChild ?? document.querySelector('[data-part="box"]'))
    // 언어 메뉴는 박스 밖 오른쪽 위에 열린다 — 열려 있으면 같이 담는다
    targets.push(document.querySelector('[data-lang-menu]'))

    const rects = targets.filter(Boolean).map((el) => el.getBoundingClientRect())
    if (!rects.length) return null
    const x1 = Math.min(...rects.map((r) => r.left)) - pad
    const y1 = Math.min(...rects.map((r) => r.top)) - pad
    const x2 = Math.max(...rects.map((r) => r.right)) + pad
    const y2 = Math.max(...rects.map((r) => r.bottom)) + padBottom
    return {
      x: Math.max(0, x1),
      y: Math.max(0, y1),
      width: Math.min(window.innerWidth, x2) - Math.max(0, x1),
      height: Math.min(window.innerHeight, y2) - Math.max(0, y1),
    }
  }, pad)
  if (!b) {
    console.log(`  ! 자를 자리를 못 찾음: ${name}`)
    return shot(name)
  }
  await shot(name, { clip: b })
}

// ── 정찰 모드 ────────────────────────────────────────────────────
if (RECON) {
  await visitor()
  console.log('=== 방문자 ===\n' + (await text()))
  await gotoAdmin()
  console.log('\n=== 관리 (' + page.url() + ') ===\n' + (await text()))
  await page.setViewport(PAD)
  await page.goto(`${BASE}/staff`, { waitUntil: 'networkidle0' })
  await wait(1200)
  console.log('\n=== 스태프 ===\n' + (await text()))
  console.log('\nERRORS:', errs.length ? errs : 'none')
  await browser.close()
  process.exit(0)
}

console.log(`캡처 시작 — ${SLUG}`)

/**
 * **시작 상태를 맞춘다** — 리허설 켜짐 · 마감 꺼짐.
 *
 * 앞선 실행이 중간에 죽으면 마감이 켜진 채 남는다(되돌리기가 맨 끝에 있다).
 * 그 상태로 다시 돌리면 방문자 화면이 마감 화면이라 아무것도 못 찍는데, 원인이
 * "리허설이 꺼졌다" 로 보여 엉뚱한 데를 뒤지게 된다. 여기서 그냥 맞춰 놓고 시작한다.
 * (둘 다 켜는 방향은 확인 창이 뜨지만, **끄는 방향은 안 뜬다** — 여기선 끄기만 한다.)
 */
await gotoAdmin('/overview')
for (const [label, want] of [
  ['실제 운영', false], // data-on = 실제 운영 중 → 꺼야 리허설
  ['행사 마감', false],
]) {
  const on = await page.$eval(`button[aria-label="${label}"]`, (e) => e.dataset.on === 'true')
  if (on !== want) {
    console.log(`  시작 상태 맞추기 — ${label} 끔`)
    await page.click(`button[aria-label="${label}"]`)
    await wait(400)
  }
}
await save()

// 그래도 아니면 멈춘다 — 실제 재고가 줄어드는 상태로 찍으면 안 된다
await visitor()
if (!/리허설/.test(await text())) {
  console.error('리허설 상태를 못 만들었습니다. 관리 화면에서 확인해 주세요.')
  console.error((await text()).slice(0, 300))
  await browser.close()
  process.exit(1)
}

// ── 1. 주최자 · 대시보드 ────────────────────────────────────────
console.log('[1] 주최자 대시보드')
await gotoAdmin()
await shot('20-admin-dashboard', { fullPage: true })

// ── 2. 주최자 · 상품 · 운영 ─────────────────────────────────────
console.log('[2] 상품 · 운영')
await gotoAdmin('/overview')

/**
 * 카드 하나만 — 절 사이에 넣을 부분 캡처. 제목 문구로 찾는다.
 * (`ad-card__title` 은 CSS 모듈이 아니라 `styles/admin.css` 의 전역 클래스라 빌드마다 안 바뀐다.)
 */
async function shotCard(title, name, pad = 14) {
  /**
   * **clip 은 문서 좌표다** — `getBoundingClientRect()` 는 뷰포트 좌표라 그대로 넘기면
   * 스크롤한 만큼 어긋난 자리가 찍힌다 (실제로 엉뚱한 카드가 찍혔다). 스크롤을 맨 위로 되돌려
   * 고정 헤더가 카드 위에 겹치는 것도 같이 막는다.
   */
  const b = await page.evaluate((title) => {
    window.scrollTo(0, 0)
    const t = [...document.querySelectorAll('.ad-card__title')].find(
      (e) => e.textContent.trim() === title
    )
    const card = t?.closest('.ad-card')
    if (!card) return null
    const r = card.getBoundingClientRect()
    return { x: r.x + window.scrollX, y: r.y + window.scrollY, width: r.width, height: r.height }
  }, title)

  if (!b) {
    console.log(`  ! 카드를 못 찾음: ${title}`)
    return
  }
  await wait(400)
  await shot(name, {
    clip: {
      x: Math.max(0, b.x - pad),
      y: Math.max(0, b.y - pad),
      width: b.width + pad * 2,
      height: b.height + pad * 2,
    },
    captureBeyondViewport: true,
  })
}

/** 카드가 아닌 덩어리(지표 줄 등)를 짚을 때 — 위 shotCard 와 같은 좌표 규칙 */
async function shotEl(selector, name, pad = 14) {
  const b = await page.evaluate((sel) => {
    window.scrollTo(0, 0)
    const el = document.querySelector(sel)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.x + window.scrollX, y: r.y + window.scrollY, width: r.width, height: r.height }
  }, selector)
  if (!b) {
    console.log(`  ! 못 찾음: ${selector}`)
    return
  }
  await wait(400)
  await shot(name, {
    clip: {
      x: Math.max(0, b.x - pad),
      y: Math.max(0, b.y - pad),
      width: b.width + pad * 2,
      height: b.height + pad * 2,
    },
    captureBeyondViewport: true,
  })
}

await shotEl('.ad-stats', '27-admin-stats')
await shotCard('운영', '22-admin-ops')
await shotCard('당첨 결과 표시', '23-admin-display')
await shotCard('경품 미리보기', '28-admin-preview')
await shotCard('묶음 뽑기 제한', '24-admin-batchcap')

// 1등을 '배송 필요' 로 — 배송 폼을 찍으려면 배송 상품이 당첨돼야 한다
console.log('[3] 1등 배송 필요 켜기 (임시)')
await page.click('button[aria-label="1등 배송 필요"]')
await wait(500)
// 저장 바가 "아직 저장하지 않은 변경이 있어요" 로 살아난 자리
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
await wait(500)
await shot('25-admin-savebar')
await save()
if (!(await ensureShipping1(true))) {
  console.error('1등을 배송 필요로 못 바꿨습니다.')
  await browser.close()
  process.exit(1)
}
console.log('  저장 확인')

/**
 * 상품 표 — 배송 열이 '필요' 로 켜진 상태로 찍는다.
 * 창을 길게 잡는다: 저장 바가 **화면 아래에 고정**돼 있어 짧은 창으로 찍으면 상품 표의
 * 마지막 줄을 덮는다.
 */
await page.setViewport({ ...DESK, height: 1800 })
await wait(700)
await shotCard('상품', '26-admin-prizes')

/**
 * 상품명 번역 칸 — 접혀 있어서 펼쳐야 보인다. 슬롯이 켠 언어만큼 줄이 생긴다
 * (체험 슬롯은 영어·중국어·일본어를 켜 뒀다).
 */
const i18nToggle = await page.$('[data-i18n-toggle]')
if (i18nToggle) {
  await i18nToggle.click()
  await wait(600)
  await shotCard('상품', '29-admin-i18n')
  await i18nToggle.click()
  await wait(300)
} else {
  console.log('  ! 다른 언어 칸이 없습니다 (슬롯에 켠 언어가 없음)')
}
await page.setViewport(DESK)

// ── 4. 방문자 · 뽑기 화면 ───────────────────────────────────────
console.log('[4] 방문자 뽑기 화면')
await visitor()
await shot('01-draw')

await page.click('[data-prize-preview]')
await wait(700)
await shotStage('02-prize-preview')

// ── 5. 방문자 · 당첨 결과 (1등이 나올 때까지 다시 뽑는다) ───────
console.log('[5] 당첨 결과 — 1등이 나올 때까지 재시도')
let got = false
for (let tryNo = 1; tryNo <= 25 && !got; tryNo++) {
  await visitor()
  await clickText('10개')
  await wait(300)
  await page.click('[data-draw]')
  await wait(2800)
  const ranks = await page.evaluate(() =>
    [...document.querySelectorAll('[data-results] li')].map((li) => li.innerText.trim())
  )
  got = ranks.some((r) => r.startsWith('1등'))
  console.log(`  시도 ${tryNo}: ${got ? '1등 나옴' : '없음'}`)
}
if (!got) {
  console.error('1등이 안 나왔습니다 — 다시 실행하세요.')
  await browser.close()
  process.exit(1)
}
await shotStage('03-result-covered')

// 덮인 칸을 긁는다 — 손을 떼면 나머지가 저절로 쓸려 나간다 (ScratchCover)
const covers = await page.$$('[data-scratch]')
console.log(`  덮인 칸 ${covers.length}개 긁기`)
for (const c of covers) {
  const box = await c.boundingBox()
  if (!box) continue
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  await page.mouse.move(cx - box.width / 4, cy)
  await page.mouse.down()
  for (let i = 0; i <= 10; i++) {
    await page.mouse.move(cx - box.width / 4 + (box.width / 20) * i, cy + (i % 2 ? 5 : -5))
    await wait(25)
  }
  await page.mouse.up()
  await wait(500)
}
// 폭죽이 다 떨어질 때까지 — 조각 수명이 3.4~5.6초다 (Confetti.tsx). 덜 기다리면 상품명을 가린다
await wait(8000)
await shotStage('04-result-open')

// ── 6. 전체 결과 · 배송지 입력 ──────────────────────────────────
console.log('[6] 전체 결과 · 배송지')
await clickText('전체 결과 보기')
await wait(800)
await shotStage('05-summary')

await clickText('배송지 입력')
await wait(800)
const inputs = await page.$$('[role="dialog"] input.input, [role="dialog"] textarea.textarea')
await inputs[0].type(FAKE.name, { delay: 12 })
await inputs[1].type(FAKE.phone, { delay: 12 })
await inputs[2].type(FAKE.address, { delay: 8 })
await page.click('[role="dialog"] input[type="checkbox"]')
// 맞춤법 밑줄(빨간 물결)이 캡처에 남지 않게 — 브라우저가 그린 것이지 화면의 일부가 아니다
await page.evaluate(() => {
  for (const el of document.querySelectorAll('[role="dialog"] textarea, [role="dialog"] input'))
    el.spellcheck = false
  document.activeElement?.blur()
})
await wait(600)
/**
 * **보내기는 누르지 않는다.** 체험 슬롯은 배송 정보 입력이 정책으로 막혀 있어
 * (`0034_demo_admin.sql` — 체험에 개인정보를 못 남기게 한 것) 누르면 실패 문구가 뜬다.
 * 가이드에 필요한 건 '무엇을 적는 화면인가' 라 채워진 폼이면 충분하다.
 */
await shotStage('06-shipping')
await clickText('취소')
await wait(500)

// ── 7. 주최자 · 배송 정보 ───────────────────────────────────────
/**
 * 체험 슬롯엔 배송 정보가 **한 건도 쌓일 수 없다**(위 0034). 그래서 이 캡처는 늘 빈 목록이다 —
 * 가짜 개인정보를 넣어 채우지 않는다. 실제 행사에서 표가 어떻게 생기는지는 글로 설명한다.
 */
console.log('[8] 배송 정보 (체험 슬롯은 늘 0건)')
await gotoAdmin('/shipping')
await shot('30-admin-shipping', { fullPage: true })

// ── 9. 다국어 ───────────────────────────────────────────────────
/**
 * 언어 고르개는 **슬롯이 켠 언어가 있을 때만** 뜬다. 한국어는 목록에 늘 있다
 * (빼면 그 언어에 갇힌다). 마지막에 반드시 한국어로 되돌린다 — 고른 언어가 남으면
 * 다음 캡처가 통째로 영어로 찍힌다.
 *
 * **마감을 켜기 전에 찍는다** — 마감 화면에는 경품 미리보기 버튼이 없다.
 */
console.log('[9] 다국어')
await visitor()
const langBtn = await page.$('[data-lang-open]')
if (langBtn) {
  await langBtn.click()
  await wait(700)
  await shotStage('50-lang-picker')

  await page.click('[data-lang="en"]')
  await wait(1600)
  await shotStage('51-visitor-en')

  await page.click('[data-prize-preview]')
  await wait(800)
  await shotStage('52-prize-preview-en')

  /*
   * 한국어로 되돌린다. **모달을 먼저 치운다** — 경품 미리보기가 떠 있으면 그 위를 덮고 있어
   * 언어 단추가 안 눌린다 (Esc 로도 안 닫힌다). 다시 열면 고른 언어는 그대로 남아 있다.
   */
  await visitor()
  await page.click('[data-lang-open]')
  await page.waitForSelector('[data-lang="ko"]', { timeout: 5000 })
  await wait(400)
  await page.click('[data-lang="ko"]')
  await wait(1200)
  console.log('  한국어로 되돌림:', /뽑을까요/.test(await text()) ? 'ok' : '확인 필요')
} else {
  console.log('  ! 언어 고르개가 없습니다 (슬롯에 켠 언어가 없음)')
}

// ── 10. 마감 화면 ───────────────────────────────────────────────
console.log('[10] 마감 화면')
await gotoAdmin('/overview')
await page.click('button[aria-label="행사 마감"]')
await confirmOk()
await save()
await visitor()
await shotStage('40-closed')

// ── 되돌리기 ────────────────────────────────────────────────────
console.log('[11] 되돌리기')
await gotoAdmin('/overview')
await page.click('button[aria-label="행사 마감"]')
await wait(400)
await save()
console.log('  마감 해제')

await ensureShipping1(false)
console.log('  1등 배송 필요 해제')

// 마지막 상태 확인
await gotoAdmin('/overview')
const final = await text()
console.log('\n=== 되돌린 뒤 상태 ===')
console.log(/리허설/.test(final) ? '리허설 ON' : '!! 리허설 OFF')
console.log(/행사가 마감됐어요/.test(final) ? '!! 마감 남아 있음' : '마감 해제됨')

console.log('\nERRORS:', errs.length ? errs : 'none')
await browser.close()
