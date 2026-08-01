import { useCallback, useEffect, useRef, useState } from 'react'
import { AlignField } from './AlignField'
import { Upload, X } from 'lucide-react'

import { photocardDisplay, type PhotocardDisplay } from '@/data/photocard'
import { WEBFONTS, type FontId } from '@/data/luckydraw'
import { repo } from '@/lib/repo'
import type { Photocard } from '@/lib/repo/types'
import { cssUrl } from '@/lib/image'
import type { Slot } from '@/types/slot'
import { AlphaColor, CSS, Card, Divided, Field, ShowToggle, SwatchColor } from '../editorUi'
import { ImageField } from '../ImageField'
import { uploadAsset, deleteAsset, extOf, nameFromUrl } from '../upload'
import { BoxFields } from './BoxFields'
import { BackgroundField } from './BackgroundField'
import { PickerFields } from './PickerFields'
import { I18nRow } from './I18nRow'

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
 * 포토카드 설정 카드 — **겉모습 + 카드 목록**이 여기 있다.
 *
 * 카드 목록이 왜 최고관리자 쪽이냐면 **이미지를 여기서만 올릴 수 있어서**다 —
 * Storage 쓰기가 owner-only 로 잠겨 있고(`0002_storage.sql`) 그 정책을 안 건드리는 게
 * 이 플랫폼의 설계다(방문자 사진 호스팅으로 번지지 않게).
 *
 * 대신 **행사 중에 바뀌는 값은 전부 주최자**가 만진다 — 레어도·재고·럭키·운영 방식·연습·마감.
 * `/{slug}/admin` 의 '카드' 화면이다. 전부 숫자나 스위치라 업로드가 필요 없다.
 *
 * 레어도까지 저쪽으로 보낸 이유: 확률은 행사 반응을 보고 조정하는 값인데, 그때마다 배포자를
 * 부르게 만들면 현장에서 못 고친다.
 *
 * **저장 방식이 다른 카드들과 다르다:** 이 목록은 슬롯 jsonb 가 아니라 `photocards`
 * 테이블에 들어간다. 그래서 편집기의 '저장하기' 와 무관하게 **즉시 저장**된다 —
 * 그 차이를 화면에 적어 둔다.
 */
