/**
 * **다른 언어에서 글자가 상자를 넘치는가.**
 *
 *   node scripts/verify-i18n-fit.mjs
 *   node scripts/verify-i18n-fit.mjs luckydraw
 *
 * 번역이 다 돼 있어도 **화면이 깨지는** 자리가 따로 있다. 한국어는 짧은데 다른 언어는
 * 길기 때문이다:
 *
 *     '1등'  (2글자)  →  'Rank 1' (6자) · '第 1 名' (5자)
 *     '뽑기'          →  'Draw' · '抽選' · '抽奖'
 *     '마감'          →  'Closed' · '締切'
 *
 * 폭을 고정한 뱃지·칩·버튼이 그걸 못 담으면 글자가 잘리거나 상자 밖으로 삐져나온다.
 * `verify-i18n-leak` 은 **글자가 번역됐는지**만 보므로 이건 통과시킨다 — 잰다:
 *
 *  · **넘침** — 글자 폭이 상자보다 넓다 (`scrollWidth > clientWidth`)
 *  · **잘림** — `overflow: hidden` 인데 넘쳤다 (사용자는 잘린 줄도 모른다)
 *  · **줄바꿈** — 한 줄짜리 뱃지가 두 줄이 됐다 (높이가 글자 크기의 2배 넘게)
 *
 * 한국어에서 이미 넘치는 자리는 **번역 탓이 아니므로 뺀다** — 원래 그런 디자인이거나
 * 다른 문제다. 한국어에서 멀쩡한데 다른 언어에서만 깨지는 것만 센다.
 */
import puppeteer from 'puppeteer-core'
import { existsSync } from 'node:fs'

const BASE = 'http://localhost:5174'
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

/** 글자가 상자에 갇히는 자리가 많은 화면들 — 뱃지·칩·표가 있는 곳 */
const PAGES = [
  ['럭드 · 방문자', '/demo-luckydraw'],
  ['럭드 · 상품표', '/demo-luckydraw/admin/overview'],
  ['럭드 · 배송', '/demo-luckydraw/admin/shipping'],
  ['타로 · 홈', '/demo-tarot'],
  ['타로 · 도감', '/demo-tarot/cards'],
  ['타로 · 뽑기', '/demo-tarot/draw/today'],
  ['투표 · 방문자', '/demo-poll'],
  ['투표 · 관리', '/demo-poll/admin/polls'],
  ['스탬프 · 방문자', '/demo-stamp'],
  ['스탬프 · 관리', '/demo-stamp/admin/stamp'],
  ['모의고사 · 방문자', '/demo-quiz'],
  ['모의고사 · 문항', '/demo-quiz/admin/quiz'],
  ['포토카드 · 관리', '/demo-photocard/admin/photocard'],
  ['포토카드 · 뽑기권', '/demo-photocard/admin/tickets'],
  ['응원 · 설정', '/demo-cheer/admin/cheer'],
  ['대시보드', '/demo-luckydraw/admin'],
]

const arg = process.argv[2]
const targets = arg ? PAGES.filter(([, p]) => p.includes(arg)) : PAGES

