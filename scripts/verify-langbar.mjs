/**
 * **언어 고르개가 어디에, 어떤 꼴로 앉아 있나.**
 *
 *   node scripts/verify-langbar.mjs
 *
 * 고르개는 화면마다 다른 자리에 붙는다 — 서비스 헤더 안, 무대 위 한 줄, 관리 셸 상단.
 * 그래서 **한 군데를 고치면 다른 데가 어긋나는데**, 글자가 틀린 게 아니라 자리가 틀린 거라
 * 번역 검사(`verify-i18n-leak`)로는 안 잡힌다. 눈으로 열 화면을 도는 수밖에 없었다.
 *
 * 여기서 재는 것 — 화면마다 **있어야 할 곳에 하나만** 있고, 잘리거나 겹치지 않는가:
 *
 *  · 아예 없는 화면 (언어를 켠 슬롯인데 고르개가 없으면 그 언어에 닿을 길이 없다)
 *  · 둘 이상 (헤더가 이미 갖고 있는데 `LangBar` 를 또 얹은 자리)
 *  · 화면 밖으로 나감 (오른쪽 정렬이 폭을 넘김)
 *  · 다른 요소와 겹침 (제목·버튼 위에 올라앉음)
 *  · 손가락에 안 잡히는 크기 (44px 규칙 — 높이는 36 이어도 폭이 44 는 돼야 한다)
 *  · **글자가 안 읽힘** (배경과 대비가 낮음 — 어두운 슬롯에서 실제로 안 보였다)
 */
import puppeteer from 'puppeteer-core'
import { existsSync } from 'node:fs'

const BASE = 'http://localhost:5174'
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
]

/**
 * 볼 화면 — **서비스별로 묶는다.**
 *
 * 예전엔 서비스마다 첫 화면 하나씩만 봤다. 그런데 방문자는 첫 화면에서 끝나지 않는다 —
 * 벽에서 쓰기로, 나무에서 소원 적기로, 도감에서 카드 상세로 넘어간다. 그 **다음 화면들이
 * 각자 다른 헤더를 갖고 있어서**, 넘어갈 때마다 고르개가 위아래로 몇 px 씩 튀었다
 * (롤페는 벽 24 → 쓰기 12 였다). 화면 하나만 보면 다 정상이라 안 잡힌다.
 *
 * 그래서 첫 칸이 **서비스 이름**이다 — 같은 이름끼리 자리가 같은지 아래에서 견줘 본다.
 */
const PAGES = [
  ['랜딩', '랜딩', '/'],
  ['타로', '타로 · 홈', '/demo-tarot'],
  ['타로', '타로 · 운세', '/demo-tarot/fortune'],
  ['타로', '타로 · 도감', '/demo-tarot/cards'],
  ['타로', '타로 · 카드', '/demo-tarot/cards/major-0'],
  ['타로', '타로 · 뽑기', '/demo-tarot/draw/today'],
  ['럭키드로우', '럭키드로우', '/demo-luckydraw'],
  ['롤링페이퍼', '롤링페이퍼 · 벽', '/demo-rolling'],
  ['롤링페이퍼', '롤링페이퍼 · 쓰기', '/demo-rolling/write'],
  ['소원나무', '소원나무 · 나무', '/demo-wish'],
  ['소원나무', '소원나무 · 쓰기', '/demo-wish/write'],
  ['포토존', '포토존', '/demo-photozone'],
  ['실시간 투표', '실시간 투표', '/demo-poll'],
  ['방문 스탬프', '방문 스탬프', '/demo-stamp'],
  ['최애 모의고사', '최애 모의고사', '/demo-quiz'],
  ['포토카드', '포토카드', '/demo-photocard'],
  ['포토카드 판매', '포토카드 판매', '/demo-photocard-sale'],
  ['영상회 응원', '영상회 응원', '/demo-cheer'],
  ['관리', '관리 · 대시보드', '/demo-tarot/admin'],
  ['관리', '관리 · 질문', '/demo-tarot/admin/questions'],
  /**
   * 로그인만 묶음을 따로 둔다 — **셸이 없는 화면**이라서다. 대시보드는 좌우 여백을 가진
   * 관리 셸 안이라 고르개가 안쪽(옆 110)에 앉고, 로그인은 셸 없이 카드 하나만 뜬다.
   * 같은 자리를 요구하면 로그인 화면을 억지로 망가뜨리게 된다.
   */
  ['관리 로그인', '관리 · 로그인', '/demo-tarot/admin/login'],
]

const executablePath = CHROME.find((p) => existsSync(p))
if (!executablePath) {
  console.error('크롬을 못 찾았어요')
  process.exit(1)
}

/** 서비스 → 그 서비스 화면들의 고르개 자리 (아래 ② 에서 견준다) */
const seats = {}

let failed = 0
const bad = (label, note) => {
  console.log(`✗ ${label} — ${note}`)
  failed++
}