export function PhotocardCard({
  slot,
  patch,
  patchAsset,
  onRepeat,
}: {
  slot: Slot
  patch: (change: Partial<PhotocardDisplay>) => void
  /** 배경 사진은 **슬롯 테마**가 든다 (럭드와 같은 자리) — 그래서 따로 받는다 */
  patchAsset: (key: 'backgroundPattern', value: string | null) => void
  /** 배경 반복 여부 (테마 자산의 size·repeat 두 값을 같이 바꾼다) */
  onRepeat: (repeat: boolean) => void
}) {
  const d = photocardDisplay(slot)
  const slug = slot.slug
  const [cards, setCards] = useState<Photocard[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    if (!repo.photocard.ready()) return setCards([])
    setCards(await repo.photocard.listCards(slug).catch(() => []))
  }, [slug])

  useEffect(() => {
    void load()
  }, [load])

  async function addFiles(files: FileList) {
    setBusy(true)
    setError(null)
    try {
      const base = cards?.length ?? 0
      // 순차로 올린다 — 병렬로 던지면 실패 하나가 어느 파일인지 알 수 없다 (StickerField 와 같은 판단)
      for (const [i, file] of Array.from(files).entries()) {
        const name = `photocard/${crypto.randomUUID().slice(0, 8)}.${extOf(file)}`
        const url = await uploadAsset(slug, name, file)
        await repo.photocard.saveCard(slug, {
          id: crypto.randomUUID(),
          // 파일 이름을 그대로 카드 이름으로 — 대부분 "01 리안.png" 처럼 이미 정리돼서 온다
          name: file.name.replace(/\.[^.]+$/, ''),
          rarity: 1,
          image: url,
          remaining: null,
          batchCapRatio: null,
          lucky: false,
          order: base + i + 1,
        })
      }
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : '업로드하지 못했어요')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const setCard = async (c: Photocard, change: Partial<Photocard>) => {
    const next = { ...c, ...change }
    setCards((list) => list?.map((x) => (x.id === c.id ? next : x)) ?? null)
    await repo.photocard.saveCard(slug, next)
  }

  const removeCard = async (c: Photocard) => {
    await repo.photocard.removeCard(slug, c.id)
    const file = nameFromUrl(c.image)
    if (file) await deleteAsset(slug, `photocard/${file}`).catch(() => {})
    await load()
  }

  return (
    <Card title={'포토카드 뽑기'}>
      <p style={{ margin: '0 0 16px', fontSize: 11.5, color: '#8a8a8a', lineHeight: 1.6 }}>
        레어도에 따라 카드가 뽑히고, 운영 방식에 따라 방문자 화면이 통째로 달라져요.{' '}
        <b>레어도·재고·운영 방식은 주최자가 관리 화면에서 정해요</b> — 여기서는 카드 이미지와
        겉모습만 정해요.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,240px),1fr))', gap: 14 }}>
        <div style={CSS.fieldCol}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 19 }}>
            <span style={CSS.label}>{'제목'}</span>
            <ShowToggle checked={d.showTitle} onChange={(v) => patch({ showTitle: v })} />
          </div>
          <input value={d.title} onChange={(e) => patch({ title: e.target.value })} style={CSS.input} />
          {/* 방문자 화면 제목 — 방문자가 읽는 글자라 언어별로 받는다 */}
          <I18nRow d={d} k="title" patch={patch} slot={slot} />
        </div>
        <Field label="부제">
          {/* 토글 자신이 '화면에 보이기' 라고 적혀 있다 — 앞에 라벨을 또 두면 두 번 읽힌다 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', minHeight: 19 }}>
            <ShowToggle checked={d.showSubtitle} onChange={(v) => patch({ showSubtitle: v })} />
          </div>
          <input value={d.subtitle} onChange={(e) => patch({ subtitle: e.target.value })} style={CSS.input} />
          {/* 덱 위 안내 — 방문자가 읽는 글자라 언어별로 받는다 */}
          <I18nRow d={d} k="subtitle" patch={patch} slot={slot} />
        </Field>
        <Field label="덱에 깔 뒷면 장수" hint="연출용이에요 — 실제 카드 종류와 상관없어요 (3~21장).">
          <input
            type="number"
            min={3}
            max={21}
            value={d.spreadCount}
            onChange={(e) => patch({ spreadCount: Math.min(21, Math.max(3, Number(e.target.value) || 13)) })}
            style={CSS.input}
          />
        </Field>
        <Field label="기본 글꼴">
          <select value={d.font} onChange={(e) => patch({ font: e.target.value as FontId })} style={CSS.select}>
            {Object.entries(WEBFONTS).map(([id, f]) => (
              <option key={id} value={id}>{f.label}</option>
            ))}
          </select>
        </Field>
      </div>

      {/* ── 카드 목록 (테이블에 즉시 저장) ── */}
      <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid #ededf2' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
          <span style={CSS.label}>카드 ({cards?.length ?? 0}종)</span>
          <button type="button" onClick={() => fileRef.current?.click()} style={CSS.ghostPill} disabled={busy} data-add-cards>
            <Upload size={13} aria-hidden="true" />
            {busy ? '올리는 중…' : '이미지 올리기'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => e.target.files?.length && void addFiles(e.target.files)}
          />
        </div>
        <p style={{ margin: '0 0 12px', fontSize: 11, color: '#9a9a9a', lineHeight: 1.6 }}>
          여러 장을 한 번에 올릴 수 있어요. 파일 이름이 카드 이름이 돼요.
          <br />
          <b>이 목록은 저장하기와 무관하게 바로 반영돼요</b> (색·문구와 저장되는 곳이 달라서요).
          <br />
          <b style={{ color: '#8a5c17' }}>사용 권리를 확인한 이미지만 올려 주세요</b> — 초상권·저작권은
          올리는 쪽의 책임이에요.
        </p>
        {error && <p style={{ margin: '0 0 10px', fontSize: 11.5, color: '#b4443c' }}>{error}</p>}

        {!cards ? null : cards.length === 0 ? (
          <div style={{ padding: '18px 14px', borderRadius: 8, border: '1px dashed #dcdce4', fontSize: 11.5, color: '#9a9a9a', textAlign: 'center' }}>
            아직 카드가 없어요. 이미지를 올리면 여기에 줄이 생겨요.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} data-photocards>
            {cards.map((c) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* 썸네일도 background-image — 편집기 미리보기도 예외가 아니다 (CLAUDE.md) */}
                <span
                  style={{
                    display: 'block',
                    width: 34,
                    height: 52,
                    flexShrink: 0,
                    borderRadius: 4,
                    border: '1px solid #e4e4ea',
                    backgroundImage: cssUrl(c.image),
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }}
                  role="img"
                  aria-label={c.name}
                />
                <input
                  value={c.name}
                  onChange={(e) => void setCard(c, { name: e.target.value })}
                  placeholder="카드 이름"
                  style={{ ...CSS.input, flex: 1, minWidth: 90 }}
                />
                <button type="button" onClick={() => void removeCard(c)} aria-label="카드 삭제" style={ICON}>
                  <X size={14} />
                </button>
              </div>
            ))}
            <p style={{ margin: '2px 0 0', fontSize: 11, color: '#9a9a9a', lineHeight: 1.6 }}>
              <b>레어도·재고·럭키는 주최자 관리 화면에서 정해요</b> — 행사 중에 바뀌는 값이라
              주최자가 직접 만질 수 있어야 해서요. 여기서는 이미지와 이름만 정해요.
            </p>
          </div>
        )}
      </div>

      <Divided>
        <Field label="뽑기권 화면 제목" hint="'1장 증정' 방식에서만 보여요.">
          <input value={d.ticketHeadline} onChange={(e) => patch({ ticketHeadline: e.target.value })} style={CSS.input} />
          {/* 뽑기권 화면 머리말 — 방문자가 읽는 글자라 언어별로 받는다 */}
          <I18nRow d={d} k="ticketHeadline" patch={patch} slot={slot} />
        </Field>
        <Field label="뽑기권 안내">
          <input value={d.ticketGuide} onChange={(e) => patch({ ticketGuide: e.target.value })} style={CSS.input} />
          {/* 뽑기권 안내문 — 방문자가 읽는 글자라 언어별로 받는다 */}
          <I18nRow d={d} k="ticketGuide" patch={patch} slot={slot} rows={3} />
        </Field>
        <Field label="안내 화면 제목" hint="'판매' 방식에서 방문자 폰에 뜨는 한 장이에요.">
          <input value={d.counterTitle} onChange={(e) => patch({ counterTitle: e.target.value })} style={CSS.input} />
        </Field>
        <Field label="운영 시간 안내">
          <input
            value={d.counterHours}
            onChange={(e) => patch({ counterHours: e.target.value })}
            placeholder="11:00 – 20:00 · 수량 소진 시 조기 마감"
            style={CSS.input}
          />
        </Field>
      </Divided>

      <Divided min={250} gap={12}>
        {(
          [
            ['deckBg', '덱 배경색', '카드가 주인공이라 어두운 게 기본이에요'],
            ['deckGlow', '덱 빛번짐', '가운데에서 번지는 색'],
            ['bg', '밝은 화면 배경', '뽑기권 · 보관함 · 안내'],
            ['headText', '글자색'],
            ['subText', '서브 글자색'],
            ['buttonColor', '버튼색'],
          ] as ['deckBg' | 'deckGlow' | 'bg' | 'headText' | 'subText' | 'buttonColor', string, string?][]
        ).map(([key, label, hint]) => (
          <SwatchColor
            key={key}
            label={label}
            hint={hint}
            value={d[key]}
            onChange={(v) => patch({ [key]: v } as Partial<PhotocardDisplay>)}
          />
        ))}
      </Divided>

      <Divided>
        <ImageField
          slug={slot.slug}
          label="로고"
          title="로고"
          name="photocard-logo"
          value={d.logo || null}
          onChange={(v) => patch({ logo: v ?? '' })}
          hint="덱 헤더와 안내 화면에 떠요."
        />
        <AlignField value={d.logoAlign} onChange={(a) => patch({ logoAlign: a })} />
        {/* 덱에 깔리는 뒷면 — 타로 뒷면과 별개다 (비율이 다르고 같이 팔지 않는다) */}
        <ImageField
          slug={slot.slug}
          label="카드 뒷면"
          title="카드 뒷면"
          name="photocard-back"
          value={d.cardBack || null}
          onChange={(v) => patch({ cardBack: v ?? '' })}
          hint="덱에 깔리는 뒷면이에요 (세로 55:85). 비우면 덱 색에서 만든 무늬를 써요."
        />
        {/* 배경 사진은 슬롯 테마가 든다 — 스태프 화면(럭드와 같은 무대) 뒤에 깔려요 */}
        <BackgroundField
          slug={slot.slug}
          name="photocard-bg"
          value={slot.theme.assets.backgroundPattern}
          repeat={slot.theme.assets.backgroundPatternRepeat === 'repeat'}
          onImage={(v) => patchAsset('backgroundPattern', v)}
          onRepeat={onRepeat}
          hint="스태프 화면의 박스가 얹힐 자리를 비워둔 사진이 좋아요."
        />
        <Field label="뽑기 버튼 문구">
          <input value={d.drawLabel} onChange={(e) => patch({ drawLabel: e.target.value })} style={CSS.input} />
          {/* 방문자 폰의 '뽑기권 받기' — 방문자가 읽는 글자라 언어별로 받는다 */}
          <I18nRow d={d} k="drawLabel" patch={patch} slot={slot} />
        </Field>
        <Field label="저장 버튼 문구">
          <input value={d.saveLabel} onChange={(e) => patch({ saveLabel: e.target.value })} style={CSS.input} />
          <I18nRow d={d} k="saveLabel" patch={patch} slot={slot} />
        </Field>
        <Field label="카운터 안내" hint="뽑기권을 받으러 카운터에 가라는 안내예요.">
          <input value={d.counterBody} onChange={(e) => patch({ counterBody: e.target.value })} style={CSS.input} />
          <I18nRow d={d} k="counterBody" patch={patch} slot={slot} />
        </Field>
        <Field label="보관함 이름">
          <input value={d.lockerLabel} onChange={(e) => patch({ lockerLabel: e.target.value })} style={CSS.input} />
          {/* 보관함 버튼 — 방문자가 읽는 글자라 언어별로 받는다 */}
          <I18nRow d={d} k="lockerLabel" patch={patch} slot={slot} />
        </Field>
        <Field label="마감 문구" hint="마감했을 때 스태프 화면에 떠요.">
          <input value={d.closedText} onChange={(e) => patch({ closedText: e.target.value })} style={CSS.input} />
          {/* 마감 안내 — 방문자가 읽는 글자라 언어별로 받는다 */}
          <I18nRow d={d} k="closedText" patch={patch} slot={slot} />
        </Field>
        <Field label="화면 아래 표기" hint="비우면 안 그려요 (제작사 표기 자리).">
          <input
            value={d.footerNote}
            onChange={(e) => patch({ footerNote: e.target.value })}
            placeholder="made by ○○"
            style={CSS.input}
          />
          {/* 화면 아래 안내 — 방문자가 읽는 글자라 언어별로 받는다 */}
          <I18nRow d={d} k="footerNote" patch={patch} slot={slot} />
        </Field>
      </Divided>

      {/* ── 미리보기 모달 · 타일 테두리 (럭드와 같은 설정) ── */}
      <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid #ededf2' }}>
        <span style={CSS.label}>포토카드 미리보기 창</span>
        <p style={{ margin: '6px 0 12px', fontSize: 11, color: '#9a9a9a', lineHeight: 1.6 }}>
          스태프 화면에서 '포토카드 미리보기' 를 눌렀을 때 뜨는 창이에요.{' '}
          <b>비워두면 이 이벤트 색을 그대로 따라가요.</b>
        </p>
        <Divided min={230} gap={12}>
          <AlphaColor label="배경색" value={d.modalBg || slot.theme.colors.surface} onChange={(v) => patch({ modalBg: v })} />
          <AlphaColor label="글자색" value={d.modalText || slot.theme.colors.fg1} onChange={(v) => patch({ modalText: v })} />
          <AlphaColor
            label="카드 칸 배경"
            value={d.modalItemBg || slot.theme.colors.wash}
            onChange={(v) => patch({ modalItemBg: v })}
          />
          {!d.modalNoBorder && (
            <AlphaColor
              label="테두리색"
              value={d.modalBorder || slot.theme.colors.border}
              onChange={(v) => patch({ modalBorder: v })}
            />
          )}
        </Divided>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#505050', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={d.modalNoBorder}
              onChange={(e) => patch({ modalNoBorder: e.target.checked })}
              style={{ width: 14, height: 14, accentColor: '#816bff', cursor: 'pointer' }}
            />
            창 안 테두리 없음 (배경색만으로 구분)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#505050', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={d.noBorder}
              onChange={(e) => patch({ noBorder: e.target.checked })}
              style={{ width: 14, height: 14, accentColor: '#816bff', cursor: 'pointer' }}
            />
            결과 카드·줄의 테두리 없음
          </label>
        </div>
      </div>

      {/* 스태프 화면은 럭키드로우와 **같은 무대**를 쓴다 — 그래서 설정도 같은 부품이다 */}
      <BoxFields
        value={d}
        onChange={(change) => patch(change)}
        borderFallback={slot.theme.colors.border}
        hint="스태프 화면에서 사진 위에 뜨는 상자예요 (럭키드로우와 같은 화면)."
      />

      <PickerFields
        value={d.picker}
        onChange={(picker) => patch({ picker })}
        hint="'판매' 방식에서 스태프 화면에 뜨는 − 숫자 + 스테퍼와 1·5·10 프리셋, 뽑기 버튼이에요."
      />
    </Card>
  )
}

