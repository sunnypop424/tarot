/** 임시 — 배포된 랜딩이 이번 변경분을 담고 있는지 실제로 열어 확인한다. */
import puppeteer from 'puppeteer-core'
import { existsSync } from 'node:fs'

const exe = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p))
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const URL_ = 'https://tarot-btjp.vercel.app'

const b = await puppeteer.launch({ executablePath: exe, headless: 'new', args: ['--no-sandbox'] })
const p = await b.newPage()
const errs = []
p.on('pageerror', (e) => errs.push(String(e)))
await p.setViewport({ width: 1280, height: 1000, deviceScaleFactor: 2 })
await p.goto(URL_, { waitUntil: 'networkidle0' })
await wait(2500)

await p.evaluate(() =>
  [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === '포토카드 뽑기')?.click()
)
await wait(2500)

const t = await p.evaluate(() => document.body.innerText)
const checks = [
  ['방문자 폰', true],
  ['손님', false],
  ['포토카드 뽑기를 직접 체험', true],
  ['새 탭에서 직접 열어', true],
  ['제작 · 검수', true],
  ['스태프 기기는 전날 준비', true],
  ['선물로 교환', true],
]
for (const [s, want] of checks)
  console.log(`  ${t.includes(s) === want ? '✓' : '✗'} ${want ? '' : '없어야: '}${s}`)

const man = await (async () => {
  const cdp = await p.createCDPSession()
  await cdp.send('Page.enable')
  return cdp.send('Page.getAppManifest')
})()
console.log(`  매니페스트(루트) — ${man.data ? '있음' : '없음'} (랜딩은 슬롯이 아니라 없는 게 정상)`)
console.log(`  콘솔 에러 ${errs.length}`)
await p.screenshot({ path: 'C:/tmp/shots/prod.png' })

// 슬롯 하나 — 매니페스트·아이콘
const p2 = await b.newPage()
await p2.goto(`${URL_}/demo-luckydraw/admin`, { waitUntil: 'networkidle0' })
await wait(2500)
const cdp2 = await p2.createCDPSession()
await cdp2.send('Page.enable')
const m2 = await cdp2.send('Page.getAppManifest')
const d = m2.data ? JSON.parse(m2.data) : null
console.log(`  /demo-luckydraw/admin — 이름 "${d?.name}" · start_url ${d?.start_url} · 아이콘 ${d?.icons?.length ?? 0}개`)
await b.close()
