import { useCallback, useEffect, useState } from 'react'

import { repo } from '@/lib/repo'
import { RATIOS } from '@/data/cheer'
import type { CheerSettings } from '@/lib/repo/types'
import { useSlot } from '@/slot/SlotProvider'
import { toast } from '../AdminFeedback'
import { useT } from '@/i18n'

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
const FIELDS = [
  {
    k: 'bubbles' as const,
    label: '한 화면에 몇 개',
    unit: '개',
    range: '1–10',
    min: 1,
    max: 10,
    hint: '6~8개가 가장 보기 좋아요. 10개면 영상이 가려질 수 있어요.',
  },
  {
    k: 'intervalSec' as const,
    label: '교체 간격',
    unit: '초',
    range: '3–15',
    min: 3,
    max: 15,
    hint: '말풍선마다 이 값의 ±30% 로 흩어져 하나씩 바뀌어요 (한꺼번에 안 바뀌어요).',
  },
  {
    k: 'perPerson' as const,
    label: '1인 입력 수',
    unit: '개',
    range: '1–10',
    min: 1,
    max: 10,
    hint: '3개면 대부분 만족하고, 10개면 한 사람 글이 화면을 채워요.',
  },
  {
    k: 'maxLength' as const,
    label: '글자 수',
    unit: '자',
    range: '10–60',
    min: 10,
    max: 60,
    hint: '40자가 말풍선에 예쁘게 들어가요. 60자는 글씨가 작아져요.',
  },
]

export function Settings() {
  const t = useT()
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
      toast(e instanceof Error ? e.message : t('저장하지 못했어요'))
      await load()
    } finally {
      setBusy(false)
    }
  }

  if (!s) return null

  return (
    <>
      <header className="ad-head">
        <div className="ad-head__row">
          <h1 className="ad-head__title">{t('상영 설정')}</h1>
          <span className="ad-head__count tnum">
            한 화면 {s.bubbles}개 · {s.intervalSec}초
          </span>
        </div>
        <p className="ad-head__desc">
          {t('상영 중에 바꿔도 그 자리에서 반영돼요. 고치면 바로 저장돼요.')}
        </p>
      </header>

      <div className="ad-stack">
        <div>
          <span className="ad-note">
            {t('고치면 바로 저장돼요 · 상영 중에 바꿔도 그 자리에서 반영돼요')}
          </span>
        </div>

        <div className="ad-card ad-card--form">
          <div className="ad-card__title">{t('말풍선')}</div>
          <div className="ad-formgrid">
            {FIELDS.map((f) => (
              <div key={f.k}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
                  <span className="ad-field__label" style={{ marginBottom: 0 }}>
                    {t(f.label)}
                  </span>
                  <span className="ad-range">{f.range}</span>
                </div>
                <div className="ad-inline" style={{ marginTop: 7 }}>
                  <input
                    className="ad-input ad-input--num"
                    inputMode="numeric"
                    value={s[f.k]}
                    aria-label={t(f.label)}
                    data-cheer={f.k}
                    onChange={(e) => {
                      const v = Number(e.target.value.replace(/[^0-9]/g, ''))
                      if (!v) return
                      void patch({ [f.k]: Math.min(f.max, Math.max(f.min, v)) } as Partial<CheerSettings>)
                    }}
                  />
                  <span className="ad-unit">{t(f.unit)}</span>
                </div>
                <p className="ad-field__hint">{t(f.hint)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="ad-card ad-card--form">
          <div className="ad-card__title">{t('영상 비율')}</div>
          <div className="ad-choices">
            {RATIOS.map((r) => (
              <button
                key={r}
                type="button"
                className="ad-choice ad-choice--sm"
                data-on={s.ratio === r || undefined}
                disabled={busy}
                onClick={() => void patch({ ratio: r })}
                data-cheer-ratio
              >
                {r}
              </button>
            ))}
          </div>
          <p className="ad-field__hint">{t('가운데를 이 비율만큼 비워 둬요 — 영상이 뜨는 자리예요.')}</p>

          <div style={{ marginTop: 6 }}>
            <div className="ad-switchrow">
              <div className="ad-switchrow__text">
                <div className="ad-switchrow__name">{t('이름 표시')}</div>
                <div className="ad-switchrow__hint">
                  {t('말풍선에 닉네임을 같이 띄워요. 끄면 한마디만 떠요.')}
                </div>
              </div>
              <button
                type="button"
                className="ad-switch"
                data-on={s.showName || undefined}
                aria-label={t('이름 표시')}
                disabled={busy}
                onClick={() => void patch({ showName: !s.showName })}
                data-cheer-showname
              />
            </div>
            <div className="ad-switchrow">
              <div className="ad-switchrow__text">
                <div className="ad-switchrow__name">{t('마감')}</div>
                <div className="ad-switchrow__hint">
                  {t('이미 받은 한마디는 그대로 상영되고, 새로 받는 것만 막혀요.')}
                </div>
              </div>
              <button
                type="button"
                className="ad-switch"
                data-on={s.closed || undefined}
                aria-label={t('마감')}
                disabled={busy}
                onClick={() => void patch({ closed: !s.closed })}
                data-cheer-closed
              />
            </div>
          </div>
        </div>

        <div className="ad-card ad-card--form">
          <div className="ad-card__title">{t('상영 화면 열기')}</div>
          <p className="ad-card__desc">
            오버레이는 배경이 투명해요. OBS·프리즘의 브라우저 소스로 얹거나, 전체화면으로 영상 위에
            겹쳐 주세요.
          </p>
          <div className="ad-btnrow" style={{ marginTop: 16 }}>
            <a
              className="ad-btn ad-btn--primary ad-btn--xl"
              href={`/${slug}/overlay`}
              target="_blank"
              rel="noreferrer"
              data-open-overlay
            >
              {t('오버레이 열기 ↗')}
            </a>
            <a
              className="ad-btn ad-btn--line ad-btn--xl"
              href={`/${slug}/credits`}
              target="_blank"
              rel="noreferrer"
            >
              {t('엔딩크레딧 열기 ↗')}
            </a>
          </div>
          <p className="ad-sub" style={{ marginTop: 16 }}>
            {t('검수는 왼쪽 ‘한마디’ 메뉴에서 해요.')}
          </p>
        </div>
      </div>
    </>
  )
}