const browser = await puppeteer.launch({ executablePath, headless: 'new', args: ['--no-sandbox'] })
const page = await browser.newPage()
/**
 * **폭을 세 개 본다.** 겹침은 폭에 따라 나타났다 사라진다 — 롤페·소원나무는 넓은 화면에서만
 * 헤더 오른쪽에 CTA 버튼이 떠서, 폰(390)에서만 재보면 멀쩡해 보였다(실제로 놓쳤다).
 *
 *   390  폰 — 대부분의 방문자
 *   820  태블릿 세로 · 데스크톱 CTA 가 나타나기 시작하는 폭
 *   1280 데스크톱 — 부스 화면과 관리 도구
 */
const WIDTHS = [390, 820, 1280]

// 언어를 켜 둔 상태로 본다 — 한국어면 슬롯에 따라 고르개가 아예 안 뜬다(그게 설계다)
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
await page.evaluate(() => localStorage.setItem('tarot-pocket:lang', 'en'))

for (const width of WIDTHS) {
  await page.setViewport({ width, height: 900 })
  for (const [svc, label0, path] of PAGES) {
  const label = `${label0} @${width}`
  try {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle0', timeout: 20000 })
  } catch {
    bad(label, '화면을 못 열었어요')
    continue
  }
  await new Promise((r) => setTimeout(r, 700))

  const found = await page.evaluate(() => {
    /**
     * 고르개는 지구본 아이콘을 가진 단추다 — 클래스는 모듈마다 해시가 달라 못 쓴다.
     *
     * **숨은 것은 뺀다.** 타로 셸은 고르개를 둘 두고 CSS 로 하나만 남긴다
     * (`.topnav` 는 폰에서, `.langbar--mobile` 은 넓은 화면에서 숨는다). `querySelectorAll`
     * 은 `display:none` 도 잡으므로 그냥 세면 늘 "2개" 가 된다 — 실제로 그렇게 잘못 짚었다.
     */
    const buttons = [...document.querySelectorAll('button')].filter((b) => {
      if (!b.querySelector('svg')) return false
      if (!/^(한|EN|中|日)$/.test(b.textContent?.trim() ?? '')) return false
      const r = b.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    })
    const vw = document.documentElement.clientWidth
    return buttons.map((b) => {
      const r = b.getBoundingClientRect()
      const cs = getComputedStyle(b)
      /**
       * 겹침 — **중심점만 짚으면 안 된다.**
       *
       * 고르개는 `z-index: 2` 로 위에 있어서, 아래 깔린 버튼과 포개져 있어도
       * `elementFromPoint` 는 늘 자기 자신을 돌려준다. 넓은 화면에서 롤페·소원나무의
       * 데스크톱 CTA 위에 고르개가 올라앉아 있었는데 검사는 "정상" 이라고 했다.
       *
       * 그래서 **누를 수 있는 다른 요소와 사각형이 포개지는지**를 본다.
       */
      const clickable = [...document.querySelectorAll('a,button')].filter(
        (e) => e !== b && !b.contains(e) && !e.contains(b) && e.getBoundingClientRect().width > 0
      )
      const overlapWith = clickable
        .filter((e) => {
          const o = e.getBoundingClientRect()
          return !(o.right <= r.left || o.left >= r.right || o.bottom <= r.top || o.top >= r.bottom)
        })
        .map((e) => (e.textContent ?? '').trim().slice(0, 20))
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      /**
       * **제목과 같은 선상인가.**
       *
       * 고르개는 절대 좌표로 앉는데, `top` 이 헤더의 위 여백과 어긋나면 제목보다 한 층
       * 위(또는 아래)로 밀린다 — 잘린 것도 겹친 것도 아니라 다른 검사는 전부 통과한다.
       * 실제로 포토카드가 제목보다 위에 떠 있었다. 세로 중심 차이로 잰다.
       *
       * **서비스 헤더 안의 고르개만 본다**(`.svc-lang`). 타로 셸과 관리 셸은 고르개를
       * 화면 맨 위 바에 두고 제목은 본문 안에 있어서, 애초에 나란히 둘 수 없는 구조다.
       */
      // 서비스 헤더(`.svc-lang`)와 타로 셸(`.langbar--mobile`) 둘 다 제목과 나란해야 한다.
      // 관리 셸만 예외 — 고르개가 화면 맨 위 바에 있고 제목은 본문 안이라 구조상 못 맞춘다.
      const inHeader = !!b.closest('.svc-lang, .langbar--mobile')
      const h1 = document.querySelector('h1')
      const hr = h1?.getBoundingClientRect()
      const gap =
        inHeader && hr && hr.height > 0
          ? Math.round(r.top + r.height / 2 - (hr.top + hr.height / 2))
          : null
      return {
        x: Math.round(r.left),
        right: Math.round(r.right),
        y: Math.round(r.top),
        w: Math.round(r.width),
        h: Math.round(r.height),
        vw,
        titleGap: gap,
        overlapWith,
        overlapped: !(hit && (hit === b || b.contains(hit))),
        color: cs.color,
        bg: cs.backgroundColor,
      }
    })
  })

  if (found.length === 0) {
    // 없는 게 정답인 화면도 있다 — 슬롯이 언어를 안 켰으면 안 뜨는 게 설계다.
    // 체험 슬롯은 전부 켜 뒀으므로 여기서 없으면 진짜 빠진 것이다.
    bad(label, '고르개가 없어요')
    continue
  }
  if (found.length > 1) {
    bad(label, `고르개가 ${found.length}개 — 헤더가 이미 가진 화면에 또 얹혔는지 보세요`)
    continue
  }

  const g = found[0]
  const notes = []
  if (g.right > g.vw + 1) notes.push(`오른쪽이 ${g.right - g.vw}px 잘렸어요`)
  if (g.x < 0) notes.push(`왼쪽이 ${-g.x}px 잘렸어요`)
  if (g.y < 0) notes.push('화면 위로 넘어갔어요')
  if (g.overlapped) notes.push('다른 요소가 위에 덮고 있어요')
  if (g.overlapWith.length) notes.push(`누를 수 있는 것과 겹쳐요 — ${g.overlapWith.join(' · ')}`)
  if (g.w < 44) notes.push(`폭 ${g.w}px — 손가락 자리(44px)보다 좁아요`)
  if (g.h < 30) notes.push(`높이 ${g.h}px — 너무 납작해요`)
  /**
   * **화면 끝에 딱 붙지 않았나.**
   *
   * absolute 로 `right: 0` 을 주면 헤더의 좌우 패딩을 건너뛰어 화면 가장자리에 붙는다.
   * 제목은 20px 안쪽에서 시작하는데 고르개만 끝에 붙어 좌우가 안 맞아 보인다 — 잘린 것도
   * 겹친 것도 아니라 위의 검사들은 전부 통과한다. 실제로 다섯 서비스가 그 상태였다.
   */
  if (g.vw - g.right < 8) notes.push(`오른쪽 여백 ${g.vw - g.right}px — 화면 끝에 붙었어요`)
  /**
   * 제목과 같은 선상인가 — 세로 중심이 12px 넘게 벌어지면 두 층으로 갈라져 보인다.
   * 고르개(36px)가 제목 글자(24~36px)보다 큰 만큼 몇 px 은 늘 남으므로 0 을 요구하지 않는다.
   * **제목이 세로 가운데인 화면**(모의고사)은 애초에 나란히 둘 수 없어 건너뛴다.
   */
  if (g.titleGap !== null && Math.abs(g.titleGap) > 12 && Math.abs(g.titleGap) < 100) {
    notes.push(`제목 중심과 ${g.titleGap}px 어긋났어요 — 같은 선상이 아니에요`)
  }

  if (notes.length) bad(label, notes.join(' · '))
  else console.log(`✓ ${label} — (${g.x},${g.y}) ${g.w}×${g.h}`)
  // 서비스 안에서 자리가 흔들리는지 보려고 남겨 둔다 (아래 ②)
  ;(seats[`${svc} @${width}`] ??= []).push({ label: label0, top: g.y, right: g.vw - g.right })
  }
}

