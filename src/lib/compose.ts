/**
 * 캔버스 합성과 **결과물 발행** — 방문자가 가져갈 이미지를 만드는 유일한 자리.
 *
 * 이 레포는 슬롯 이미지가 저장되는 걸 막으려고 `<img>` 를 통틀어 안 쓴다 (`lib/image.ts`).
 * 그런데 포토존 인증샷·뽑은 포토카드·칭호 카드는 **저장되는 게 목적**이다. 그 예외를 아무 데서나
 * 열면 규칙이 그냥 무너지므로, 여기서 만든 `ResultImage` 만 `<SavableImage>` 에 들어갈 수 있게
 * 타입으로 막는다 — 규칙을 주석이 아니라 컴파일러가 지킨다.
 *
 * 라이브러리는 안 쓴다. 이 레포의 런타임 의존성은 다섯 개뿐이고, 캔버스 2D 로 되는 일에
 * 하나를 더 얹을 이유가 없다.
 */

/**
 * 브랜디드 타입 — `unique symbol` 은 이 모듈 밖에서 못 만든다.
 * 그래서 `ResultImage` 를 요구하는 자리에 슬롯 자산 URL(`string`)을 넣는 게 **타입 에러**가 된다.
 */
declare const RESULT: unique symbol

export interface ResultImage {
  readonly [RESULT]: true
  /** `blob:` URL — 다 쓰면 `releaseResult` 로 돌려준다 */
  url: string
  blob: Blob
  width: number
  height: number
}

/** 저장물 한 변의 상한. 프레임이 아무리 커도 여기서 자른다 (폰에서 캔버스가 죽는다) */
const MAX_EDGE = 2048

/** 미리보기 캔버스 배율 — 3배 이상은 눈에 안 보이고 메모리만 먹는다 */
export function previewScale(): number {
  return Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, 2)
}

/**
 * 캔버스에 그릴 목적으로 원격 이미지를 받는다. **`useImageAsset` 로 받은 이미지를 쓰면 안 된다** —
 * 그쪽은 `crossOrigin` 을 안 걸어서, 그걸 `drawImage` 하면 캔버스가 오염되고
 * `toBlob` 이 `SecurityError` 로 터진다 (화면엔 멀쩡히 보이다가 저장 순간에만 죽는다).
 *
 * 함정 둘을 여기서 흡수한다:
 *
 * 1. **`crossOrigin` 은 `src` 대입 *전에* 세팅해야 한다.** 순서가 반대면 그냥 무시된다.
 * 2. **CORS 캐시 오염.** 같은 URL 을 화면이 이미 `background-image`(비-CORS)로 받아뒀으면
 *    브라우저가 CORS 재요청 없이 그 캐시를 내주고, 캔버스는 다시 오염된다. 쿼리를 하나 붙여
 *    **별도 캐시 엔트리**를 강제한다. Storage URL 엔 이미 `?v=` 가 붙어 있으니 유무를 보고 잇는다.
 *
 * Supabase Storage 의 `slots` 버킷은 public 이라 `access-control-allow-origin: *` 이 온다.
 */
export function loadForCanvas(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous' // ← src 보다 먼저여야 한다
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`이미지를 불러오지 못했어요: ${src}`))
    img.src = src + (src.includes('?') ? '&' : '?') + 'canvas=1'
  })
}

/**
 * 업로드한 파일을 캔버스에 그릴 수 있는 형태로 연다.
 *
 * **EXIF 회전을 반드시 살린다.** iOS 로 찍은 세로 사진은 픽셀이 가로로 저장되고 회전 태그가 따로
 * 붙는다. 그냥 그리면 **사진이 눕는다.** `createImageBitmap` 의 `imageOrientation` 이 그걸 풀어준다.
 */
export async function loadFile(file: File): Promise<Photo> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return { source: bmp, width: bmp.width, height: bmp.height }
    } catch {
      /* 옵션 미지원 브라우저 — 아래로 떨어진다 */
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('사진을 열지 못했어요'))
      el.src = url
    })
    // 최신 브라우저는 <img> 렌더 시 EXIF 를 알아서 적용한다 (naturalWidth 가 회전 후 값)
    return { source: img, width: img.naturalWidth, height: img.naturalHeight }
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * 바닥에 깔 사진 — **크기를 값으로 따로 받는다.**
 *
 * `HTMLVideoElement` 는 `width`/`height` 가 레이아웃 속성이라 대개 0 이고, 진짜 크기는
 * `videoWidth`/`videoHeight` 에 있다. 소스 종류마다 어디서 크기를 읽는지가 달라서,
 * 읽는 쪽이 아니라 **주는 쪽이 명시**하게 한다 — 안 그러면 `cover` 계산이 0 으로 나눠진다.
 */
