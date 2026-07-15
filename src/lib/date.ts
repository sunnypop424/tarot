const DAYS = ['일', '월', '화', '수', '목', '금', '토']

/** "2026년 7월 15일 수요일" */
export function formatDateLabel(d: Date = new Date()): string {
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${DAYS[d.getDay()]}요일`
}

/** "7월 13일 ~ 7월 19일" — 이번 주(월~일) */
export function formatWeekLabel(d: Date = new Date()): string {
  const dayNum = d.getDay() || 7 // 월=1 … 일=7
  const monday = new Date(d)
  monday.setDate(d.getDate() - (dayNum - 1))
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return `${monday.getMonth() + 1}월 ${monday.getDate()}일 ~ ${sunday.getMonth() + 1}월 ${sunday.getDate()}일`
}

/** "2026년 7월" */
export function formatMonthLabel(d: Date = new Date()): string {
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월`
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
