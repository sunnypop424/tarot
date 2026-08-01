import type { ReactNode } from 'react'

import { cssUrl } from '@/lib/image'
import { useSlotOrNull } from '@/slot/SlotProvider'
import { LangPicker } from './LangPicker'

/**
 * 방문자 화면 맨 위 **로고 + 제목 한 줄.**
 *
 * ── 왜 부품인가 ──
 *
 * **로고를 안 올린 슬롯에서 회색 네모가 떴다.** 투표·포토존이 로고 자리를 늘 그리고 그 안에
 * 이미지 아이콘을 넣었는데, 캡처로 보면 **깨진 그림처럼 보인다.** 스탬프는 이미 고쳤고 이유도
 * 남겨 뒀다 — "없는데도 타일을 그리면 '이미지가 깨졌다' 로 읽힌다(실제로 그렇게 보였다)".
 * 그런데 그 판단이 스탬프 파일 안에만 있었다. 헤더가 서비스마다 복붙돼 있어서
 * **고친 사람이 자기 파일만 고칠 수 있었기 때문**이다 (`docs/REVIEW_COMMON.md` 2번).
 *
 * 그래서 여기 가두는 건 딱 하나다: **로고가 없으면 로고 자리를 안 그린다.**
 * 새 서비스가 이걸 다시 정할 일이 없게 기본값으로 못박는다.
 *
 * ── 무엇을 안 묶었나 ──
 *
 * 헤더의 **생김새는 서비스마다 진짜로 다르다.** 억지로 하나로 만들면 서비스가 죽는다:
 *  · `tile` — 로고가 제목 **옆** 44px 타일 (투표·스탬프·포토존)
 *  · `mark` — 로고가 제목 **위** 블록 (포카·응원)
 *  · `mark` + `titleWithLogo={false}` — 로고가 **제목 자리를 대신한다** (롤페·소원나무).
 *    이 둘은 로고가 곧 이벤트 제목이라 `logoAlign`·`logoMarginTop` 을 따로 갖는다
 *
 * **부제도 안 가져왔다.** 투표·스탬프·포토존은 부제(`.intro`)가 `<header>` **밖**에서
 * 자기 여백(`margin: 12px var(--layout-pad) 0`)을 갖는다 — 헤더(flex row) 안으로 넣으면
 * 그 여백이 깨진다. 부제는 각 서비스가 지금 자리에 그대로 둔다.
 *
 * 색·치수는 `classes` 로 받는다. 서비스 토큰(`--pl-head` 등)을 쓰는 값이라 여기서 못 고른다.
 */