export interface Photo {
  source: CanvasImageSource
  width: number
  height: number
}

/** `<video>` 를 Photo 로 — 재생 중이 아니면 크기가 0 이라 그때는 그리지 않는다 */
export function photoFromVideo(v: HTMLVideoElement): Photo | null {
  if (!v.videoWidth || !v.videoHeight) return null
  return { source: v, width: v.videoWidth, height: v.videoHeight }
}

/** `object-fit: cover` 를 캔버스 좌표로 — 원본에서 잘라낼 사각형을 준다 */
export function coverRect(
  sw: number,
  sh: number,
  dw: number,
  dh: number
): { sx: number; sy: number; sw: number; sh: number } {
  const scale = Math.max(dw / sw, dh / sh)
  const w = dw / scale
  const h = dh / scale
  return { sx: (sw - w) / 2, sy: (sh - h) / 2, sw: w, sh: h }
}

export interface ComposeOptions {
  /** 바닥에 깔 사진 (cover 로 채운다) */
  photo: Photo
  /** 사진 위에 얹을 투명 PNG */
  frame?: HTMLImageElement | null
  /** 구석에 얹을 이벤트 로고 */
  watermark?: HTMLImageElement | null
  watermarkPos?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
  /** 출력 크기. 안 주면 프레임의 자연 크기, 그것도 없으면 사진 크기 */
  width?: number
  height?: number
  /** 좌우 반전 — 전면 카메라는 거울처럼 보여주고 찍은 것도 거울로 남기는 게 자연스럽다 */
  mirror?: boolean
}

/**
 * **저장물은 DPR 을 안 따른다.** 출력 크기를 프레임의 자연 크기로 잡는다 —
 * 화면 배율을 곱하면 같은 프레임이 폰마다 다른 해상도로 저장되고, 그게 "왜 화질이 다르냐" 가 된다.
 */
export function composeFrame(opts: ComposeOptions): HTMLCanvasElement {
  const { photo, frame, watermark, watermarkPos = 'bottom-right', mirror } = opts

  let w = opts.width ?? frame?.naturalWidth ?? photo.width
  let h = opts.height ?? frame?.naturalHeight ?? photo.height
  const over = Math.max(w, h) / MAX_EDGE
  if (over > 1) {
    w = Math.round(w / over)
    h = Math.round(h / over)
  }

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('캔버스를 쓸 수 없어요')

  // 사진이 프레임 비율과 다르면 잘라서 채운다 (여백을 남기면 프레임 구멍으로 배경이 비친다)
  const cut = coverRect(photo.width, photo.height, w, h)
  if (mirror) {
    ctx.save()
    ctx.translate(w, 0)
    ctx.scale(-1, 1)
  }
  ctx.drawImage(photo.source, cut.sx, cut.sy, cut.sw, cut.sh, 0, 0, w, h)
  if (mirror) ctx.restore()

  if (frame) ctx.drawImage(frame, 0, 0, w, h)

  if (watermark) {
    const pad = Math.round(Math.min(w, h) * 0.04)
    const mw = Math.round(Math.min(w, h) * 0.18)
    const mh = Math.round((mw * watermark.naturalHeight) / (watermark.naturalWidth || 1))
    const x = watermarkPos.endsWith('right') ? w - mw - pad : pad
    const y = watermarkPos.startsWith('bottom') ? h - mh - pad : pad
    ctx.drawImage(watermark, x, y, mw, mh)
  }

  return canvas
}

/**
 * 캔버스를 결과물로 발행한다 — **`ResultImage` 를 만들 수 있는 유일한 경로 둘 중 하나.**
 *
 * `toBlob` 이 던지면 그건 십중팔구 오염된 캔버스다 (`loadForCanvas` 를 안 쓰고 그렸다).
 * 그 사실을 메시지에 적어둔다 — 이 오류는 개발 중에 반드시 한 번은 만난다.
 */
export function mint(canvas: HTMLCanvasElement, type = 'image/png'): Promise<ResultImage> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error('이미지를 만들지 못했어요'))
        resolve({
          url: URL.createObjectURL(blob),
          blob,
          width: canvas.width,
          height: canvas.height,
        } as ResultImage)
      }, type)
    } catch (e) {
      reject(
        new Error(
          `캔버스가 오염돼 이미지를 만들지 못했어요 — 원격 이미지는 loadForCanvas() 로 받아야 합니다. (${String(e)})`
        )
      )
    }
  })
}

