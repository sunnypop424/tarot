/**
 * 포토존 검증 — **이 스크립트의 존재 이유는 "안 되는 걸 확인" 하는 것이다.**
 *
 *   node scripts/verify-photozone.mjs <스크린샷 디렉터리>
 *   (개발 서버 5174 가 떠 있어야 한다)
 *
 * 다른 서비스의 verify 는 "되나" 를 본다. 포토존은 서버에 테이블도 RPC 도 없어서 볼 게 없다 —
 * 대신 **열려선 안 되는 것 셋**을 실제로 찔러 본다:
 *
 *  1. **anon 이 Storage 에 못 쓴다** (0002 정책 회귀). 방문자 사진이 서버에 올라갈 길이
 *     생기는 순간 이 서비스는 미성년 팬의 얼굴 사진을 호스팅하게 된다. 코드리뷰가 아니라
 *     스크립트가 지켜야 하는 계약이다.
 *  2. **`<img>` 가 SavableImage 한 곳에서만 나온다** (CLAUDE.md 의 예외가 새지 않았나).
 *  3. **캔버스가 오염되지 않는다** — `toDataURL()` 이 안 던지는 것 자체가 회귀 검사다.
 *     `crossOrigin` 을 빠뜨리면 화면은 멀쩡하고 저장 순간에만 죽는다.
 *
 * 그리고 되는 것 하나: **가짜 카메라로 실제로 찍어 합성된 픽셀이 나오는가.**
 */

import puppeteer from 'puppeteer-core'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checkNoImg } from './verify-noimg.mjs'

const env = {}
try {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim())
    if (m) env[m[1]] = m[2]
  }
} catch {
  /* .env.local 이 없으면 local 어댑터 — Storage 검사는 건너뛴다 */
}

const URL_ = env.VITE_SUPABASE_URL
const ANON = env.VITE_SUPABASE_ANON_KEY
const OWNER_EMAIL = 'owner@example.com'
const OWNER_PASSWORD = env.SEED_PASSWORD ?? 'tarot1234'
const SLUG = 'photozone-verify'
const BASE = 'http://localhost:5174'
const outDir = process.argv[2] ?? '.'

const chrome = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p))

let failed = 0
const check = (name, ok, detail = '') => {
  if (!ok) failed++
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

// ══ 1. 소스 규칙: <img> 는 SavableImage 에서만 ══════
//
// **검사 본체는 `verify-noimg.mjs` 에 있다.** 예전엔 여기 같은 검사를 따로 갖고 있었는데
// 그쪽은 `//`·`*` 로 시작하는 줄만 주석으로 쳐서, JSX 주석 안의 `<img>` 를 코드로 읽고
// 오탐을 냈다(실제로 그랬다). 같은 검사가 둘이면 한쪽만 고치는 날이 온다.
for (const r of checkNoImg()) check(r.name, r.ok, r.detail)

// ══ 2. anon 은 Storage 에 못 쓴다 (0002 정책 회귀) ══
let OWNER = null
if (URL_ && ANON) {
  const auth = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'content-type': 'application/json' },
    body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASSWORD }),
  })
  if (!auth.ok) {
    console.error('최고관리자 로그인 실패 — supabase/seed.sql 의 씨앗 계정과 SEED_PASSWORD 를 확인하세요')
    process.exit(1)
  }
  const { access_token } = await auth.json()
  OWNER = { apikey: ANON, authorization: `Bearer ${access_token}` }

  // 1×1 투명 PNG
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  )

  const anonPut = await fetch(`${URL_}/storage/v1/object/slots/${SLUG}/photozone/anon-should-fail.png`, {
    method: 'POST',
    headers: { apikey: ANON, 'content-type': 'image/png' },
    body: png,
  })
  check(
    '**anon 은 슬롯 버킷에 못 쓴다** (방문자 사진이 서버로 갈 길이 없다)',
    !anonPut.ok,
    `HTTP ${anonPut.status}${anonPut.ok ? ' — 올라갔다!! 0002 정책이 깨졌다' : ''}`
  )

  // 최고관리자는 올릴 수 있어야 한다 (프레임은 최고관리자 자산)
  const ownerPut = await fetch(`${URL_}/storage/v1/object/slots/${SLUG}/photozone/owner-ok.png`, {
    method: 'POST',
    headers: { ...OWNER, 'content-type': 'image/png' },
    body: png,
  })
  check('최고관리자는 프레임을 올릴 수 있다', ownerPut.ok, ownerPut.ok ? '' : `HTTP ${ownerPut.status}`)

  // 방금 올린 프레임이 anon 에게 **공개로 읽혀야** 한다 (방문자 화면이 그려야 하므로)
  const pub = await fetch(`${URL_}/storage/v1/object/public/slots/${SLUG}/photozone/owner-ok.png`)
  check('올린 프레임은 방문자에게 공개로 읽힌다', pub.ok, `HTTP ${pub.status}`)

  // CORS 헤더가 와야 캔버스 합성이 된다 — 없으면 toBlob 이 터진다
  check(
    'Storage 응답에 CORS 허용이 붙는다 (캔버스 합성의 전제)',
    pub.headers.get('access-control-allow-origin') === '*',
    String(pub.headers.get('access-control-allow-origin'))
  )

  await fetch(`${URL_}/storage/v1/object/slots/${SLUG}/photozone/owner-ok.png`, {
    method: 'DELETE',
    headers: OWNER,
  })
} else {
  console.log('· Supabase 미설정 — Storage 정책 검사를 건너뜁니다')
}

