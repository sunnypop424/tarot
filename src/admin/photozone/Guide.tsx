import { photozoneDisplay } from '@/data/photozone'
import { useSlot } from '@/slot/SlotProvider'
import { useT } from '@/i18n'

/**
 * 포토존 주최자 화면 — **만질 데이터가 하나도 없다.**
 *
 * 프레임은 최고관리자 자산이고, 방문자 사진은 서버에 오지 않는다. 그래서 이 화면은 설정이
 * 아니라 **안내**다. 그럼에도 화면이 있어야 하는 이유는 `AdminRoutes` 의 홈이 어딘가로는
 * 보내야 하기 때문이고, 주최자가 로그인했는데 빈 화면을 보면 "고장났나" 로 읽히기 때문이다.
 *
 * 여기서 제일 중요한 문장은 **"방문자 사진은 저희 서버에 저장되지 않아요"** 다.
 * 주최자가 이걸 알아야 방문자에게 답할 수 있다 (얼굴 사진이라 실제로 묻는다).
 */
export function Guide() {
  const t = useT()
  const slot = useSlot()
  const display = photozoneDisplay(slot)

  return (
    <>
      <header className="ad-head">
        <div className="ad-head__row">
          <h1 className="ad-head__title">{t('포토존')}</h1>
          <span className="ad-head__count tnum">프레임 {display.frames.length}종</span>
        </div>
        <p className="ad-head__desc">{t('따로 설정할 것이 없는 서비스예요.')}</p>
      </header>

      <div style={{ maxWidth: 680 }}>
        <div className="ad-card" style={{ padding: 26 }}>
          <div className="ad-card__title ad-card__title--lg">
            프레임 {display.frames.length}종이 올라가 있어요
          </div>
          <p className="ad-card__desc">
            따로 설정할 것이 없는 서비스예요. 방문자는 프레임을 골라 사진을 찍고 저장하면 끝이에요.
          </p>

          <div className="ad-banner ad-banner--info ad-banner--pad" style={{ marginTop: 20 }}>
            <div className="ad-banner__title">{t('방문자 사진은 서버에 저장되지 않아요')}</div>
            <div className="ad-banner__body">
              합성은 방문자 폰 안에서 끝나고, 결과 이미지도 그 기기에만 남아요. 그래서 주최자가 볼
              사진도, 지울 사진도 없어요. 방문자가 물어보면 이대로 답해 주시면 돼요.
            </div>
          </div>

          <p className="ad-sub" style={{ marginTop: 16 }}>
            프레임을 바꾸고 싶으면 담당자에게 말씀해 주세요. 원본 이미지를 보내 주시면 교체해
            드려요.
          </p>

          <a
            className="ad-btn ad-btn--line ad-btn--xl"
            style={{ marginTop: 20 }}
            href={`/${slot.slug}`}
            target="_blank"
            rel="noreferrer"
            data-visit
          >
            내 페이지 보기 ↗
          </a>
        </div>
      </div>
    </>
  )
}
