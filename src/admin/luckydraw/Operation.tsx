import { useCallback, useEffect, useState } from 'react'

import { repo } from '@/lib/repo'
import type { LuckydrawSettings } from '@/lib/repo'
import { useSlot } from '@/slot/SlotProvider'
import styles from './Luckydraw.module.css'

/**
 * 운영 설정 — **누르는 즉시 저장된다.**
 *
 * 상품 표는 저장 버튼이 있는데 여기는 없는 게 일부러다. 이 값들은 하나하나가 **결정**이고
 * 대부분 행사 중에 눌린다("지금 마감") — 눌렀는데 저장을 또 해야 반영되는 토글은
 * 현장에서 "왜 마감이 안 돼요" 를 만든다. 반대로 상품 표는 여러 칸을 고친 뒤 한 번에
 * 검토하고 넣는 작업이라 명시적 저장이 맞다.
 */
export function Operation() {
  const slot = useSlot()
  const slug = slot.slug

  const [settings, setSettings] = useState<LuckydrawSettings | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setSettings(await repo.luckydraw.getSettings(slug))
  }, [slug])

  useEffect(() => {
    void load()
  }, [load])

  async function patch(next: Partial<LuckydrawSettings>, confirmText?: string) {
    if (!settings) return
    if (confirmText && !confirm(confirmText)) return

    const merged = { ...settings, ...next }
    // 먼저 그린다 — 토글은 즉각 반응해야 눌렀다는 느낌이 난다
    setSettings(merged)
    setBusy(true)
    setError(null)
    try {
      await repo.luckydraw.saveSettings(slug, merged)
    } catch (e) {
      // 실패하면 화면을 서버 상태로 되돌린다 — 안 그러면 "껐다" 고 믿는데 켜져 있다
      setError(e instanceof Error ? e.message : '저장하지 못했어요')
      await load()
    } finally {
      setBusy(false)
    }
  }

  if (!settings) return null

  return (
    <div>
      <header className="admin__head">
        <div>
          <h1 className="t-title-m">운영 설정</h1>
          <p className="t-text-xs t-muted">여기 있는 값은 누르는 즉시 반영돼요.</p>
        </div>
      </header>

      {error && <p className={styles.warn}>{error}</p>}

      <section className="admin-section">
        <h2 className="t-title-s admin-section__title">지금 상태</h2>

        <div className={styles.toggles}>
          {/**
           * 리허설이 기본값이다 — 전날 시연에서 실수로 재고를 태우는 사고가,
           * 실운영인 줄 알고 리허설로 도는 사고보다 훨씬 비싸다 (후자는 배너가 계속 알려준다).
           */}
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={!settings.rehearsal}
              disabled={busy}
              onChange={(e) =>
                void patch(
                  { rehearsal: !e.target.checked },
                  e.target.checked
                    ? '실제 운영으로 바꿀까요?\n지금부터는 뽑을 때마다 재고가 실제로 줄어듭니다.'
                    : undefined
                )
              }
            />
            <span>
              <b>실제 운영</b>
              <span className="t-text-xs t-muted">
                {settings.rehearsal
                  ? '지금은 리허설이라 뽑아도 재고가 줄지 않아요'
                  : '뽑을 때마다 재고가 실제로 줄어요'}
              </span>
            </span>
          </label>

          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={settings.closed}
              disabled={busy}
              onChange={(e) =>
                void patch(
                  { closed: e.target.checked },
                  e.target.checked ? '지금 마감할까요?\n방문자 화면에서 추첨이 막힙니다.' : undefined
                )
              }
            />
            <span>
              <b>행사 마감</b>
              <span className="t-text-xs t-muted">켜면 아무도 추첨할 수 없어요</span>
            </span>
          </label>

          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={settings.locked}
              disabled={busy}
              onChange={(e) => void patch({ locked: e.target.checked })}
            />
            <span>
              <b>설정 잠금</b>
              <span className="t-text-xs t-muted">
                상품·수량을 못 고치게 잠가요. 추첨은 그대로 됩니다
              </span>
            </span>
          </label>
        </div>
      </section>

      <section className="admin-section">
        <h2 className="t-title-s admin-section__title">당첨 결과 표시</h2>
        <div className={styles.toggles}>
          {(
            [
              ['both', '등수와 상품명'],
              ['rank', '등수만'],
              ['prize', '상품명만'],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className={styles.toggle}>
              <input
                type="radio"
                name="displayMode"
                checked={settings.displayMode === value}
                disabled={busy}
                onChange={() => void patch({ displayMode: value })}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="admin-section">
        <h2 className="t-title-s admin-section__title">묶음 뽑기 제한</h2>
        <p className="t-text-xs t-muted" style={{ marginBottom: 'var(--space-base)' }}>
          여러 개를 한 번에 뽑을 때 같은 상품이 몰려 나오는 걸 줄여요. 켜면 상품마다 상한을 고를 수
          있어요.
        </p>

        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={settings.batchCapEnabled}
            disabled={busy}
            onChange={(e) => void patch({ batchCapEnabled: e.target.checked })}
          />
          <span>
            <b>제한 사용</b>
            <span className="t-text-xs t-muted">
              {settings.batchCapEnabled ? '상품 표에서 상한을 고를 수 있어요' : '끄면 제한 없이 뽑혀요'}
            </span>
          </span>
        </label>

        {/**
         * 켜는 자리에서 대가를 말한다 — 이건 버그가 아니라 이 기능의 본질이다.
         * 나중에 "왜 1등이 이렇게 빨리 나갔지" 를 듣는 것보다 지금 말하는 게 낫다.
         */}
        {settings.batchCapEnabled && (
          <p className={styles.warn}>
            제한을 켜면 흔한 상품이 덜 나오는 만큼 <b>비싼 상품이 더 빨리 소진돼요.</b> 행사 후반에
            낮은 등수만 남는 현상이 심해질 수 있어요.
          </p>
        )}
      </section>
    </div>
  )
}
