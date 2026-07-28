/**
 * 실시간 미리보기 검증 — **저장하지 않아도 초안이 비치는가.**
 *
 *   node scripts/verify-preview.mjs <스크린샷 디렉터리>
 *
 * 개발 서버(5174)가 떠 있어야 한다.
 *
 * 예전 미리보기는 저장된 슬롯을 띄웠다. 색을 고를 때마다 저장을 눌러야 보였고, 그래서
 * 마음에 안 들면 되돌릴 방법이 없는 채로 저장이 쌓였다. 이제 초안이 postMessage 로
 * 건너간다 (`src/slot/preview.ts`) — **그게 실제로 도는지는 눌러봐야만 안다.**
 *
 * 이 스크립트는 아무것도 저장하지 않는다. 색을 바꾸고 iframe 을 확인한 뒤 그냥 나간다.
 */

import puppeteer from 'puppeteer-core'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const chrome = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p))

const env = {}
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim())
  if (m) env[m[1]] = m[2]
}
const OWNER_PASSWORD = env.SEED_PASSWORD ?? 'tarot1234'
const URL_ = env.VITE_SUPABASE_URL
const ANON = env.VITE_SUPABASE_ANON_KEY
/** 빈 테마로 슬롯을 만들면 applyTheme 이 죽어 화면이 하얗게 뜬다 — 씨앗에서 통째로 가져온다 */
const SEED_THEME = JSON.parse(readFileSync('src/data/slots.json', 'utf8'))[0].theme
const BASE = 'http://localhost:5174'
const outDir = process.argv[2] ?? '.'

let failed = 0
const check = (name, ok, detail = '') => {
  if (!ok) failed++
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

await mkdir(outDir, { recursive: true })
const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 1500, height: 1000 })

/**
 * 편집기는 저장 안 한 초안을 두고 나가려 하면 붙잡는다(beforeunload) — 옳은 동작이다.
 * 그 대화상자를 받아주지 않으면 새로고침이 30초를 기다리다 죽는다.
 */
page.on('dialog', (d) => void d.accept())

