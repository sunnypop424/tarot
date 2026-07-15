---
id: tarot-web
name: "타로 포켓 (Tarot Pocket)"
country: KR
category: consumer-lifestyle
primary_color: "#816BFF"
omd: "0.1"
tokens:
  source: project-defined
  colors:
    primary: "#816bff"
    primary-hover: "#6e58ff"
    brand: "#816bff"
    gold: "#d4af37"
    gold-soft: "#e8cf7a"
    canvas: "#0f1020"
    surface: "#1a1b2e"
    surface-raised: "#242537"
    foreground: "#f2f0fa"
    muted: "#9a97b0"
    hairline: "#2e2f45"
    accent-wash: "#241f45"
    error: "#f16361"
    on-primary: "#ffffff"
  typography:
    family: { sans: "Pretendard", mono: "Pretendard" }
    title-xxl: { size: 40, weight: 700, lineHeight: 1.5, use: "결과 화면 카드 이름 (대형)" }
    title-xl:  { size: 32, weight: 700, lineHeight: 1.5, use: "화면 타이틀" }
    title-l:   { size: 28, weight: 700, lineHeight: 1.5, use: "섹션 타이틀" }
    title-m:   { size: 24, weight: 700, lineHeight: 1.5, use: "카드 이름 / 블록 타이틀" }
    title-s:   { size: 20, weight: 700, lineHeight: 1.5, use: "포지션 라벨, 소제목" }
    text-l:    { size: 18, weight: 700, lineHeight: 1.5, use: "버튼 라벨, 강조 본문" }
    text-m:    { size: 16, weight: 400, lineHeight: 1.7, use: "해석 본문 (행간 넉넉히)" }
    text-s:    { size: 14, weight: 700, lineHeight: 1.5, use: "탭, 토스트, 작은 라벨" }
    text-xs:   { size: 13, weight: 400, lineHeight: 1.5, use: "메타데이터, 키워드 칩" }
    text-xxs:  { size: 12, weight: 400, lineHeight: 1.5, use: "면책 문구, 파인 프린트" }
  spacing: { xs: 4, sm: 8, md: 12, base: 16, lg: 24, xl: 32, xxl: 48 }
  rounded: { sm: 4, md: 8, lg: 16, full: 9999 }
  shadow:
    glow: "0 0 24px rgba(129, 107, 255, 0.25)"
    card: "0 4px 16px rgba(0, 0, 0, 0.4)"
  components:
    button-primary: { type: button, bg: "#816bff", fg: "#ffffff", radius: "8px", height: "56px", padding: "0 18px", font: "18px / 700", states: "hover #6e58ff", use: "주요 CTA (카드 섞기, 결과 보기)" }
    button-primary-sm: { type: button, bg: "#816bff", fg: "#ffffff", radius: "8px", height: "48px", padding: "0 20px", font: "16px / 700", use: "보조 화면 CTA" }
    button-slight: { type: button, bg: "#241f45", fg: "#b7aaff", radius: "8px", height: "56px", font: "18px / 700", use: "보조 액션 (다시 뽑기, 다른 운세)" }
    button-disabled: { type: button, bg: "#2e2f45", fg: "#6b6880", radius: "8px", height: "56px", use: "비활성 (오늘 카드 이미 뽑음 등)" }
    tarot-card: { type: card, bg: "#1a1b2e", border: "1px solid #d4af37", radius: "16px", ratio: "3:5", shadow: "0 4px 16px rgba(0,0,0,0.4)", use: "타로 카드 프레임 — 골드 테두리" }
    category-tile: { type: card, bg: "#1a1b2e", fg: "#f2f0fa", radius: "16px", padding: "20px 16px", border: "1px solid #2e2f45", states: "active border #816bff + glow", use: "홈 카테고리 그리드 타일" }
    segment-tab: { type: tab, bg: "#1a1b2e", fg: "#9a97b0", height: "44px", radius: "9999px", font: "14px / 700", active: "bg #816bff, fg #ffffff", use: "오늘/주간/월간 세그먼트" }
    badge-keyword: { type: badge, bg: "#241f45", fg: "#b7aaff", radius: "9999px", height: "28px", padding: "0 12px", font: "13px / 400", use: "카드 키워드 칩" }
    toast: { type: toast, bg: "#242537", fg: "#ffffff", radius: "8px", padding: "16px 12px", height: "48px", font: "14px / 400", use: "안내 토스트 (자정 리셋 알림 등)" }
