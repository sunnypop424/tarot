/**
 * 방문자 보관함 — **이 폰에만 있다. 서버로 절대 안 간다.**
 *
 * 뽑은 포토카드, 찍은 스탬프, 응시 이력처럼 "내가 뭘 했나" 를 다시 보여주는 값들이 여기 쌓인다.
 * 서버에 두지 않는 이유는 단순하다: **방문자 로그인이 없어서 서버가 이걸 누구 것이라고
 * 말할 방법이 없다.** 닉네임이나 코드로 식별하기 시작하면 그때부터 개인정보를 보관하는 일이 된다.
 *
 * 대가는 분명하다 — **브라우저 데이터를 지우거나 폰을 바꾸면 사라진다.** 이건 버그가 아니라
 * 선택이고, 그러므로 **화면이 그렇게 말해야 한다** ("이 기기에만 저장돼요"). 안 적으면
 * 현장에서 "제 카드 어디 갔어요" 를 듣게 된다.
 *
 * **여기 있는 값은 진위의 근거가 아니다.** 실물 교환처럼 무언가를 내주는 판단은 반드시 서버가
 * 한다 (개발자도구로 이 값을 고치는 건 아무나 할 수 있다). 보관함은 표시용 캐시일 뿐이다.
 *
 * 서버로 나가는 익명 식별자는 `visitor.ts` 에 따로 있다 — 섞지 않는다.
 */

/** `tarot-pocket:{feature}:{slug}` — `repo/rolling.ts` 의 기존 키 규약 그대로 */
const keyFor = (feature: string, slug: string) => `tarot-pocket:${feature}:${slug}`

/**
 * 한 슬롯·한 기능이 쌓을 수 있는 최대 개수.
 * 루프나 연타가 localStorage 쿼터(보통 5MB)를 태우면 **그 도메인의 다른 저장까지 같이 죽는다** —
 * 보관함 하나 때문에 슬롯 테마 캐시나 세션이 날아가는 건 너무 비싼 대가다.
 */
const DEFAULT_CAP = 200

export function readList<T>(feature: string, slug: string): T[] {
  try {
    const raw = localStorage.getItem(keyFor(feature, slug))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    // 손으로 고쳤거나 예전 포맷이 남아 있을 수 있다 — 배열이 아니면 없는 셈 친다
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

/**
 * 뒤에 붙인다 — **오래된 것이 앞이다.** 화면에서 최신을 먼저 보이고 싶으면 그리는 쪽에서 뒤집는다
 * (저장 순서를 뒤집으면 `cap` 이 넘칠 때 잘라낼 쪽이 헷갈린다).
 * `id` 가 이미 있으면 아무것도 안 한다 — 같은 뽑기를 두 번 기록하지 않는다.
 */
export function appendItem<T extends { id: string }>(
  feature: string,
  slug: string,
  item: T,
  cap: number = DEFAULT_CAP
): void {
  const all = readList<T>(feature, slug)
  if (all.some((x) => x.id === item.id)) return
  all.push(item)
  write(feature, slug, all.length > cap ? all.slice(all.length - cap) : all)
}

export function has(feature: string, slug: string, id: string): boolean {
  return readList<{ id: string }>(feature, slug).some((x) => x.id === id)
}

export function clear(feature: string, slug: string): void {
  try {
    localStorage.removeItem(keyFor(feature, slug))
  } catch {
    /* 아래 write 와 같은 이유로 삼킨다 */
  }
}

/**
 * **덮어쓴다.** 목록을 통째로 갈아야 할 때 쓴다 (서버 상태를 받아 캐시를 맞추는 자리).
 * 저장 실패는 조용히 넘긴다 — `localRolling.write` 와 같은 처리다.
 * 프라이빗 모드에서 쓰기가 막혀도 **화면은 계속 돌아야 한다**: 보관함이 안 쌓일 뿐,
 * 뽑기나 체크인 같은 진짜 동작은 서버가 하고 있다.
 */
export function write<T>(feature: string, slug: string, all: T[]): void {
  try {
    localStorage.setItem(keyFor(feature, slug), JSON.stringify(all))
  } catch {
    /* 조용히 넘긴다 (위 주석) */
  }
}
