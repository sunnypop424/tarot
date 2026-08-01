import { useMemo } from 'react'

import { useT, useLang, type Lang } from './index'

/**
 * **서비스 표시 설정(`display`)을 지금 언어로 옮긴다.**
 *
 * 각 서비스의 화면 문구는 `src/data/<svc>.ts` 의 `DEFAULT_*` 에서 오고, 주최자가 편집기에서
 * 고치면 그 값이 대신 온다 (`saved.title || DEFAULT.title`). 그래서 화면에 뜨는 문장은
 * **둘 중 하나**다 — 우리가 쓴 기본 문구이거나, 주최자가 쓴 문구이거나.
 *
 * 이 둘을 화면이 구분할 방법이 없고, 구분할 필요도 없다: **사전을 그냥 통과시키면 된다.**
 *
 *   · 우리 기본 문구 → 사전에 있다 → 번역된다
 *   · 주최자가 쓴 문구 → 사전에 없다 → **원문 그대로** (그 사람이 쓴 말이 맞다)
 *
 * 폴백이 곧 정답이라, 판정 코드가 필요 없다. `t()` 의 설계(없으면 한국어)를 그대로 쓴다.
 *
 * **문자열만 건드린다.** 색(`#fff`)·URL·숫자·불린은 사전에 없으니 통과해도 그대로지만,
 * 굳이 넣지 않는다 — 훑는 값이 적을수록 사고가 적다.
 *
 * 주최자가 **언어별로 직접 적은** 문구는 이 위 단계에서 이미 골라져 들어온다
 * (`src/data/multilingual.ts`) — 여기는 그 뒤에 남은 한 언어짜리 값만 본다.
 */
export function useLocalizedDisplay<T extends object>(display: T): T {
  const t = useT()
  const { lang } = useLang()
  return useMemo(() => {
    const out = { ...display } as Record<string, unknown>
    /**
     * **주최자가 언어별로 적어 둔 값이 먼저다** (`display.i18n` — 편집기에서 적는다).
     *
     * 여기서 한 번 갈아 끼우면 **화면 코드는 하나도 안 고쳐도 된다** — 아홉 서비스가
     * 이미 이 훅을 통과시키고 있기 때문이다. 값마다 `pick()` 을 흩뿌리는 대신
     * 통로 하나에서 끝낸다.
     */
    const alt = (out.i18n ?? null) as Record<string, Partial<Record<Lang, string>>> | null
    for (const [k, v] of Object.entries(out)) {
      if (k === 'i18n') continue
      const written = alt?.[k]?.[lang]
      if (typeof v === 'string' && written && written.trim()) {
        out[k] = written
        continue
      }
      if (typeof v === 'string' && v !== '' && !isOpaque(v)) out[k] = t(v)
      // 선택지 목록처럼 문자열 배열인 자리도 같이 (예: 칭호·안내 줄)
      else if (Array.isArray(v) && v.every((x) => typeof x === 'string')) {
        out[k] = (v as string[]).map((x) => (x && !isOpaque(x) ? t(x) : x))
      }
    }
    return out as T
  }, [display, t, lang])
}

/**
 * 사전에 물어볼 것도 없는 값 — 색·URL·데이터 URI.
 *
 * 통과시켜도 결과는 같지만(사전에 없다), 색 이름 하나가 우연히 사전 키와 겹치는 날
 * 배경색이 문장으로 바뀌는 사고가 난다. 모양으로 미리 걸러 둔다.
 */
function isOpaque(s: string): boolean {
  return s.startsWith('#') || s.startsWith('http') || s.startsWith('data:') || s.startsWith('/')
}
