import { useEffect, useRef, useState } from 'react'
import { Check, Globe } from 'lucide-react'

import { LANGS, useLang, type Lang } from '@/i18n'
import styles from './LangPicker.module.css'

/**
 * 언어 고르개 — **지구본 단추 + 펼침 목록.**
 *
 * 처음엔 한/EN 을 나란히 놓은 알약 토글이었는데, 언어가 넷이 되면서 못 쓰게 됐다:
 * 390px 폰 헤더에 글자 한 자짜리 칸 넷이 붙으면 뭘 고르는 자리인지도 안 보이고,
 * 누를 자리도 좁다. 그리고 '中'·'日' 같은 한 글자 표기는 **그 언어 사용자에게조차** 불친절하다.
 *
 * 지구본은 만국 공통 기호라 한국어를 못 읽는 사람도 무슨 단추인지 안다. 펼치면 언어 이름을
 * **그 언어로** 온전히 보여준다(English · 中文 · 日本語) — 자기 언어를 자기 글자로 찾는 게
 * 제일 빠르다. 언어가 더 늘어도 목록만 길어질 뿐 헤더는 안 좁아진다.
 *
 * **방문자 화면에서는 슬롯이 고른 언어만 뜬다** (`slot.langs`). 관리 화면에서는 넷 다 뜬다 —
 * 주최자 계정을 누구에게 주게 될지 우리가 미리 알 수 없다.
 * 편집기에는 없다 (한국어 고정 — `src/i18n/index.tsx` 머리말).
 */
export function LangPicker({ only, className }: { only?: string[]; className?: string }) {
  const { lang, setLang } = useLang()
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement | null>(null)

  /**
   * **한국어는 늘 목록에 있다.** `only` 에 없어도 넣는다 — 그게 기본값이라, 빼면
   * 한국어로 되돌아올 길이 사라진다 (실제로 그 언어에 갇힐 수 있다).
   */
  const shown = only ? LANGS.filter((l) => l.id === 'ko' || only.includes(l.id)) : LANGS
  const current = LANGS.find((l) => l.id === lang) ?? LANGS[0]

  /**
   * 바깥을 누르거나 Esc 면 닫는다. 스크롤로는 안 닫는다 — 목록이 짧아 스크롤 중에 닫히면
   * 오히려 다시 눌러야 한다.
   */
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // 고를 게 하나뿐이면 단추가 아니라 장식이다 — 안 그린다
  if (shown.length < 2) return null

  return (
    <div ref={boxRef} className={`${styles.wrap} ${className ?? ''}`}>
      <button
        type="button"
        className={styles.btn}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        /* 지구본만으로도 통하지만, 스크린리더에는 지금 언어까지 말해 준다 */
        aria-label={`언어 / Language · ${current.label}`}
        data-lang-open
      >
        <Globe size={16} strokeWidth={2} aria-hidden="true" />
        <span className={styles.now}>{current.short}</span>
      </button>

      {open && (
        <ul className={styles.menu} role="listbox" aria-label="언어 / Language" data-lang-menu>
          {shown.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                role="option"
                aria-selected={lang === l.id}
                className={styles.item}
                data-on={lang === l.id || undefined}
                onClick={() => {
                  setLang(l.id as Lang)
                  setOpen(false)
                }}
                data-lang={l.id}
              >
                {/* 언어 이름은 **그 언어로** — 자기 글자를 찾는 게 제일 빠르다 */}
                <span>{l.label}</span>
                {lang === l.id && <Check size={14} strokeWidth={2.5} aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