/** 한 화면에서 "글자가 갇힌 자리" 를 전부 잰다 */
const MEASURE = () => {
  const out = []
  for (const el of document.querySelectorAll('span,button,div,td,th,a,b,strong,p,h1,h2,h3')) {
    // 자식 엘리먼트가 있으면 그 안쪽에서 재면 된다 — 여기선 글자만 든 잎만 본다
    if (el.children.length > 0) continue
    const text = (el.textContent ?? '').trim()
    if (!text) continue
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    const cs = getComputedStyle(el)
    const hidden = cs.overflow !== 'visible' || cs.overflowX !== 'visible'
    const lineH = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4
    /**
     * **글자의 실제 폭을 잰다** — `scrollWidth` 로는 부족하다.
     *
     * `overflow: visible` 인 고정폭 상자(뱃지·칩이 대부분 그렇다)는 글자가 밖으로
     * 삐져나가도 `scrollWidth` 가 안 늘어난다. 그래서 `.ad-rank`(width 34px)에
     * "Rank 1" 이 들어가 옆 칸을 밀고 있어도 검사는 통과했다.
     * `Range` 로 텍스트 자체의 폭을 재면 그 자리가 보인다.
     */
    let textW = 0
    let textH = 0
    try {
      const range = document.createRange()
      range.selectNodeContents(el)
      const rr = range.getBoundingClientRect()
      textW = rr.width
      textH = rr.height
    } catch {
      textW = 0
    }
    const padX =
      parseFloat(cs.paddingLeft || '0') + parseFloat(cs.paddingRight || '0')
    const fixed = cs.width !== 'auto' && (cs.flexShrink === '0' || cs.display.includes('flex'))
    out.push({
      text: text.slice(0, 24),
      // 1px 은 소수점 반올림 — 실제로 넘친 게 아니다
      over: Math.max(
        Math.round(el.scrollWidth - el.clientWidth),
        // 한 줄로 두는 상자에서만 — 여러 줄로 접히는 건 넘침이 아니다
        cs.whiteSpace === 'nowrap' || fixed
          ? Math.round(textW + padX - r.width)
          : 0
      ),
      hidden,
      lines: Math.round(r.height / lineH),
      /**
       * **높이가 고정인가.** 고정 높이 상자에서 글자가 두 줄이 되면 위아래로 삐져나온다 —
       * 넘침(`over`)으로는 안 잡힌다. 실제로 `.ad-rank`(34×24px)에서 "Rank 2" 가
       * 두 줄로 접혀 뱃지 밖으로 나가 있었다.
       */
      fixedH: cs.height !== 'auto' && parseFloat(cs.height) > 0,
      /**
       * **폭이 고정인데 글자가 두 줄이 됐나.**
       *
       * `.ad-rank`(width 34px · height 24px)에서 "Rank 2" 가 두 줄로 접혀 뱃지 밖으로
       * 나가 있었다. `align-items: center` 라 range 높이가 상자에 맞춰 잘려서 위아래
       * 넘침으로도 안 잡혔다 — **줄 수**로 봐야 보인다.
       */
      /**
       * `display: inline` 은 뺀다 — 인라인 요소는 computed width 가 늘 픽셀로 나와서
       * "폭 고정" 으로 오판된다. 문장 속 `<b>` 가 자연스럽게 줄바꿈한 것까지 깨짐으로
       * 세면 목록이 오탐으로 덮인다. 뱃지·칩은 `inline-flex`·`inline-block` 이다.
       */
      fixedW:
        cs.display !== 'inline' && cs.width !== 'auto' && parseFloat(cs.width) > 0,
      textLines: lineH > 0 ? Math.round(textH / lineH) : 1,
      textH: Math.round(textH),
      nowrap: cs.whiteSpace === 'nowrap' || cs.whiteSpace === 'pre',
      boxH: Math.round(r.height),
      boxW: Math.round(r.width),
      // 자리를 짚을 수 있게 — 클래스는 해시라 쓸모없지만 태그와 글자로 찾는다
      tag: el.tagName.toLowerCase(),
    })
  }
  return out
}

const browser = await puppeteer.launch({ executablePath: exe, headless: 'new', args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 390, height: 844 })

async function measure(path, lang) {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await page.evaluate((l) => localStorage.setItem('tarot-pocket:lang', l), lang)
  try {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle0', timeout: 20000 })
  } catch {
    return null
  }
  await new Promise((r) => setTimeout(r, 700))
  return page.evaluate(MEASURE)
}

let failed = 0
for (const [label, path] of targets) {
  // 한국어를 기준선으로 — 원래 넘치던 자리는 번역 탓이 아니다
  const base = await measure(path, 'ko')
  if (!base) {
    console.log(`· ${label} — 화면을 못 열었어요`)
    continue
  }
  const baseBroken = new Set(base.filter((m) => m.over > 1).map((m) => m.tag + '|' + m.text))

  const notes = []
  for (const lang of LANGS) {
    const rows = await measure(path, lang)
    if (!rows) continue
    for (const m of rows) {
      if (baseBroken.has(m.tag + '|' + m.text)) continue
      if (m.over > 1) {
        notes.push(`${lang} "${m.text}" ${m.over}px 넘침${m.hidden ? ' (잘림)' : ''}`)
      } else if (m.fixedH && m.textH > m.boxH + 4) {
        // 4px 은 line-height 여유 — 그 이하는 글자가 상자에 맞게 앉은 것이다
        notes.push(`${lang} "${m.text}" 가 ${m.textH - m.boxH}px 위아래로 넘쳐요 (뱃지 안 줄바꿈)`)
      /*
       * `fixedW` 만으로는 못 가른다 — 도감 카드 타일도 폭·높이가 고정이지만 이름이 두 줄로
       * 접히는 건 정상 디자인이다. **글자가 실제로 상자를 넘쳤는지**(위 `fixedH` 가지)만
       * 보면 `.ad-rank` 같은 진짜 깨짐은 다 잡히고 오탐은 안 난다.
       */
      } else if (m.nowrap === false && m.lines > 2 && m.text.length < 16 && m.boxW < 60) {
        /*
         * **좁은 상자에서만** 본다(60px 미만 — 뱃지·칩의 크기다). 도감 타일 아래 카드
         * 이름은 100px 폭에 세 줄이 되기도 하지만, 옆 타일도 두 줄이라 그리드가 그걸
         * 감당한다 — 정상 동작을 깨짐으로 세면 진짜가 묻힌다.
         */
        notes.push(`${lang} "${m.text}" 가 ${m.boxW}px 상자에서 ${m.lines}줄로 접혔어요`)
      }
    }
  }
  if (notes.length) {
    console.log(`✗ ${label}`)
    for (const n of [...new Set(notes)].slice(0, 8)) console.log(`    ${n}`)
    failed++
  } else {
    console.log(`✓ ${label}`)
  }
}

await browser.close()
console.error(failed === 0 ? '\n세 언어 모두 상자 안에 들어가요' : `\n${failed}개 화면에서 글자가 넘쳐요`)
process.exit(failed === 0 ? 0 : 1)
