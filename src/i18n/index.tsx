import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import { ADMIN_EN } from './admin.en'
import { ADMIN_JA } from './admin.ja'
import { ADMIN_ZH } from './admin.zh'
import { ADMIN2_EN } from './admin2.en'
import { ADMIN2_JA } from './admin2.ja'
import { ADMIN2_ZH } from './admin2.zh'
import { LANDING_EN } from './landing.en'
import { LANDING_JA } from './landing.ja'
import { LANDING_ZH } from './landing.zh'
import { EN } from './en'
import { JA } from './ja'
import { ZH } from './zh'

/**
 * 한국어 · 영어 · 중국어 · 일본어 — **방문자 화면과 주최자 화면만.** 편집기는 한국어 고정이다
 * (쓰는 사람이 우리 하나라 번역을 유지보수할 이유가 없다 — CLAUDE.md 의 역할 분리와 같은 결).
 *
 * ── 키가 **한국어 원문 그 자체**다 ─────────────────────
 *
 * `t('저장했어요')` 처럼 부른다. 흔한 방식(`t('admin.saved')`)을 안 쓴 이유가 셋 있다:
 *
 *  1. **빠진 번역이 안전하다.** 사전에 없으면 한국어가 그대로 나온다 — 지금과 똑같은 화면이다.
 *     키 방식이면 못 찾은 자리에 `admin.saved` 같은 날것이 뜨고, 그건 고장으로 보인다.
 *     화면이 1,500줄인데 한 번에 다 번역할 수 없으므로 이 성질이 결정적이다.
 *  2. **코드를 읽을 때 무슨 글자인지 보인다.** 키만 있으면 사전을 열어야 화면을 상상할 수 있다.
 *  3. **옮기는 작업이 기계적이다.** `"저장했어요"` → `{t('저장했어요')}` 로 감싸기만 하면 된다.
 *     키를 새로 지으면 이름을 1,500번 고민해야 하고, 그 과정에서 실수가 난다.
 *
 * 대가는 안다: 같은 한국어가 자리마다 다른 영어여야 할 때 구분할 수 없다. 그런 자리가 생기면
 * 한국어 쪽을 더 구체적으로 쓰면 된다 — 어차피 그게 한국어 화면에도 더 나은 문장이다.
 *
 * ── 번역할 수 없는 것 ────────────────────────────────
 *
 * **주최자가 입력한 내용은 한국어로 남는다** — 질문·상품명·문항·칭호·쪽지·이벤트명.
 * 그건 데이터고, 우리가 번역할 수 없다. 화면이 그 사실을 방문자에게 말해 준다
 * (`LangPicker` 와 편집기 힌트가 그 한계를 적는다).
 */

/**
 * 지원 언어 넷 — 생일카페에 실제로 오는 순서다 (한국 · 영어권 · 중화권 · 일본).
 * 늘리려면 사전 파일 하나를 더하고 여기 배열에 한 줄 넣으면 된다 — 화면은 안 건드린다.
 */
export const LANGS = [
  { id: 'ko', short: '한', label: '한국어' },
  { id: 'en', short: 'EN', label: 'English' },
  { id: 'zh', short: '中', label: '中文' },
  { id: 'ja', short: '日', label: '日本語' },
] as const

export type Lang = (typeof LANGS)[number]['id']

/**
 * 언어 → BCP 47 로케일. **숫자·날짜도 언어를 따라가야 한다.**
 *
 * `toLocaleString('ko-KR')` 이 25곳에 박혀 있었다. 글자는 영어로 바뀌는데 시각만
 * "오후 12:57" 로 남아서, 영어 화면에 한국어가 섞여 있다는 게 여기서도 새어 나왔다.
 * 형식은 사전의 일이 아니라 **런타임의 일**이라 `t()` 로는 못 잡는다 — 로케일을 넘겨야 한다.
 */
export const LOCALE: Record<Lang, string> = {
  ko: 'ko-KR',
  en: 'en-US',
  zh: 'zh-CN',
  ja: 'ja-JP',
}

/**
 * 언어별 사전 — **한국어는 사전이 없다.** 키가 곧 한국어 원문이라 돌려줄 게 자기 자신이다.
 * `Record<Lang, …>` 가 아니라 부분 맵인 이유가 그것이다.
 *
 * 방문자 사전과 관리 사전을 **여기서 합친다.** 파일을 나눈 건 읽는 사람이 달라서지
 * (`admin.en.ts` 머리말) 찾는 방법이 달라서가 아니다 — 화면은 `t()` 하나만 안다.
 * 같은 키가 양쪽에 있으면 **관리 쪽이 이긴다**: 관리 도구에서만 쓰는 낱말이 방문자 문구와
 * 우연히 같을 때(예: '카드'), 관리 화면에서 더 정확한 말이 나와야 한다.
 */
const DICTS: Partial<Record<Lang, Record<string, string>>> = {
  en: { ...EN, ...ADMIN_EN, ...ADMIN2_EN, ...LANDING_EN },
  zh: { ...ZH, ...ADMIN_ZH, ...ADMIN2_ZH, ...LANDING_ZH },
  ja: { ...JA, ...ADMIN_JA, ...ADMIN2_JA, ...LANDING_JA },
}

