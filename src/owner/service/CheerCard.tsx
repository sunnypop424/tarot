import { cheerDisplay, type CheerDisplay } from '@/data/cheer'
import { WEBFONTS, type FontId } from '@/data/fonts'
import type { Slot } from '@/types/slot'
import { CSS, Card, Divided, Field, SwatchColor } from '../editorUi'
import { ImageField } from '../ImageField'
import { BackgroundField } from './BackgroundField'
import { PaletteField } from './PaletteField'

/**
 * 영상회 응원 설정 카드 — **겉모습만.**
 *
 * 운영값(한 화면 개수·비율·교체 간격·이름 표시·1인 입력 수·글자 수)은 **주최자 화면**에 있다.
 * 행사 중에 보고 조정하는 값이라서다 — 그때마다 배포자를 부르게 만들면 현장에서 못 고친다.
 *
 * 말풍선 팔레트가 여기 있는 이유: 색은 **행사의 것**이다. 오버레이가 색을 무작위로 뽑되
 * 이 목록 안에서만 뽑는다 — 아무 색이나 나오면 행사 색이 무너진다.
 */
export function CheerCard({
  slot,
  patch,
}: {
  slot: Slot
  patch: (change: Partial<CheerDisplay>) => void
}) {
  const d = cheerDisplay(slot)

  return (
    <Card title="영상회 응원">
      <p style={{ margin: '0 0 16px', fontSize: 11.5, color: '#8a8a8a', lineHeight: 1.6 }}>
        방문자가 남긴 한마디가 상영 화면에 말풍선으로 떠요.{' '}
        <b>한 화면 개수·교체 간격·글자 수는 주최자가 관리 화면에서 정해요</b> — 여기서는 색과 문구만.
        <br />
        한마디는 <b>롤링페이퍼와 같은 곳</b>에 저장돼요 (검수 화면도 같아요).
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,240px),1fr))', gap: 14 }}>
        <Field label="입력 화면 제목">
          <input value={d.title} onChange={(e) => patch({ title: e.target.value })} style={CSS.input} />
        </Field>
        <Field label="부제">
          <input value={d.subtitle} onChange={(e) => patch({ subtitle: e.target.value })} style={CSS.input} />
        </Field>
        <Field label="입력칸 안내">
          <input value={d.prompt} onChange={(e) => patch({ prompt: e.target.value })} style={CSS.input} />
        </Field>
        <Field label="이름칸 안내">
          <input value={d.namePrompt} onChange={(e) => patch({ namePrompt: e.target.value })} style={CSS.input} />
        </Field>
        <Field label="보내기 버튼">
          <input value={d.postLabel} onChange={(e) => patch({ postLabel: e.target.value })} style={CSS.input} />
        </Field>
        <Field label="보낸 뒤 문구">
          <input value={d.thanks} onChange={(e) => patch({ thanks: e.target.value })} style={CSS.input} />
        </Field>
        <Field label="기본 글꼴">
          <select value={d.font} onChange={(e) => patch({ font: e.target.value as FontId })} style={CSS.select}>
            {Object.entries(WEBFONTS).map(([id, f]) => (
              <option key={id} value={id}>
                {f.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="엔딩크레딧 제목">
          <input value={d.creditsTitle} onChange={(e) => patch({ creditsTitle: e.target.value })} style={CSS.input} />
        </Field>
      </div>

      {/* 말풍선 팔레트 — 오버레이가 이 안에서만 색을 뽑는다 */}
      <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid #ededf2' }}>
        <PaletteField
          label="말풍선 색"
          hint="상영 화면이 이 색들 중에서 무작위로 골라 씌워요. 3~6개가 적당해요 — 하나만 두면 단조롭고, 열 개를 넘으면 행사 색이 흐려져요."
          value={d.bubbleColors}
          onChange={(bubbleColors) => patch({ bubbleColors })}
          addDefault="#ff6b9d"
        />
      </div>

      <Divided min={230} gap={12}>
        {(
          [
            ['headText', '제목 글자색'],
            ['subText', '안내 글자색'],
            ['bg', '입력 화면 배경'],
            ['buttonColor', '버튼색'],
            ['bubbleInk', '먹색', '흰 판 위 글자 · 테두리 · 이름표'],
            ['bubblePaper', '종이색', '진한 색 판 위 글자 · 흰 바 배경'],
            ['bubbleBorder', '말풍선 테두리색', '비우면 먹색을 써요'],
            ['creditsBg', '엔딩크레딧 배경'],
            ['creditsText', '엔딩크레딧 글자색'],
          ] as [keyof CheerDisplay, string, string?][]
        ).map(([key, label, hint]) => (
          <SwatchColor
            key={key}
            label={label}
            hint={hint}
            value={d[key] as string}
            onChange={(v) => patch({ [key]: v } as Partial<CheerDisplay>)}
          />
        ))}
      </Divided>

      <Divided>
        <Field label="말풍선 테두리 두께 (px)" hint="0 이면 선 없음. 3px 이 참고 이미지의 느낌이에요.">
          <input
            type="number"
            min={0}
            max={8}
            value={d.bubbleBorderWidth}
            onChange={(e) => patch({ bubbleBorderWidth: Math.max(0, Math.min(8, Number(e.target.value) || 0)) })}
            style={CSS.input}
          />
        </Field>
        <ImageField
          slug={slot.slug}
          label="로고"
          title="로고"
          name="cheer-logo"
          value={d.logo || null}
          onChange={(v) => patch({ logo: v ?? '' })}
          hint="입력 화면 위에 떠요."
        />
        <BackgroundField
          slug={slot.slug}
          name="cheer-bg"
          value={d.bgImage || null}
          repeat={d.bgRepeat}
          onImage={(v) => patch({ bgImage: v ?? '' })}
          onRepeat={(on) => patch({ bgRepeat: on })}
          hint="방문자가 한마디를 적는 화면의 배경이에요."
        />
      </Divided>
    </Card>
  )
}
