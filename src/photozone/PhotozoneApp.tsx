import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Camera,
  CameraOff,
  Check,
  ChevronLeft,
  Download,
  Grid2x2,
  Image as ImageIcon,
  Info,
  Pointer,
  RotateCcw,
  Share2,
  SwitchCamera,
  User,
} from 'lucide-react'

import { useSlotState } from '@/slot/SlotProvider'
import { photozoneDisplay, type PhotozoneDisplay, type PhotozoneFrame } from '@/data/photozone'
import { fontStack, loadWebfont } from '@/data/fonts'
import { cssUrl } from '@/lib/image'
import { SavableImage } from '@/components/SavableImage'
import {
  composeFrame,
  loadFile,
  loadForCanvas,
  mint,
  photoFromVideo,
  releaseResult,
  saveResult,
  shareResult,
  type Photo,
  type ResultImage,
} from '@/lib/compose'
import type { Slot } from '@/types/slot'
import { CAMERA_MESSAGE, useCamera } from './useCamera'
import { AdminEntry } from '@/components/AdminEntry'
import { ServiceHeader } from '@/components/ServiceHeader'
import styles from './Photozone.module.css'
import { useT } from '@/i18n'
import { useLocalizedDisplay } from '@/i18n/display'

/**
 * 포토존 프레임 — 카페 포토존에서 찍은 사진에 **이벤트 프레임을 씌워 저장해 가는** 인증샷.
 * 화면은 claude.ai/design 시안 '포토존 프레임 방문자' 를 옮긴 것이다.
 *
 * **서버에 아무것도 안 남는다.** 합성은 이 화면의 캔버스가 하고 결과는 곧장 방문자 폰으로 간다.
 * 방문자 사진을 서버에 두는 순간 이건 미성년 팬의 얼굴 사진을 호스팅하는 서비스가 된다
 * (`0016_photozone.sql`). Storage 는 `is_owner()` 만 쓰기가 되므로 그 정책을 **안 건드리는
 * 것이 곧 설계다.**
 *
 * **URL 로 화면을 안 가른다** — 롤페는 `/write` 로 갈랐지만, 여기선 뒤로가기가 카메라
 * 스트림을 끊는 게 더 나쁘다. `useState` 로 둔다.
 */
export default function PhotozoneApp() {
  const state = useSlotState()
  if (state.status === 'loading') return <div className="app" aria-busy="true" />
  if (state.status === 'missing') return null
  return <Photozone slot={state.slot} />
}

/** `error` 는 `live` 에서 카메라가 열리지 않았을 때 — 시안이 독립 화면으로 그린다 */
type Stage = 'ready' | 'live' | 'error' | 'result'

/** 3:4 → "3 : 4" — 썸네일 아래에 실제 비율을 적어준다 (시안) */
function ratioLabel(r: number): string {
  const cands: [number, string][] = [
    [3 / 4, '3 : 4'], [1, '1 : 1'], [4 / 3, '4 : 3'], [1 / 3, '1 : 3'],
    [2 / 3, '2 : 3'], [9 / 16, '9 : 16'], [16 / 9, '16 : 9'], [4 / 5, '4 : 5'],
  ]
  const hit = cands.find(([v]) => Math.abs(v - r) < 0.02)
  if (hit) return hit[1]
  return r >= 1 ? `${r.toFixed(2)} : 1` : `1 : ${(1 / r).toFixed(2)}`
}

/** 썸네일을 190×300 안에 비율대로 앉힌다 (시안의 `fit`) */
const BOX_W = 190
const BOX_H = 300
function fit(r: number): { w: number; h: number } {
  let w = BOX_W
  let h = BOX_W / r
  if (h > BOX_H) {
    h = BOX_H
    w = BOX_H * r
  }
  return { w: Math.round(w), h: Math.round(h) }
}

