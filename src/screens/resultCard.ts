import { loadForCanvas, mint, type ResultImage } from '@/lib/compose'
import { CARD_RATIO } from '@/lib/card'
import { isLight } from '@/lib/color'

/**
 * 타로 결과를 그림 한 장으로 — **손에 남는 것을 만든다.**
 *
 * 열 서비스 중 포토존·모의고사·포토카드는 방문자가 결과물을 가져가는데 **타로만 없었다.**
 * 카페에서 뽑은 카드가 화면을 닫는 순간 사라지고, 기간이 지나면 다시 볼 수도 없다.
 * 트위터에 올라가는 한 장이 그 행사의 기록이자 홍보인데 그 자리가 비어 있었다.
 *
 * `quiz/titleCard.ts` 와 같은 길이다: `compose.ts` 는 "사진 + 프레임" 한 가지 합성만 알고,
 * 글자와 카드를 배치하는 건 각 서비스가 자기 캔버스로 그려 `mint()` 로 발행한다.
 * **`mint()` 를 거치므로 결과가 `ResultImage` 다** — 그래야 `SavableImage` 에 들어갈 수 있고,
 * 슬롯 자산 URL 은 타입상 그 자리에 못 온다 (CLAUDE.md 의 `<img>` 예외 규칙).
 *
 * **DPR 을 안 따른다** (titleCard 와 같은 규칙): 1080 고정. 폰마다 화질이 달라지면 안 된다.
 */

const W = 1080
const PAD = 72

export interface ResultCardCard {
  name: string
  nameEn: string
  reversed: boolean
  /** 포지션 라벨 — "나의 마음". 한 장이면 비운다 */
  position: string
  /** 슬롯이 올린 앞면 이미지. 없으면 이름으로 그린다 */
  image?: string
}

export interface ResultCardInput {
  /** 이벤트명 — 로고가 없을 때 머리에 온다 */
  eventTitle: string
  /** 카테고리 — "애정운" */
  kicker: string
  cards: ResultCardCard[]
  /** 카드 아래 본문 — 1장이면 조언, 여러 장이면 AI 종합 */
  body: string
  /** 'YYYY.MM.DD' */
  date: string
  /**
   * 저장 이미지 안에 그려 넣는 글자 — **캔버스라 화면의 `t()` 가 닿지 않는다.**
   *
   * 지금은 '역방향' 한 낱말뿐이지만, 이미지는 방문자가 저장해서 가져가는 결과물이라
   * 화면만 번역되고 저장물이 한국어면 그게 더 눈에 띈다. 부르는 쪽이 넘긴다.
   */
  reversedLabel: string
  logo?: string
  colors: {
    bg: string
    head: string
    sub: string
    line: string
    accent: string
    /** 이미지 없는 슬롯의 카드 바탕 — 화면 폴백(`CardFace.module.css`)과 같은 두 색 */
    cardFrom: string
    cardTo: string
  }
  fontFamily: string
}

/** 글자가 폭을 넘으면 줄인다 — 카드 이름은 한 줄로 읽혀야 한다 */
function fitFont(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, start: number, weight: number, ff: string): number {
  let size = start
  for (; size > 18; size -= 2) {
    ctx.font = `${weight} ${size}px ${ff}`
    if (ctx.measureText(text).width <= maxWidth) break
  }
  return size
}

