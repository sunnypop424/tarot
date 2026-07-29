import { photozoneDisplay, type PhotozoneDisplay } from '@/data/photozone'
import { WEBFONTS, type FontId } from '@/data/luckydraw'
import type { Slot } from '@/types/slot'
import { CSS, Card, Divided, Field, SwatchColor } from '../editorUi'
import { ImageField } from '../ImageField'
import { BackgroundField } from './BackgroundField'
import { FrameField } from './FrameField'

/**
 * 포토존 설정 카드 — **서비스 설정을 `SlotEditor` 밖으로 뺀 첫 사례.**
 *
 * 편집기는 이미 1700줄이 넘는데 서비스마다 카드가 하나씩 붙는다. 롤페 카드(160줄)만 한 덩어리가
 * 여섯 번 더 들어가면 파일이 2500줄을 넘고 아무도 못 읽는다. 그래서 여기부터는
 * `src/owner/service/{Svc}Card.tsx` 로 나눈다 — 공용 부품은 `../editorUi` 가 준다.
 *
 * 값이 바로 저장되지 않는 건 편집기 규약 그대로다 (초안 → **저장하기**를 눌러야 반영).
 */
export function PhotozoneCard({
  slot,
  patch,
}: {
  slot: Slot
  /** 초안에 부분 반영 — 부모(`SlotEditor`)가 이전 값과 머지한다 */
  patch: (change: Partial<PhotozoneDisplay>) => void
}) {
  const d = photozoneDisplay(slot)

  return (
    <Card title="포토존">
      <p style={{ margin: '0 0 16px', fontSize: 11.5, color: '#8a8a8a', lineHeight: 1.6 }}>
        손님이 찍거나 올린 사진에 프레임을 씌워 자기 폰에 저장해 가요.{' '}
        <b>사진은 손님 폰 안에서 합성되고 서버로 오지 않아요</b> — 주최자도 저희도 볼 수 없습니다.
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
        <Field label="촬영 안내" hint="카메라 화면 아래 뜨는 한 줄이에요.">
          <input value={d.guide} onChange={(e) => patch({ guide: e.target.value })} style={CSS.input} />
        </Field>
        <Field label="기본 글꼴">
          <select value={d.font} onChange={(e) => patch({ font: e.target.value as FontId })} style={CSS.select}>
            {Object.entries(WEBFONTS).map(([id, f]) => (
              <option key={id} value={id}>{f.label}</option>
            ))}
          </select>
        </Field>
      </div>

      <Divided>
        <FrameField slug={slot.slug} value={d.frames} onChange={(frames) => patch({ frames })} />
      </Divided>

      <Divided>
        <Field
          label="사진 받는 방법"
          hint="카메라가 막힌 손님에겐 어느 값이든 '사진 올리기' 가 대신 뜹니다 — 막다른 골목은 없어요."
        >
          <select
            value={d.captureMode}
            onChange={(e) => patch({ captureMode: e.target.value as PhotozoneDisplay['captureMode'] })}
            style={CSS.select}
            data-capture-mode
          >
            <option value="both">둘 다 — 찍기와 올리기</option>
            <option value="camera">바로 찍기를 먼저</option>
            <option value="upload">올리기만</option>
          </select>
        </Field>
        <Field label="기본 카메라" hint="인생네컷은 전면, 포토존 배경을 담으면 후면이 자연스러워요.">
          <select
            value={d.facing}
            onChange={(e) => patch({ facing: e.target.value as PhotozoneDisplay['facing'] })}
            style={CSS.select}
          >
            <option value="user">전면 (셀카)</option>
            <option value="environment">후면</option>
          </select>
        </Field>
        <Field label="촬영 버튼 문구">
          <input value={d.shootLabel} onChange={(e) => patch({ shootLabel: e.target.value })} style={CSS.input} />
        </Field>
        <Field label="올리기 버튼 문구">
          <input value={d.uploadLabel} onChange={(e) => patch({ uploadLabel: e.target.value })} style={CSS.input} />
        </Field>
        <Field label="저장 버튼 문구">
          <input value={d.saveLabel} onChange={(e) => patch({ saveLabel: e.target.value })} style={CSS.input} />
        </Field>
        <Field label="다시 찍기 문구">
          <input value={d.retakeLabel} onChange={(e) => patch({ retakeLabel: e.target.value })} style={CSS.input} />
        </Field>
      </Divided>

      <Divided min={250} gap={12}>
        {(
          [
            ['headText', '글자색', '제목 · 헤더'],
            ['subText', '서브 글자색', '부제 · 안내'],
            ['bg', '배경색', '배경 이미지가 없을 때'],
            ['buttonColor', '버튼색', '찍기 · 저장'],
          ] as ['headText' | 'subText' | 'bg' | 'buttonColor', string, string?][]
        ).map(([key, label, hint]) => (
          <SwatchColor
            key={key}
            label={label}
            hint={hint}
            value={d[key]}
            onChange={(v) => patch({ [key]: v } as Partial<PhotozoneDisplay>)}
          />
        ))}
      </Divided>

      <Divided>
        <ImageField
          slug={slot.slug}
          label="로고"
          name="photozone-logo"
          value={d.logo || null}
          onChange={(v) => patch({ logo: v ?? '' })}
          hint="헤더에 떠요. 없으면 제목 텍스트가 나와요."
        />
        <BackgroundField
          slug={slot.slug}
          name="photozone-bg"
          value={d.bgImage || null}
          repeat={d.bgRepeat}
          onImage={(v) => patch({ bgImage: v ?? '' })}
          onRepeat={(on) => patch({ bgRepeat: on })}
        />
        <ImageField
          slug={slot.slug}
          label="워터마크"
          name="photozone-watermark"
          value={d.watermark || null}
          onChange={(v) => patch({ watermark: v ?? '' })}
          hint="합성된 사진 구석에 얹혀요. 손님이 공유할 때 출처가 됩니다."
        />
        <Field label="워터마크 자리">
          <select
            value={d.watermarkPos}
            onChange={(e) => patch({ watermarkPos: e.target.value as PhotozoneDisplay['watermarkPos'] })}
            style={CSS.select}
          >
            <option value="bottom-right">오른쪽 아래</option>
            <option value="bottom-left">왼쪽 아래</option>
            <option value="top-right">오른쪽 위</option>
            <option value="top-left">왼쪽 위</option>
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
