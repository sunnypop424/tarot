import { useCallback, useEffect, useState } from 'react'
import { ExternalLink, Info, MonitorPlay, SlidersHorizontal } from 'lucide-react'

import { repo } from '@/lib/repo'
import { RATIOS } from '@/data/cheer'
import type { CheerSettings } from '@/lib/repo/types'
import { useSlot } from '@/slot/SlotProvider'
import { toast } from '../AdminFeedback'

/**
 * 영상회 응원 운영 — **주최자가 정한다.**
 *
 * 겉모습(색·팔레트·문구)은 편집기(최고관리자)고, 여기 있는 건 **행사 중에 보고 조정하는 값**이다.
 * 다른 서비스와 같은 경계다.
 *
 * **숫자 칸마다 가이드를 적는다.** "몇 개가 맞는지" 는 아무도 모른다 — 6개와 10개의 차이를
 * 화면이 말해주지 않으면 주최자는 상영 중에 처음 알게 된다.
 *
 * 저장은 **즉시**다 (주최자 화면의 규칙 — 저장을 잊어 날리는 게 더 나쁘다).
 */

/** 칸마다 붙는 안내 — 표는 docs/서비스-영상회-응원.md 와 같은 내용이다 */
const GUIDE = {
  bubbles: '6~8개가 가장 보기 좋아요. 10개면 영상이 가려질 수 있어요.',
  ratio: '가운데를 이 비율만큼 비워 둡니다 — 영상이 뜨는 자리예요.',
  interval: '말풍선마다 이 값의 ±30% 로 흩어져 하나씩 바뀝니다 (한꺼번에 안 바뀌어요).',
  showName: '끄면 한마디만 떠요. 익명으로 받는 행사에 쓰세요.',
  perPerson: '3개면 대부분 만족하고, 10개면 한 사람 글이 화면을 채웁니다.',
  maxLength: '40자가 말풍선에 예쁘게 들어가요. 60자는 글씨가 작아집니다.',
}

export function Settings() {
  const slot = useSlot()
  const slug = slot.slug
  const [s, setS] = useState<CheerSettings | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setS(await repo.cheer.settings(slug).catch(() => null))
  }, [slug])

  useEffect(() => {
    void load()
  }, [load])

  async function patch(change: Partial<CheerSettings>) {
    if (!s || busy) return
    const next = { ...s, ...change }
    setS(next)
    setBusy(true)
    try {
      await repo.cheer.saveSettings(slug, next)
    } catch (e) {
      toast(e instanceof Error ? e.message : '저장하지 못했어요')
      await load()
    } finally {
      setBusy(false)
    }
  }

  if (!s) return null

  const num = (
    label: string,
    key: 'bubbles' | 'intervalSec' | 'perPerson' | 'maxLength',
    min: number,
    max: number,
    hint: string,
    unit: string
  ) => (
    <label className="field">
      <span className="field__label">{label}</span>
      <div className="range-row">
        <input
          type="range"
          min={min}
          max={max}
          value={s[key]}
          onChange={(e) => void patch({ [key]: Number(e.target.value) } as Partial<CheerSettings>)}
          className="range"
          aria-label={label}
          data-cheer={key}
        />
        <span className="range-row__value">
          {s[key]}
          {unit}
        </span>
      </div>
      <span className="field__hint">{hint}</span>
    </label>
  )

  return (
    <>
      <header className="admin__head">
        <div>
          <h1 className="t-title-s">영상회 응원</h1>
          <p className="t-text-xs t-muted">
            손님이 남긴 한마디가 상영 화면에 뜹니다. <b>검수는 '한마디' 메뉴</b>에서 하세요.
          </p>
        </div>
        <div className="admin-actions" style={{ marginTop: 0 }}>
          <a
            className="btn btn--outline btn--sm"
            href={`/${slug}/overlay`}
            target="_blank"
            rel="noreferrer"
            data-open-overlay
          >
            <MonitorPlay size={15} strokeWidth={2} aria-hidden="true" />
            오버레이 열기
            <ExternalLink size={12} strokeWidth={2} aria-hidden="true" />
          </a>
          <a className="btn btn--outline btn--sm" href={`/${slug}/credits`} target="_blank" rel="noreferrer">
            엔딩크레딧
            <ExternalLink size={12} strokeWidth={2} aria-hidden="true" />
          </a>
        </div>
      </header>

      <div className="admin-banner admin-banner--info">
        <Info size={16} aria-hidden="true" />
        <span>
          <b>오버레이는 배경이 투명해요.</b> OBS·프리즘의 '브라우저 소스' 로 주소를 넣으면 영상 위에
          그대로 얹힙니다. 프로젝터로 쏘실 거면 창을 전체화면으로 띄워 영상 위에 겹쳐 두세요.
          <br />
          상영 중에도 이 화면의 값을 바꿀 수 있어요 — 바꾸면 상영 화면이 그 자리에서 따라갑니다.
        </span>
      </div>

      <section className="admin-section">
        <h2 className="admin-section__title">
          <SlidersHorizontal size={15} strokeWidth={2} aria-hidden="true" />
          상영 설정
        </h2>
        <div className="form-grid">
        {num('한 화면에 몇 개', 'bubbles', 1, 10, GUIDE.bubbles, '개')}
        {num('교체 간격', 'intervalSec', 3, 15, GUIDE.interval, '초')}
        {num('1인 입력 수', 'perPerson', 1, 10, GUIDE.perPerson, '개')}
        {num('글자 수', 'maxLength', 10, 60, GUIDE.maxLength, '자')}

        <label className="field">
          <span className="field__label">영상 비율</span>
          <select
            className="select"
            value={s.ratio}
            onChange={(e) => void patch({ ratio: e.target.value })}
            data-cheer-ratio
          >
            {RATIOS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <span className="field__hint">{GUIDE.ratio}</span>
        </label>

        <div className="field">
          <span className="field__label">이름 표시</span>
          <label className="check">
            <input
              type="checkbox"
              checked={s.showName}
              onChange={(e) => void patch({ showName: e.target.checked })}
              data-cheer-showname
            />
            이름을 같이 띄워요
          </label>
          <span className="field__hint">{GUIDE.showName}</span>
        </div>

        <div className="field">
          <span className="field__label">마감</span>
          <label className="check">
            <input
              type="checkbox"
              checked={s.closed}
              onChange={(e) => void patch({ closed: e.target.checked })}
              data-cheer-closed
            />
            지금은 한마디를 안 받아요
          </label>
          <span className="field__hint">
            이미 받은 한마디는 그대로 상영돼요 — 새로 받는 것만 막습니다.
          </span>
        </div>
        </div>
      </section>
    </>
  )
}
