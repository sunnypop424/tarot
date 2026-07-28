import { useRef, useState } from 'react'
import { Image as ImageIcon, Plus, Upload, X } from 'lucide-react'

import { quizDisplay, type QuizDisplay, type QuizTitle } from '@/data/quiz'
import { WEBFONTS, type FontId } from '@/data/luckydraw'
import { cssUrl } from '@/lib/image'
import type { Slot } from '@/types/slot'
import { CSS, Card, Divided, Field, SwatchColor } from '../editorUi'
import { ImageField } from '../ImageField'
import { uploadAsset, deleteAsset, extOf, nameFromUrl } from '../upload'

const ICON: React.CSSProperties = {
  width: 24,
  height: 24,
  display: 'grid',
  placeItems: 'center',
  border: 'none',
  background: 'none',
  color: '#a0a0a8',
  cursor: 'pointer',
  padding: 0,
  flexShrink: 0,
}

/**
 * 최애 모의고사 설정 카드 — **겉모습 + 칭호**가 여기 있다.
 *
 * 칭호가 왜 최고관리자 쪽이냐면, 점수대별 이름은 이벤트의 톤 그 자체("입덕 새싹" / "찐팬 인증")고
 * **실제로 손님이 공유하는 건 점수가 아니라 칭호**이기 때문이다. 문안을 만드는 사람 쪽에 둔다.
 *
 * 문항·정답·커트라인·제한시간은 **주최자**가 `/{slug}/admin` 에서 만든다.
 */
