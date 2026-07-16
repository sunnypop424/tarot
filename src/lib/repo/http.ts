/**
 * Edge Function 을 부르는 어댑터들이 같이 쓰는 것 (`ai.ts` · `organizers.ts`).
 */

/**
 * 실패를 Error 로 바꾼다.
 *
 * **함수가 준 메시지를 살리는 게 요점이다.** 함수는 한글로 답한다 —
 * "이미 있는 이메일이에요", "이 슬롯의 AI 리딩 한도를 다 썼어요".
 * 상태코드만 던지면 화면이 "요청이 실패했어요 (409)" 라고 변명하게 되고,
 * 정작 뭘 고쳐야 하는지는 개발자 도구를 열어야 안다.
 */
export async function fail(res: Response): Promise<never> {
  let message = `요청이 실패했어요 (${res.status})`
  try {
    const body = (await res.json()) as { error?: string }
    if (body.error) message = body.error
  } catch {
    /* 본문이 JSON 이 아니면 상태코드로 만족한다 */
  }
  throw new Error(message)
}
