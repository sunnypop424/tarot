import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, Pencil } from 'lucide-react'

import { useSlotState } from '@/slot/SlotProvider'
import { rollingDisplay, type RollingDisplay } from '@/data/rolling'
import { loadWebfont, fontStack, fontStyle, HANDWRITING_FONTS, WEBFONTS } from '@/data/fonts'
import { repo } from '@/lib/repo'
import { Pager, usePaged } from '@/components/Pager'
import { cssUrl } from '@/lib/image'
import type { RollingMessage } from '@/lib/repo/types'
import type { Slot } from '@/types/slot'
import { AdminEntry } from '@/components/AdminEntry'
import { LangPicker } from '@/components/LangPicker'
import { useT } from '@/i18n'
import { ServiceHeader } from '@/components/ServiceHeader'
import styles from './Rolling.module.css'
import { useLocalizedDisplay } from '@/i18n/display'

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
  const rawDisplay = useMemo(() => rollingDisplay(slot), [slot])
  /** 기본 문구는 사전에서 번역되고, 주최자가 쓴 문구는 원문 그대로 (src/i18n/display.ts) */
  const display = useLocalizedDisplay(rawDisplay)
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
  const t = useT()
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
  /**
   * **페이지로 나눈다** (소원나무와 같은 장치 — `components/Pager.tsx`).
   * 쪽지가 쌓이면 스크롤이 끝없이 길어진다. 카페에서 폰으로 보는 화면이라 "아래로 계속"
   * 보다 "넘겨서 본다" 가 낫고, 한 번에 그리는 쪽지 수도 그만큼만 유지된다.
   *
   * 한 페이지 분량은 **열 수 × 6** 이다. 열 수는 CSS 메이슨리(`column-count`)와 같은
   * 분기점을 쓴다 — 한쪽만 고치면 페이지가 반쯤 비거나 넘친다.
   */
  const boardRef = useRef<HTMLElement | null>(null)
  const roRef = useRef<ResizeObserver | null>(null)
  const [boardW, setBoardW] = useState(390)
  const setBoard = useCallback((el: HTMLElement | null) => {
    boardRef.current = el
    roRef.current?.disconnect()
    if (!el) return
    const ro = new ResizeObserver(([e]) => setBoardW(e.contentRect.width))
    ro.observe(el)
    roRef.current = ro
  }, [])
  useEffect(() => () => roRef.current?.disconnect(), [])
  const cols = boardW >= 1200 ? 5 : boardW >= 900 ? 4 : boardW >= 640 ? 3 : 2
  const paged = usePaged(notes, cols * 6)

  // 벽에 쓰인 쪽지 폰트만 로드 (전부 미리 받지 않는다) — 지금 페이지 것만
  useEffect(() => {
    for (const m of paged.items) if (m.font) loadWebfont(m.font)
  }, [paged.items])

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
      <ServiceHeader
        variant="mark"
        logo={display.logo}
        title={t(display.wallTitle)}
        showTitle={display.showTitle}
        align={display.logoAlign}
        marginTop={display.logoMarginTop}
        /* 로고가 곧 이벤트 제목이다 — 로고를 올리면 제목 글자는 안 그린다 */
        titleWithLogo={false}
        classes={{ head: styles.head, logo: styles.logo, title: styles.title, text: styles.headText }}
        below={
          display.showSubtitle && display.wallSubtitle ? (
            <p className={styles.subtitle}>{display.wallSubtitle}</p>
          ) : null
        }
      >
        {/* 데스크톱: 헤더 CTA (모바일은 하단 고정) */}
        <button
          type="button"
          className={styles.headCta}
          onClick={() => navigate(`/${slug}/write`)}
        >
          <Pencil size={17} aria-hidden="true" />
          {t(display.postLabel)}
        </button>
      </ServiceHeader>

      <main ref={setBoard} className={`app__scroll ${styles.board}`}>
        {notes.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyNote}>
              <span className={`${styles.tape} ${styles.tapeC}`} aria-hidden="true" />
              <Pencil size={26} strokeWidth={1.5} aria-hidden="true" className={styles.emptyIcon} />
              {/* 줄바꿈을 문장에서 뺐다 — 언어마다 끊을 자리가 다르다 (CSS 가 감싼다) */}
              <p className={styles.emptyText}>{t('첫 메시지를 남겨 보세요')}</p>
            </div>
          </div>
        ) : (
          <>
            <ul className={styles.masonry} data-rolling-wall>
              {paged.items.map((m) => (
                <MessageNote key={m.id} message={m} papers={display.papers} />
              ))}
            </ul>
            <Pager page={paged.page} pages={paged.pages} onPage={paged.setPage} label={t('벽')} />
          </>
        )}

        {/* 관리자 진입 — 방문자 눈엔 잘 안 띄게 */}
        <div className={styles.adminRow}>
          <AdminEntry slug={slug} className={styles.adminLink} />
        </div>
      </main>

      {/* 모바일 하단 고정 CTA */}
      <div className={styles.fixedBar}>
        <button type="button" className={styles.fixedBtn} onClick={() => navigate(`/${slug}/write`)}>
          <Pencil size={18} aria-hidden="true" />
          {t(display.postLabel)}
        </button>
      </div>
    </div>
  )
}