export function ServiceHeader({
  variant,
  logo,
  title,
  showTitle,
  align,
  marginTop,
  titleWithLogo = true,
  stage = false,
  classes,
  below,
  children,
}: {
  variant: 'tile' | 'mark'
  logo: string
  title: string
  showTitle: boolean
  /** 로고·제목 정렬 — `mark` 에서만 쓴다 (`tile` 은 늘 왼쪽) */
  align?: 'left' | 'center' | 'right'
  /** 배경 사진 위에서 헤더를 내려야 할 때 (롤페·소원나무) */
  marginTop?: number
  /** false 면 **로고가 제목을 대신한다** — 로고가 있으면 제목 글자를 안 그린다 */
  titleWithLogo?: boolean
  /** 화면 위 헤더가 아니라 전면 무대인가 — 공통 헤더 규칙에서 빠진다 */
  stage?: boolean
  /**
   * `text` 는 **있는 서비스만 준다.** 롤페·소원나무는 제목 덩어리를 감싸는 칸이 따로 있어야
   * 그 옆에 CTA 가 붙고(flex row), 포카·응원은 헤더 자체가 세로 흐름이라 래퍼가 없다.
   */
  classes: { head: string; logo: string; title: string; text?: string }
  /** 제목 **아래**, 제목 덩어리 **안**에 들어갈 것 (롤페·소원·응원의 부제) */
  below?: ReactNode
  /** 제목 덩어리 **밖**, 헤더 안에 들어갈 것 (롤페의 데스크톱 CTA) */
  children?: ReactNode
}) {
  /**
   * 언어 고르개 — **슬롯이 언어를 골랐을 때만** (`slot.langs`).
   *
   * 헤더에 두는 이유: 이 부품을 일곱 서비스가 같이 쓰므로 여기 한 번 넣으면 그 서비스들이
   * 전부 같은 자리에 같은 모양으로 갖는다. 서비스마다 따로 넣으면 자리가 제각각이 되고,
   * 새 서비스는 아예 빠뜨린다 (이 파일이 존재하는 이유와 같은 이야기다).
   *
   * `useSlotOrNull` 인 이유: 편집기 미리보기·랜딩 iframe 처럼 슬롯 컨텍스트가 없는 자리에서도
   * 이 헤더가 그려진다 — 거기선 고르개가 없는 게 맞다.
   */
  const slot = useSlotOrNull()
  /**
   * **고르개는 헤더 위 자기 줄에 앉는다.**
   *
   * 두 번 틀린 자리라 이유를 적어 둔다.
   *
   *  1. 처음엔 헤더의 **마지막 자식**으로 그냥 흘려 두었다. `classes.head` 가 서비스마다
   *     달라서(가로 flex · 세로 stack · 가운데 정렬) 흐르는 자리도 제각각이 됐다 —
   *     투표는 제목 옆에 딱 붙고, 응원은 부제 아래 왼쪽에 혼자 떴다.
   *  2. 그래서 **절대 좌표**(`top:0; right:0`)로 잡았더니 이번엔 헤더의 안쪽 여백을
   *     건너뛰었다. 포토카드는 고르개가 제목보다 위로 올라갔고, 타로는 가운데 정렬된
   *     제목 옆에 혼자 오른쪽 끝으로 붕 떴다. `right` 는 변수로 맞췄지만 `top` 은
   *     서비스마다 값이 달라 그 방법으로는 끝이 없었다.
   *
   * 지금은 **다시 절대 좌표**인데, 이번엔 `top` 을 0 이 아니라 **헤더의 위 여백과 같은 값**
   * 으로 받는다 — 그래야 제목 첫 줄과 같은 선상에 앉는다. 그 여백이 서비스마다 다르므로
   * (24px 이 다섯, 포토카드 44px, 응원 0) CSS 변수로 열어 두고 예외만 자기 파일에서 준다.
   *
   * 자기 줄로 뺐던 때(직전 시도)는 자리가 일정해지는 대신 **제목보다 위**에 앉아,
   * 제목과 고르개가 두 층으로 갈라져 보였다.
   *
   * 자리는 `scripts/verify-langbar.mjs` 가 화면에서 재서 지킨다.
   */
  const langRow = slot?.langs?.length ? (
    <div className="svc-lang">
      <LangPicker only={slot.langs} />
    </div>
  ) : null

  /**
   * **여기가 이 부품의 전부다.** 로고가 없으면 로고 자리를 아예 안 그린다 —
   * 빈 타일은 "이미지가 깨졌다" 로 읽힌다.
   */
  const mark = logo ? (
    <div
      className={classes.logo}
      style={{
        backgroundImage: cssUrl(logo),
        ...(variant === 'mark' && align ? { backgroundPosition: `${align} center` } : {}),
      }}
      role="img"
      aria-label={title}
    />
  ) : null

  /** 로고가 제목을 대신하는 서비스에서는, 로고가 있으면 제목 글자를 안 그린다 */
  /**
   * 제목은 **주최자가 정하는 값**이다 — 기본 문구면 사전이 옮기고(`useLocalizedDisplay`),
   * 고쳤으면 그 사람이 쓴 말이 그대로 나온다. `data-user-text` 로 그 사실을 표시해 두면
   * 번역 검사(`verify-i18n-leak`)가 이 자리를 "안 옮긴 우리 문구" 로 세지 않는다.
   */
  const heading =
    showTitle && (titleWithLogo || !logo) ? (
      <h1 className={classes.title} data-user-text>
        {title}
      </h1>
    ) : null

  if (variant === 'tile') {
    return (
      <header className={classes.head} data-align={align} data-stage={stage || undefined}>
        {mark}
        {/*
          * **부제도 제목과 같이 움직인다.** `textAlign` 을 안 걸어 두면 제목 상자만
          * 가운데로 가고 그 안의 글자는 왼쪽에 남는다 — 제목은 상자 폭과 같아 티가 안 나는데
          * 짧은 부제가 혼자 왼쪽에 붙어 두 줄이 어긋나 보였다. `mark` 변형은 원래 걸려 있다.
          */}
        <div className={classes.text} data-align={align} style={{ textAlign: align, minWidth: 0 }}>
          {heading}
          {below}
        </div>
        {children}
        {langRow}
      </header>
    )
  }

  /** 래퍼가 없는 서비스(포카·응원)는 헤더가 곧 제목 덩어리다 */
  const body = (
    <>
      {mark}
      {heading}
      {below}
    </>
  )
  return (
    /**
     * `data-stage` — **화면 위쪽 헤더가 아니라 전면 무대**라는 표식.
     *
     * 공통 규칙(`components.css` 의 `header:has(> .svc-lang)`)은 제목 19px·좌우 20px 처럼
     * *헤더* 를 전제로 한 값이다. 포토카드 판매의 카운터 안내처럼 화면을 통째로 쓰는 자리에
     * 그걸 씌우면 큰 제목이 19px 로 쪼그라들고 가운데도 어긋난다. 여기선 빠진다.
     */
    <header className={classes.head} data-align={align} data-stage={stage || undefined}>
      {classes.text ? (
        <div
          className={classes.text}
          data-align={align}
          style={{ textAlign: align, marginTop: marginTop || undefined }}
        >
          {body}
        </div>
      ) : (
        body
      )}
      {children}
      {langRow}
    </header>
  )
}