function Photozone({ slot }: { slot: Slot }) {
  const t = useT()
  const rawDisplay = useMemo(() => photozoneDisplay(slot), [slot])
  /** 기본 문구는 사전에서 번역되고, 주최자가 쓴 문구는 원문 그대로 (src/i18n/display.ts) */
  const display = useLocalizedDisplay(rawDisplay)
  const [stage, setStage] = useState<Stage>('ready')
  const [frameIdx, setFrameIdx] = useState(0)
  const [facing, setFacing] = useState(display.facing)
  const [result, setResult] = useState<ResultImage | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  /** 저장이 브라우저에 막혔다 — 시안 ③-b 의 토스트를 띄운다 */
  const [saveBlocked, setSaveBlocked] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const frame: PhotozoneFrame | null = display.frames[frameIdx] ?? null
  const ratio = frame?.ratio || 3 / 4

  useEffect(() => {
    loadWebfont(display.font)
  }, [display.font])

  const wantCamera = stage === 'live' || stage === 'error'
  const camera = useCamera(wantCamera, facing)

  // 카메라가 못 열리면 시안의 독립 실패 화면으로 (막다른 골목이 아니라 업로드로 가는 길)
  useEffect(() => {
    if (camera.error && stage === 'live') setStage('error')
  }, [camera.error, stage])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.srcObject = camera.stream
    if (camera.stream) void v.play().catch(() => {})
  }, [camera.stream, stage])

  // 결과를 새로 만들 때 이전 blob URL 을 돌려준다 — 안 하면 탭이 사는 동안 계속 쌓인다
  useEffect(() => () => { if (result) releaseResult(result) }, [result])

  const loadOverlays = useCallback(async () => {
    const [frameImg, mark] = await Promise.all([
      frame ? loadForCanvas(frame.src).catch(() => null) : Promise.resolve(null),
      display.watermark ? loadForCanvas(display.watermark).catch(() => null) : Promise.resolve(null),
    ])
    return { frameImg, mark }
  }, [frame, display.watermark])

  const publish = useCallback(
    async (photo: Photo, mirror: boolean) => {
      const { frameImg, mark } = await loadOverlays()
      const canvas = composeFrame({
        photo,
        frame: frameImg,
        watermark: mark,
        watermarkPos: display.watermarkPos,
        mirror,
        // 프레임이 없는 슬롯은 고른 비율로 잘라 준다 (원본 비율 그대로면 프레임과 어긋난다)
        ...(frameImg ? {} : { width: Math.round(1200 * ratio), height: 1200 }),
      })
      setResult(await mint(canvas))
      setSaveBlocked(false)
      setStage('result')
    },
    [loadOverlays, display.watermarkPos, ratio]
  )

  async function shoot() {
    const v = videoRef.current
    const photo = v && photoFromVideo(v)
    if (!photo) return setNotice(t('아직 카메라가 준비되지 않았어요.'))
    setBusy(true)
    setNotice(null)
    try {
      // 전면 카메라는 화면에서 거울로 보여주므로 **찍힌 것도 거울이어야** 방문자가 본 그대로다
      await publish(photo, facing === 'user')
    } catch (e) {
      setNotice(e instanceof Error ? e.message : t('사진을 만들지 못했어요.'))
    } finally {
      setBusy(false)
    }
  }

  async function pickFile(file: File) {
    setBusy(true)
    setNotice(null)
    try {
      await publish(await loadFile(file), false)
    } catch (e) {
      setNotice(e instanceof Error ? e.message : t('사진을 열지 못했어요.'))
    } finally {
      setBusy(false)
    }
  }

  /**
   * **'저장' 과 '공유' 는 다른 일을 한다.** 예전엔 두 버튼이 같은 함수를 불러서 어느 쪽을
   * 눌러도 공유 시트가 떴다 — 글자만 다르고 하는 일이 똑같았다 (compose.ts 주석).
   */
  async function save(kind: 'save' | 'share' = 'save') {
    if (!result) return
    const name = `${slot.slug}-photo.png`
    const how = kind === 'save' ? await saveResult(result, name) : await shareResult(result, name)
    setSaveBlocked(how === 'opened')
  }

  const vars: React.CSSProperties = {
    ['--pz-font' as string]: fontStack(display.font),
    ['--pz-head' as string]: display.headText,
    ['--pz-sub' as string]: display.subText,
    ['--pz-btn' as string]: display.buttonColor,
    ['--pz-bg' as string]: display.bg,
  }

  const backToReady = () => {
    setNotice(null)
    setStage('ready')
  }

  return (
    <div
      className={`app ${styles.root}`}
      data-stage={stage}
      style={{
        ...vars,
        ...(display.bgImage
          ? {
              backgroundImage: cssUrl(display.bgImage),
              backgroundRepeat: display.bgRepeat ? 'repeat' : 'no-repeat',
              backgroundSize: display.bgRepeat ? 'auto' : 'cover',
            }
          : {}),
      }}
    >
      <div className={styles.phone}>
        {stage === 'ready' && (
          <Ready
            display={display}
            frameIdx={frameIdx}
            onPick={setFrameIdx}
            onShoot={() => setStage('live')}
            onFile={pickFile}
            busy={busy}
            slug={slot.slug}
          />
        )}

        {stage === 'live' && (
          <>
            <div className={styles.camTop}>
              <button type="button" className={styles.camBack} onClick={backToReady} aria-label={t('돌아가기')}>
                <ChevronLeft size={18} strokeWidth={1.7} aria-hidden="true" />
              </button>
              <div className={styles.camGuide}>{display.guide}</div>
              <span className={styles.camTopSpacer} />
            </div>

            <div className={styles.viewport}>
              {/**
               * `<video>` 는 `<img>` 금지 규칙의 대상이 아니다 — 저장 메뉴가 뜨지 않는다.
               * `playsInline` 이 없으면 iOS 가 전체화면 재생기로 튀어 프레임이 안 겹친다.
               */}
              <video
                ref={videoRef}
                className={styles.video}
                data-mirror={facing === 'user' || undefined}
                playsInline
                muted
                autoPlay
              />
              {!camera.stream && (
                <div className={styles.camIdle}>
                  <User size={30} strokeWidth={1.7} aria-hidden="true" />
                  <span>{camera.starting ? t('카메라를 켜는 중…') : t('카메라 프리뷰')}</span>
                </div>
              )}
              {frame && (
                <div className={styles.overlay} style={{ backgroundImage: cssUrl(frame.src) }} aria-hidden="true" />
              )}
            </div>

            <div className={styles.camBar}>
              <button
                type="button"
                className={styles.camIcon}
                onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}
                aria-label={t('카메라 전환')}
              >
                <SwitchCamera size={22} strokeWidth={1.7} aria-hidden="true" />
              </button>
              <button
                type="button"
                className={styles.shutter}
                onClick={() => void shoot()}
                disabled={busy || !camera.stream}
                aria-label={t('촬영')}
                data-shutter
              />
              <button
                type="button"
                className={styles.camIcon}
                onClick={backToReady}
                aria-label={t('프레임 바꾸기')}
              >
                <Grid2x2 size={20} strokeWidth={1.7} aria-hidden="true" />
              </button>
            </div>
          </>
        )}

        {stage === 'error' && (
          <>
            <div className={styles.camTop}>
              <button type="button" className={styles.camBack} onClick={backToReady} aria-label={t('돌아가기')}>
                <ChevronLeft size={18} strokeWidth={1.7} aria-hidden="true" />
              </button>
              <span />
              <span className={styles.camTopSpacer} />
            </div>

            <div className={styles.failWrap} data-camera-error={camera.error ?? 'busy'}>
              <div className={styles.failIcon}>
                <CameraOff size={30} strokeWidth={1.7} aria-hidden="true" />
              </div>
              <div className={styles.failTitle}>{t('카메라를 열 수 없어요')}</div>
              <p className={styles.failText}>
                {camera.error ? t(CAMERA_MESSAGE[camera.error]) : ''}
                <br />
                가지고 있는 사진을 올려도 똑같이 프레임을 씌울 수 있어요.
              </p>
              <FileButton
                label={display.uploadLabel}
                onFile={pickFile}
                busy={busy}
                className={styles.failPrimary}
              />
              <button type="button" className={styles.failGhost} onClick={() => setStage('live')}>
                다시 시도
              </button>
            </div>
            <div className={styles.failHint}>
              설정 &gt; 사이트 권한에서 카메라를 허용하면 바로 찍을 수 있어요.
            </div>
          </>
        )}

        {stage === 'result' && result && (
          <>
            <div className={styles.topBar}>
              <button type="button" className={styles.backBtn} onClick={backToReady} aria-label={t('돌아가기')}>
                <ChevronLeft size={18} strokeWidth={1.7} aria-hidden="true" />
              </button>
            </div>

            <div className={styles.shotWrap}>
              <div style={{ position: 'relative', width: '100%' }}>
                {/**
                 * 코드베이스에서 `<img>` 가 나오는 유일한 자리 — 저장되는 게 목적인 결과물이다.
                 * `SavableImage` 는 `ResultImage` 만 받으므로 슬롯 자산이 여기 들어올 수 없다.
                 */}
                <SavableImage image={result} alt={t('합성된 인증샷')} className={styles.shot} />
                {saveBlocked && (
                  <span
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      left: '50%',
                      top: '50%',
                      transform: 'translate(-50%,-50%)',
                      width: 46,
                      height: 46,
                      borderRadius: 9999,
                      background: 'rgb(20 20 20 / 0.55)',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Pointer size={22} strokeWidth={1.7} />
                  </span>
                )}
              </div>
            </div>

            <div className={styles.actions}>
              {saveBlocked ? (
                <div className={styles.toast} data-save-blocked>
                  <Info size={16} strokeWidth={1.7} aria-hidden="true" style={{ flex: 'none', marginTop: 1 }} />
                  <span className={styles.toastText}>
                    이 브라우저에서는 바로 저장이 안 돼요.
                    <br />
                    <b>{t('사진을 길게 눌러 저장')}</b>해 주세요.
                  </span>
                </div>
              ) : (
                /* 저장·공유는 **한 줄이다** — 같은 사진을 어디로 보낼지만 다른 짝이다 */
                <div className={styles.row}>
                  <button type="button" className={styles.primary} onClick={() => void save('save')} data-save>
                    <Download size={19} strokeWidth={1.7} aria-hidden="true" />
                    {t(display.saveLabel)}
                  </button>
                  {typeof navigator !== 'undefined' && 'share' in navigator && (
                    <button type="button" className={styles.ghost} onClick={() => void save('share')} data-share>
                      <Share2 size={17} strokeWidth={1.7} aria-hidden="true" />
                      {t('공유')}
                    </button>
                  )}
                </div>
              )}
              <div className={styles.row}>
                {/* 저장이 막힌 기기(주로 iOS)에서는 공유가 유일한 길이다 — 여기서 사라지면 안 된다 */}
                {saveBlocked && typeof navigator !== 'undefined' && 'share' in navigator && (
                  <button type="button" className={styles.ghost} onClick={() => void save('share')} data-share>
                    <Share2 size={17} strokeWidth={1.7} aria-hidden="true" />
                    {t('공유')}
                  </button>
                )}
                <button
                  type="button"
                  className={styles.ghost}
                  onClick={() => {
                    setResult(null)
                    setSaveBlocked(false)
                    setStage(display.captureMode === 'upload' ? 'ready' : 'live')
                  }}
                >
                  <RotateCcw size={17} strokeWidth={1.7} aria-hidden="true" />
                  {display.retakeLabel}
                </button>
              </div>
            </div>
            <div style={{ height: 34 }} />
          </>
        )}

        {notice && (
          <p className={styles.notice} role="status" data-notice>
            {notice}
          </p>
        )}
      </div>
    </div>
  )
}

