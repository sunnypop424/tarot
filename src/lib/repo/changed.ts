/**
 * 슬롯이 바뀌었다는 알림 — **같은 브라우저 안에서만** 도는 신호.
 *
 * 편집기에서 색을 바꿔 저장하면 미리보기 iframe 이 바로 따라와야 한다.
 * 예전엔 SlotProvider 가 localStorage 의 초안 키를 직접 구독했는데,
 * 그건 **어댑터가 뭔지 아는 배선**이었다 — 슬롯이 DB 로 가는 순간 storage 이벤트가
 * 안 뜨고 미리보기는 조용히 옛 색으로 남는다 (저장은 됐는데 화면이 거짓말한다).
 *
 * 그래서 알림을 저장소에서 떼어내 여기 둔다. 저장이 어디로 가든 — localStorage 든
 * Supabase 든 — 어댑터는 쓰고 나서 이걸 부르고, 화면은 이것만 듣는다.
 *
 * 서버까지 가는 실시간 동기화가 아니다 (다른 사람 브라우저는 모른다).
 * 편집기와 그 미리보기는 같은 탭 안에 있으니 이걸로 충분하다.
 */

const CHANNEL = 'tarot-pocket:slot-changed'

/** 슬롯을 저장·삭제한 어댑터가 부른다 */
export function publishSlotChange(slug: string): void {
  if (typeof BroadcastChannel === 'undefined') return
  const ch = new BroadcastChannel(CHANNEL)
  ch.postMessage(slug)
  ch.close()
}

/** 그 슬롯을 그리고 있는 화면이 듣는다. 정리 함수를 돌려준다 */
export function onSlotChange(listener: (slug: string) => void): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => {}
  const ch = new BroadcastChannel(CHANNEL)
  ch.onmessage = (e: MessageEvent<string>) => listener(e.data)
  return () => ch.close()
}
