import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, Pencil, Settings } from 'lucide-react'

import { useSlotState } from '@/slot/SlotProvider'
import { rollingDisplay, type RollingDisplay } from '@/data/rolling'
import { loadWebfont, fontStack, fontStyle, HANDWRITING_FONTS, WEBFONTS } from '@/data/fonts'
import { repo } from '@/lib/repo'
import { cssUrl } from '@/lib/image'
import type { RollingMessage } from '@/lib/repo/types'
import type { Slot } from '@/types/slot'
import styles from './Rolling.module.css'

/**
 * 롤링페이퍼 (세 번째 서비스) — 방문자가 응원 메시지를 **포스트잇**으로 남기고, 남긴 즉시
 * 공개 벽에 붙는다 (후검수: 부적절한 건 주최자가 나중에 숨긴다).
 *
 * 화면이 둘이다: **벽**(`/{slug}`)과 **작성 페이지**(`/{slug}/write`). SlotLayout 이 롤페면
 * 하위 경로 전부 이 컴포넌트를 그리므로, URL 로 벽/작성을 가른다 (진짜 페이지 · 브라우저 뒤로가기).
 * PC·태블릿·모바일 다 쓰므로 벽은 넓은 게시판으로 반응형.
 */
export default function RollingApp() {
  const state = useSlotState()
  if (state.status === 'loading') return <div className="app" aria-busy="true" />
  if (state.status === 'missing') return null
  return <Rolling slot={state.slot} />
}

/** 슬롯이 정한 색·폰트를 CSS 변수로 — 벽·작성이 같은 값을 쓴다 */
function useRollingVars(display: RollingDisplay): React.CSSProperties {
  return {
    ['--rp-font' as string]: fontStack(display.font),
    ['--rp-head' as string]: display.headText,
    ['--rp-sub' as string]: display.subText,
    ['--rp-note-body' as string]: display.noteBody,
    ['--rp-note-name' as string]: display.noteName,
    ['--rp-board' as string]: display.boardBg,
    ['--rp-btn' as string]: display.buttonColor,
  }
}

function Rolling({ slot }: { slot: Slot }) {
  const location = useLocation()
  const display = useMemo(() => rollingDisplay(slot), [slot])
  const composing = location.pathname.replace(/\/+$/, '').endsWith('/write')

  // 벽 기본 폰트는 늘 로드 (제목·UI·작성 폼)
  useEffect(() => {
    loadWebfont(display.font)
  }, [display.font])

  return composing ? (
    <Compose slot={slot} display={display} />
  ) : (
    <Wall slot={slot} display={display} />
  )
}

function Wall({ slot, display }: { slot: Slot; display: RollingDisplay }) {
  const { slug } = slot
  const navigate = useNavigate()
  const vars = useRollingVars(display)
  const [messages, setMessages] = useState<RollingMessage[]>([])

  useEffect(() => {
    let alive = true
    const load = () =>
      void repo.rolling
        .list(slug)
        .then((m) => {
          if (alive) setMessages(m)
        })
        .catch(() => {})
    load()
    const stop = repo.rolling.watch(slug, load)
    return () => {
      alive = false
      stop()
    }
  }, [slug])

  // 편집기 미리보기(iframe)에선 메시지가 없어도 샘플 포스트잇으로 종이색·글씨체를 보여준다
  const inPreview = typeof window !== 'undefined' && window.parent !== window
  const notes = useMemo(
    () => (messages.length > 0 ? messages : inPreview ? sampleNotes(display) : []),
    [messages, inPreview, display]
  )
  // 벽에 쓰인 쪽지 폰트만 로드 (전부 미리 받지 않는다)
  useEffect(() => {
    for (const m of notes) if (m.font) loadWebfont(m.font)
  }, [notes])

  return (
    <div
      className={`app ${styles.wall}`}
      style={{
        ...vars,
        ...(display.wallBg
          ? {
              backgroundImage: cssUrl(display.wallBg),
              // 반복(타일) 또는 꽉 채우기 — 편집기 체크박스가 정한다
              backgroundRepeat: display.wallBgRepeat ? 'repeat' : 'no-repeat',
              backgroundSize: display.wallBgRepeat ? 'auto' : 'cover',
            }
          : {}),
      }}
    >
      <header className={styles.head} data-align={display.logoAlign}>
        <div
          className={styles.headText}
          data-align={display.logoAlign}
          style={{ textAlign: display.logoAlign, marginTop: display.logoMarginTop || undefined }}
        >
          {display.logo ? (
            <div
              className={styles.logo}
              style={{ backgroundImage: cssUrl(display.logo), backgroundPosition: `${display.logoAlign} center` }}
              role="img"
              aria-label={display.wallTitle}
            />
          ) : (
            display.showTitle && <h1 className={styles.title}>{display.wallTitle}</h1>
          )}
          {display.showSubtitle && display.wallSubtitle && (
            <p className={styles.subtitle}>{display.wallSubtitle}</p>
          )}
        </div>
        {/* 데스크톱: 헤더 CTA (모바일은 하단 고정) */}
        <button
          type="button"
          className={styles.headCta}
          onClick={() => navigate(`/${slug}/write`)}
        >
          <Pencil size={17} aria-hidden="true" />
          {display.postLabel}
        </button>
      </header>

      <main className={`app__scroll ${styles.board}`}>
        {notes.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyNote}>
              <span className={`${styles.tape} ${styles.tapeC}`} aria-hidden="true" />
              <Pencil size={26} strokeWidth={1.5} aria-hidden="true" className={styles.emptyIcon} />
              <p className={styles.emptyText}>
                첫 메시지를
                <br />
                남겨 보세요
              </p>
            </div>
          </div>
        ) : (
          <ul className={styles.masonry} data-rolling-wall>
            {notes.map((m) => (
              <MessageNote key={m.id} message={m} papers={display.papers} />
            ))}
          </ul>
        )}

        {/* 관리자 진입 — 방문자 눈엔 잘 안 띄게 */}
        <div className={styles.adminRow}>
          <button type="button" className={styles.adminLink} onClick={() => navigate(`/${slug}/admin`)}>
            <Settings size={13} aria-hidden="true" />
            관리자
          </button>
        </div>
      </main>

      {/* 모바일 하단 고정 CTA */}
      <div className={styles.fixedBar}>
        <button type="button" className={styles.fixedBtn} onClick={() => navigate(`/${slug}/write`)}>
          <Pencil size={18} aria-hidden="true" />
          {display.postLabel}
        </button>
      </div>
    </div>
  )
}

