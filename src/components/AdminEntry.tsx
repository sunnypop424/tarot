import { Settings } from 'lucide-react'
import { Link } from 'react-router-dom'

/**
 * 방문자 화면 구석의 **관리자 진입 한 줄.**
 *
 * 방문자 눈엔 안 띄고 주최자는 찾을 수 있어야 하는 링크다. 서비스마다 따로 자란 탓에
 * 같은 물건이 네 가지로 구현돼 있었다 — `<a href>`(모의고사·투표·스탬프·포토존·포카),
 * `<button onClick={navigate}>`(롤페·소원), `<Link>`(럭드), 미리보기용 `<span>`.
 * **`<a href>` 쪽은 누르면 SPA 를 통째로 다시 받아** 화면이 하얗게 깜빡였다 —
 * 같은 동작인데 서비스마다 반응이 달랐다 (`docs/REVIEW_COMMON.md` 3번).
 *
 * 글자도 셋이었다("관리자" / "관리자 페이지로 이동" / "관리자로 로그인").
 * **방문자 화면의 진입 링크는 "관리자" 하나로 간다** — 누르는 사람이 주최자일 수도
 * 최고관리자일 수도 있어서 역할 이름을 못 박지 않는다 (`docs/REVIEW_COMMON.md` 5번).
 *
 * **여기서 정하는 것:** 무엇으로 이동하나(`<Link>`) · 글자 · 아이콘 크기 · 기본 생김새.
 * **서비스가 정하는 것:** 색과 자리. 색은 `className` 으로 자기 모듈 클래스를 넘겨 준다
 * (`--pl-sub` 처럼 서비스 토큰을 쓰므로 여기서 고를 수 없다). 자리는 감싸는 쪽 몫이다 —
 * 소원나무는 밤하늘 위 절대배치고 롤페는 스크롤 맨 아래라, 그건 공통이 될 수 없다.
 *
 * 스태프 기기의 링크(`staff/*`·`photocard/StaffApp`)는 **이 부품을 안 쓴다.** 거기 글자는
 * 로그인 상태를 알려주는 안내를 겸해서("관리자로 로그인" vs "관리자 페이지로 이동")
 * 한 단어로 줄이면 스태프가 지금 로그인돼 있는지를 화면에서 읽을 수 없게 된다.
 */
export function AdminEntry({
  slug,
  className,
  /** 관리 화면 안쪽으로 바로 보낼 때만 (예: 포카 스태프는 `admin/photocard`) */
  to,
}: {
  slug: string
  className?: string
  to?: string
}) {
  return (
    <Link to={`/${slug}/admin${to ? `/${to}` : ''}`} className={`admin-entry ${className ?? ''}`}>
      <Settings size={12} strokeWidth={1.7} aria-hidden="true" />
      관리자
    </Link>
  )
}
