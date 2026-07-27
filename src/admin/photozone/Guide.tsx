import { Camera, ExternalLink } from 'lucide-react'

import { photozoneDisplay } from '@/data/photozone'
import { useSlot } from '@/slot/SlotProvider'

/**
 * 포토존 주최자 화면 — **만질 데이터가 하나도 없다.**
 *
 * 프레임은 최고관리자 자산이고, 방문자 사진은 서버에 오지 않는다. 그래서 이 화면은 설정이
 * 아니라 **안내**다. 그럼에도 화면이 있어야 하는 이유는 `AdminRoutes` 의 홈이 어딘가로는
 * 보내야 하기 때문이고, 주최자가 로그인했는데 빈 화면을 보면 "고장났나" 로 읽히기 때문이다.
 *
 * 여기서 제일 중요한 문장은 **"손님 사진은 저희 서버에 저장되지 않아요"** 다.
 * 주최자가 이걸 알아야 손님에게 답할 수 있다 (얼굴 사진이라 실제로 묻는다).
 */
export function Guide() {
  const slot = useSlot()
  const display = photozoneDisplay(slot)
  const siteUrl = `/${slot.slug}`

  return (
    <div>
      <header className="admin__head">
        <div>
          <h1 className="t-title-l">포토존</h1>
          <p className="t-text-xs t-muted">
            프레임 {display.frames.length}개 · 이 서비스는 따로 설정하실 게 없어요.
          </p>
        </div>
      </header>

      <div className="admin-empty">
        <Camera size={44} strokeWidth={1.6} aria-hidden="true" />
        <div className="admin-empty__title">관리할 데이터가 없는 서비스예요</div>
        <div className="t-text-s t-muted" style={{ maxWidth: 460, margin: '0 auto', lineHeight: 1.7 }}>
          <p style={{ margin: '0 0 10px' }}>
            손님이 찍은 사진은 <b>손님 폰에서 바로 합성되고, 저희 서버에 저장되지 않아요.</b> 그래서
            주최자님이 보시거나 지우실 사진도 없습니다.
          </p>
          <p style={{ margin: 0 }}>
            프레임을 바꾸거나 더하시려면 담당자에게 말씀해 주세요. 손님 화면에서 바로 반영됩니다.
          </p>
        </div>
        <a
          className="btn btn--ghost"
          href={siteUrl}
          target="_blank"
          rel="noreferrer"
          style={{ marginTop: 18 }}
          data-visit
        >
          <ExternalLink size={16} strokeWidth={2} aria-hidden="true" />내 페이지 보기
        </a>
      </div>
    </div>
  )
}
