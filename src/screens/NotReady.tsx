import { useSlotPath } from '@/slot/useSlotPath'
import { useT } from '@/i18n'

/** 슬롯 안에서 대상을 못 찾았을 때 (없는 운세/카드/질문) */
export function NotReady({ title }: { title: string }) {
  const t = useT()
  const { go } = useSlotPath()

  return (
    <div className="screen">
      <h1 className="t-title-l screen__title">{title}</h1>
      <p className="t-body t-muted screen__lead">{t('찾으시는 내용이 없어요.')}</p>
      <button type="button" className="btn btn--sm btn--slight" onClick={() => go()}>
        홈으로
      </button>
    </div>
  )
}