/**
 * 원격 이미지 한 장을 그대로 결과물로 — 합성 없이 워터마크만 얹는다 (포토카드 결과가 이 경로).
 *
 * 부수 효과가 좋다: 화면에 뜨는 `<img src>` 가 `blob:` URL 이라
 * **"이미지 주소 복사" 로 Storage 원본에 도달하지 못한다.**
 */
export async function fromUrl(src: string, watermarkSrc?: string): Promise<ResultImage> {
  const img = await loadForCanvas(src)
  const watermark = watermarkSrc ? await loadForCanvas(watermarkSrc).catch(() => null) : null
  const photo: Photo = { source: img, width: img.naturalWidth, height: img.naturalHeight }
  return mint(composeFrame({ photo, watermark }))
}

/**
 * 저장 — **다운로드를 먼저 시도한다.**
 *
 * 처음엔 공유를 먼저 뒀다. iOS Safari 가 `blob:` 에서 `<a download>` 를 무시하고 그냥
 * 열어버리는 경우가 있어서였다. 그런데 그러면 **안드로이드·데스크톱은 공유가 되니까 거기서
 * 멈춰서**, 어디서 '저장' 을 눌러도 공유 시트가 떴다. "저장" 이라고 적힌 버튼이 저장을
 * 안 하는 건 그냥 거짓말이다.
 *
 * 그래서 순서를 뒤집었다: **다운로드 → 공유 → 새 탭.** iOS 처럼 다운로드가 실제로 안 되는
 * 데서만 공유로 물러선다. 공유가 목적이면 `shareResult` 를 쓴다 — 두 버튼이 같은 함수를
 * 부르면 글자만 다르고 하는 일이 똑같아진다(실제로 그랬다).
 *
 * **다운로드가 통했는지는 브라우저가 안 알려준다.** `download` 속성 지원 여부로만 가르고,
 * iOS Safari 는 속성을 지원한다고 말하면서 무시하므로 거기서 한 겹 더 본다.
 */
export async function saveResult(img: ResultImage, filename: string): Promise<'shared' | 'downloaded' | 'opened'> {
  if (canDownload()) {
    const a = document.createElement('a')
    a.href = img.url
    a.download = filename
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
    return 'downloaded'
  }

  // 여기부터는 다운로드가 안 먹는 기기다 (iOS Safari 계열)
  if (await tryShare(img, filename)) return 'shared'

  window.open(img.url, '_blank', 'noopener')
  return 'opened'
}

/**
 * 공유 — **공유 시트를 먼저 연다.** 못 열면 저장으로 물러선다.
 *
 * '저장' 과 반대 순서라는 게 요점이다. 두 버튼이 실제로 다른 일을 해야 나란히 둘 이유가 있다.
 */
export async function shareResult(img: ResultImage, filename: string): Promise<'shared' | 'downloaded' | 'opened'> {
  if (await tryShare(img, filename)) return 'shared'
  return saveResult(img, filename)
}

/**
 * `<a download>` 가 실제로 파일을 내려받나.
 *
 * iOS Safari 는 속성을 **지원한다고 말하면서 무시한다** — blob URL 을 그냥 새 화면으로 연다.
 * 그래서 속성 지원만 보면 안 되고 iOS 를 따로 가른다. (iPadOS 는 데스크톱 Safari 로
 * 위장하므로 `maxTouchPoints` 까지 본다 — 그게 없으면 아이패드에서 저장이 조용히 실패한다.)
 */
function canDownload(): boolean {
  if (typeof document === 'undefined') return false
  if (!('download' in HTMLAnchorElement.prototype)) return false
  const ua = navigator.userAgent
  const iOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  return !iOS
}

/** 공유 시트. 열렸으면 true — 사용자가 닫은 것도 "열렸다" 로 본다 (다시 저장으로 떨어뜨리지 않는다) */
async function tryShare(img: ResultImage, filename: string): Promise<boolean> {
  if (typeof navigator === 'undefined') return false
  const file = new File([img.blob], filename, { type: img.blob.type })
  if (!navigator.canShare?.({ files: [file] })) return false
  try {
    await navigator.share({ files: [file] })
    return true
  } catch (e) {
    return e instanceof DOMException && e.name === 'AbortError'
  }
}

/** blob URL 을 돌려준다. 안 부르면 탭이 살아 있는 동안 메모리에 남는다 */
export function releaseResult(img: ResultImage): void {
  URL.revokeObjectURL(img.url)
}
