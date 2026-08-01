import { useT } from '@/i18n'

/**
 * 없는 슬롯/페이지.
 * 배포 루트(`/`)에도 이게 뜬다 — 슬롯 목록을 노출하면 다른 이벤트가 다 보이므로
 * 방문자는 자기 이벤트의 슬러그(QR)로만 들어온다.
 */
export function NotFound() {
  const t = useT()
  return (
    <div className="app">
      <main className="app__scroll">
        <div className="screen">
          <h1 className="t-title-l screen__title">{t('페이지를 찾을 수 없어요')}</h1>
          <p className="t-body t-muted screen__lead">
            {t('주소를 다시 확인해 주세요. 카페에 비치된 QR로 들어오시면 돼요.')}
          </p>
        </div>
      </main>
    </div>
  )
}
