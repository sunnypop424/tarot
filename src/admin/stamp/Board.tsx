import { useCallback, useEffect, useState } from 'react'
import { Eye, EyeOff, RefreshCw, Stamp } from 'lucide-react'

import { repo } from '@/lib/repo'
import type { StampSettings } from '@/lib/repo/types'
import { stampDisplay } from '@/data/stamp'
import { useSlot } from '@/slot/SlotProvider'
import { toast } from '../AdminFeedback'

/**
 * 스탬프 운영 — **주최자의 자리다.**
 * 칸 정의(이름·개수)는 최고관리자가 편집기에서 정하고, 여기서는 **현장 암호와 운영값**을 만진다.
 *
 * 수령 확인·추첨·응모자 명단은 **공용 화면**(`admin/reward/*`)이라 여기 없다.
 */
export function Board() {
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

  if (!repo.stamp.ready()) {
    return (
      <div className="admin-empty">
        <Stamp size={44} strokeWidth={1.6} aria-hidden="true" />
        <div className="admin-empty__title">지금 빌드에서는 스탬프를 쓸 수 없어요</div>
      </div>
    )
  }
  if (!settings) return null

  const save = async (next: StampSettings) => {
    setBusy(true)
    try {
      await repo.stamp.saveSettings(slug, next)
      setSettings(next)
      toast('저장했어요')
    } finally {
      setBusy(false)
    }
  }

  /** 4자리 — 혼동 문자(I·L·O·U·0·1)를 뺀다. 현장에 붙여두고 손님이 손으로 친다 */
  const makeCode = () => {
    const A = '23456789ABCDEFGHJKMNPQRSTVWXYZ'
    return Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join('')
  }

  return (
    <div>
      <header className="admin__head">
        <div>
          <h1 className="t-title-l">스탬프</h1>
          <p className="t-text-xs t-muted">
            칸 {display.stamps.length}개 · 각 칸의 암호를 현장에 붙여 두세요. 손님이 그 암호를 입력하면 도장이 찍혀요.
          </p>
        </div>
      </header>

      {display.stamps.length === 0 ? (
        <div className="admin-empty">
          <Stamp size={44} strokeWidth={1.6} aria-hidden="true" />
          <div className="admin-empty__title">아직 스탬프 칸이 없어요</div>
          <div className="t-text-s t-muted">칸 구성은 담당자가 정합니다 — 필요하시면 말씀해 주세요.</div>
        </div>
      ) : (
        <section className="card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 10, flexWrap: 'wrap' }}>
            <h2 className="t-title-s" style={{ margin: 0 }}>현장 암호</h2>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setShown((v) => !v)}>
              {shown ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
              {shown ? '가리기' : '보기'}
            </button>
          </div>
          <p className="t-text-xs t-muted" style={{ marginTop: 0, marginBottom: 14 }}>
            암호가 새면 <b>새로 만들기</b>로 바꾸세요. 바꾸면 예전 암호는 바로 안 먹습니다.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} data-stamp-codes>
            {display.stamps.map((c, i) => (
              <div key={c.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="t-text-s" style={{ width: 24, opacity: 0.5 }}>{i + 1}</span>
                <span className="t-text-m" style={{ flex: 1, minWidth: 120, fontWeight: 600 }}>{c.name}</span>
                <input
                  className="input"
                  style={{ width: 130, fontFamily: 'ui-monospace, Menlo, monospace', letterSpacing: '0.12em', textTransform: 'uppercase' }}
                  type={shown ? 'text' : 'password'}
                  value={codes[c.id] ?? ''}
                  maxLength={8}
                  aria-label={`${c.name} 암호`}
                  onChange={(e) => setCodes({ ...codes, [c.id]: e.target.value.toUpperCase() })}
                  onBlur={() => codes[c.id] && void repo.stamp.saveCode(slug, c.id, codes[c.id])}
                />
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={async () => {
                    const code = makeCode()
                    setCodes({ ...codes, [c.id]: code })
                    await repo.stamp.saveCode(slug, c.id, code)
                    setShown(true)
                    toast('새 암호를 만들었어요')
                  }}
                >
                  <RefreshCw size={14} aria-hidden="true" />
                  새로 만들기
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card" style={{ padding: 18, marginTop: 16 }}>
        <h2 className="t-title-s" style={{ margin: '0 0 14px' }}>운영 설정</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,220px),1fr))', gap: 14 }}>
          <label className="field">
            <span className="field__label">다 모으면</span>
            <select
              className="select"
              value={settings.rewardMode}
              disabled={busy}
              onChange={(e) => void save({ ...settings, rewardMode: e.target.value as StampSettings['rewardMode'] })}
              data-reward-mode
            >
              <option value="none">보상 없음 (축하 화면만)</option>
              <option value="guaranteed">확정 선물 (교환권 발급)</option>
              <option value="raffle">응모 (나중에 추첨)</option>
            </select>
            <span className="field__hint">
              확정이면 손님 폰에 교환코드가 뜨고, 스태프가 '수령 확인' 에서 처리합니다.
            </span>
          </label>

          <label className="field">
            <span className="field__label">선물 이름</span>
            <input
              className="input"
              value={settings.rewardLabel}
              disabled={busy || settings.rewardMode === 'none'}
              onChange={(e) => setSettings({ ...settings, rewardLabel: e.target.value })}
              onBlur={() => void save(settings)}
            />
          </label>

          <label className="field">
            <span className="field__label">날짜별 참여</span>
            <select
              className="select"
              value={settings.dailyReset ? 'on' : 'off'}
              disabled={busy}
              onChange={(e) => void save({ ...settings, dailyReset: e.target.value === 'on' })}
            >
              <option value="off">한 번만 (계속 모아요)</option>
              <option value="on">매일 새로 (자정에 초기화)</option>
            </select>
            <span className="field__hint">
              매일 새로면 하루 안에 다 모아야 해요. 여러 카페를 도는 랠리면 '한 번만' 이 맞습니다.
            </span>
          </label>

          <label className="field">
            <span className="field__label">마감</span>
            <select
              className="select"
              value={settings.closed ? 'on' : 'off'}
              disabled={busy}
              onChange={(e) => void save({ ...settings, closed: e.target.value === 'on' })}
            >
              <option value="off">진행 중</option>
              <option value="on">마감 (도장을 못 찍어요)</option>
            </select>
          </label>
        </div>

        {settings.rewardMode === 'raffle' && (
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--color-border)' }}>
            <div className="field__label" style={{ marginBottom: 9 }}>응모 때 받을 정보</div>
            <p className="t-text-xs t-muted" style={{ margin: '0 0 10px' }}>
              <b>안 켠 항목은 받지 않습니다</b> — 쓰지 않을 개인정보를 모아두지 않는 게 안전해요.
              닉네임은 항상 받습니다.
            </p>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {(
                [
                  ['handle', '트위터 아이디'],
                  ['contact', '연락처'],
                  ['address', '주소 (배송할 때만)'],
                ] as ['handle' | 'contact' | 'address', string][]
              ).map(([key, label]) => (
                <label key={key} className="check">
                  <input
                    type="checkbox"
                    checked={settings.entryFields[key]}
                    disabled={busy}
                    onChange={(e) =>
                      void save({
                        ...settings,
                        entryFields: { ...settings.entryFields, [key]: e.target.checked },
                      })
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