/** 편집기 미리보기용 샘플 쪽지 — 팔레트 색·손글씨를 돌려 써서 종이색·글씨체가 보이게 한다 */
const SAMPLE_TEXTS: [string, string][] = [
  ['지민', '생일 축하해요! 늘 행복하길 바라요.'],
  ['', '오늘도 반짝반짝!'],
  ['수현', '무대 위에서도 무대 밖에서도 응원해요.'],
  ['', '늘 고마워요.'],
  ['민서', '좋은 일만 가득한 한 해가 되길!'],
  ['유나', '새 앨범 기다릴게요!'],
]
function sampleNotes(display: RollingDisplay): RollingMessage[] {
  const papers = display.papers.length ? display.papers : ['#f4efe2']
  const fonts = ['', ...HANDWRITING_FONTS]
  return SAMPLE_TEXTS.map(([nickname, body], i) => ({
    id: `sample-${i}`,
    nickname,
    body,
    color: papers[i % papers.length],
    font: fonts[i % fonts.length],
    hidden: false,
    createdAt: '',
  }))
}

/** 손으로 붙인 티 — id 로 회전·테이프를 안정적으로 파생 (렌더마다 안 흔들리게) */
function seeded(id: string, salt: number): number {
  let h = salt * 131
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 100000
  return (h % 1000) / 1000
}

function MessageNote({ message, papers }: { message: RollingMessage; papers: string[] }) {
  const paper = message.color || papers[0] || '#f4efe2'
  const rot = (seeded(message.id, 1) * 5 - 2.5).toFixed(2)
  const twoTapes = seeded(message.id, 2) > 0.6
  const tapeTilt = (seeded(message.id, 4) * 8 - 4).toFixed(1)

  return (
    <li className={styles.noteOuter} data-rolling-card>
      <div
        className={styles.note}
        style={{ background: paper, transform: `rotate(${rot}deg)` }}
      >
        {twoTapes ? (
          <>
            <span className={`${styles.tape} ${styles.tapeL}`} aria-hidden="true" />
            <span className={`${styles.tape} ${styles.tapeR}`} aria-hidden="true" />
          </>
        ) : (
          <span
            className={`${styles.tape} ${styles.tapeC}`}
            style={{ transform: `translateX(-50%) rotate(${tapeTilt}deg)` }}
            aria-hidden="true"
          />
        )}
        {message.sticker && (
          <span
            className={styles.sticker}
            style={{ backgroundImage: cssUrl(message.sticker) }}
            aria-hidden="true"
          />
        )}
        <p className={styles.noteBody} style={fontStyle(message.font, 'var(--text-s)')}>
          {message.body}
        </p>
        {message.nickname && (
          <div className={styles.noteName} style={fontStyle(message.font, 'var(--text-xs)')}>
            — {message.nickname}
          </div>
        )}
        <span className={styles.dogEar} aria-hidden="true" />
      </div>
    </li>
  )
}

const MAX_BODY = 120

