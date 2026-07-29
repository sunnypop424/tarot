/**
 * CSV 내보내기 — **주최자 화면 전부가 여기 하나를 쓴다.**
 *
 * 예전엔 한 글자도 다르지 않은 `cell()` 이 여섯 파일에 복사돼 있었고, 그 아래 BOM·Blob·
 * 앵커 클릭 블록까지 통째로 다섯 번 반복됐다. **내보낸 파일이 깨지는 버그가 나오면 여섯 곳을
 * 다 고쳐야 하고, 하나를 빠뜨리면 그 화면의 내보내기만 조용히 깨진다.**
 * 그 파일은 개인정보가 든 파일이다 (`docs/REVIEW_COMMON.md` 10번).
 */

/** CSV 한 칸 — 쉼표·따옴표·줄바꿈이 들어가면 깨지므로 감싸고 따옴표는 두 번 쓴다 */
export const cell = (v: string | number | null | undefined): string =>
  `"${String(v ?? '').replaceAll('"', '""')}"`

/** 날짜 칸 — 주최자가 엑셀에서 그대로 읽는 값이라 로컬 표기로 넣는다 */
export const when = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleString('ko-KR') : ''

/**
 * 표 한 장을 파일로 내려받는다.
 *
 * **BOM 을 붙인다** — 안 붙이면 엑셀이 한글을 깨진 글자로 연다.
 * 줄바꿈은 `\r\n` 이다 (엑셀이 `\n` 만 있으면 한 줄로 읽는 판이 있다).
 */
export function downloadCsv(
  filename: string,
  header: string[],
  rows: (string | number | null | undefined)[][]
): void {
  const body = [header.map(cell).join(','), ...rows.map((r) => r.map(cell).join(','))].join('\r\n')
  const blob = new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