export function QuizCard({
  slot,
  patch,
}: {
  slot: Slot
  patch: (change: Partial<QuizDisplay>) => void
}) {
  const d = quizDisplay(slot)
  const [busy, setBusy] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  // 칭호마다 파일 입력을 두면 DOM 이 칭호 수만큼 는다 - 하나를 돌려 쓰고 대상만 기억한다
  const fileRef = useRef<HTMLInputElement>(null)
  const targetRef = useRef<number | null>(null)

  const setTitle = (i: number, change: Partial<QuizTitle>) =>
    patch({ titles: d.titles.map((t, n) => (n === i ? { ...t, ...change } : t)) })

  /** Storage 에서도 지운다 - 안 지우면 슬롯을 지울 때까지 남는다 */
  async function dropImage(url: string) {
    const file = nameFromUrl(url)
    if (file) await deleteAsset(slot.slug, `quiz/${file}`).catch(() => {})
  }

  async function uploadBadge(file: File) {
    const i = targetRef.current
    if (i === null) return
    setBusy(i)
    setError(null)
    try {
      const name = `quiz/${crypto.randomUUID().slice(0, 8)}.${extOf(file)}`
      const url = await uploadAsset(slot.slug, name, file)
      const prev = d.titles[i]?.image
      setTitle(i, { image: url })
      if (prev) void dropImage(prev)
    } catch (e) {
      setError(e instanceof Error ? e.message : '업로드하지 못했어요')
    } finally {
      setBusy(null)
      targetRef.current = null
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <Card title="최애 모의고사">
      <p style={{ margin: '0 0 16px', fontSize: 11.5, color: '#8a8a8a', lineHeight: 1.6 }}>
        문제를 풀면 점수대별 <b>칭호 카드</b>가 나오고, 손님이 그걸 저장해 자랑합니다.{' '}
        <b>문항과 정답은 주최자가 관리 화면에서 만듭니다</b> — 여기서는 칭호와 겉모습만 정해요.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,240px),1fr))', gap: 14 }}>
        <div style={CSS.fieldCol}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 19 }}>
            <span style={CSS.label}>제목</span>
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
        <Field label="시작 버튼 문구">
          <input value={d.startLabel} onChange={(e) => patch({ startLabel: e.target.value })} style={CSS.input} />
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
          <span style={CSS.label}>칭호 ({d.titles.length}개)</span>
          <button
            type="button"
            onClick={() => patch({ titles: [...d.titles, { min: 50, label: '새 칭호' }] })}
            style={CSS.ghostPill}
            data-add-title
          >
            <Plus size={13} aria-hidden="true" />
            칭호 추가
          </button>
        </div>
        <p style={{ margin: '0 0 12px', fontSize: 11, color: '#9a9a9a', lineHeight: 1.6 }}>
          기준은 <b>백분율</b>이에요 — 문항 수가 바뀌어도 칭호가 그대로 맞습니다. (절대 점수로 두면
          문항 하나만 지워도 아무도 최고 칭호를 못 받아요.)
          <br />
          가장 낮은 칭호는 <b>0%</b> 로 두세요. 그래야 모든 손님이 무언가는 받습니다.
          <br />
          칭호마다 <b>그림(투명 PNG)</b>을 올릴 수 있어요 &mdash; 칭호 <b>위</b>에 뜨고,{' '}
          <b>손님이 저장하는 칭호 카드에도 같이 들어갑니다.</b>
        </p>
        {error && <p style={{ margin: '0 0 10px', fontSize: 11.5, color: '#b4443c' }}>{error}</p>}
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/webp,image/svg+xml"
          hidden
          onChange={(e) => e.target.files?.[0] && void uploadBadge(e.target.files[0])}
        />

        {d.titles.length === 0 ? (
          <div style={{ padding: '18px 14px', borderRadius: 8, border: '1px dashed #dcdce4', fontSize: 11.5, color: '#9a9a9a', textAlign: 'center' }}>
            칭호가 없으면 결과 카드에 점수만 나와요.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }} data-titles>
            {[...d.titles]
              .map((t, i) => ({ t, i }))
              .sort((a, b) => a.t.min - b.t.min)
              .map(({ t, i }) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={t.min}
                    onChange={(e) => setTitle(i, { min: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })}
                    style={{ ...CSS.input, width: 68 }}
                    aria-label="기준 백분율"
                  />
                  <span style={{ fontSize: 11.5, color: '#8a8a8a', flexShrink: 0 }}>% →</span>
                  {/* 썸네일도 background-image - 편집기 미리보기도 예외가 아니다 (CLAUDE.md) */}
                  <button
                    type="button"
                    onClick={() => {
                      targetRef.current = i
                      fileRef.current?.click()
                    }}
                    disabled={busy === i}
                    title={t.image ? '칭호 그림 바꾸기' : '칭호 그림 올리기'}
                    aria-label={`${t.label} 칭호 그림`}
                    style={{
                      width: 34,
                      height: 34,
                      flexShrink: 0,
                      display: 'grid',
                      placeItems: 'center',
                      border: '1px solid #dddddd',
                      borderRadius: 4,
                      background: '#fff',
                      backgroundImage: t.image ? cssUrl(t.image) : undefined,
                      backgroundSize: '76%',
                      backgroundPosition: 'center',
                      backgroundRepeat: 'no-repeat',
                      color: '#a0a0a8',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    {!t.image && (busy === i ? <Upload size={13} /> : <ImageIcon size={13} />)}
                  </button>
                  {t.image && (
                    <button
                      type="button"
                      onClick={() => {
                        void dropImage(t.image!)
                        setTitle(i, { image: undefined })
                      }}
                      aria-label={`${t.label} 칭호 그림 지우기`}
                      title="칭호 그림 지우기"
                      style={{ ...ICON, width: 18 }}
                    >
                      <X size={11} />
                    </button>
                  )}
                  <input
                    value={t.label}
                    onChange={(e) => setTitle(i, { label: e.target.value })}
                    placeholder="칭호 이름"
                    style={{ ...CSS.input, flex: 1, minWidth: 80 }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (t.image) void dropImage(t.image)
                      patch({ titles: d.titles.filter((_, n) => n !== i) })
                    }}
                    aria-label="칭호 삭제"
                    style={ICON}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
          </div>
        )}
      </div>

      <Divided>
        <Field label="칭호 카드 위 작은 글씨" hint="시안 기본값은 MY TITLE 이에요.">
          <input value={d.resultKicker} onChange={(e) => patch({ resultKicker: e.target.value })} style={CSS.input} />
        </Field>
        <Field label="칭호 카드 아래 한 줄" hint="보통 이벤트 주소를 적어요 — 저장된 이미지가 퍼질 때 출처가 됩니다.">
          <input
            value={d.cardFooter}
            onChange={(e) => patch({ cardFooter: e.target.value })}
            placeholder={`tarot.example.com/${slot.slug}`}
            style={CSS.input}
          />
        </Field>
        <Field label="문항 순서" hint="섞으면 앞사람 답을 어깨너머로 보기 어려워져요.">
          <select
            value={d.shuffleQuestions ? 'on' : 'off'}
            onChange={(e) => patch({ shuffleQuestions: e.target.value === 'on' })}
            style={CSS.select}
          >
            <option value="off">만든 순서대로</option>
            <option value="on">사람마다 섞어요</option>
          </select>
        </Field>
        <Field label="다음 버튼 문구">
          <input value={d.nextLabel} onChange={(e) => patch({ nextLabel: e.target.value })} style={CSS.input} />
        </Field>
      </Divided>

      <Divided min={250} gap={12}>
        {(
          [
            ['headText', '글자색', '문제 · 칭호'],
            ['subText', '서브 글자색', '안내 · 점수'],
            ['bg', '배경색', '문항 화면 · 칭호 카드'],
            ['resultBg', '결과 배경색', '카드를 받치는 판 (조금 어둡게)'],
            ['buttonColor', '버튼색', '고른 보기도 이 색이에요'],
          ] as ['headText' | 'subText' | 'bg' | 'resultBg' | 'buttonColor', string, string?][]
        ).map(([key, label, hint]) => (
          <SwatchColor
            key={key}
            label={label}
            hint={hint}
            value={d[key]}
            onChange={(v) => patch({ [key]: v } as Partial<QuizDisplay>)}
          />
        ))}
      </Divided>

      <Divided>
        <ImageField
          slug={slot.slug}
          label="로고"
          name="quiz-logo"
          value={d.logo || null}
          onChange={(v) => patch({ logo: v ?? '' })}
          hint="시작 화면과 칭호 카드에 함께 떠요 (저장되는 이미지에도 들어갑니다)."
        />
        <Field label="시작 화면 정렬">
          <select
            value={d.logoAlign}
            onChange={(e) => patch({ logoAlign: e.target.value as QuizDisplay['logoAlign'] })}
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
