/**
 * **정렬을 고르면 로고·제목·부제가 함께 그쪽으로 가는가.**
 *
 *   node scripts/verify-header-align.mjs
 *
 * `logoAlign` 은 셋 다 같은 뜻이어야 한다 — 왼쪽이면 왼쪽 끝, 가운데면 화면 정가운데,
 * 오른쪽이면 오른쪽 끝. 그런데 `text-align` 만 걸어 두면 **글자가 자기 상자 안에서만**
 * 움직이고 상자는 왼쪽에 붙어 있어서, 화면으로는 아무 일도 안 일어난 것처럼 보인다.
 * 포토존에서 '오른쪽' 을 골라도 왼쪽에 붙어 있었던 게 그 경우다.
 *
 * 그리고 **부제가 같이 안 움직이는** 사고가 따로 있다. 부제를 헤더 밖에 그리면
 * (`<p className={styles.intro}>` 를 `ServiceHeader` 뒤에 두면) 제목만 움직이고 부제는
 * 왼쪽에 남는다 — 세 서비스가 그랬다.
 *
 * 그래서 셋을 다 재고, **제목과 부제의 어긋남**까지 본다.
 */
import puppeteer from 'puppeteer-core'
import { existsSync } from 'node:fs'

const exe = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => existsSync(p))
if (!exe) {
  console.error('크롬을 못 찾았어요')
  process.exit(1)
}

const PAGES = [
  ['롤링페이퍼', '/demo-rolling'],
  ['소원나무', '/demo-wish'],
  ['포토존', '/demo-photozone'],
  ['실시간 투표', '/demo-poll'],
  ['방문 스탬프', '/demo-stamp'],
  ['포토카드', '/demo-photocard'],
  ['영상회 응원', '/demo-cheer'],
]

let failed = 0
const bad = (label, note) => {
  console.log(`✗ ${label} — ${note}`)
  failed++
}

const browser = await puppeteer.launch({ executablePath: exe, headless: 'new', args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 390, height: 900 })
await page.goto('http://localhost:5174/', { waitUntil: 'domcontentloaded' })
await page.evaluate(() => localStorage.setItem('tarot-pocket:lang', 'ko'))

for (const [name, route] of PAGES) {
  await page.goto(`http://localhost:5174${route}`, { waitUntil: 'networkidle0', timeout: 20000 })
  await new Promise((r) => setTimeout(r, 700))

  for (const align of ['left', 'center', 'right']) {
    const got = await page.evaluate((a) => {
      const h = document.querySelector('header:has(> .svc-lang)')
      if (!h) return null
      h.setAttribute('data-align', a)
      // `mark` 변형은 안쪽 상자에도 정렬이 걸린다 — 그 상자까지 같이 바꿔 준다
      h.querySelectorAll('[data-align]').forEach((e) => {
        if (e !== h) {
          e.setAttribute('data-align', a)
          e.style.textAlign = a
        }
      })
      const vw = document.documentElement.clientWidth
      const box = (el) => {
        if (!el) return null
        const r = el.getBoundingClientRect()
        // 글자의 실제 폭 (블록 상자가 아니라)
        const range = document.createRange()
        range.selectNodeContents(el)
        const rr = range.getBoundingClientRect()
        return rr.width > 0 ? rr : r
      }
      const t = box(h.querySelector('h1'))
      const s = box(h.querySelector('p'))
      return {
        vw,
        title: t ? { l: Math.round(t.left), r: Math.round(vw - t.right), c: Math.round((t.left + t.right) / 2) } : null,
        sub: s ? { l: Math.round(s.left), r: Math.round(vw - s.right), c: Math.round((s.left + s.right) / 2) } : null,
      }
    }, align)

    if (!got) {
      console.log(`· ${name} — 헤더가 없어요 (건너뜀)`)
      break
    }
    if (!got.title) continue

    const label = `${name} · ${align}`
    const { l, r } = got.title
    /**
     * **오른쪽 끝은 고르개 자리다.**
     *
     * 헤더는 오른쪽에 `--svc-lang-gutter`(약 94px)를 비워 둔다 — 안 비우면 제목이
     * 고르개 밑으로 파고든다(`components.css`). 그래서 '오른쪽' 정렬의 오른쪽 여백은
     * 20 이 아니라 94 근처가 **정답**이다. 여기서 그걸 오해하고 실패로 세면,
     * 고치는 방향이 "제목을 고르개 밑으로 밀어 넣기" 가 된다.
     */
    const GUTTER = 94
    if (align === 'left' && l > 30) bad(label, `왼쪽인데 왼쪽 여백이 ${l}px 이에요`)
    if (align === 'right' && r > GUTTER + 12) bad(label, `오른쪽인데 오른쪽 여백이 ${r}px 이에요`)
    if (align === 'center' && Math.abs(got.title.c - got.vw / 2) > 12) {
      bad(label, `가운데인데 화면 중심에서 ${Math.round(got.title.c - got.vw / 2)}px 벗어났어요`)
    }

    /**
     * **부제가 제목과 같은 쪽으로 갔나** — 헤더 밖에 그리면 여기서 걸린다.
     *
     * 가운데일 땐 **중심끼리** 견줘야 한다. 글자 길이가 다르면 왼쪽 끝은 당연히 다르다 —
     * 처음엔 그걸로 재서 멀쩡한 다섯 서비스가 전부 빨갛게 났다.
     */
    if (got.sub) {
      const same =
        align === 'center'
          ? Math.abs(got.sub.c - got.title.c)
          : align === 'right'
            ? Math.abs(got.sub.r - r)
            : Math.abs(got.sub.l - l)
      if (same > 12) bad(`${label} · 부제`, `제목과 ${same}px 어긋났어요 — 헤더 안(below)에 있나요?`)
    }
  }
}

await browser.close()
console.error(failed === 0 ? '\n정렬 셋이 로고·제목·부제에 다 먹어요' : `\n${failed}곳이 안 따라가요`)
process.exit(failed === 0 ? 0 : 1)
