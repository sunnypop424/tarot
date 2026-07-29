/**
 * 조사 고르기 — **앞 글자의 받침을 보고** 을/를, 이/가, 은/는 을 정한다.
 *
 * 화면에 들어가는 이름이 데이터에서 오면 조사를 박아 둘 수 없다. 랜딩의 서비스 이름이
 * 실제로 그랬다: `{이름}을 직접 체험해 보세요` 로 박아 놓아 열 개 중 일곱 개가
 * "럭키드로우을"·"소원 나무을"·"포토카드 뽑기을" 로 나가고 있었다.
 *
 *   josa(name, '을', '를')   // 받침 있으면 '을', 없으면 '를'
 *
 * 한글이 아닌 글자로 끝나면(숫자·영문·괄호) **받침 없음으로 본다.** 정답이 없는 자리라
 * 어느 쪽이든 어색한데, 그런 이름이면 애초에 조사를 안 붙이는 문장으로 쓰는 게 낫다.
 */
export function josa(word: string, withBatchim: string, withoutBatchim: string): string {
  const last = word.trim().slice(-1)
  const code = last.charCodeAt(0)
  if (Number.isNaN(code) || code < 0xac00 || code > 0xd7a3) return withoutBatchim
  return (code - 0xac00) % 28 === 0 ? withoutBatchim : withBatchim
}