---

아이돌 생일카페 이벤트용 모바일 타로 웹 — 이벤트마다 옷을 갈아입는 테마 시스템 위에, 다크 네이비 밤하늘과 보랏빛 신비를 기본 테마로 얹었다.

> **먼저 읽을 것 — 이 문서의 색은 "기본 테마"일 뿐이다.**
> 이 앱은 여러 생일카페가 각자의 색·로고·패턴·카드 이미지를 입혀 쓰는 틀이다.
> 아래 §2의 팔레트는 **테마가 지정되지 않았을 때의 폴백**이고, 실제 이벤트에선 전부 교체된다.
>
> | 테마로 바뀜 (슬롯마다) | 고정 (제품 정체성) |
> |---|---|
> | 색 전체, **radius**, 배경 패턴, 로고, 카드 앞/뒷면 이미지 | 타이포 스케일·웨이트, 스페이싱, 터치 타깃, 모션, 레이아웃, 카드 3:5 비율 |
>
> **밝은 배경도 온다.** 그림자·딤은 다크 전제(`rgba(0,0,0,0.4~0.5)`)로 굳히지 말 것 —
> `applyTheme()`이 캔버스 휘도를 보고 세기를 자동으로 낮추고 `color-scheme`도 함께 바꾼다.
>
> 그래서 **색 이름은 역할 기반**으로 짓는다. `gold` 같은 색 특정 이름은 핑크 테마에서 거짓말이 된다.
> - `--color-primary` = 인터랙션(CTA·활성·글로우) · `--color-accent` = 장식·포인트(카드 테두리·아이콘·별)
> - 구현: `src/styles/tokens.css`(기본값) → `src/lib/theme.ts`의 `applyTheme()`이 런타임에 덮어씀
> - 상세 스키마와 운영 방식은 `docs/PLANNING.md` §5 테마 시스템

## 1. Visual Theme & Atmosphere

