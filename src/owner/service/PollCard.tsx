import { pollDisplay, type PollDisplay } from '@/data/poll'
import { WEBFONTS, type FontId } from '@/data/luckydraw'
import type { Slot } from '@/types/slot'
import { CSS, Card, Divided, Field, SwatchColor } from '../editorUi'
import { ImageField } from '../ImageField'

/**
 * 실시간 투표 설정 카드 — **겉모습만 여기 있다.**
 * 설문·선택지는 주최자가 `/{slug}/admin` 에서 만든다 (럭드 상품표와 같은 경계).
 */
export function PollCard({
  slot,
  patch,
}: {
  slot: Slot
  patch: (change: Partial<PollDisplay>) => void
}) {
  const d = pollDisplay(slot)

  return (
    <Card title="실시간 투표">
      <p style={{ margin: '0 0 16px', fontSize: 11.5, color: '#8a8a8a', lineHeight: 1.6 }}>
        손님이 자기 폰으로 찍으면 결과가 그 자리에서 차올라요.{' '}
        <b>설문과 선택지는 주최자가 관리 화면에서 만듭니다</b> — 여기서는 색·문구만 정해요.
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
        <Field label="투표 버튼 문구">
          <input value={d.voteLabel} onChange={(e) => patch({ voteLabel: e.target.value })} style={CSS.input} />
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
        <Field
          label="결과를 언제 보여줄지"
          hint="투표 전에 결과가 보이면 초반에 표가 한쪽으로 쏠려요. 기본은 '내가 찍은 뒤' 입니다."
        >
          <select
            value={d.resultMode}
            onChange={(e) => patch({ resultMode: e.target.value as PollDisplay['resultMode'] })}
            style={CSS.select}
            data-result-mode
          >
            <option value="afterVote">내가 찍은 뒤에</option>
            <option value="live">투표 전에도 보임</option>
            <option value="closed">마감된 뒤에만</option>
          </select>
        </Field>
        <Field label="표 수 공개" hint="끄면 퍼센트와 막대만 보여요 — 순위가 민망한 항목이 있을 때.">
          <select
            value={d.showCount ? 'on' : 'off'}
            onChange={(e) => patch({ showCount: e.target.value === 'on' })}
            style={CSS.select}
          >
            <option value="on">표 수를 보여줘요</option>
            <option value="off">숨겨요</option>
          </select>
        </Field>
        <Field label="결과 그리는 방식">
          <select
            value={d.chartStyle}
            onChange={(e) => patch({ chartStyle: e.target.value as PollDisplay['chartStyle'] })}
            style={CSS.select}
          >
            <option value="bar">막대</option>
            <option value="heart">하트</option>
          </select>
        </Field>
        <Field label="참여 감사 문구">
          <input value={d.thanksText} onChange={(e) => patch({ thanksText: e.target.value })} style={CSS.input} />
        </Field>
      </Divided>

      <Divided min={250} gap={12}>
        {(
          [
            ['headText', '글자색', '제목 · 선택지'],
            ['subText', '서브 글자색', '안내 · 표 수'],
            ['bg', '배경색'],
            ['buttonColor', '버튼색', '투표하기'],
            ['barColor', '막대색', '결과가 차오르는 색 · 스크린도 같이'],
          ] as ['headText' | 'subText' | 'bg' | 'buttonColor' | 'barColor', string, string?][]
        ).map(([key, label, hint]) => (
          <SwatchColor
            key={key}
            label={label}
            hint={hint}
            value={d[key]}
            onChange={(v) => patch({ [key]: v } as Partial<PollDisplay>)}
          />
        ))}
      </Divided>

      <Divided>
        <ImageField
          slug={slot.slug}
          label="로고"
          name="poll-logo"
          value={d.logo || null}
          onChange={(v) => patch({ logo: v ?? '' })}
          hint="헤더에 떠요. 없으면 제목 텍스트가 나와요."
        />
        <Field label="로고 정렬">
          <select
            value={d.logoAlign}
            onChange={(e) => patch({ logoAlign: e.target.value as PollDisplay['logoAlign'] })}
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