/**
 * 본문을 줄로 나눈다 — **글자 단위로 자른다.**
 * 한국어는 띄어쓰기가 드물어(한 문장이 통째로 한 어절인 경우가 흔하다) 단어 단위로 자르면
 * 한 줄이 폭을 훌쩍 넘는다. 라틴 문자만 있는 문장에서도 글자 단위 줄바꿈이 어색하지 않다.
 */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const ch of text) {
    if (ch === '\n') {
      lines.push(line)
      line = ''
      if (lines.length >= maxLines) return lines
      continue
    }
    const next = line + ch
    if (ctx.measureText(next).width > maxWidth && line !== '') {
      lines.push(line)
      line = ch
      if (lines.length >= maxLines) {
        // 넘치면 마지막 줄 끝에 말줄임 — 잘린 걸 숨기면 문장이 끊긴 것처럼 보인다
        const last = lines[maxLines - 1]
        lines[maxLines - 1] = last.slice(0, Math.max(0, last.length - 1)) + '…'
        return lines
      }
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  return lines.slice(0, maxLines)
}

/** 둥근 사각형 — 카드 자리와 이미지 클리핑에 같이 쓴다 */
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export async function drawResultCard(input: ResultCardInput): Promise<ResultImage> {
  const { colors: c, fontFamily: ff, cards } = input

  /**
   * **카드를 먼저 받아 온다.** 캔버스에 그릴 원격 이미지는 반드시 `loadForCanvas` 다 —
   * `useImageAsset` 은 `crossOrigin` 을 안 걸어 캔버스를 오염시키고, 그러면 화면엔 멀쩡한데
   * 저장할 때만 터진다 (CLAUDE.md). 못 받은 카드는 이름으로 그린다.
   */
  const images = await Promise.all(
    cards.map((card) => (card.image ? loadForCanvas(card.image).catch(() => null) : Promise.resolve(null)))
  )
  const logo = input.logo ? await loadForCanvas(input.logo).catch(() => null) : null

  // ── 자리 계산 ────────────────────────────────────
  const inner = W - PAD * 2
  const gap = cards.length > 1 ? 28 : 0
  const cardW = Math.floor((inner - gap * (cards.length - 1)) / cards.length)
  const cardH = Math.round(cardW / CARD_RATIO)

  const headH = 190
  const nameH = cards.length > 1 ? 96 : 108

  // 본문 높이를 먼저 재야 캔버스 높이가 나온다 — 잰 뒤에 진짜 캔버스를 만든다
  const probe = document.createElement('canvas').getContext('2d')!
  const bodySize = cards.length > 1 ? 30 : 33
  probe.font = `400 ${bodySize}px ${ff}`
  const bodyLines = wrap(probe, input.body, inner, 7)
  const lineH = Math.round(bodySize * 1.72)
  const bodyH = input.body ? bodyLines.length * lineH + 44 : 0

  const footH = 120
  const H = headH + cardH + nameH + bodyH + footH

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('캔버스를 쓸 수 없어요')

  ctx.fillStyle = c.bg
  ctx.fillRect(0, 0, W, H)

  // ── 머리 ─────────────────────────────────────────
  ctx.textAlign = 'center'
  let y = 74

  if (logo) {
    // 로고 비율을 유지하며 높이 52 에 맞춘다 (찌그러진 로고가 제일 티가 난다)
    const h = 52
    const w = Math.round((logo.naturalWidth / logo.naturalHeight) * h)
    ctx.drawImage(logo, (W - w) / 2, y - 14, w, h)
    y += h + 22
  } else {
    ctx.fillStyle = c.head
    const size = fitFont(ctx, input.eventTitle, inner, 40, 700, ff)
    ctx.font = `700 ${size}px ${ff}`
    ctx.fillText(input.eventTitle, W / 2, y + size * 0.35)
    y += size + 26
  }

  ctx.fillStyle = c.accent
  ctx.font = `700 30px ${ff}`
  ctx.fillText(input.kicker, W / 2, y + 10)

  // ── 카드 ─────────────────────────────────────────
  const top = headH
  cards.forEach((card, i) => {
    const x = PAD + i * (cardW + gap)
    const r = Math.round(cardW * 0.055)

    ctx.save()
    roundRect(ctx, x, top, cardW, cardH, r)
    ctx.clip()

    const img = images[i]
    if (img) {
      /**
       * **역방향은 이미지를 180° 돌린다** — 화면(`CardFace`)과 같은 규칙이다.
       * 여기서 안 돌리면 저장한 그림과 방금 본 화면이 다르고, 그게 제일 이상한 종류의 차이다.
       */
      if (card.reversed) {
        ctx.translate(x + cardW / 2, top + cardH / 2)
        ctx.rotate(Math.PI)
        ctx.drawImage(img, -cardW / 2, -cardH / 2, cardW, cardH)
      } else {
        ctx.drawImage(img, x, top, cardW, cardH)
      }
    } else {
      /**
       * 이미지 없는 슬롯 폴백 — **화면(`CardFace` 의 `.fallback`)과 같은 그림**이어야 한다.
       * 거기가 `radial-gradient(72% 72% at 50% 42%, cardBackFrom, cardBackTo)` 라서 여기도
       * 같은 중심·같은 두 색으로 그린다. 회색 판으로 대충 채우면 저장한 그림만 딴 앱 같아진다.
       * 글자는 안 뒤집는다 — 뒤집으면 못 읽는다 (화면도 같은 규칙, 역방향은 아래 배지로 알린다).
       */
      const cx = x + cardW / 2
      const cy = top + cardH * 0.42
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cardH * 0.72)
      grad.addColorStop(0, c.cardFrom)
      grad.addColorStop(1, c.cardTo)
      ctx.fillStyle = grad
      ctx.fillRect(x, top, cardW, cardH)

      ctx.textAlign = 'center'
      ctx.fillStyle = c.accent
      const size = fitFont(ctx, card.name, cardW - 40, Math.round(cardW * 0.15), 700, ff)
      ctx.font = `700 ${size}px ${ff}`
      ctx.fillText(card.name, cx, top + cardH / 2)
      /**
       * 영문명은 **카드 바탕 밝기에서 파생한다** — 본문 색(`c.sub`)을 그대로 쓰면
       * 어두운 카드 위에서 거의 안 보인다. 화면 폴백이 `t-muted` 로 같은 일을 하는데,
       * 그건 CSS 가 `color-scheme` 을 보고 알아서 뒤집는 것이라 캔버스에는 안 따라온다.
       * (`lib/theme.ts` 가 배경 휘도로 토큰을 파생하는 것과 같은 결이다.)
       */
      ctx.fillStyle = isLight(c.cardTo) ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.5)'
      ctx.font = `400 ${Math.round(size * 0.48)}px ${ff}`
      ctx.fillText(card.nameEn, cx, top + cardH / 2 + size * 0.85)
    }
    ctx.restore()

    // 테두리 — 밝은 배경에서 카드가 배경에 녹지 않게
    ctx.strokeStyle = c.line
    ctx.lineWidth = 2
    roundRect(ctx, x + 1, top + 1, cardW - 2, cardH - 2, r)
    ctx.stroke()

    // 카드 이름 (+ 포지션·역방향)
    let ny = top + cardH + 46
    ctx.textAlign = 'center'
    if (card.position) {
      ctx.fillStyle = c.accent
      ctx.font = `700 24px ${ff}`
      ctx.fillText(card.position, x + cardW / 2, ny)
      ny += 36
    }
    ctx.fillStyle = c.head
    const nameSize = fitFont(ctx, card.name, cardW, cards.length > 1 ? 30 : 40, 700, ff)
    ctx.font = `700 ${nameSize}px ${ff}`
    ctx.fillText(card.name, x + cardW / 2, ny)
    if (card.reversed) {
      ctx.fillStyle = c.sub
      ctx.font = `400 ${Math.round(nameSize * 0.62)}px ${ff}`
      ctx.fillText(input.reversedLabel, x + cardW / 2, ny + nameSize * 0.95)
    }
  })

  // ── 본문 ─────────────────────────────────────────
  if (input.body) {
    ctx.textAlign = 'left'
    ctx.fillStyle = c.sub
    ctx.font = `400 ${bodySize}px ${ff}`
    let by = headH + cardH + nameH + 26
    for (const line of bodyLines) {
      ctx.fillText(line, PAD, by)
      by += lineH
    }
  }

  // ── 발 ───────────────────────────────────────────
  ctx.strokeStyle = c.line
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(PAD, H - footH + 24)
  ctx.lineTo(W - PAD, H - footH + 24)
  ctx.stroke()

  ctx.textAlign = 'center'
  ctx.fillStyle = c.sub
  ctx.font = `400 24px ${ff}`
  ctx.fillText(`${input.eventTitle} · ${input.date}`, W / 2, H - footH + 74)

  return mint(canvas)
}