try {
  // ── 최고관리자로 편집기에 들어간다 ──────────────
  await page.goto(`${BASE}/theme-editor`, { waitUntil: 'networkidle0' })
  await wait(500)
  if (await page.$('#owner-email')) {
    await page.type('#owner-email', 'owner@example.com')
    await page.type('#owner-password', OWNER_PASSWORD)
    await Promise.all([page.click('button[type="submit"]'), wait(2500)])
  }

  /**
   * 아무 슬롯이나 하나 — 목록의 첫 줄에서 슬러그를 읽는다.
   * **링크(`<a href>`)로 찾지 않는다:** 목록은 줄 전체를 눌러 `navigate` 한다(주소가 DOM 에 없다).
   * 예전엔 href 를 훑다가 목록이 비었다고 오진했다.
   */
  const slug = await page.evaluate(
    () => document.querySelector('[data-slot]')?.getAttribute('data-slot') ?? null
  )
  check('편집할 슬롯을 찾았다', Boolean(slug), slug ?? '목록이 비었다')
  if (!slug) throw new Error('슬롯 없음')

  await page.goto(`${BASE}/theme-editor/${slug}`, { waitUntil: 'networkidle0' })
  await wait(2500)

  /**
   * **메인 프레임을 빼야 한다.** 편집기 주소가 `/theme-editor/{slug}` 라 슬러그를 포함해서,
   * url 만 보고 찾으면 iframe 대신 편집기 자신이 잡힌다. 편집기는 고정 라이트라 색이 안 변하고,
   * 그러면 미리보기가 멀쩡히 도는데도 "안 따라온다" 로 오진하게 된다.
   */
  const frame = () =>
    page.frames().find((f) => f !== page.mainFrame() && f.url().includes(`/${slug}`))
  check('미리보기 iframe 이 떴다', Boolean(frame()))

  /** iframe 안에서 실제로 그려진 배경색 — 커스텀 프로퍼티가 아니라 계산된 값을 본다 */
  const canvasOf = async () => {
    const f = frame()
    if (!f) return null
    return f.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--color-canvas').trim()
    )
  }

  const before = await canvasOf()
  check('미리보기가 슬롯 테마를 그린다', Boolean(before), before ?? '')

  // ── 저장하지 않고 색만 바꾼다 ───────────────────
  /**
   * **`input[type=color]` 을 순서로 집으면 안 된다.** 첫 번째는 AI 테마 생성의 '대표 색' 이고
   * 그건 로컬 상태라 초안과 무관하다 — 처음에 그걸 집어놓고 "미리보기가 안 따라온다" 고
   * 오진할 뻔했다. 테마 색은 `#c-{키}` 로 잡는다 (배경은 canvas).
   */
  const NEW_CANVAS = '#123456'
  const changed = await page.evaluate((value) => {
    const input = document.querySelector('#c-canvas')
    if (!input) return false
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  }, NEW_CANVAS)
  check('편집기에서 배경색을 바꿨다', changed)

  await wait(1200)
  const after = await canvasOf()

  /**
   * **이게 이 스크립트의 전부다.** 저장을 누르지 않았는데 iframe 이 따라왔는가.
   * 예전 구현에선 여기서 before 와 after 가 같았다 — 그게 "저장하면 반영돼요" 였다.
   */
  check('저장하지 않아도 미리보기가 따라온다', after !== before, `${before} → ${after}`)

  const dirtyNote = await page.evaluate(() => document.body.innerText.includes('저장 전 초안'))
  check('저장 전 초안임을 화면이 말한다', dirtyNote)

  await page.screenshot({ path: join(outDir, 'preview-live.png') })

  /**
   * 저장하지 않고 새로고침 — 초안이 사라지고 저장본이 돌아와야 한다.
   * (미리보기가 **아무것도 저장하지 않는다**는 걸 확인하는 자리다.)
   *
   * `networkidle0` 을 안 쓴다: 편집기 안엔 iframe 이 또 하나의 앱을 띄우고 있어서
   * 네트워크가 조용해지는 순간이 안 온다 — 30초를 기다리다 죽는다.
   */
  await page.reload({ waitUntil: 'domcontentloaded' })
  await wait(3500)
  const restored = await canvasOf()
  check('저장 안 했으므로 원래 색으로 돌아온다', restored === before, `${restored}`)

  // ══ 럭키드로우 슬롯의 편집기 ═══════════════════
  //
  // **타로 전용 설정이 안 보여야 한다.** 남겨두면 최고관리자가 78장 앞면을 올리거나
  // AI 플랜을 고르고 있게 되고, 안 쓰이는 값이 저장돼 나중에 "이 슬롯은 타로도 되나" 로 헷갈린다.
  const auth = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'owner@example.com', password: OWNER_PASSWORD }),
  })
  const { access_token } = await auth.json()
  const OWNER = {
    apikey: ANON,
    authorization: `Bearer ${access_token}`,
    'content-type': 'application/json',
  }
  const LD = 'preview-ld-verify'
  const dropLd = () =>
    fetch(`${URL_}/rest/v1/slots?slug=eq.${LD}`, { method: 'DELETE', headers: OWNER })

  await dropLd()
  await fetch(`${URL_}/rest/v1/slots`, {
    method: 'POST',
    headers: { ...OWNER, prefer: 'return=minimal' },
    body: JSON.stringify({
      slug: LD,
      name: '럭키드로우 편집기 검증',
      service: 'luckydraw',
      period: {},
      /**
       * **새로 더한 색 키를 일부러 뺀다** — 실제 DB 의 옛 슬롯이 그 상태다.
       * high·onHigh 를 추가했을 때 옛 슬롯을 열자 편집기가 통째로 하얗게 죽었는데,
       * 검증이 늘 최신 테마로 슬롯을 만들어서 못 잡았다.
       */
      theme: (() => {
        const t = structuredClone(SEED_THEME)
        delete t.colors.high
        delete t.colors.onHigh
        return t
      })(),
      event: {},
    }),
  })

  try {
    await page.goto(`${BASE}/theme-editor/${LD}`, { waitUntil: 'domcontentloaded' })
    await wait(3500)

    const body = await page.evaluate(() => document.body.innerText)
    check('럭키드로우: 카드 앞면 설정이 없다', !body.includes('카드 앞면'))
    check('럭키드로우: 카드 뒷면 설정이 없다', !body.includes('카드 뒷면'))
    check('럭키드로우: 수정구슬 설정이 없다', !body.includes('수정구슬'))
    check('럭키드로우: 플랜이 없다', !body.includes('플랜'))
    check('럭키드로우: 이벤트 설정이 없다', !body.includes('이벤트 설정'))
    /** 설정이 **화면 요소별 카드**로 묶여 있는가 — 색·형태·문구가 흩어져 있으면 못 쓴다 */
    for (const card of ['박스', '버튼', '상품 타일', '당첨 (긁는 등수)', '글자 · 폰트', '배경']) {
      check(`럭키드로우: '${card}' 카드가 있다`, body.includes(card))
    }

    /**
     * **원본 index.html 에 없던 입력은 하나도 남지 않아야 한다.**
     * 중립색(글자·테두리·입력칸)은 base-template 에서 고정이었고, 그게 이 디자인이
     * 성립하는 이유다 — 사진 위 반투명 흰 박스 안은 늘 밝은 회색이라 어떤 사진에서도 읽힌다.
     * 열어두면 어두운 글자색을 고르는 순간 사라진다.
     */
    // '포인트' 만으로 찾으면 대비 검사 패널의 '포인트 아이콘 / 표면' 행에 걸린다 — 그건 입력이 아니다
    for (const gone of ['색 만들기', '배경 · 표면', '텍스트 · 보더', '포인트 (카드', '로고']) {
      check(`럭키드로우: '${gone}' 입력이 없다`, !body.includes(gone))
    }
    // 카드 안에 색·크기·문구가 **같이** 들어 있어야 묶은 의미가 있다
    for (const kept of ['본문 폰트', '배경 이미지', '상단 여백', '커버 문자', '남은 수량 배지', '둥글기']) {
      check(`럭키드로우: '${kept}' 칸이 있다`, body.includes(kept))
    }
    check('럭키드로우: 미리보기가 아이패드 가로다', body.includes('아이패드 가로'))
    check('럭키드로우: 상태 토글이 있다', body.includes('뽑기') && body.includes('전체 결과'))

    // 다 지워버리는 것도 틀린 것이다 — 슬롯·기간·형태는 서비스와 무관하게 필요하다
    // 다 지워버리는 것도 틀린 것이다 — 슬롯·기간은 서비스와 무관하게 필요하다
    check(
      '럭키드로우: 슬롯·기간 설정은 남아 있다',
      body.includes('기간') && body.includes('슬러그')
    )
    // 둥글기는 '형태' 섹션이 아니라 박스·버튼 카드 안으로 갔다 (같은 값이 두 군데 뜨면 안 된다)
    check('럭키드로우: 별도 형태 섹션이 없다', !body.includes('형태 (radius)'))

    /**
     * **색 고르개가 리렌더에 살아남는가.**
     *
     * 처음엔 AlphaColor 를 SlotEditor 안에서 정의했는데, 그러면 렌더마다 새 컴포넌트 타입이
     * 만들어져 React 가 input 을 버리고 다시 만든다 — 색을 고르려고 누르는 순간 브라우저
     * 색 고르개가 닫혀서 **드래그로 색을 못 고른다.** DOM 노드가 유지되는지로 잰다
     * (네이티브 고르개는 자동화로 못 여니 원인을 직접 본다).
     */
    const survives = await page.evaluate(() => {
      const color = document.querySelector('.color-field input[type="color"]')
      const range = document.querySelector('.color-field input[type="range"]')
      if (!color || !range) return 'not-found'
      color.dataset.probe = 'same-node'

      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(range, '0.5')
      range.dispatchEvent(new Event('input', { bubbles: true }))
      return 'ok'
    })
    check('색 고르개 조작이 반영된다', survives === 'ok', survives)
    await wait(600)
    const sameNode = await page.evaluate(
      () => document.querySelector('.color-field input[type="color"]')?.dataset.probe === 'same-node'
    )
    check('색 고르개가 리렌더에 다시 만들어지지 않는다 (드래그로 고를 수 있다)', sameNode)

    await page.screenshot({ path: join(outDir, 'preview-luckydraw-editor.png'), fullPage: true })

    /** 당첨 탭 — 미리보기에서 진짜로 뽑을 순 없으니 가짜 결과가 떠야 한다 */
    const clicked = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === '당첨')
      if (!b) return false
      b.click()
      return true
    })
    check('럭키드로우: 당첨 탭을 눌렀다', clicked)
    await wait(2000)

    const ldFrame = page.frames().find((f) => f !== page.mainFrame() && f.url().includes(`/${LD}`))
    const shown = ldFrame ? await ldFrame.evaluate(() => document.body.innerText) : ''
    check('럭키드로우: 미리보기에 당첨 결과가 뜬다', shown.includes('당첨 결과'), shown.slice(0, 60))

    /**
     * **폰트가 미리보기에 실제로 먹는가.**
     * `--ld-font` 를 자식(.stage)에 정의하고 font-family 는 부모(.app)에서 읽고 있었다 —
     * CSS 변수는 아래로만 상속되므로 폰트가 영영 안 먹었는데, 설정이 저장은 되니 아무도 몰랐다.
     */
    const look = ldFrame
      ? await ldFrame.evaluate(() => {
          const box = document.querySelector('[data-part="box"]')
          const link = document.querySelector('[data-part="adminLink"]')
          return {
            font: box ? getComputedStyle(box).fontFamily : '',
            adminLink: link ? getComputedStyle(link).color : '(없음)',
          }
        })
      : { font: '', adminLink: '' }
    check('럭키드로우: 미리보기에 슬롯 폰트가 먹는다', /Paperlogy|Pretendard|Noto/.test(look.font), look.font)
    // 색을 고르는 칸이 편집기에 있는데 화면에 안 보이면 무슨 색인지 확인할 수가 없다
    check('럭키드로우: 미리보기에 관리자 링크가 보인다', look.adminLink.startsWith('rgb'), look.adminLink)
    await page.screenshot({ path: join(outDir, 'preview-luckydraw-result.png') })
  } finally {
    await dropLd()
  }
} finally {
  await browser.close()
}

console.log(failed === 0 ? `\n전부 통과 — 스크린샷: ${outDir}` : `\n${failed}개 실패`)
process.exit(failed === 0 ? 0 : 1)