/** 편집기 미리보기용 샘플 쪽지 — 팔레트 색·손글씨를 돌려 써서 종이색·글씨체가 보이게 한다 */
const SAMPLE_TEXTS: [string, string][] = [
  ['첫눈', '생일 축하해요! 늘 행복하길 바라요.'],
  ['', '오늘도 반짝반짝!'],
  ['바람', '무대 위에서도 무대 밖에서도 응원해요.'],
  ['', '늘 고마워요.'],
  ['초록', '좋은 일만 가득한 한 해가 되길!'],
  ['다래', '새 앨범 기다릴게요!'],
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
        {/* 방문자가 쓴 글 — 번역 대상이 아니다 (`scripts/verify-i18n-leak.mjs`) */}
        <p
          className={styles.noteBody}
          style={fontStyle(message.font, 'var(--text-s)')}
          data-user-text
        >
          {message.body}
        </p>
        {message.nickname && (
          <div
            className={styles.noteName}
            style={fontStyle(message.font, 'var(--text-xs)')}
            data-user-text
          >
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
  const t = useT()
  const navigate = useNavigate()
  const vars = useRollingVars(display)

  const [nickname, setNickname] = useState('')
  const [body, setBody] = useState('')
  const [color, setColor] = useState(display.papers[0] ?? '')
  const [font, setFont] = useState('') // '' = 벽 기본 폰트
  const [sticker, setSticker] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 작성 화면은 폰트 목록을 미리보기하므로 손글씨를 전부 로드
  useEffect(() => {
    for (const id of HANDWRITING_FONTS) loadWebfont(id)
  }, [])

  const canPost = body.trim().length > 0 && !busy

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!canPost) return
    setBusy(true)
    setError(null)
    try {
      /** **체험용 슬롯은 서버로 안 보낸다** (`slot.demo` — 0030). 공개 주소라 낙서가 남는다 */
      if (!slot.demo) {
        await repo.rolling.add(slug, {
          nickname: nickname.trim(),
          body: body.trim(),
          color,
          font,
          sticker,
        })
      }
      navigate(`/${slug}`)
    } catch (e) {
      /**
       * **거절 사유를 그대로 보여준다.** 금칙어에 걸리면 서버가 한국어로 답한다
       * (`0041_banned_words.sql`) — 어떤 단어인지는 안 알려준다(알려주면 우회 설명서가 된다).
       * 예전엔 여기서 예외를 삼켜서, 안 남겨졌는데 벽으로 돌아가 "왜 내 쪽지가 없지" 가 됐다.
       */
      setError(e instanceof Error ? e.message : t('남기지 못했어요. 잠시 뒤 다시 시도해 주세요.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`app ${styles.compose}`} style={vars}>
      <div className={styles.composeTop}>
        <button type="button" className={styles.backBtn} onClick={() => navigate(`/${slug}`)}>
          <ArrowLeft size={17} aria-hidden="true" />
          {t('돌아가기')}
        </button>
        <div className={styles.composeTitle}>{t('메시지 남기기')}</div>
        {/*
          * 빈 칸(`composeTopSpacer`) 자리에 고르개를 놓는다 — 제목을 가운데 두려고 만든
          * 균형추라 크기가 비슷하고, 새 줄을 만들지 않아 작성 화면이 안 길어진다.
          * 여기가 없으면 `/write` 로 바로 들어온 사람은 언어를 못 바꾼다.
          */}
        <span className={styles.composeTopSpacer}>
          <LangPicker only={slot.langs ?? []} />
        </span>
      </div>

      <div className={`app__scroll ${styles.composeWrap}`}>
        <form className={styles.formCard} onSubmit={submit} data-rolling-composer>
          <div className={styles.formHead}>
            <div className={styles.formHeadTitle}>{display.wallSubtitle || t('한마디를 남겨 주세요')}</div>
            <div className={styles.formHeadSub}>{t('남기면 바로 벽에 붙어요.')}</div>
          </div>

          <label className={styles.field}>
            <span className={styles.label}>
              {t('이름')} <span className={styles.optional}>{t('(선택)')}</span>
            </span>
            <input
              className={styles.input}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder={t('남길 이름')}
              maxLength={20}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>{t('메시지')}</span>
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
              <span className={styles.label}>{t('쪽지 색')}</span>
              <div className={styles.swatches} role="radiogroup" aria-label={t('쪽지 색')}>
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
            <span className={styles.label}>{t('글씨체')}</span>
            <div className={styles.fontList} role="radiogroup" aria-label={t('글씨체')}>
              <button
                type="button"
                role="radio"
                aria-checked={font === ''}
                className={styles.fontBtn}
                data-active={font === ''}
                style={fontStyle(display.font, 'var(--text-m)')}
                onClick={() => setFont('')}
                title={t('기본 글씨체')}
              >
                {/* 글씨체를 보여주는 게 목적인 견본 — 번역하면 그 글씨체의 한글 모양을 못 본다 */}
                <span data-user-text>{display.fontSample}</span>
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
                  <span data-user-text>{display.fontSample}</span>
                </button>
              ))}
            </div>
          </div>

          {display.stickers.length > 0 && (
            <div className={styles.field}>
              <span className={styles.label}>
                {t('스티커')} <span className={styles.optional}>{t('(선택)')}</span>
              </span>
              <div className={styles.stickers} role="radiogroup" aria-label={t('스티커')}>
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
                    aria-label={t('스티커')}
                  />
                ))}
              </div>
            </div>
          )}

          {error && (
            <p className={styles.error} role="alert" data-post-error>
              {error}
            </p>
          )}

          <button type="submit" className={styles.submit} disabled={!canPost}>
            {busy ? t('남기는 중…') : t(display.postLabel)}
          </button>
        </form>

        {/* 미리보기 — 데스크톱에서 곁에 (CSS 로 좁은 폭에선 숨긴다) */}
        <div className={styles.previewCol}>
          <div className={styles.previewLabel}>{t('미리보기')}</div>
          <div className={styles.note} style={{ background: color || display.papers[0] || '#f4efe2' }}>
            <span className={`${styles.tape} ${styles.tapeC}`} aria-hidden="true" />
            {sticker && (
              <span className={styles.sticker} style={{ backgroundImage: cssUrl(sticker) }} aria-hidden="true" />
            )}
            <p className={styles.noteBody} style={fontStyle(font, 'var(--text-s)')}>
              {body.trim() || t('여기에 메시지가 보여요')}
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
