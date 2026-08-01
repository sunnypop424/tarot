import { useRef, useState } from 'react'
import { GripVertical, Image as ImageIcon, Plus, Upload, X } from 'lucide-react'

import { stampDisplay, type StampCell, type StampDisplay } from '@/data/stamp'
import { WEBFONTS, type FontId } from '@/data/luckydraw'
import { cssUrl } from '@/lib/image'
import type { Slot } from '@/types/slot'
import { CSS, Card, Divided, Field, SwatchColor } from '../editorUi'
import { ImageField } from '../ImageField'
import { uploadAsset, deleteAsset, extOf, nameFromUrl } from '../upload'

/** 칸 줄에만 쓰는 작은 아이콘 버튼 — 편집기 공용 CSS 에 없어 여기 둔다 */
const ICON: React.CSSProperties = {
  width: 24,
  height: 24,
  display: 'grid',
  placeItems: 'center',
  border: 'none',
  background: 'none',
  color: '#a0a0a8',
  cursor: 'pointer',
  fontSize: 9,
  padding: 0,
  flexShrink: 0,
}

/**
 * 방문 스탬프 설정 카드 — **겉모습 + 칸 정의**가 여기 있다.
 *
 * 칸이 왜 최고관리자 쪽이냐면, **칸 수가 곧 판의 모양**이라 겉모습에 가깝고
 * 서버(`stamp_checkin` 의 완성 판정)도 이 수를 읽기 때문이다. 주최자가 이벤트 중간에
 * 칸을 늘리면 이미 다 모은 방문자의 판이 미완성으로 되돌아간다.
 *
 * 반대로 **현장 암호·보상 방식·일일 리셋은 주최자**가 `/{slug}/admin` 에서 정한다
 * (`stamp_settings` 테이블) — 운영 중에 바뀌는 값이라 배포를 기다릴 수 없다.
 */