function Compose({ slot, display }: { slot: Slot; display: RollingDisplay }) {
  const { slug } = slot
  const navigate = useNavigate()
  const vars = useRollingVars(display)

  const [nickname, setNickname] = useState('')
  const [body, setBody] = useState('')
  const [color, setColor] = useState(display.papers[0] ?? '')
  const [font, setFont] = useState('') // '' = 벽 기본 폰트
  const [sticker, setSticker] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)

  // 작성 화면은 폰트 목록을 미리보기하므로 손글씨를 전부 로드
  useEffect(() => {
    for (const id of HANDWRITING_FONTS) loadWebfont(id)
  }, [])

  const canPost = body.trim().length > 0 && !busy

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!canPost) return
    setBusy(true)
    try {
      await repo.rolling.add(slug, {
        nickname: nickname.trim(),
        body: body.trim(),
        color,
        font,
        sticker,
      })
      navigate(`/${slug}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`app ${styles.compose}`} style={vars}>
      <div className={styles.composeTop}>
        <button type="button" className={styles.backBtn} onClick={() => navigate(`/${slug}`)}>
          <ArrowLeft size={17} aria-hidden="true" />
          돌아가기
        </button>
        <div className={styles.composeTitle}>메시지 남기기</div>
        <span className={styles.composeTopSpacer} />
      </div>

      <div className={`app__scroll ${styles.composeWrap}`}>
        <form className={styles.formCard} onSubmit={submit} data-rolling-composer>
          <div className={styles.formHead}>
            <div className={styles.formHeadTitle}>{display.wallSubtitle || '한마디를 남겨 주세요'}</div>
            <div className={styles.formHeadSub}>남기면 바로 벽에 붙어요.</div>
          </div>

          <label className={styles.field}>
            <span className={styles.label}>
              이름 <span className={styles.optional}>(선택)</span>
            </span>
            <input
              className={styles.input}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="남길 이름"
              maxLength={20}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>메시지</span>
            <textarea
              className={styles.textarea}
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, MAX_BODY))}
              placeholder={display.prompt}
              rows={5}
              style={fontStyle(font, 'var(--text-m)')}
            />
            <span className={styles.counter}>
              {body.length} / {MAX_BODY}
            </span>
          </label>

          {display.papers.length > 0 && (
            <div className={styles.field}>
              <span className={styles.label}>쪽지 색</span>
              <div className={styles.swatches} role="radiogroup" aria-label="쪽지 색">
                {display.papers.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={color === c}
                    className={styles.swatch}
                    data-active={color === c}
                    style={{ background: c }}
                    onClick={() => setColor(c)}
                    aria-label={`색 ${c}`}
                  />
                ))}
              </div>
            </div>
          )}

          <div className={styles.field}>
            <span className={styles.label}>글씨체</span>
            <div className={styles.fontList} role="radiogroup" aria-label="글씨체">
              <button
                type="button"
                role="radio"
                aria-checked={font === ''}
                className={styles.fontBtn}
                data-active={font === ''}
                style={fontStyle(display.font, 'var(--text-m)')}
                onClick={() => setFont('')}
                title="기본 글씨체"
              >
                {display.fontSample}
              </button>
              {HANDWRITING_FONTS.map((id) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={font === id}
                  className={styles.fontBtn}
                  data-active={font === id}
                  style={fontStyle(id, 'var(--text-m)')}
                  onClick={() => setFont(id)}
                  title={WEBFONTS[id].label}
                >
                  {display.fontSample}
                </button>
              ))}
            </div>
          </div>

          {display.stickers.length > 0 && (
            <div className={styles.field}>
              <span className={styles.label}>
                스티커 <span className={styles.optional}>(선택)</span>
              </span>
              <div className={styles.stickers} role="radiogroup" aria-label="스티커">
                {display.stickers.map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={sticker === s}
                    className={styles.stickerBtn}
                    data-active={sticker === s}
                    style={{ backgroundImage: cssUrl(s) }}
                    onClick={() => setSticker(sticker === s ? undefined : s)}
                    aria-label="스티커"
                  />
                ))}
              </div>
            </div>
          )}

          <button type="submit" className={styles.submit} disabled={!canPost}>
            {busy ? '남기는 중…' : display.postLabel}
          </button>
        </form>

        {/* 미리보기 — 데스크톱에서 곁에 (CSS 로 좁은 폭에선 숨긴다) */}
        <div className={styles.previewCol}>
          <div className={styles.previewLabel}>미리보기</div>
          <div className={styles.note} style={{ background: color || display.papers[0] || '#f4efe2' }}>
            <span className={`${styles.tape} ${styles.tapeC}`} aria-hidden="true" />
            {sticker && (
              <span className={styles.sticker} style={{ backgroundImage: cssUrl(sticker) }} aria-hidden="true" />
            )}
            <p className={styles.noteBody} style={fontStyle(font, 'var(--text-s)')}>
              {body.trim() || '여기에 메시지가 보여요'}
            </p>
            {nickname.trim() && (
              <div className={styles.noteName} style={fontStyle(font, 'var(--text-xs)')}>
                — {nickname.trim()}
              </div>
            )}
            <span className={styles.dogEar} aria-hidden="true" />
          </div>
        </div>
      </div>
    </div>
  )
}