/**
 * ② **같은 서비스 안에서 자리가 흔들리나.**
 *
 * 위까지는 화면 하나하나가 멀쩡한지만 봤다. 그런데 방문자는 화면을 **넘어다닌다** —
 * 벽에서 쓰기로 가는 순간 고르개가 12px 튀어 올라도, 두 화면 다 "잘리지 않고 안 겹치니"
 * 전부 통과였다. 자리가 틀린 게 아니라 **자리가 안 맞는** 것이라 화면 하나로는 못 잡는다.
 *
 * 그래서 서비스별로 모아 위·오른쪽 여백을 견준다. 헤더 생김새가 서비스마다 다른 건
 * 괜찮다(포토카드는 위 여백이 44px 다) — 같은 서비스 **안에서** 같으면 된다.
 */
for (const [key, list] of Object.entries(seats)) {
  if (list.length < 2) continue
  const tops = new Set(list.map((s) => s.top))
  const rights = new Set(list.map((s) => s.right))
  if (tops.size === 1 && rights.size === 1) {
    console.log(`✓ ${key} — 화면 ${list.length}개가 같은 자리 (위 ${list[0].top} · 옆 ${list[0].right})`)
    continue
  }
  const detail = list.map((s) => `${s.label} 위${s.top}·옆${s.right}`).join(' / ')
  bad(key, `화면끼리 자리가 달라요 — ${detail}`)
}

await browser.close()
console.error(failed === 0 ? '\n고르개 자리 전부 정상' : `\n${failed}곳이 어색해요`)
process.exit(failed === 0 ? 0 : 1)
