import type { Slot } from '@/types/slot'

/**
 * slots.json 내보내기 / 가져오기.
 *
 * 편집분은 이 브라우저의 localStorage 에만 있다 — 내보낸 파일을 레포 `src/data/slots.json` 에
 * 넣고 재배포해야 실제로 슬롯이 열린다. 목록과 편집기 양쪽에서 쓴다.
 */

export function exportSlots(slots: Slot[]): void {
  const blob = new Blob([JSON.stringify(slots, null, 2) + '\n'], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'slots.json'
  a.click()
  URL.revokeObjectURL(url)
}

export async function importSlots(file: File): Promise<Slot[]> {
  const parsed: unknown = JSON.parse(await file.text())
  if (!Array.isArray(parsed)) throw new Error('슬롯 배열이 아니에요')
  return parsed as Slot[]
}
