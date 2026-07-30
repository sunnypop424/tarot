import { useSlotOrNull } from '@/slot/SlotProvider'
import { LangPicker } from './LangPicker'
import styles from './LangBar.module.css'

/**
 * 언어 고르개 **한 줄** — 자기 헤더를 따로 그리는 화면들이 쓴다.
 *
 * `ServiceHeader` 를 쓰는 일곱 서비스는 거기서 이미 고르개를 갖는다. 그런데 헤더가 없는
 * 화면이 남는다:
 *
 *   · 럭키드로우 — 화면이 통째로 무대 하나다
 *   · 최애 모의고사 — 자기 헤더를 그린다
 *   · 롤페·소원나무의 **작성 화면**(`/write`) — 뒤로가기 + 제목 줄이 따로다
 *   · 타로 — 상단 네비가 **데스크톱 전용**이라 폰에서는 고르개가 안 보였다
 *   · 스태프 기기 셋
 *
 * 그런 자리에 오른쪽 정렬 한 줄로 얹는다. **슬롯이 언어를 안 골랐으면 아무것도 안 그린다** —
 * 빈 줄이 남아 여백만 벌어지는 걸 막으려고 `null` 을 돌려준다(높이도 안 차지한다).
 *
 * `float` 로 화면 구석에 띄우지 않은 이유: 카드·버튼 위에 겹쳐 앉아 누르는 걸 방해한다.
 * 흐름 안의 한 줄이면 어느 화면에서도 자리를 뺏지 않는다.
 */
export function LangBar({ all, className }: { all?: boolean; className?: string }) {
  const slot = useSlotOrNull()

  /**
   * `all` — **넷 다 보여준다.** 주최자·스태프가 쓰는 화면(관리 로그인·스태프 기기)이 이걸 쓴다.
   *
   * 그 화면들은 `slot.langs` 와 무관하다: 그 값은 "방문자에게 무엇을 보여줄까" 인데
   * 여기서 묻는 건 "이 기기를 쓰는 사람이 한국어를 읽나" 라 다른 질문이다.
   * 관리 셸(`AdminLayout`)의 고르개도 같은 이유로 늘 넷이다.
   */
  if (!all && !slot?.langs?.length) return null

  return (
    <div className={`${styles.bar} ${className ?? ''}`} data-lang-bar>
      <LangPicker only={all ? undefined : slot!.langs} />
    </div>
  )
}
