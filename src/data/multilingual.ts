import type { Lang } from '@/i18n'
import type { Slot } from '@/types/slot'

/**
 * **주최자가 적는 값의 다국어.**
 *
 * 화면 문구는 우리가 쓰고 사전이 옮긴다 (`src/i18n/`). 그런데 방문자가 보는 글자의 절반은
 * 우리가 안 쓴 것이다 — 경품 이름("1등 사인 폴라로이드"), 스탬프 칸("방명록 작성"),
 * 설문 선택지("청량"), 질문 타로의 질문과 답변. **이건 사전으로 못 푼다.** 행사마다 다르고,
 * 주최자가 오늘 적은 말을 우리가 미리 번역해 둘 방법이 없다.
 *
 * 그래서 **주최자가 직접 언어별로 적는다.** 이 파일은 그 값이 사는 모양과 고르는 규칙이다.
 *
 * ── 모양: 원문 옆에 사전 하나 ──────────────────────
 *
 * 기존 컬럼(`prizes.name`)은 **그대로 둔다.** 언어별 값은 `name_i18n jsonb` 에 따로 든다:
 *
 *     name      = '1등 사인 폴라로이드'          ← 한국어, 늘 있다
 *     name_i18n = { en: 'Signed Polaroid', ja: 'サイン入りチェキ' }
 *
 * 원문을 그대로 두는 이유가 셋이다:
 *
 *  1. **이미 도는 행사가 안 깨진다.** `name_i18n` 이 없으면 지금과 똑같이 돈다.
 *  2. **서버 함수가 안 깨진다.** `draw_prizes` 가 `name` 을 읽어 결과에 담는데, 값을 객체로
 *     바꾸면 그 함수와 저장된 뽑기 기록이 같이 깨진다.
 *  3. **한국어가 특별하지 않아진다.** 원문은 늘 있고, `_i18n` 은 있으면 좋은 덤이다 —
 *     주최자가 영어만 적어 두고 일본어를 비워 둬도 화면이 멀쩡하다.
 *
 * ── 고르는 규칙: 있으면 쓰고 없으면 원문 ───────────
 *
 * `t()` 의 폴백과 **같은 결**이다. 빠진 자리가 고장이 아니라 한국어여야, 주최자가 78장 답변을
 * 세 언어로 다 채우지 않아도 행사를 열 수 있다.
 */

/** 언어 코드 → 그 언어로 적은 값. 빈 문자열은 "안 적었다" 와 같게 본다 */
export type I18nText = Partial<Record<Lang, string>> | null | undefined

/**
 * 지금 언어의 값 — 없으면 원문.
 *
 * `lang === 'ko'` 면 물어볼 것도 없이 원문이다 (원문이 곧 한국어다).
 */
export function pick(base: string, alt: I18nText, lang: Lang): string {
  if (lang === 'ko') return base
  const v = alt?.[lang]
  return v && v.trim() ? v : base
}

/**
 * **주최자에게 물어볼 언어** — 슬롯이 켠 것만.
 *
 * 안 켠 언어의 칸을 띄우면 주최자는 쓰지도 않을 번역을 78번 적게 된다. 나중에 언어를 켜면
 * 그때 칸이 생기고, 그전까지 적어둔 값은 `_i18n` 에 그대로 남아 있다가 살아난다
 * (칸을 안 보여줄 뿐 값을 지우지는 않는다).
 *
 * 한국어는 안 낀다 — 그건 원문 칸이고, 이미 화면에 있다.
 */
export function askLangs(slot: Slot): Lang[] {
  return (slot.langs ?? []).filter((l): l is Lang => l === 'en' || l === 'zh' || l === 'ja')
}

/** 비어 있는 언어를 털어낸 값 — 빈 문자열만 든 객체를 DB 에 넣지 않는다 */
export function clean(alt: I18nText): Partial<Record<Lang, string>> | null {
  if (!alt) return null
  const out: Partial<Record<Lang, string>> = {}
  for (const [k, v] of Object.entries(alt)) {
    if (typeof v === 'string' && v.trim()) out[k as Lang] = v.trim()
  }
  return Object.keys(out).length ? out : null
}

/**
 * **서비스 표시 설정 안의 다국어 묶음** — `display.i18n`.
 *
 * 편집기에서 적는 값은 대부분 `slots.theme` jsonb 안의 서비스별 `display` 에 산다
 * (제목·부제·안내·버튼 라벨…). 값마다 `titleI18n`·`subtitleI18n` 처럼 필드를 하나씩
 * 더하면 **서비스 아홉 개 × 값 다섯 개 = 45개 필드**가 되고, 그때마다 타입·저장·렌더
 * 세 곳을 고쳐야 한다.
 *
 * 그래서 **키 → 언어별 값** 한 묶음으로 든다:
 *
 *     display.i18n = { title: { en: 'Wish tree' }, subtitle: { ja: '…' } }
 *
 * 이러면 타입은 서비스당 한 줄이고, **렌더는 아예 안 고쳐도 된다** —
 * `useLocalizedDisplay`(`src/i18n/display.ts`)가 이 묶음을 먼저 보기 때문이다.
 */
export type DisplayI18n = Record<string, I18nText>

/** `display.i18n` 을 가진 설정 — `useLocalizedDisplay` 가 이 모양을 본다 */
export interface HasI18n {
  i18n?: DisplayI18n
}

/**
 * **줄 맞춘 목록의 다국어** — 보기처럼 *순서가 뜻을 가진* 배열.
 *
 * 모의고사 보기는 순서가 곧 정답 인덱스다 (`quiz_answers.answers` 가 '0'·'2' 로 가리킨다).
 * 그래서 항목마다 사전을 두면 **줄이 어긋나는 순간 채점이 어긋난다** — 배열째 두고
 * 원문과 같은 길이로 맞춰 둔다.
 */
export function pickList(base: string[], alt: Partial<Record<Lang, string[]>> | undefined, lang: Lang): string[] {
  if (lang === 'ko' || !alt) return base
  const row = alt[lang]
  if (!row) return base
  // 짧거나 빈 자리는 원문으로 — 한 줄만 적어 둬도 나머지가 안 사라진다
  return base.map((v, i) => (row[i]?.trim() ? row[i] : v))
}

/** 비어 있는 언어를 털어낸 목록 묶음 — 다 빈 배열이면 통째로 안 넣는다 */
export function cleanList(
  alt: Partial<Record<Lang, string[]>> | undefined,
  len: number
): Partial<Record<Lang, string[]>> | null {
  if (!alt) return null
  const out: Partial<Record<Lang, string[]>> = {}
  for (const [k, v] of Object.entries(alt)) {
    if (!Array.isArray(v)) continue
    // 원문과 길이를 맞춰 둔다 — 짧으면 화면이 원문으로 떨어지므로 손해가 없다
    const row = Array.from({ length: len }, (_, i) => (typeof v[i] === 'string' ? v[i].trim() : ''))
    if (row.some((x) => x)) out[k as Lang] = row
  }
  return Object.keys(out).length ? out : null
}
