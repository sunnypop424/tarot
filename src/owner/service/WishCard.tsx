import { wishDisplay, type WishDisplay } from '@/data/wish'
import { WEBFONTS, type FontId } from '@/data/luckydraw'
import type { Slot } from '@/types/slot'
import { CSS, Card, Divided, Field, SwatchColor } from '../editorUi'
import { ImageField } from '../ImageField'
import { StickerField } from '../StickerField'
import { PaletteField } from './PaletteField'

/**
 * 소원나무 설정 카드 — 포토존에 이어 **두 번째로 `SlotEditor` 밖에 있는 서비스 카드**.
 *
 * 롤페 카드와 필드 구성이 거의 같다(제목·부제·색 팔레트·장식·배경). 그런데 **부르는 이름이 다르다** —
 * 종이색이 아니라 등불색, 스티커가 아니라 장식이다. 최고관리자가 소원나무 슬롯을 열었는데
 * "포스트잇 종이색" 이라고 쓰여 있으면 그건 그냥 틀린 화면이다.
 */
export function WishCard({
  slot,
  patch,
}: {
  slot: Slot
  patch: (change: Partial<WishDisplay>) => void
}) {
  const d = wishDisplay(slot)

  return (
    <Card title="소원나무">
      <p style={{ margin: '0 0 16px', fontSize: 11.5, color: '#8a8a8a', lineHeight: 1.6 }}>
        방문자가 소원을 적으면 등불로 나무에 매달려요. 건 즉시 보이고, 부적절한 건 주최자가 숨겨요.
        아래 색·글꼴은 소원나무 전용이에요 (위 테마와 별개).{' '}
        <b>메시지는 롤링페이퍼와 같은 저장소를 써요</b> — 주최자 검수 화면도 같습니다.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,240px),1fr))', gap: 14 }}>
        <div style={CSS.fieldCol}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 19 }}>
            <span style={CSS.label}>제목</span>
            <ShowToggle checked={d.showTitle} onChange={(v) => patch({ showTitle: v })} />
          </div>
          <input value={d.treeTitle} onChange={(e) => patch({ treeTitle: e.target.value })} style={CSS.input} />
        </div>
        <div style={CSS.fieldCol}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 19 }}>
            <span style={CSS.label}>부제</span>
            <ShowToggle checked={d.showSubtitle} onChange={(v) => patch({ showSubtitle: v })} />
          </div>
          <input value={d.treeSubtitle} onChange={(e) => patch({ treeSubtitle: e.target.value })} style={CSS.input} />
        </div>
        <Field label="입력 안내" hint="작성 화면 소원칸에 흐리게 뜨는 문구예요.">
          <input value={d.wishPrompt} onChange={(e) => patch({ wishPrompt: e.target.value })} style={CSS.input} />
        </Field>
        <Field label="소원 걸기 버튼">
          <input value={d.hangLabel} onChange={(e) => patch({ hangLabel: e.target.value })} style={CSS.input} />
        </Field>
      </div>

      <Divided>
        <Field label="기본 글꼴" hint="제목·UI 글꼴이에요. 등불 글씨체는 방문자가 골라요.">
          <select value={d.font} onChange={(e) => patch({ font: e.target.value as FontId })} style={CSS.select}>
            {Object.entries(WEBFONTS).map(([id, f]) => (
              <option key={id} value={id}>{f.label}</option>
            ))}
          </select>
        </Field>
        <Field label="글씨체 예시 텍스트" hint="작성 화면 글씨체 고르기에 이 문구로 미리보기가 떠요.">
          <input value={d.fontSample} onChange={(e) => patch({ fontSample: e.target.value })} style={CSS.input} />
        </Field>
        <Field label="등불 흔들림" hint="끄면 정적으로 둡니다. 움직임에 민감한 분들을 위한 설정이에요.">
          <select
            value={d.sway ? 'on' : 'off'}
            onChange={(e) => patch({ sway: e.target.value === 'on' })}
            style={CSS.select}
          >
            <option value="on">바람에 흔들려요</option>
            <option value="off">가만히 있어요</option>
          </select>
        </Field>
      </Divided>

      <Divided min={250} gap={12}>
        {(
          [
            ['headText', '글자색', '제목 · 헤더'],
            ['subText', '서브 글자색', '부제 · 안내'],
            ['wishBody', '소원 본문색', '등불 안 글씨'],
            ['wishName', '이름색'],
            ['skyBg', '배경색', '배경 이미지가 없을 때'],
            ['buttonColor', '버튼색', '소원 걸기'],
          ] as ['headText' | 'subText' | 'wishBody' | 'wishName' | 'skyBg' | 'buttonColor', string, string?][]
        ).map(([key, label, hint]) => (
          <SwatchColor
            key={key}
            label={label}
            hint={hint}
            value={d[key]}
            onChange={(v) => patch({ [key]: v } as Partial<WishDisplay>)}
          />
        ))}
      </Divided>

      <Divided>
        <PaletteField
          label="등불 색"
          hint="방문자가 소원을 쓸 때 이 중에서 골라요. 비우면 색 선택이 없고 전부 첫 색으로 나갑니다."
          value={d.lanterns}
          onChange={(lanterns) => patch({ lanterns })}
        />
      </Divided>

      <Divided>
        <StickerField
          slug={slot.slug}
          label="매다는 장식"
          value={d.charms}
          onChange={(charms) => patch({ charms })}
          hint="방문자가 등불에 달 수 있어요. 주최자에게 받은 이미지를 올려 주세요."
        />
      </Divided>

      <Divided>
        <div style={CSS.fieldCol}>
          <ImageField
            slug={slot.slug}
            label="로고"
            name="wish-logo"
            value={d.logo || null}
            onChange={(v) => patch({ logo: v ?? '' })}
            hint="헤더에 떠요. 없으면 제목 텍스트가 나와요."
          />
          {/* 롤페와 같은 짝 — 정렬·위 여백을 같은 이름으로 고른다 */}
          <Field label="정렬" hint="로고·제목·부제가 함께 움직여요.">
            <select
              value={d.logoAlign}
              onChange={(e) => patch({ logoAlign: e.target.value as WishDisplay['logoAlign'] })}
              style={CSS.select}
            >
              <option value="left">왼쪽</option>
              <option value="center">가운데</option>
              <option value="right">오른쪽</option>
            </select>
          </Field>
          <Field label="위 여백 (px)" hint="배경 이미지의 나무 위치에 맞춰 제목을 내릴 때 써요.">
            <input
              type="number"
              min={0}
              max={240}
              value={d.logoMarginTop}
              onChange={(e) => patch({ logoMarginTop: Math.max(0, Math.min(240, Number(e.target.value) || 0)) })}
              style={CSS.input}
            />
          </Field>
        </div>
        <ImageField
          slug={slot.slug}
          label="배경 이미지"
          name="wish-bg"
          value={d.treeBg || null}
          onChange={(v) => patch({ treeBg: v ?? '' })}
          hint="나무·밤하늘 이미지예요. 비우면 배경색을 씁니다."
        />
        <ImageField
          slug={slot.slug}
          label="등불 모양"
          name="wish-lantern"
          value={d.lanternShape || null}
          onChange={(v) => patch({ lanternShape: v ?? '' })}
          hint="실루엣 PNG 를 올리면 그 모양으로 그려요. 색은 위 팔레트가 채웁니다 — 한 장으로 여섯 색이 나와요."
        />
      </Divided>

      {/**
        * 실루엣을 올린 슬롯에만 나온다.
        *
        * 실루엣은 가장자리가 좁아지는 모양이 많아서 글자 상자가 등불 전체를 쓰면
        * **글자 밑이 투명해져 등불 밖으로 나간 것처럼 보인다.** 모양은 PNG 마다 달라
        * (호리병·원형·사각형) 코드가 짐작할 수 없으니 눈으로 보고 맞추는 자리다.
        */}
      {d.lanternShape && (
        <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid #ededf2' }}>
          <span style={CSS.label}>실루엣 안 글자 자리</span>
          <p style={{ margin: '6px 0 12px', fontSize: 11, color: '#9a9a9a', lineHeight: 1.6 }}>
            등불 크기의 <b>%</b> 로 잡습니다. 올리신 그림 모양에 맞춰 <b>오른쪽 미리보기를 보면서</b>{' '}
            조절해 주세요 — 글자가 실루엣 안쪽에 앉으면 됩니다.
            <br />
            <b>본문과 이름을 따로 잡습니다.</b> 실루엣이 아래로 좁아지면 본문은 멀쩡한데 이름만
            삐지는 일이 흔해서요 (이름은 <b>닉네임을 적은 소원에만</b> 나옵니다).
          </p>
          {(
            [
              ['shapePad', '본문 여백'],
              ['shapeNamePad', '이름 여백'],
            ] as ['shapePad' | 'shapeNamePad', string][]
          ).map(([group, groupLabel]) => (
            <div key={group} style={{ marginBottom: 14 }}>
              <div style={{ ...CSS.label, marginBottom: 8, color: '#8a8a8a' }}>{groupLabel}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,110px),1fr))', gap: 10 }}>
                {(
                  [
                    ['top', '위'],
                    ['right', '오른쪽'],
                    ['bottom', '아래'],
                    ['left', '왼쪽'],
                  ] as ['top' | 'right' | 'bottom' | 'left', string][]
                ).map(([key, label]) => (
                  <Field key={key} label={label}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="number"
                        min={0}
                        max={45}
                        value={d[group][key]}
                        onChange={(e) =>
                          patch({
                            [group]: {
                              ...d[group],
                              [key]: Math.min(45, Math.max(0, Number(e.target.value) || 0)),
                            },
                          } as Partial<WishDisplay>)
                        }
                        style={{ ...CSS.input, flex: 1, minWidth: 0 }}
                        aria-label={`${groupLabel} ${label}`}
                        data-shape-pad={`${group}-${key}`}
                      />
                      <span style={{ fontSize: 11.5, color: '#8a8a8a', flexShrink: 0 }}>%</span>
                    </div>
                  </Field>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
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
