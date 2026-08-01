/**
 * **서비스 헤더가 서로 같은 모양인가.**
 *
 *   node scripts/verify-header-uniform.mjs
 *
 * 일곱 서비스가 같은 부품(`ServiceHeader`)을 쓰는데 **클래스는 각자 모듈에서 준다**
 * (`classes={{ head, logo, title }}`). 그래서 부품은 하나인데 생김새는 일곱 벌이 됐다 —
 * 제목 크기가 20~26px 로 갈리고, 위아래 여백도 서비스마다 달랐다.
 *
 * 슬롯 하나에 서비스 하나라 방문자는 보통 한 화면만 본다. 그래서 **아무도 안 깨지고**,
 * 여러 서비스를 나란히 놓고 보는 최고관리자만 알아챈다. 눈으로 일곱 번 비교하는 대신 잰다.
 *
 * 재는 것: 제목·부제의 글자 크기·굵기·줄간격, 그리고 헤더의 위/좌/우 여백.
 * **값이 같기만 하면 된다** — 어떤 값이어야 하는지는 안 정한다(기준은 다수결로 잡는다).
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

/** 같은 모양이어야 하는 일곱 — 럭드·타로·모의고사는 헤더가 아니라 자기 무대를 그린다 */
const PAGES = [
  ['롤링페이퍼', '/demo-rolling'],
  ['소원나무', '/demo-wish'],
  ['포토존', '/demo-photozone'],
  ['실시간 투표', '/demo-poll'],
  ['방문 스탬프', '/demo-stamp'],
  ['포토카드', '/demo-photocard'],
  ['영상회 응원', '/demo-cheer'],
]

const browser = await puppeteer.launch({ executablePath: exe, headless: 'new', args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 390, height: 900 })
await page.goto('http://localhost:5174/', { waitUntil: 'domcontentloaded' })
await page.evaluate(() => localStorage.setItem('tarot-pocket:lang', 'ko'))

const rows = []
for (const [name, route] of PAGES) {
  await page.goto(`http://localhost:5174${route}`, { waitUntil: 'networkidle0', timeout: 20000 })
  await new Promise((r) => setTimeout(r, 700))
  const got = await page.evaluate(() => {
    const h = document.querySelector('header:has(> .svc-lang)')
    if (!h) return null
    const hs = getComputedStyle(h)
    const t = h.querySelector('h1')
    const sub = [...h.querySelectorAll('p')][0]
    const px = (v) => Math.round(parseFloat(v) || 0)
    return {
      padTop: px(hs.paddingTop),
      padSide: px(hs.paddingLeft),
      titleSize: t ? px(getComputedStyle(t).fontSize) : null,
      titleWeight: t ? getComputedStyle(t).fontWeight : null,
      subSize: sub ? px(getComputedStyle(sub).fontSize) : null,
      gap: t && sub ? Math.round(sub.getBoundingClientRect().top - t.getBoundingClientRect().bottom) : null,
      /**
       * **페이지 바깥 여백** — 헤더만 맞춰 놓고 본문이 어긋나면 화면이 통째로 삐뚤어 보인다.
       *
       * "헤더 다음 덩어리의 왼쪽 끝" 으로 재면 안 된다. 소원나무의 나무·포토존의 카메라·
       * 포토카드의 부채는 **전면 배치 무대**라 여백이라는 게 없고, 그걸 여백으로 세면
       * 175·0·25 같은 값이 나와 진짜 어긋남이 그 소음에 묻힌다.
       *
       * 그래서 **글자를 담은 블록**만 보되, `[data-stage]` 안은 건너뛴다 — 등불·도장 칸·
       * 부채처럼 좌표로 흩뿌리는 자리의 글자는 여백과 아무 상관이 없다.
       * 가장 흔한 값이 그 서비스의 기준이다.
       */
      bodyPad: (() => {
        const lefts = []
        for (const el of document.querySelectorAll('p, h2, h3, li, label')) {
          if (h.contains(el) || el.closest('[data-stage]')) continue
          const r = el.getBoundingClientRect()
          if (r.width < 40 || r.top < 0) continue
          if (!el.textContent?.trim()) continue
          lefts.push(Math.round(r.left))
        }
        if (!lefts.length) return null
        const tally = new Map()
        for (const v of lefts) tally.set(v, (tally.get(v) ?? 0) + 1)
        return [...tally].sort((a, b) => b[1] - a[1])[0][0]
      })(),
    }
  })
  if (!got) {
    console.log(`· ${name} — 헤더가 없어요 (건너뜀)`)
    continue
  }
  rows.push([name, got])
  console.log(
    `· ${name} — 제목 ${got.titleSize}px/${got.titleWeight} · 부제 ${got.subSize}px · 위 ${got.padTop} · 옆 ${got.padSide} · 사이 ${got.gap} · 본문옆 ${got.bodyPad}`
  )
}

/** 값이 갈리는 항목을 찾는다 — **다수를 기준으로 삼는다** (뭐가 옳은지는 안 정한다) */
let failed = 0
for (const key of ['titleSize', 'titleWeight', 'subSize', 'padTop', 'padSide', 'gap', 'bodyPad']) {
  const seen = rows.map(([n, g]) => [n, g[key]]).filter(([, v]) => v !== null)
  const kinds = new Map()
  for (const [n, v] of seen) kinds.set(String(v), [...(kinds.get(String(v)) ?? []), n])
  if (kinds.size <= 1) continue
  const sorted = [...kinds].sort((a, b) => b[1].length - a[1].length)
  const [base, baseNames] = sorted[0]
  const odd = sorted.slice(1).map(([v, ns]) => `${ns.join('·')}=${v}`)
  console.log(`✗ ${key} — 다수(${baseNames.length}개)는 ${base} 인데 ${odd.join(' / ')}`)
  failed++
}

await browser.close()
console.error(failed === 0 ? '\n일곱 헤더가 같은 모양이에요' : `\n${failed}개 항목이 서비스마다 달라요`)
process.exit(failed === 0 ? 0 : 1)