// ══ 3. 브라우저: 가짜 카메라로 찍고 합성한다 ═══════
{
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-gpu',
      '--hide-scrollbars',
      // 권한 프롬프트 자동 허용 + 움직이는 가짜 비디오 소스
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
    ],
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

  /**
   * 화면을 열지 않고 **모듈만 불러** 합성을 돌린다 — dev 서버가 TS 를 변환해 준다.
   * 진짜 슬롯을 만들지 않아도 `compose.ts` 의 계약(오염 없음·크기·저장 가능)을 볼 수 있다.
   */
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' })

  const composed = await page.evaluate(async (origin) => {
    const m = await import('/src/lib/compose.ts')

    // 원격(= 다른 오리진처럼 취급되는) 이미지를 캔버스에 그려 오염 여부를 본다.
    // dev 서버가 내주는 파일이라 실제로 같은 오리진이지만, loadForCanvas 의 crossOrigin·
    // 캐시 우회 경로를 그대로 타므로 회귀는 잡힌다.
    const frame = await m.loadForCanvas(`${origin}/favicon.svg`).catch(() => null)

    // 가짜 "사진" — 캔버스로 만든 단색 이미지
    const src = document.createElement('canvas')
    src.width = 600
    src.height = 800
    const sctx = src.getContext('2d')
    sctx.fillStyle = '#3355ff'
    sctx.fillRect(0, 0, 600, 800)

    const out = m.composeFrame({
      photo: { source: src, width: 600, height: 800 },
      frame,
      width: 300,
      height: 400,
    })

    let tainted = false
    let dataUrlLen = 0
    try {
      dataUrlLen = out.toDataURL().length
    } catch (e) {
      tainted = true
    }

    const result = await m.mint(out)
    const px = out.getContext('2d').getImageData(10, 10, 1, 1).data

    return {
      tainted,
      dataUrlLen,
      w: result.width,
      h: result.height,
      blobType: result.blob.type,
      blobSize: result.blob.size,
      isBlobUrl: result.url.startsWith('blob:'),
      corner: [px[0], px[1], px[2]],
      frameLoaded: !!frame,
    }
  }, BASE)

  check('프레임을 캔버스용으로 받는다 (loadForCanvas)', composed.frameLoaded)
  check(
    '**캔버스가 오염되지 않는다** (toDataURL 이 안 던진다)',
    !composed.tainted && composed.dataUrlLen > 100,
    composed.tainted ? 'SecurityError — crossOrigin 회귀!' : `${composed.dataUrlLen}자`
  )
  check('합성 크기가 요청한 값 그대로다', composed.w === 300 && composed.h === 400, `${composed.w}×${composed.h}`)
  check('사진이 실제로 그려졌다 (좌상단 픽셀)', composed.corner.join(',') === '51,85,255', composed.corner.join(','))
  check('결과가 PNG blob 이다', composed.blobType === 'image/png' && composed.blobSize > 0, `${composed.blobSize}B`)
  check(
    '결과 URL 이 blob: 이다 (원본 주소가 새지 않는다)',
    composed.isBlobUrl,
    composed.isBlobUrl ? '' : '원격 URL 이 그대로 노출됐다'
  )

  // 상한 — 큰 프레임이 와도 2048px 를 넘지 않는다 (폰에서 캔버스가 죽는다)
  const capped = await page.evaluate(async () => {
    const m = await import('/src/lib/compose.ts')
    const src = document.createElement('canvas')
    src.width = 100
    src.height = 100
    const c = m.composeFrame({
      photo: { source: src, width: 100, height: 100 },
      width: 5000,
      height: 4000,
    })
    return { w: c.width, h: c.height }
  })
  check('아주 큰 출력은 2048px 로 자른다', capped.w === 2048 && capped.h === 1638, `${capped.w}×${capped.h}`)

  // EXIF·업로드 경로 (createImageBitmap) 가 실제로 도는지
  const fileRoute = await page.evaluate(async () => {
    const m = await import('/src/lib/compose.ts')
    const cv = document.createElement('canvas')
    cv.width = 40
    cv.height = 60
    const blob = await new Promise((r) => cv.toBlob(r, 'image/png'))
    const photo = await m.loadFile(new File([blob], 'a.png', { type: 'image/png' }))
    return { w: photo.width, h: photo.height }
  })
  check('업로드한 파일을 연다 (loadFile)', fileRoute.w === 40 && fileRoute.h === 60, `${fileRoute.w}×${fileRoute.h}`)

  // 카메라 — 가짜 장치로 실제 스트림이 열리는가
  const cam = await page.evaluate(async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
      const n = s.getVideoTracks().length
      s.getTracks().forEach((t) => t.stop())
      return { ok: n > 0, n }
    } catch (e) {
      return { ok: false, n: String(e) }
    }
  })
  check('가짜 카메라로 스트림이 열린다', cam.ok, String(cam.n))

  check('콘솔 에러가 없다', errors.length === 0, errors.slice(0, 2).join(' / '))

  // ══ 4. 진짜 슬롯을 만들어 화면을 끝까지 태운다 ═══
  //
  // 위까지는 모듈 계약이고, 여기부터는 **방문자가 실제로 겪는 흐름**이다:
  // 프레임 고르기 → 촬영 → 결과. 빌드가 통과해도 이게 안 되면 서비스가 없는 것이다.
  if (OWNER) {
    const rest = (p, init = {}) => fetch(`${URL_}/rest/v1/${p}`, init)
    const del = () => rest(`slots?slug=eq.${SLUG}`, { method: 'DELETE', headers: OWNER })
    await del()

    // 가운데가 뚫린 진짜 프레임을 만들어 올린다 (테두리만 불투명 — 사진이 구멍으로 비쳐야 한다)
    const frameData = await page.evaluate(() => {
      const c = document.createElement('canvas')
      c.width = 300
      c.height = 400
      const x = c.getContext('2d')
      x.fillStyle = '#e8306a'
      x.fillRect(0, 0, 300, 400)
      x.clearRect(24, 24, 252, 352) // ← 구멍
      return c.toDataURL('image/png')
    })
    const frameBytes = Buffer.from(frameData.split(',')[1], 'base64')

    const up = await fetch(`${URL_}/storage/v1/object/slots/${SLUG}/photozone/f1.png`, {
      method: 'POST',
      // upsert — 앞선 실행이 중간에 죽어 파일이 남아 있어도 다음 실행이 막히면 안 된다
      headers: { ...OWNER, 'content-type': 'image/png', 'x-upsert': 'true' },
      body: frameBytes,
    })
    const frameUrl = `${URL_}/storage/v1/object/public/slots/${SLUG}/photozone/f1.png`
    check('검증용 프레임을 올린다', up.ok, up.ok ? '' : `HTTP ${up.status}`)

    const mk = await rest('slots', {
      method: 'POST',
      headers: { ...OWNER, 'content-type': 'application/json', prefer: 'return=minimal' },
      body: JSON.stringify({
        slug: SLUG,
        name: '포토존 검증',
        service: 'photozone',
        theme: { colors: {}, shape: {}, assets: {} },
        event: {},
        photozone: {
          title: '포토존 검증',
          frames: [{ id: 'f1', name: '정면컷', src: frameUrl, ratio: 300 / 400 }],
        },
      }),
    })
    check('포토존 슬롯을 만든다', mk.ok, mk.ok ? '' : await mk.text())

    if (mk.ok) {
      const ctx = browser.defaultBrowserContext()
      await ctx.overridePermissions(BASE, ['camera'])

      await page.goto(`${BASE}/${SLUG}`, { waitUntil: 'networkidle0' })
      await new Promise((r) => setTimeout(r, 600))

      const frames = await page.$$eval('[data-frames] button', (b) => b.length)
      check('프레임 목록이 뜬다', frames === 1, `${frames}개`)
      await page.screenshot({ path: join(outDir, 'photozone-1-ready.png') })

      await page.click('[data-shoot]')
      // getUserMedia 승인 + 첫 프레임이 흐를 시간
      await new Promise((r) => setTimeout(r, 1800))

      const live = await page.evaluate(() => {
        const v = document.querySelector('video')
        return { has: !!v, w: v?.videoWidth ?? 0, playing: !!v && !v.paused }
      })
      check('카메라 프리뷰가 흐른다', live.has && live.w > 0 && live.playing, JSON.stringify(live))
      await page.screenshot({ path: join(outDir, 'photozone-2-live.png') })

      await page.click('[data-shutter]')
      await page.waitForSelector('[data-savable]', { timeout: 8000 }).catch(() => {})

      const shot = await page.evaluate(() => {
        const img = document.querySelector('[data-savable]')
        if (!img) return null
        return { src: img.getAttribute('src'), w: img.naturalWidth, h: img.naturalHeight }
      })
      check('촬영하면 결과 이미지가 나온다', !!shot, shot ? `${shot.w}×${shot.h}` : '안 나왔다')
      check(
        '결과가 프레임 비율(300×400)로 합성됐다',
        shot?.w === 300 && shot?.h === 400,
        shot ? `${shot.w}×${shot.h}` : '—'
      )
      check(
        '결과 src 가 blob: 이다 (Storage 원본 주소가 아니다)',
        !!shot?.src?.startsWith('blob:'),
        shot?.src?.slice(0, 24)
      )

      // **프레임이 실제로 얹혔는가** — 화면 캡처로는 못 본다. 픽셀을 직접 본다.
      const px = await page.evaluate(async () => {
        const img = document.querySelector('[data-savable]')
        const bmp = await createImageBitmap(await (await fetch(img.src)).blob())
        const c = document.createElement('canvas')
        c.width = bmp.width
        c.height = bmp.height
        c.getContext('2d').drawImage(bmp, 0, 0)
        const at = (x, y) => [...c.getContext('2d').getImageData(x, y, 1, 1).data].slice(0, 3)
        return { border: at(6, 6), center: at(150, 200) }
      })
      check(
        '**프레임 테두리가 결과에 찍혔다** (232,48,106)',
        px.border.join(',') === '232,48,106',
        px.border.join(',')
      )
      check(
        '가운데는 프레임이 아니라 사진이다 (구멍이 뚫렸다)',
        px.center.join(',') !== '232,48,106',
        px.center.join(',')
      )
      await page.screenshot({ path: join(outDir, 'photozone-3-result.png') })

      // 방문자 화면에 결과물 말고 다른 <img> 가 없어야 한다
      const imgs = await page.$$eval('img', (els) => els.map((e) => e.dataset.savable ?? 'BARE'))
      check('화면의 `<img>` 는 결과물 하나뿐이다', imgs.every((v) => v !== 'BARE'), imgs.join(','))
    }

    await fetch(`${URL_}/storage/v1/object/slots/${SLUG}/photozone/f1.png`, { method: 'DELETE', headers: OWNER })
    await del()
    const left = await rest(`slots?slug=eq.${SLUG}&select=slug`, { headers: OWNER })
    check('검증이 남긴 게 없다', left.ok && (await left.json()).length === 0)
  }

  await browser.close()
}

console.log(failed === 0 ? '\n전부 통과' : `\n${failed}개 실패`)
process.exit(failed === 0 ? 0 : 1)
