import { loadForCanvas, mint, type ResultImage } from '@/lib/compose'

/**
 * 칭호 카드를 캔버스로 그린다 — **결과 화면에 보이는 카드와 같은 그림**.
 *
 * `compose.ts` 에 안 넣은 이유: 거기는 "사진 + 프레임 + 워터마크" 라는 한 가지 합성만 알고,
 * 글자를 그리는 건 그 모듈의 일이 아니다. `mint()` 가 공개돼 있으니 각 서비스가 자기
 * 캔버스를 만들어 발행하면 된다 — 그게 `ResultImage` 로 가는 두 번째 경로다.
 *
 * **DPR 을 안 따른다** (`compose.ts` 와 같은 규칙): 출력 크기를 1080×1145 로 고정한다.
 * 화면 배율을 곱하면 같은 카드가 폰마다 다른 해상도로 저장되고 그게 "왜 화질이 다르냐" 가 된다.
 * 1080 은 인스타·트위터가 리사이즈 없이 받는 폭이다.
 */

const W = 1080
/** 시안 카드 비율 1 : 1.06 */
const H = Math.round(W * 1.06)

export interface TitleCardInput {
  eventTitle: string
  kicker: string
  title: string
  correct: number
  count: number
  /** 'YYYY.MM.DD' */
  date: string
  footer: string
  logo?: string
  colors: { bg: string; head: string; sub: string; line: string }
  fontFamily: string
}

/** 글자가 폭을 넘으면 크기를 줄인다 — 줄바꿈보다 축소가 낫다(칭호는 한 줄로 읽힌다) */
function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  start: number,
  weight = 800,
  family = 'sans-serif'
): number {
  let size = start
  for (; size > 24; size -= 2) {
    ctx.font = `${weight} ${size}px ${family}`
    if (ctx.measureText(text).width <= maxWidth) break
  }
  return size
}

export async function drawTitleCard(input: TitleCardInput): Promise<ResultImage> {
  const { colors: c, fontFamily: ff } = input
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('캔버스를 쓸 수 없어요')

  ctx.fillStyle = c.bg
  ctx.fillRect(0, 0, W, H)

  const pad = 68
  ctx.textBaseline = 'alphabetic'

  // ── 위: 로고 + 이벤트 이름 ──
  let headX = pad
  if (input.logo) {
    /*
     * **`loadForCanvas` 로 받아야 한다** — 평범한 `new Image()` 로 그린 원격 이미지는
     * 캔버스를 오염시켜 `toBlob` 이 SecurityError 로 터진다 (compose.ts 주석).
     * 실패하면 로고 없이 계속 간다 — 카드를 못 만드는 것보다 낫다.
     */
    const logo = await loadForCanvas(input.logo).catch(() => null)
    if (logo) {
      const s = 74
      const r = 18
      ctx.save()
      ctx.beginPath()
      ctx.roundRect(pad, pad, s, s, r)
      ctx.clip()
      const ar = logo.naturalWidth / (logo.naturalHeight || 1)
      const dw = ar >= 1 ? s : s * ar
      const dh = ar >= 1 ? s / ar : s
      ctx.drawImage(logo, pad + (s - dw) / 2, pad + (s - dh) / 2, dw, dh)
      ctx.restore()
      headX = pad + s + 20
    }
  }
  ctx.fillStyle = c.sub
  ctx.font = `700 26px ${ff}`
  ctx.fillText(input.eventTitle, headX, pad + 46, W - headX - pad)

  // ── 가운데: 칭호 ──
  const midY = H / 2
  ctx.textAlign = 'center'

  ctx.fillStyle = c.sub
  ctx.font = `800 28px ${ff}`
  ctx.letterSpacing = '4px'
  ctx.fillText(input.kicker, W / 2, midY - 130)
  ctx.letterSpacing = '0px'

  ctx.fillStyle = c.head
  const size = fitFont(ctx, input.title, W - pad * 2 - 40, 108, 800, ff)
  ctx.font = `800 ${size}px ${ff}`
  ctx.fillText(input.title, W / 2, midY - 20)

  ctx.fillStyle = c.line
  ctx.fillRect(W / 2 - 70, midY + 40, 140, 2)

  // "10문항 중 9문항 정답" — 숫자만 진하게. 세 조각을 재서 가운데 정렬한다
  const a = `${input.count}문항 중 `
  const b = `${input.correct}문항`
  const d = ' 정답'
  ctx.font = `500 34px ${ff}`
  const wa = ctx.measureText(a).width
  const wd = ctx.measureText(d).width
  ctx.font = `800 34px ${ff}`
  const wb = ctx.measureText(b).width
  let x = W / 2 - (wa + wb + wd) / 2
  ctx.textAlign = 'left'
  ctx.fillStyle = c.sub
  ctx.font = `500 34px ${ff}`
  ctx.fillText(a, x, midY + 110)
  x += wa
  ctx.fillStyle = c.head
  ctx.font = `800 34px ${ff}`
  ctx.fillText(b, x, midY + 110)
  x += wb
  ctx.fillStyle = c.sub
  ctx.font = `500 34px ${ff}`
  ctx.fillText(d, x, midY + 110)

  // ── 아래: 날짜 · 주소 ──
  ctx.font = `500 24px ${ff}`
  ctx.fillStyle = c.sub
  ctx.globalAlpha = 0.75
  ctx.textAlign = 'left'
  ctx.fillText(input.date, pad, H - pad)
  if (input.footer) {
    ctx.textAlign = 'right'
    ctx.fillText(input.footer, W - pad, H - pad, W / 2)
  }
  ctx.globalAlpha = 1

  return mint(canvas)
}
