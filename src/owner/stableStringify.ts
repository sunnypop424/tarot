/**
 * 키 순서에 흔들리지 않는 직렬화 — 객체 키를 재귀적으로 정렬해 문자열로 만든다.
 * "저장 안 됨" 판정에만 쓴다: JSONB 저장소가 키 순서를 바꿔 돌려줘도 값이 같으면 같다고 봐야 한다.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const obj = value as Record<string, unknown>
  const body = Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')
  return `{${body}}`
}

