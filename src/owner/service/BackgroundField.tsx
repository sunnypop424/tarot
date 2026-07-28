import { CSS } from '../editorUi'
import { ImageField } from '../ImageField'

/**
 * 배경 이미지 칸 — **모든 서비스가 같이 쓴다.**
 *
 * 배경은 **올린 그대로 올라간다.** 투명도를 씌우거나 색을 섞지 않는다 —
 * 슬롯이 배경으로 쓰는 건 대개 패턴이 아니라 사진이고, 사진을 반투명하게 만들 이유가 없다.
 * (예전 테마에는 불투명도 칸이 있었는데 **화면에서 안 읽고 있었다** — 내려도 아무 일이
 * 없었으니 있으나 마나가 아니라 거짓말하는 칸이었다.)
 *
 * 고를 수 있는 건 둘뿐이다:
 *  - **꽉 채우기**(기본) — `cover` + `no-repeat`
 *  - **반복** — 원본 크기로 타일링
 *
 * 서비스마다 저장되는 자리는 다르다(테마 자산 / 서비스 설정)지만 **화면에서 하는 일이 같아
 * 칸도 하나여야 한다** — 둘로 두면 한쪽에만 옵션이 붙는 날이 온다.
 */
export function BackgroundField({
  slug,
  name,
  value,
  repeat,
  onImage,
  onRepeat,
  label = '배경 이미지',
  hint = '비우면 배경색을 써요.',
}: {
  slug: string
  /** 업로드 파일 이름 앞머리 (서비스마다 달라야 서로 덮어쓰지 않는다) */
  name: string
  value: string | null
  repeat: boolean
  onImage: (v: string | null) => void
  onRepeat: (v: boolean) => void
  label?: string
  hint?: string
}) {
  return (
    <div style={CSS.fieldCol}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 19 }}>
        <span style={CSS.label}>{label}</span>
        <label
          style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#8a8a8a', cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          <input
            type="checkbox"
            checked={repeat}
            onChange={(e) => onRepeat(e.target.checked)}
            style={{ width: 14, height: 14, accentColor: '#816bff', cursor: 'pointer' }}
            data-bg-repeat={name}
          />
          패턴 반복
        </label>
      </div>
      <ImageField
        slug={slug}
        label={label}
        name={name}
        value={value}
        onChange={onImage}
        hint={`${hint} 끄면 화면을 꽉 채워요(원본 비율 유지).`}
      />
    </div>
  )
}

/** 테마 자산의 배경은 CSS 값 두 개로 저장된다 — 체크박스 하나를 그 둘로 바꿔준다 */
export const bgRepeatValues = (repeat: boolean) => ({
  backgroundPatternRepeat: repeat ? 'repeat' : 'no-repeat',
  backgroundPatternSize: repeat ? 'auto' : 'cover',
})