밤하늘 아래에서 카드를 펼치는 순간의 분위기가 기본값이다. 화면은 딥 네이비(#0F1020)를 캔버스로 하는 다크 우선(dark-first) 구성이며, 그 위에 보랏빛(#816BFF)이 인터랙션과 브랜드 순간을 밝히고, 골드(#D4AF37)가 카드 테두리·별 장식·강조 텍스트에서 촛불처럼 반짝인다. 타로 카드 일러스트가 화면의 주인공이므로 UI 색은 카드를 감싸는 액자 역할에 머문다. 전체 인상은 "점집의 어둑한 신비"보다는 "밤에 켠 무드등 아래의 조용한 리추얼" — 무겁지 않고, 무섭지 않고, 매일 열어보고 싶은 감도를 유지한다.

## 2. Color Palette & Roles

**아래 hex는 기본 테마의 값이다.** 각 항목의 *역할*은 고정이고 *색*은 이벤트마다 바뀐다. 코드에선 hex가 아니라 항상 토큰 이름으로 참조한다.

| 토큰 | 역할 (고정) | 기본 테마 값 |
|---|---|---|
| `--color-primary` | 인터랙션 — 주요 CTA, 활성 탭, 선택 글로우 | `#816BFF` |
| `--color-primary-hover` | primary 버튼 hover/pressed | `#6E58FF` |
| `--color-primary-soft` | 워시 위 옅은 인터랙션 색 — 보조 버튼·칩 텍스트 | `#B7AAFF` |
| `--color-wash` | 보조 버튼·칩 배경 | `#241F45` |
| `--color-accent` | 장식·포인트 — 카드 테두리, 아이콘, 별·달 문양 | `#D4AF37` |
| `--color-accent-soft` | 액센트 hover, 미세 장식 | `#E8CF7A` |
| `--color-canvas` | 화면 바탕 | `#0F1020` |
| `--color-surface` | 카드·타일·시트 표면 | `#1A1B2E` |
| `--color-surface-raised` | 토스트·모달 등 떠 있는 요소 | `#242537` |
| `--color-fg-1` | 기본 텍스트 | `#F2F0FA` |
| `--color-fg-2` | 보조 텍스트 | `#C6C3D8` |
| `--color-fg-3` | 메타데이터, 비활성 라벨 | `#9A97B0` |
| `--color-border` | 헤어라인 구분선 | `#2E2F45` |
| `--color-error` | **테마 고정** — 시스템 에러 전용 | `#F16361` |

- `--shadow-glow`는 `primary`에서 자동 파생 — 테마 색이 바뀌면 글로우도 따라간다
- `--color-error`는 파괴적/시스템 오류에만. **운세의 "나쁨" 표현에 쓰지 말 것**
- 라이트 모드는 보조: `:root[data-theme='light']`에서 색 토큰만 스왑 (캔버스 `#FAF8FF`, 표면 `#FFFFFF`, 텍스트 `#1A1B2E`)
- 주최자가 고른 색이 대비를 깨뜨릴 수 있으므로, 관리자 테마 편집기는 배경↔텍스트 명도차를 검증해 경고한다

## 3. Typography Rules

- **Font family:** Pretendard (cdn.jsdelivr.net/gh/orioncactus/pretendard), 폴백 -apple-system, BlinkMacSystemFont, system-ui, Roboto, "Noto Sans KR"
- **Base size:** 16px on `html, body`
- **Scale:** title-xxl 40px · title-xl 32px · title-l 28px · title-m 24px · title-s 20px · text-l 18px · text-m 16px · text-s 14px · text-xs 13px · text-xxs 12px
- **Weight:** 700(타이틀·버튼·라벨)과 400(본문) 두 단계만 사용, 700 초과 금지
- **Line height:** 기본 1.5; **해석 본문(text-m)은 1.7** — 운세 텍스트는 호흡이 길어 행간을 넉넉히
- **Letter spacing:** `normal` 리셋
- **Smoothing:** `-webkit-font-smoothing: antialiased`
- 카드 영문 이름(The Fool 등)은 같은 Pretendard로 표기하되 text-xs + muted 색으로 한글 이름 아래 병기

## 4. Component Stylings

### Buttons

**Primary (md)** — 카드 섞기, 결과 보기 등 주요 CTA
- Background `#816BFF` · Text `#FFFFFF` · Radius 8px · Height 56px · Padding 0 18px · Font 18px/700 · Hover `#6E58FF`

**Primary (sm)** — 보조 화면 CTA
- Background `#816BFF` · Text `#FFFFFF` · Radius 8px · Height 48px · Padding 0 20px · Font 16px/700

**Slight (secondary)** — 다시 뽑기, 다른 운세 보기
- Background `#241F45` · Text `#B7AAFF` · Radius 8px · Height 56px

**Disabled** — 오늘의 카드를 이미 뽑은 상태 등
- Background `#2E2F45` · Text `#6B6880` · Radius 8px · Height 56px

### Tarot Card Frame
- 비율 3:5 고정 · Radius 16px · Border 1px solid `#D4AF37` · Shadow `0 4px 16px rgba(0,0,0,0.4)`
- 카드 뒷면: 딥 네이비 바탕 + 골드 별 문양 패턴 (단일 SVG 재사용)
- 선택/포커스 시: `box-shadow: 0 0 24px rgba(129,107,255,0.25)` 보라 글로우

### Category Tile (홈 그리드)
- Background `#1A1B2E` · Radius 16px · Border 1px `#2E2F45` · Padding 20px 16px
- 아이콘(Lucide, stroke 골드 `#D4AF37`, 24px) + 카테고리명(text-l/700) + 한 줄 설명(text-xs/muted)
- Pressed: border `#816BFF` + 보라 글로우

### Iconography
- **아이콘 세트는 Lucide 단일 사용** (`lucide-react`), stroke-width 1.5~2, 크기 20/24px 두 단계
- **이모지 사용 전면 금지** — UI 텍스트, 카테고리 타일, 토스트, 해석 본문 모두
- 색: 장식·카테고리 아이콘은 골드(`#D4AF37`), 기능 아이콘(뒤로가기, 닫기 등)은 foreground 계열
- 카테고리 아이콘 예시: 오늘의 타로 `sparkles` · 애정운 `heart` · 금전운 `coins` · 직업·학업운 `briefcase` · 예/아니오 `scale` · 이달의 조언 `moon-star`

### Segment Tab (오늘/주간/월간)
- 컨테이너: pill 형태, Background `#1A1B2E`, Height 44px
- 활성 세그먼트: Background `#816BFF`, Text `#FFFFFF`, Font 14px/700
- 비활성: Text `#9A97B0`

### Keyword Chip
- Background `#241F45` · Text `#B7AAFF` · Radius full · Height 28px · Font 13px/400
- 카드 키워드(새로운 시작, 자유…)를 결과 화면 상단에 가로 나열

### Toast
- Background `#242537` · Text `#FFFFFF` · Radius 8px · Min-height 48px · Font 14px
- Transition: opacity 0.2s ease, transform 0.2s ease

## 5. Layout Principles

- **모바일 우선 단일 컬럼:** 기준 뷰포트 360px, 콘텐츠 최대 폭 480px(중앙 정렬) — 그 이상은 여백
- **터치 타깃:** 최소 44×44px; 카드 팬에서 카드 간 겹침이 있어도 탭 영역은 44px 확보
- **수평 패딩:** 20px(모바일 기본)
- **스페이싱 리듬:** 8px 기본 단위; 섹션 간 32~48px, 컴포넌트 간 16~24px
- **카드 팬(fan) 레이아웃:** 가로 스크롤 또는 부채꼴 겹침 배열, `touch-action: pan-x`
- **하단 고정 CTA:** 뽑기 플로우에서 primary 버튼은 safe-area 위 하단 고정
- **관리자 페이지(/admin) 예외:** 동일 토큰을 쓰되 최대 폭 제한 없음(데스크톱 편집 작업 전제) — 답변 입력 그리드 등 데이터 밀도 높은 레이아웃 허용. 사용자 화면의 미스틱 장식(별, 글로우)은 생략하고 기능 위주로

## 6. Depth & Elevation

- **헤어라인:** `box-shadow: 0 1px 0 0 var(--border-1)` — sticky 헤더 하단
- **카드 섀도:** `0 4px 16px rgba(0,0,0,0.4)` — 타로 카드 기본
- **보라 글로우:** `0 0 24px rgba(129,107,255,0.25)` — 선택된 카드, 활성 타일
- **딤 오버레이:** `rgba(15,16,32,0.7)` — 모달/시트 배경
- **스켈레톤:** `linear-gradient(to right, #1A1B2E 0%, #242537 25%, #1A1B2E 50%)` 시머, 1.5s linear infinite
- 배경 별 장식은 정적 SVG(불투명도 0.3 이하)로 — 파티클 라이브러리 금지

## 7. Do's and Don'ts

### Do
- `--color-primary`는 인터랙션(CTA·활성·선택 글로우)에, `--color-accent`는 장식(카드 테두리·별·강조)에 — 역할을 나눠 쓸 것
- 색은 **항상 토큰으로** 참조 — 이벤트 테마가 갈아끼워질 자리다
- 새 색이 필요하면 토큰부터 만들고, 테마 스키마(`ThemeColors`)에 추가할지 먼저 판단할 것
- 다크를 기본으로 설계하고 라이트는 토큰 스왑으로 대응
- 해석 본문은 16px/400에 행간 1.7 — 읽는 호흡을 최우선
- 라운드는 `--radius-*` 토큰으로만 — 슬롯마다 값이 달라진다 (기본: 버튼·토스트 8px, 카드·타일 16px)
- 부정적 카드(탑, 죽음 등)의 결과 화면도 동일한 톤 — 색으로 겁주지 말 것

### Don't
- **컴포넌트에 hex 하드코딩 절대 금지** — 다음 이벤트에서 그 컴포넌트만 색이 안 바뀐다. `tokens.css` 밖에 hex를 쓰지 말 것
- 색 특정 이름(`gold`, `purple`)으로 토큰·클래스 짓기 금지 — 역할 기반으로
- 액센트를 버튼 배경 등 대면적으로 사용 금지 — 포인트가 흔해지면 신비감이 죽는다
- `--color-error`를 운세의 "나쁨" 표현에 사용 금지 — 시스템 에러 전용
- 3D 라이브러리, 파티클 효과, 대형 로티 애니메이션 금지 — "무겁지 않게"가 원칙
- 폰트 웨이트 700 초과 금지, Pretendard 외 장식 폰트 도입 금지 (영문 카드명도 Pretendard)
- 이모지 사용 금지 — 아이콘이 필요한 모든 자리는 Lucide로

## 8. Responsive Behavior

- **Mobile (기본, ≤480px):** 단일 컬럼, 카테고리 그리드 2열, 하단 고정 CTA
- **Tablet (481~1024px):** 콘텐츠 폭 480px 중앙 정렬, 좌우는 캔버스 색 여백 (모바일 레이아웃 유지)
- **Desktop (>1024px):** 동일 — 이 서비스는 모바일 레이아웃 하나만 유지한다 (별도 데스크톱 레이아웃 없음)
- **Touch:** `-webkit-tap-highlight-color: transparent`; 카드 팬 `touch-action: pan-x`; viewport `maximum-scale=1`
- **prefers-reduced-motion:** 셔플·플립 애니메이션을 즉시 전환(fade)으로 대체

## 9. Agent Prompt Guide

타로 포켓 스타일 UI 생성 시:
- **Palette:** primary `#816BFF` · gold accent `#D4AF37` · canvas `#0F1020` · surface `#1A1B2E` · raised `#242537`
- **Buttons:** 8px radius, 48/56px height, weight 700, Pretendard
- **Cards:** 3:5 비율, 16px radius, 1px 골드 테두리, 다크 섀도
- **Mode:** 다크 우선; 라이트는 CSS 변수 스왑
- **Typography:** Pretendard, 16px base, 해석 본문 line-height 1.7
- **Motion:** 카드 플립 `rotateY` 0.6s ease, 색 전환 0.4s, 오버레이 0.2s ease — transform/opacity만 애니메이션
- **Layout:** 모바일 단일 컬럼, 최대 폭 480px, 수평 패딩 20px

## 10. Voice & Tone

**세 가지 형용사:** 따뜻한, 신비로운, 단정 짓지 않는

| Dimension | Do | Don't |
|---|---|---|
| Register | 곁에서 카드를 읽어주는 다정한 조언자 | 점술가의 위압적 선언, 기계적 사전 낭독 |
| 화법 | 흐름·가능성 화법 ("~한 기운이 흐르고 있어요", "~해볼 수 있어요") | 단정적 예언 ("반드시 ~하게 됩니다") |
| 문장 길이 | 짧고 부드럽게, 한 문장에 한 생각 | 길게 늘어지는 복문 |
| 어휘 | 쉬운 한국어 + 타로 고유명사(정방향, 아르카나)는 그대로 | 어려운 점성술 용어 남발, 공포 어휘 |
| 부정 카드 | 성찰과 조언으로 마무리 | 겁주기, 불안 조장 |

**Voice samples (illustrative):**
- *Illustrative:* "오늘의 카드가 당신을 기다리고 있어요." — 홈 CTA; 부드러운 초대의 어조.
- *Illustrative:* "지금은 흐름을 거스르기보다 잠시 지켜볼 때예요." — 해석 조언; 단정 없이 방향만 제시.
- *Illustrative:* "탑 카드가 나왔다고 겁먹지 마세요. 무너진 자리에서 새로 시작할 수 있다는 뜻이기도 해요." — 부정 카드의 재해석; 안심시키되 의미는 희석하지 않음.

## 11. Brand Narrative

타로 포켓은 "타로 카페 앞에서 망설이는 마음"에서 출발했다. 카드 한 장이 건네는 위로와 환기가 필요하지만, 예약과 비용과 대면의 부담이 문턱이 되는 사람들 — 그들이 지하철에서, 잠들기 전 침대에서, 30초 만에 카드를 뒤집을 수 있게 하는 것이 이 서비스의 존재 이유다.

타로 포켓은 미래를 맞히는 도구가 아니라 **하루를 정돈하는 리추얼**을 지향한다. 78장의 라이더-웨이트 전통 의미를 충실히 담되, 해석의 언어는 예언이 아닌 조언으로 다듬는다. 회원가입도 서버도 없다 — 카드와 사용자 사이에 아무것도 끼어들지 않는 가장 가벼운 형태로, 매일 아침 열어보는 작은 습관이 되는 것이 목표다.

## 12. Principles

1. **조언이지 예언이 아니다.** 모든 해석 텍스트는 가능성과 방향을 말한다. *UI 구현:* 단정 어미 금지, 부정 카드에도 조언 섹션 필수, 화면 하단에 "타로는 재미와 성찰을 위한 것" 면책 문구(text-xxs).
2. **30초 리추얼.** 열기 → 뽑기 → 읽기가 30초 안에 끝나야 한다. *UI 구현:* 3탭 이내 플로우, 셔플 연출 1.5초 상한, 스킵 가능.
3. **가벼움이 신뢰다.** 로딩이 느린 운세 앱은 다시 열지 않는다. *UI 구현:* 초기 JS 150KB(gzip) 이하, CSS transform만으로 연출, 대형 애니메이션 라이브러리 금지.
4. **카드가 주인공.** UI는 카드를 감싸는 액자다. *UI 구현:* 결과 화면에서 카드 이미지가 첫 뷰포트의 시각적 중심; 색·장식은 카드보다 낮은 채도 대비 유지.
5. **매일의 일관성.** 같은 날 다시 열어도 오늘의 카드는 같아야 믿음이 생긴다. *UI 구현:* 날짜 시드 + localStorage; 자정 리셋을 토스트로 안내.

## 13. Personas

*Illustrative — 출근길 리추얼러:* 수진, 29, 마케터. 출근 지하철에서 오늘의 카드를 뽑는 것으로 하루를 연다. 해석을 정독하기보다 키워드와 조언 한 줄을 스캔한다. 로딩이 3초를 넘으면 닫아버린다.

*Illustrative — 연애 고민러:* 민재, 24, 대학생. 썸 상대의 마음이 궁금해 애정운을 반복해서 본다. 결과를 캡처해 친구에게 보내며 수다의 재료로 쓴다. 예/아니오 타로의 헤비 유저가 될 타입.

*Illustrative — 타로 입문자:* 하영, 32, 개발자. 타로 상징 자체가 궁금해 카드 도감을 정독한다. 정방향/역방향 의미를 비교해 읽고, 78장을 도감에서 하나씩 훑는 컬렉션 욕구가 있다.

*Illustrative — 월말 점검러:* 지우, 35, 프리랜서 디자이너. 매월 1일 월간 운세로 한 달의 흐름을 잡고, 일이 풀리지 않는 주에 주간 운세를 다시 연다. 금전운·직업운 카테고리 위주.

## 14. States

- **Empty (오늘 카드 뽑기 전):** 홈 상단에 뒤집힌 카드 + "오늘의 카드가 당신을 기다리고 있어요" + primary CTA. 빈 그리드 노출 금지.
- **Drawn (오늘 카드 뽑은 후):** 같은 자리에 뽑힌 카드 미니 뷰 + 키워드 칩; 탭하면 결과 화면 재진입. CTA는 disabled 스타일로 "내일 다시 만나요".
- **Deck Spread (덱 펼침):** 덱 전체(기본 메이저 22장)를 뒷면으로 화면 하단 부채꼴에 겹쳐 배열; 카드당 노출 폭 ~14px, 아크 ±35°. 터치 시 해당 카드 `translateY(-8px)` 피드백.
- **Shuffling:** 셔플 버튼(Lucide `shuffle`) 탭 시 카드들이 흩어졌다 다시 부채꼴로 모이는 연출(1.2s, 탭으로 스킵 가능); 텍스트 "카드를 섞고 있어요…". 횟수 제한 없음; 선택 중 셔플 시 선택 초기화 + 확인 토스트.
- **Card Selected (선택됨):** 고른 카드가 아크에서 위로 뽑혀 나오며(`translateY(-24px)`) 보라 글로우 + 순서 배지; 재탭 시 해제. 필요한 수를 다 고르면 "결과 보기" CTA 활성화.
- **Card Reveal:** `rotateY` 플립 0.6s ease, 3장 스프레드는 0.15s 간격 순차 플립; 플립 완료 시 골드 테두리 + 보라 글로우 1회 페이드.
- **Loading / Skeleton:** 도감 목록 진입 시 카드 비율(3:5) 스켈레톤 타일, 시머 1.5s linear infinite.
- **Error — 데이터 로드 실패:** "카드를 불러오지 못했어요. 잠시 후 다시 시도해 주세요" + slight 재시도 버튼; red 아이콘 액센트.
- **자정 리셋:** 날짜가 바뀐 채 재방문 시 토스트 "새로운 하루가 시작됐어요. 오늘의 카드를 뽑아보세요."
- **Disabled:** `#2E2F45` 배경 / `#6B6880` 텍스트; hover 효과 없음.

## 15. Motion & Easing

**Duration scale:**
- Micro (색·상태 전환): 200ms
- Short (오버레이, 토스트, 칩 등장): 200~400ms
- Card flip: 600ms (`rotateY`, ease)
- Shuffle 연출: 최대 1500ms (스킵 가능)
- Skeleton shimmer: 1500ms loop

**Easing:**
- 기본 전환: `ease`
- 카드 플립: `ease` 단일 `rotateY` 트랜지션 (`transform-style: preserve-3d` + 앞/뒷면 `backface-visibility: hidden`)
- 순차 플립: 3장 스프레드는 150ms stagger
- 셔플: `transform: translate/rotate` 키프레임 조합, JS 물리 연산 없음

**Rules:**
- 애니메이션은 `transform`과 `opacity`만 — width/height/layout 속성 애니메이션 금지
- 3D는 CSS `rotateY` 플립 하나로 제한 — Three.js 등 3D 라이브러리 도입 금지
- 모든 연출은 `prefers-reduced-motion: reduce`에서 즉시 전환(fade 200ms)으로 대체
- 별 반짝임 등 배경 장식 애니메이션은 opacity 루프 1개 이하, 60fps 저해 시 제거
