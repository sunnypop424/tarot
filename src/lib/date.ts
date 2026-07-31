/**
 * 날짜 문구는 **사전이 아니라 `toLocaleDateString`** 으로 푼다 — "2026년 7월 15일 수요일"
 * 같은 문장을 사전 키로 만들면 날짜 수만큼 키가 생긴다. 언어는 호출자가 넘긴다
 * (여기는 훅을 못 쓰는 순수 함수라 — 화면이 `useLang()` 의 값을 내려 준다).
 */

/** ko "2026년 7월 15일 수요일" · en "Wednesday, July 15, 2026" */
export function formatDateLabel(d: Date = new Date(), lang = 'ko'): string {
  return d.toLocaleDateString(lang, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
}

/** ko "7월 13일 ~ 7월 19일" · en "July 13 ~ July 19" — 이번 주(월~일) */
export function formatWeekLabel(d: Date = new Date(), lang = 'ko'): string {
  const dayNum = d.getDay() || 7 // 월=1 … 일=7
  const monday = new Date(d)
  monday.setDate(d.getDate() - (dayNum - 1))
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const md = (x: Date) => x.toLocaleDateString(lang, { month: 'long', day: 'numeric' })
  return `${md(monday)} ~ ${md(sunday)}`
}

/** ko "2026년 7월" · en "July 2026" */
export function formatMonthLabel(d: Date = new Date(), lang = 'ko'): string {
  return d.toLocaleDateString(lang, { year: 'numeric', month: 'long' })
}

/** "2026-07-15" — 하루 단위. 자정 리셋 기준 (로컬 타임존) */
export function dateKey(d: Date = new Date()): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/** "2026-W29" — ISO 주차. 월요일에 주가 바뀐다 */
export function weekKey(d: Date = new Date()): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  // ISO 기준: 목요일이 속한 해가 그 주의 해
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

/** "2026-07" — 월 단위 */
export function monthKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** 해석 텍스트의 첫 문장 — 오늘의 운세 한 줄 요약에 쓴다 */
export function firstSentence(text: string): string {
  const match = text.match(/^[^.!?]*[.!?]/)
  return match ? match[0].trim() : text
}
