import { useT } from '@/i18n'

/**
 * 목록 검색칸 — **줄 서 있는 방문자 앞에서 스크롤로 찾을 수는 없다.**
 *
 * 응모자·수령·뽑기권처럼 행이 수백 줄이 되는 목록에 붙는다. 서버에 질의하지 않고
 * **이미 받아온 목록을 거른다** — 행사 규모(수백~수천)에서 왕복을 늘릴 이유가 없고,
 * 오프라인이 되어도 이미 받은 목록은 계속 찾을 수 있다.
 *
 * 시안에서는 **카드 머리의 도구 줄에 앉는다** — 몇 건 중 몇 건인지는 카드 제목 옆 숫자가
 * 말하므로 여기서는 입력칸만 그린다 (`found`/`total` 은 부르는 쪽이 제목에 적는다).
 */
export function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  const t = useT()
  return (
    <input
      className="ad-input ad-input--search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={t('목록 검색')}
      data-search
    />
  )
}

/** 몇 건 중 몇 건 — 카드 제목 옆에 붙는 숫자 (검색과 짝이다) */
export function foundLabel(found: number, total: number, unit = '건'): string {
  return `${found} / ${total}${unit}`
}