export function StampCard({
  slot,
  patch,
}: {
  slot: Slot
  patch: (change: Partial<StampDisplay>) => void
}) {
  const d = stampDisplay(slot)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // 칸마다 파일 입력을 두면 DOM 이 칸 수만큼 는다 — 하나를 돌려 쓰고 어느 칸인지만 기억한다
  const fileRef = useRef<HTMLInputElement>(null)
  const targetRef = useRef<string | null>(null)

  const setCell = (i: number, change: Partial<StampCell>) =>
    patch({ stamps: d.stamps.map((c, n) => (n === i ? { ...c, ...change } : c)) })

  const addCell = () =>
    patch({
      stamps: [
        ...d.stamps,
        // id 는 코드와 이어지는 열쇠라 **한 번 정해지면 안 바뀐다** — 이름만 고친다
        { id: crypto.randomUUID().slice(0, 8), name: `${d.stamps.length + 1}번 칸` },
      ],
    })

  const removeCell = (i: number) => {
    const gone = d.stamps[i]
    if (gone?.icon) void dropIcon(gone.icon)
    patch({ stamps: d.stamps.filter((_, n) => n !== i) })
  }

  /** Storage 에서도 지운다 — 안 지우면 슬롯을 지울 때까지 남는다 */
  async function dropIcon(url: string) {
    const file = nameFromUrl(url)
    if (file) await deleteAsset(slot.slug, `stamp/${file}`).catch(() => {})
  }

  async function uploadIcon(file: File) {
    const id = targetRef.current
    if (!id) return
    setBusy(id)
    setError(null)
    try {
      const name = `stamp/${crypto.randomUUID().slice(0, 8)}.${extOf(file)}`
      const url = await uploadAsset(slot.slug, name, file)
      const prev = d.stamps.find((c) => c.id === id)?.icon
      patch({ stamps: d.stamps.map((c) => (c.id === id ? { ...c, icon: url } : c)) })
      if (prev) void dropIcon(prev)
    } catch (e) {
      setError(e instanceof Error ? e.message : '업로드하지 못했어요')
    } finally {
      setBusy(null)
      targetRef.current = null
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= d.stamps.length) return
    const next = [...d.stamps]
    ;[next[i], next[j]] = [next[j], next[i]]
    patch({ stamps: next })
  }

  return (
    <Card title={'방문 스탬프'}>
      <p style={{ margin: '0 0 16px', fontSize: 11.5, color: '#8a8a8a', lineHeight: 1.6 }}>
        방문자가 현장 암호를 입력하면 도장이 찍혀요.{' '}
        <b>암호와 선물 방식은 주최자가 관리 화면에서 정해요</b> — 여기서는 칸과 겉모습만 정해요.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,240px),1fr))', gap: 14 }}>
        <div style={CSS.fieldCol}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 19 }}>
            <span style={CSS.label}>{'제목'}</span>
            <ShowToggle checked={d.showTitle} onChange={(v) => patch({ showTitle: v })} />
          </div>
          <input value={d.title} onChange={(e) => patch({ title: e.target.value })} style={CSS.input} />
        </div>
        <div style={CSS.fieldCol}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 19 }}>
            <span style={CSS.label}>부제</span>
            <ShowToggle checked={d.showSubtitle} onChange={(v) => patch({ showSubtitle: v })} />
          </div>
          <input value={d.subtitle} onChange={(e) => patch({ subtitle: e.target.value })} style={CSS.input} />
        </div>
        <Field label="암호 입력 버튼 문구">
          <input value={d.codeLabel} onChange={(e) => patch({ codeLabel: e.target.value })} style={CSS.input} />
        </Field>
        <Field label="기본 글꼴">
          <select value={d.font} onChange={(e) => patch({ font: e.target.value as FontId })} style={CSS.select}>
            {Object.entries(WEBFONTS).map(([id, f]) => (
              <option key={id} value={id}>{f.label}</option>
            ))}
          </select>
        </Field>
      </div>

      <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid #ededf2' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
          <span style={CSS.label}>스탬프 칸 ({d.stamps.length}개)</span>
          <button type="button" onClick={addCell} style={CSS.ghostPill} data-add-stamp>
            <Plus size={13} aria-hidden="true" />
            칸 추가
          </button>
        </div>
        <p style={{ margin: '0 0 12px', fontSize: 11, color: '#9a9a9a', lineHeight: 1.6 }}>
          <b>이벤트가 시작된 뒤에는 칸을 늘리거나 줄이지 마세요</b> — 이미 다 모은 방문자의 판이
          미완성으로 되돌아가요. 이름만 고치는 건 안전해요.
          {d.stamps.length > 0 && d.stamps.length <= 4 && ' · 4칸 이하는 2줄로, 5칸부터는 3줄로 그려져요.'}
          <br />
          칸마다 <b>도장 그림(투명 PNG)</b>을 올릴 수 있어요. 안 올리면 기본 도장 아이콘이
          들어가고 <b>도장색</b>을 따라요 (그림을 올리면 그림의 색이 그대로 나와요).
        </p>
        {error && <p style={{ margin: '0 0 10px', fontSize: 11.5, color: '#b4443c' }}>{error}</p>}
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/webp,image/svg+xml"
          hidden
          onChange={(e) => e.target.files?.[0] && void uploadIcon(e.target.files[0])}
        />

        {d.stamps.length === 0 ? (
          <div
            style={{
              padding: '18px 14px',
              borderRadius: 8,
              border: '1px dashed #dcdce4',
              fontSize: 11.5,
              color: '#9a9a9a',
              textAlign: 'center',
            }}
          >
            아직 칸이 없어요. 칸을 만들어야 방문자 화면에 판이 그려져요.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }} data-stamp-cells>
            {d.stamps.map((c, i) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <div style={{ display: 'flex', flexDirection: 'column', color: '#c4c4cc' }}>
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label="위로"
                    style={{ ...ICON, height: 15, opacity: i === 0 ? 0.3 : 1 }}
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === d.stamps.length - 1}
                    aria-label="아래로"
                    style={{ ...ICON, height: 15, opacity: i === d.stamps.length - 1 ? 0.3 : 1 }}
                  >
                    ▼
                  </button>
                </div>
                <GripVertical size={14} color="#d4d4dc" aria-hidden="true" />
                <span style={{ width: 18, fontSize: 11, color: '#a0a0a8', textAlign: 'right' }}>{i + 1}</span>
                {/* 썸네일도 background-image — 편집기 미리보기도 예외가 아니다 (CLAUDE.md) */}
                <button
                  type="button"
                  onClick={() => {
                    targetRef.current = c.id
                    fileRef.current?.click()
                  }}
                  disabled={busy === c.id}
                  title={c.icon ? '도장 그림 바꾸기' : '도장 그림 올리기'}
                  aria-label={`${c.name} 도장 그림`}
                  style={{
                    width: 34,
                    height: 34,
                    flexShrink: 0,
                    display: 'grid',
                    placeItems: 'center',
                    border: '1px solid #dddddd',
                    borderRadius: 4,
                    background: '#fff',
                    backgroundImage: c.icon ? cssUrl(c.icon) : undefined,
                    backgroundSize: '70%',
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat',
                    color: '#a0a0a8',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  {!c.icon && (busy === c.id ? <Upload size={13} /> : <ImageIcon size={13} />)}
                </button>
                {c.icon && (
                  <button
                    type="button"
                    onClick={() => {
                      void dropIcon(c.icon!)
                      setCell(i, { icon: undefined })
                    }}
                    aria-label={`${c.name} 도장 그림 지우기`}
                    title="도장 그림 지우기"
                    style={{ ...ICON, width: 18 }}
                  >
                    <X size={11} />
                  </button>
                )}
                <input
                  value={c.name}
                  onChange={(e) => setCell(i, { name: e.target.value })}
                  placeholder="칸 이름 (포토존 참여 · 1번 카페)"
                  style={{ ...CSS.input, flex: 1, minWidth: 90 }}
                />
                <button type="button" onClick={() => removeCell(i)} aria-label="칸 삭제" style={ICON}>
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Divided>
        <Field label="암호 입력 안내">
          <input value={d.codeHint} onChange={(e) => patch({ codeHint: e.target.value })} style={CSS.input} />
        </Field>
      </Divided>

      <Divided min={250} gap={12}>
        {(
          [
            ['headText', '글자색', '제목 · 칸 이름'],
            ['subText', '서브 글자색', '안내 문구'],
            ['bg', '배경색'],
            ['buttonColor', '버튼색', '암호 입력'],
            ['stampColor', '도장색', '찍힌 칸에 들어가는 색'],
          ] as ['headText' | 'subText' | 'bg' | 'buttonColor' | 'stampColor', string, string?][]
        ).map(([key, label, hint]) => (
          <SwatchColor
            key={key}
            label={label}
            hint={hint}
            value={d[key]}
            onChange={(v) => patch({ [key]: v } as Partial<StampDisplay>)}
          />
        ))}
      </Divided>

      <Divided>
        <ImageField
          slug={slot.slug}
          label="로고"
          name="stamp-logo"
          value={d.logo || null}
          onChange={(v) => patch({ logo: v ?? '' })}
          hint="헤더에 떠요. 없으면 제목 텍스트가 나와요."
        />
        <Field label="로고 정렬">
          <select
            value={d.logoAlign}
            onChange={(e) => patch({ logoAlign: e.target.value as StampDisplay['logoAlign'] })}
            style={CSS.select}
          >
            <option value="left">왼쪽</option>
            <option value="center">가운데</option>
            <option value="right">오른쪽</option>
          </select>
        </Field>
      </Divided>
    </Card>
  )
}

function ShowToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#8a8a8a', cursor: 'pointer', whiteSpace: 'nowrap' }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 14, height: 14, accentColor: '#816bff', cursor: 'pointer' }}
      />
      화면에 보이기
    </label>
  )
}