/** 치환값 — `t('{n}개를 넣었어요', { n: 3 })` */
export type Vars = Record<string, string | number>

const KEY = 'tarot-pocket:lang'

const isLang = (v: unknown): v is Lang => LANGS.some((l) => l.id === v)

function readLang(): Lang {
  try {
    const saved = localStorage.getItem(KEY)
    return isLang(saved) ? saved : 'ko'
  } catch {
    // Safari 프라이빗 모드 — 못 읽어도 앱은 돌아야 한다 (visitor.ts 와 같은 판단)
    return 'ko'
  }
}

interface LangState {
  lang: Lang
  setLang: (next: Lang) => void
  /**
   * 슬롯이 정한 **기본 언어**를 적용한다 — **방문자가 한 번도 안 골랐을 때만.**
   *
   * 골랐다면 그쪽이 이긴다. 안 그러면 한국어로 바꿔 놓고 새로고침할 때마다 슬롯 기본값으로
   * 돌아가서, 방문자 입장에선 "언어가 안 바뀐다" 가 된다.
   */
  applyDefault: (lang: string | undefined, allowed: string[] | undefined) => void
  t: (ko: string, vars?: Vars) => string
}

/**
 * 기본값이 **한국어 + 그대로 돌려주는 `t`** 다.
 * 제공자 밖에서 불러도(테스트·편집기 미리보기) 화면이 안 깨진다.
 */
const Ctx = createContext<LangState>({
  lang: 'ko',
  setLang: () => {},
  applyDefault: () => {},
  t: (ko) => ko,
})

/**
 * 사전에서 찾고, **없으면 한국어 원문.** 치환은 찾은 뒤에 한다.
 *
 * 폴백이 영어가 아니라 한국어인 게 중요하다: 중국어 사전에 한 줄이 비었을 때 영어로 떨어지면
 * 화면에 세 언어가 섞인다. 한국어로 떨어지면 "아직 번역 안 된 자리" 로 읽히고, 그게 사실이다.
 */
function translate(lang: Lang, ko: string, vars?: Vars): string {
  const base = DICTS[lang]?.[ko] ?? ko
  if (!vars) return base
  return base.replace(/\{(\w+)\}/g, (whole: string, name: string) =>
    // 못 채운 자리는 **그대로 둔다** — 빈칸으로 지우면 문장이 조용히 틀려진다
    name in vars ? String(vars[name]) : whole
  )
}

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readLang)

  /**
   * `<html lang>` 을 **처음 뜰 때도** 맞춘다.
   *
   * 예전엔 `setLang` 안에서만 바꿔서, 새로고침하면 화면 글자는 일본어인데 `lang` 은 `ko` 로
   * 되돌아갔다 — 스크린리더가 일본어를 한국어 발음으로 읽고 브라우저 번역기도 헛짚는다.
   * 화면에 안 보이는 값이라 눈으로는 절대 안 잡힌다 (`verify-i18n.mjs` 가 잡았다).
   */
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    try {
      localStorage.setItem(KEY, next)
    } catch {
      /* 저장 못 해도 이번 세션은 바뀐 언어로 돈다 */
    }
    // `<html lang>` 은 위 effect 가 맞춘다 — 여기서 또 쓰면 두 곳이 갈라진다
  }, [])

  /**
   * 슬롯이 정한 기본 언어 — **저장된 선택이 없을 때만** 쓴다.
   *
   * `localStorage` 에 값이 있으면 그건 방문자가 직접 고른 것이므로 건드리지 않는다.
   * 안 그러면 한국어로 바꿔 놓고 새로고침할 때마다 슬롯 기본값으로 돌아가서,
   * 방문자 입장에선 "언어가 안 바뀐다" 가 된다.
   *
   * `allowed` 에 없는 값은 무시한다 — 고를 수 없는 언어로 열어 두면 되돌릴 길이 없다.
   */
  const applyDefault = useCallback((want: string | undefined, allowed: string[] | undefined) => {
    if (!want || want === 'ko' || !isLang(want)) return
    if (!allowed?.includes(want)) return
    try {
      if (localStorage.getItem(KEY)) return
    } catch {
      /* 저장소를 못 읽으면 이번 세션에만 적용한다 */
    }
    setLangState(want)
  }, [])

  const value = useMemo<LangState>(
    () => ({ lang, setLang, applyDefault, t: (ko, vars) => translate(lang, ko, vars) }),
    [lang, setLang, applyDefault]
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useLang(): LangState {
  return useContext(Ctx)
}

/** 문장 하나만 필요한 흔한 경우 — `const t = useT()` */
export function useT(): (ko: string, vars?: Vars) => string {
  return useContext(Ctx).t
}

/**
 * 지금 언어의 로케일 — `const loc = useLocale()` 뒤에 `n.toLocaleString(loc)`.
 *
 * 모듈 함수(훅을 못 쓰는 자리)는 이걸 **인자로 받는다** — `fmt(iso, loc)`.
 */
export function useLocale(): string {
  return LOCALE[useContext(Ctx).lang]
}
