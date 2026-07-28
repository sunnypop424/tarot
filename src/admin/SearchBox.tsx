import { Search, X } from 'lucide-react'

/**
 * 목록 검색칸 — **줄 서 있는 손님 앞에서 스크롤로 찾을 수는 없다.**
 *
 * 응모자·수령·뽑기권처럼 행이 수백 줄이 되는 목록에 붙는다. 서버에 질의하지 않고
 * **이미 받아온 목록을 거른다** — 행사 규모(수백~수천)에서 왕복을 늘릴 이유가 없고,
 * 오프라인이 되어도 이미 받은 목록은 계속 찾을 수 있다.
 *
 * 지우기(X)를 함께 두는 이유: 검색어를 지우려고 백스페이스를 열 번 누르는 자리다.
 */
export function SearchBox({
  value,
  onChange,
  placeholder,
  /** 걸러진 결과 / 전체 — 몇 줄이 숨었는지 말해준다 */
  found,
  total,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  found?: number
  total?: number
}) {
  return (
    <div className="admin-toolbar">
      <div className="search">
        <Search size={14} strokeWidth={2} aria-hidden="true" className="search__icon" />
        <input
          className="input search__input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label="목록 검색"
          data-search
        />
        {value && (
          <button type="button" className="search__clear" onClick={() => onChange('')} aria-label="검색어 지우기">
            <X size={13} strokeWidth={2.2} />
          </button>
        )}
      </div>
      {value && found !== undefined && total !== undefined && (
        <span className="t-text-xs t-muted">
          {found}건 / 전체 {total}건
        </span>
      )}
    </div>
  )
}
