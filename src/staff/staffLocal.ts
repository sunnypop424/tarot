import { useEffect, useState } from 'react'

/**
 * 스태프 기기의 **이 기기 기록** — 오늘 몇 건 처리했나, 직전 결과는 무엇이었나.
 *
 * **서버 숫자가 아니다.** 서버는 "이 슬롯에서 오늘 몇 장 나갔나" 를 알지만, 부스에 기기가
 * 둘이면 그건 두 사람 몫이 섞인 값이다. 스태프가 알고 싶은 건 대개 **자기 기기**의 흐름이라
 * 여기서는 그걸 센다 — 그래서 화면에도 "이 기기" 라고 적는다.
 *
 * 날짜가 바뀌면 저절로 0 이 된다(키에 날짜가 없고 값에 날짜를 넣는다 — 어제 키가 쌓이지 않게).
 */

const KEY = (slug: string) => `tarot-pocket:staff:${slug}`

interface Kept<T> {
  /** KST 날짜 — 다르면 오늘 것이 아니다 */
  day: string
  count: number
  /** 직전 결과 — 전달 착오가 나면 되짚어야 한다 */
  last: T | null
  at: string | null
}

/** KST 오늘 (서버 시계가 아니라 표시용이다 — 판정은 서버가 한다) */
function todayKst(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
}

function read<T>(slug: string): Kept<T> {
  const empty: Kept<T> = { day: todayKst(), count: 0, last: null, at: null }
  try {
    const raw = localStorage.getItem(KEY(slug))
    if (!raw) return empty
    const kept = JSON.parse(raw) as Kept<T>
    return kept.day === todayKst() ? kept : empty
  } catch {
    return empty
  }
}

function write<T>(slug: string, value: Kept<T>): void {
  try {
    localStorage.setItem(KEY(slug), JSON.stringify(value))
  } catch {
    /* 사파리 프라이빗 모드 — 세는 건 편의라 실패해도 화면은 그대로 돌아야 한다 */
  }
}

/**
 * 오늘 이 기기에서 처리한 수 + 직전 결과.
 * `record(result)` 를 부르면 하나 올리고 직전 결과를 덮어쓴다.
 */
export function useStaffLog<T>(slug: string) {
  const [kept, setKept] = useState<Kept<T>>(() => read<T>(slug))

  useEffect(() => {
    setKept(read<T>(slug))
  }, [slug])

  const record = (result: T) => {
    const next: Kept<T> = {
      day: todayKst(),
      count: read<T>(slug).count + 1,
      last: result,
      at: new Date().toISOString(),
    }
    write(slug, next)
    setKept(next)
  }

  return { count: kept.count, last: kept.last, at: kept.at, record }
}

/**
 * 연결 상태 — **카페 와이파이는 끊긴다.**
 *
 * 끊긴 걸 모르면 "뽑지 못했어요" 만 뜨고 스태프는 시스템이 고장난 줄 안다.
 * `navigator.onLine` 은 "랜선이 꽂혀 있나" 수준이라 거짓 양성이 있지만, **끊겼다고 말할 때는
 * 대체로 진짜 끊긴 것**이라 이 방향으로만 쓴다(온라인이라고 안심시키지 않는다).
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}
