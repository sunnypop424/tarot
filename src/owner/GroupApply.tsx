import { useState } from 'react'
import { Layers } from 'lucide-react'

import { repo } from '@/lib/repo'
import type { Slot } from '@/types/slot'
import { CSS } from './editorUi'
import { confirmAction, toast } from '@/admin/AdminFeedback'

/**
 * **묶음에 같이 적용** — 같은 `group` 인 다른 슬롯에 지금 슬롯의 공통 설정을 복사한다.
 *
 * 한 생일카페가 포토카드·스탬프·모의고사를 같이 얹으면 슬롯이 셋이다. 색·radius·글꼴·
 * 로고는 셋이 같아야 하는데, 지금까지는 **같은 값을 세 번 손으로 넣었다.** 하나를 고치면
 * 나머지 둘을 잊는 게 기본값이 된다.
 *
 * ── 왜 "공통 설정" 이라는 새 저장소를 안 만드나 ──────
 *
 * 그룹은 **최고관리자의 정리 도구**지 권한이나 소유 단위가 아니다 (`src/types/slot.ts`).
 * 여기에 진짜 상속을 넣으면 슬롯 하나를 읽는 데 그룹 행을 같이 읽어야 하고, 그룹을 지우면
 * 슬롯 겉모습이 무너진다. **복사는 그런 게 없다** — 누르는 순간 각 슬롯이 자기 값을 갖고,
 * 그 뒤에 하나만 다르게 고쳐도 아무것도 안 깨진다.
 *
 * ── 되돌리기 어려운 일이라 확인을 받는다 ───────────
 *
 * 여러 슬롯을 한 번에 덮어쓴다. 그래서 **무엇을 · 어디에** 를 먼저 보여 주고 확인을 받는다.
 */
export function GroupApply({ draft, slots }: { draft: Slot; slots: Slot[] }) {
  const group = (draft.group ?? '').trim()
  const mates = slots.filter((s) => (s.group ?? '').trim() === group && s.slug !== draft.slug)

  const [what, setWhat] = useState({ theme: true, logo: false, align: true })
  const [busy, setBusy] = useState(false)

  // 묶음이 없거나 혼자면 보여줄 게 없다
  if (!group || mates.length === 0) return null

  const apply = async () => {
    const picked = [
      what.theme && '색·형태·글꼴',
      what.logo && '로고 이미지',
      what.align && '로고 정렬',
    ].filter(Boolean)
    if (!picked.length) return

    const ok = await confirmAction({
      title: `묶음 「${group}」 의 슬롯 ${mates.length}개에 적용할까요?`,
      desc: `${picked.join(' · ')} 을(를) ${mates.map((m) => m.slug).join(' · ')} 에 덮어써요. 각 슬롯에 저장된 값은 사라져요.`,
      okLabel: '적용',
    })
    if (!ok) return

    setBusy(true)
    try {
      for (const mate of mates) {
        const next: Slot = { ...mate }
        if (what.theme) {
          next.theme = {
            ...mate.theme,
            colors: draft.theme.colors,
            shape: draft.theme.shape,
            font: draft.theme.font,
          }
        }
        if (what.logo) {
          next.theme = {
            ...next.theme,
            assets: { ...next.theme.assets, logo: draft.theme.assets.logo, logoHeight: draft.theme.assets.logoHeight },
          }
        }
        /**
         * 로고 정렬은 **서비스별 설정 안**에 산다 (`<Svc>Display.logoAlign`). 서비스가
         * 달라도 필드 이름은 같아서, 상대 슬롯이 쓰는 서비스 칸에 그대로 넣으면 된다.
         */
        if (what.align) {
          const align = alignOf(draft)
          if (align) {
            for (const key of SERVICE_KEYS) {
              const cur = (next as unknown as Record<string, unknown>)[key]
              if (cur && typeof cur === 'object') {
                ;(next as unknown as Record<string, unknown>)[key] = { ...(cur as object), logoAlign: align }
              }
            }
          }
        }
        await repo.slots.save(next)
      }
      toast(`${mates.length}개 슬롯에 적용했어요`)
    } catch (e) {
      toast(e instanceof Error ? e.message : '적용하지 못했어요')
    } finally {
      setBusy(false)
    }
  }

  const box = (key: keyof typeof what, label: string) => (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#505050', cursor: 'pointer' }}>
      <input
        type="checkbox"
        checked={what[key]}
        onChange={(e) => setWhat((w) => ({ ...w, [key]: e.target.checked }))}
        style={{ width: 14, height: 14, accentColor: '#816bff', cursor: 'pointer' }}
      />
      {label}
    </label>
  )

  return (
    <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #eeeeee' }} data-group-apply>
      <div style={{ ...CSS.label, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Layers size={13} aria-hidden="true" />
        묶음에 같이 적용
      </div>
      <p style={{ ...CSS.hint, margin: '0 0 9px' }}>
        같은 묶음의 <b>{mates.length}개</b> 슬롯({mates.map((m) => m.slug).join(' · ')})에 이 값을 덮어써요.
      </p>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 10 }}>
        {box('theme', '색 · 형태 · 글꼴')}
        {box('align', '로고 정렬')}
        {box('logo', '로고 이미지')}
      </div>
      <button type="button" style={CSS.ghostPill} disabled={busy} onClick={() => void apply()}>
        {busy ? '적용 중…' : '적용하기'}
      </button>
    </div>
  )
}

/** 슬롯이 쓰는 서비스 설정 칸들 — 로고 정렬이 여기 산다 */
const SERVICE_KEYS = [
  'luckydraw',
  'rolling',
  'photozone',
  'wish',
  'poll',
  'stamp',
  'quiz',
  'photocard',
  'cheer',
] as const

/** 지금 슬롯이 고른 로고 정렬 (서비스가 무엇이든 필드 이름은 같다) */
function alignOf(slot: Slot): string | null {
  for (const key of SERVICE_KEYS) {
    const cfg = (slot as unknown as Record<string, unknown>)[key]
    if (cfg && typeof cfg === 'object') {
      const a = (cfg as { logoAlign?: string }).logoAlign
      if (a) return a
    }
  }
  return null
}
