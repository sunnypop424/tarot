import { useCallback, useEffect, useState } from 'react'

import { repo } from '@/lib/repo'
import type { StampSettings } from '@/lib/repo/types'
import { stampDisplay } from '@/data/stamp'
import { useSlot } from '@/slot/SlotProvider'
import { toast } from '../AdminFeedback'
import { useT } from '@/i18n'

/**
 * 스탬프 운영 — **주최자의 자리다.**
 * 칸 정의(이름·개수)는 최고관리자가 편집기에서 정하고, 여기서는 **현장 암호와 운영값**을 만진다.
 *
 * 수령 확인·추첨·응모자 명단은 **공용 화면**(`admin/reward/*`)이라 여기 없다.
 */
export function Board() {
  const t = useT()
  const slot = useSlot()
  const slug = slot.slug
  const display = stampDisplay(slot)
  const [codes, setCodes] = useState<Record<string, string>>({})
  const [settings, setSettings] = useState<StampSettings | null>(null)
  const [shown, setShown] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [c, s] = await Promise.all([repo.stamp.codes(slug), repo.stamp.settings(slug)])
    setCodes(Object.fromEntries(c.map((x) => [x.stampId, x.code])))
    setSettings(s)
  }, [slug])

  useEffect(() => {
    void load()
  }, [load])

  const head = (count: number) => (
    <header className="ad-head">
      <div className="ad-head__row">
        <h1 className="ad-head__title">{t('스탬프')}</h1>
        <span className="ad-head__count tnum">칸 {count}개</span>
      </div>
      <p className="ad-head__desc">
        각 칸의 현장 암호와 운영 방식을 정해요. 칸 구성은 담당자가 만들어 드려요.
      </p>
    </header>
  )

  if (!repo.stamp.ready()) {
    return (
      <>
        {head(0)}
        <div className="ad-card">
          <div className="ad-empty">
            <div className="ad-empty__title">지금 빌드에서는 스탬프를 쓸 수 없어요</div>
          </div>
        </div>
      </>
    )
  }
  if (!settings) return null

  const save = async (next: StampSettings) => {
    setBusy(true)
    try {
      await repo.stamp.saveSettings(slug, next)
      setSettings(next)
      toast(t('저장했어요'))
    } finally {
      setBusy(false)
    }
  }

  /** 4자리 — 혼동 문자(I·L·O·U·0·1)를 뺀다. 현장에 붙여두고 방문자가 손으로 친다 */
  const makeCode = () => {
    const A = '23456789ABCDEFGHJKMNPQRSTVWXYZ'
    return Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join('')
  }

  const choice = <T extends string>(
    label: string,
    hint: string,
    value: T,
    options: { v: T; n: string }[],
    onPick: (v: T) => void,
    locked?: string
  ) => (
    <div style={locked ? { opacity: 0.55 } : undefined}>
      <div className="ad-card__titleRow">
        <span className="ad-card__title">{label}</span>
        {locked && <span className="ad-tag ad-tag--sm">{t('지금은 바꿀 수 없어요')}</span>}
      </div>
      {hint && <p className="ad-card__desc">{hint}</p>}
      <div className="ad-choices" style={{ marginTop: 12 }}>
        {options.map((o) => (
          <button
            key={o.v}
            type="button"
            className="ad-choice"
            data-on={value === o.v || undefined}
            disabled={busy}
            onClick={() => (locked ? toast(locked) : onPick(o.v))}
          >
            {o.n}
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <>
      {head(display.stamps.length)}

      <div className="ad-stack">
        <div className="ad-banner ad-banner--info ad-banner--pad">
          <div className="ad-banner__title">{t('이 목록의 규칙')}</div>
          <div className="ad-banner__body">
            암호를 비워 두면 그 칸은 방문자에게 잠긴 채로 보여요. 암호가 새면 새로 만들기로 바꾸세요 —
            바꾸면 예전 암호는 바로 안 먹어요. 칸 이름과 순서는 담당자가 정해요.
          </div>
        </div>

        <div className="ad-card" data-stamp-panel>
          <div className="ad-card__head">
            <div className="ad-card__titleRow">
              <span className="ad-card__title">현장 암호</span>
              <span className="ad-card__num tnum">칸 {display.stamps.length}개</span>
            </div>
            <button
              type="button"
              className="ad-btn ad-btn--line ad-btn--sm"
              onClick={() => setShown((v) => !v)}
            >
              {shown ? t('가리기') : t('보기')}
            </button>
          </div>

          {display.stamps.length === 0 ? (
            <div className="ad-empty">
              <div className="ad-empty__title">아직 스탬프 칸이 없어요</div>
              <div className="ad-empty__sub">
                칸 구성은 담당자가 정해요 — 필요하시면 말씀해 주세요.
              </div>
            </div>
          ) : (
            <div className="ad-rows" data-stamp-codes>
              {display.stamps.map((c, i) => {
                const code = codes[c.id] ?? ''
                return (
                  <div key={c.id} className="ad-row" data-off={code.trim() ? undefined : true}>
                    <span className="ad-row__no ad-row__no--line tnum">{i + 1}</span>
                    <span style={{ flex: 1, minWidth: 140, fontSize: 14, fontWeight: 700 }}>
                      {c.name}
                    </span>
                    <div className="ad-inline" style={{ flexWrap: 'nowrap' }}>
                      <input
                        className="ad-input ad-input--sm ad-input--code"
                        style={{ width: 110 }}
                        type={shown ? 'text' : 'password'}
                        value={code}
                        maxLength={8}
                        placeholder="현장 암호"
                        aria-label={`${c.name} 암호`}
                        onChange={(e) => setCodes({ ...codes, [c.id]: e.target.value.toUpperCase() })}
                        onBlur={() => code && void repo.stamp.saveCode(slug, c.id, code)}
                      />
                      <button
                        type="button"
                        className="ad-btn ad-btn--line ad-btn--sm"
                        onClick={async () => {
                          const next = makeCode()
                          setCodes({ ...codes, [c.id]: next })
                          await repo.stamp.saveCode(slug, c.id, next)
                          setShown(true)
                          toast('새 암호를 만들었어요')
                        }}
                      >
                        새로 만들기
                      </button>
                    </div>
                    {!code.trim() && (
                      <span className="ad-tag ad-tag--sm" data-tone="warn">
                        암호 없음 · 방문자에게 잠긴 칸이에요
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div>
          <span className="ad-note">{t('바꾸면 바로 저장돼요 · 저장 버튼이 없어요')}</span>
        </div>

        <div className="ad-card ad-card--form">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            {choice(
              '다 모으면',
              '응모로 정하면 응모 때 받을 정보를 고를 수 있어요.',
              settings.rewardMode,
              [
                { v: 'none' as const, n: '선물 없음 (축하 화면만)' },
                { v: 'guaranteed' as const, n: '확정 선물 (교환권 발급)' },
                { v: 'raffle' as const, n: '응모 (나중에 추첨)' },
              ],
              (v) => void save({ ...settings, rewardMode: v })
            )}

            {settings.rewardMode !== 'none' && (
              <div>
                <div className="ad-card__title">선물 이름</div>
                <input
                  className="ad-input"
                  style={{ marginTop: 12 }}
                  value={settings.rewardLabel}
                  placeholder={t('예: 아크릴 스탠드')}
                  disabled={busy}
                  onChange={(e) => setSettings({ ...settings, rewardLabel: e.target.value })}
                  onBlur={() => void save(settings)}
                />
                <p className="ad-field__hint">
                  확정이면 방문자 폰에 교환코드가 뜨고, 스태프가 ‘수령 확인’ 에서 처리해요.
                </p>
              </div>
            )}

            {choice(
              t('날짜별 참여'),
              t('매일 새로면 하루 안에 다 모아야 해요. 여러 카페를 도는 랠리면 ‘한 번만’ 이 맞아요.'),
              settings.dailyReset ? 'on' : 'off',
              [
                { v: 'off' as const, n: t('한 번만 (계속 모아요)') },
                { v: 'on' as const, n: '매일 새로 (자정에 초기화)' },
              ],
              (v) => void save({ ...settings, dailyReset: v === 'on' })
            )}

            {choice(
              t('마감'),
              '',
              settings.closed ? 'on' : 'off',
              [
                { v: 'off' as const, n: t('진행 중') },
                { v: 'on' as const, n: '마감 (도장을 못 찍어요)' },
              ],
              (v) => void save({ ...settings, closed: v === 'on' })
            )}

            {settings.rewardMode === 'raffle' && (
              <div className="ad-subset">
                <div className="ad-subset__title">응모 때 받을 정보</div>
                <div className="ad-checks">
                  {(
                    [
                      ['handle', '트위터 아이디', '당첨 안내용 · 선택'],
                      ['contact', '연락처', '꼭 필요할 때만 받아 주세요'],
                      ['address', '주소', '배송이 필요한 선물일 때만'],
                    ] as ['handle' | 'contact' | 'address', string, string][]
                  ).map(([key, label, hint]) => {
                    const on = settings.entryFields[key]
                    return (
                      <button
                        key={key}
                        type="button"
                        className="ad-check"
                        data-on={on || undefined}
                        disabled={busy}
                        onClick={() =>
                          void save({
                            ...settings,
                            entryFields: { ...settings.entryFields, [key]: !on },
                          })
                        }
                      >
                        <span className="ad-check__box">{on ? '✓' : ''}</span>
                        <span>
                          <span className="ad-check__name">{label}</span>
                          <span className="ad-check__hint">{hint}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
                <p className="ad-fine" style={{ marginTop: 12 }}>
                  안 켠 항목은 아예 받지 않아요 — 쓰지 않을 개인정보를 모아두지 않는 게 안전해요.
                  닉네임은 항상 받아요.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