function Ready({
  display,
  frameIdx,
  onPick,
  onShoot,
  onFile,
  busy,
  slug,
}: {
  display: PhotozoneDisplay
  frameIdx: number
  onPick: (i: number) => void
  onShoot: () => void
  onFile: (f: File) => void
  busy: boolean
  slug: string
}) {
  const t = useT()
  return (
    <>
      <ServiceHeader
        variant="tile"
        logo={display.logo}
        title={display.title}
        showTitle={display.showTitle}
        align={display.logoAlign}
        classes={{ head: styles.head, logo: styles.logoTile, title: styles.title, text: styles.headText }}
        /* 부제는 **헤더 안**이어야 제목과 같이 정렬된다 — 밖에 두면 혼자 왼쪽에 남는다 */
        below={
          display.showSubtitle && display.subtitle ? (
            <p className={styles.subtitle}>{display.subtitle}</p>
          ) : null
        }
      />

      {display.frames.length > 0 && (
        <div className={styles.pickWrap}>
          <div className={styles.pickHead}>
            <div className={styles.pickTitle}>{t('프레임 고르기')}</div>
            {display.frames.length > 1 && <div className={styles.pickHint}>{t('좌우로 넘겨 보세요')}</div>}
          </div>
          <ul className={styles.frames} data-frames data-stage>
            {display.frames.map((f, i) => {
              const size = fit(f.ratio || 3 / 4)
              const on = i === frameIdx
              return (
                <li key={f.id} className={styles.frameCell}>
                  <button
                    type="button"
                    className={styles.frameBtn}
                    data-active={on || undefined}
                    aria-pressed={on}
                    onClick={() => onPick(i)}
                  >
                    <span className={styles.frameThumb} style={{ width: size.w, height: size.h }}>
                      <span className={styles.frameArt} style={{ backgroundImage: cssUrl(f.src) }} />
                      {on && (
                        <span className={styles.frameCheck} aria-hidden="true">
                          <Check size={13} strokeWidth={2.2} />
                        </span>
                      )}
                    </span>
                    <span className={styles.frameName}>{f.name}</span>
                    <span className={styles.frameRatio}>{ratioLabel(f.ratio || 3 / 4)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <div className={styles.spacer} />

      <div className={styles.actions}>
        {display.captureMode !== 'upload' && (
          <button type="button" className={styles.primary} onClick={onShoot} disabled={busy} data-shoot>
            <Camera size={19} strokeWidth={1.7} aria-hidden="true" />
            {display.shootLabel}
          </button>
        )}
        <FileButton
          label={display.uploadLabel}
          onFile={onFile}
          busy={busy}
          className={display.captureMode === 'upload' ? styles.primary : styles.ghost}
        />
      </div>

      {/* 방문자 눈엔 안 띄게 — 주최자만 찾아 누른다 */}
      <div className={styles.adminRow}>
        <AdminEntry slug={slug} className={styles.adminLink} />
      </div>
    </>
  )
}

/**
 * `capture` 속성은 코드베이스에 처음 쓴다 — 모바일에서 앨범 대신 카메라를 바로 연다.
 * `useCamera` 가 막힌 환경에서도 이 경로는 대개 살아 있다 (OS 카메라 앱을 부르기 때문).
 */
function FileButton({
  label,
  onFile,
  busy,
  className,
}: {
  label: string
  onFile: (f: File) => void
  busy: boolean
  className: string
}) {
  return (
    <label className={className} data-upload>
      <ImageIcon size={18} strokeWidth={1.7} aria-hidden="true" />
      {label}
      <input
        type="file"
        accept="image/*"
        className="sr-only"
        disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0]
          // 같은 파일을 다시 골라도 change 가 나게 비운다
          e.target.value = ''
          if (f) onFile(f)
        }}
      />
    </label>
  )
}
