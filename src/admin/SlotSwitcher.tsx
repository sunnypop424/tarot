import { useEffect, useState } from 'react'

import { repo } from '@/lib/repo'
import type { Slot } from '@/types/slot'
import { serviceLabel, getSlotService } from '@/data/services'
import styles from './SlotSwitcher.module.css'

/**
 * 이 계정이 맡은 **다른 슬롯**으로 건너가는 자리.
 *
 * 같은 행사 주최자가 타로 슬롯과 럭키드로우 슬롯을 함께 갖는 경우가 생기면서 필요해졌다
 * (`0006_multi_slot_admins.sql`). 계정을 두 개 주는 대신 한 계정에 슬롯을 여러 개 매어 두고,
 * 여기서 오간다 — 행사 당일에 로그인을 두 번 하게 만들지 않는다.
 *
 * **슬롯이 하나면 아무것도 안 그린다.** 대부분의 주최자는 슬롯이 하나고, 그 사람들에게
 * "슬롯 전환" 이라는 개념을 보여줄 이유가 없다.
 */
export function SlotSwitcher({ current, slugs }: { current: string; slugs: string[] }) {
  const [slots, setSlots] = useState<Slot[] | null>(null)

  useEffect(() => {
    if (slugs.length < 2) return
    let alive = true
    /**
     * 슬롯을 하나씩 읽는다 — `repo.slots.list()` 는 최고관리자용이라 주최자에겐 다른 슬롯이
     * 안 나온다(RLS). 어차피 두세 개라 왕복 수가 문제 되지 않는다.
     */
    void Promise.all(slugs.map((s) => repo.slots.get(s))).then((found) => {
      if (alive) setSlots(found.filter((s): s is Slot => s !== null))
    })
    return () => {
      alive = false
    }
  }, [slugs])

  if (slugs.length < 2 || !slots) return null

  return (
    <nav className={styles.switcher} aria-label="내 슬롯">
      <p className={styles.title}>내 행사</p>
      {slots.map((s) => (
        <a
          key={s.slug}
          href={`/${s.slug}/admin`}
          className={styles.item}
          aria-current={s.slug === current ? 'page' : undefined}
          data-current={s.slug === current || undefined}
        >
          <span className={styles.name}>{s.name}</span>
          <span className={styles.svc}>{serviceLabel(getSlotService(s))}</span>
        </a>
      ))}
    </nav>
  )
}
