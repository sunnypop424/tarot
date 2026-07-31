import { useCallback, useEffect, useState } from 'react'

import type { Card, CardReading } from '@/types/card'
import { useLang, type Lang } from './index'

/**
 * **카드 의미(78장 × 정/역 × 관점) 번역** — UI 사전(`DICTS`)과 딴 살림을 차린 이유가 둘 있다.
 *
 *  1. **양이 다르다.** UI 문장은 다 합쳐 백 KB 남짓이지만 카드 의미는 언어마다 수백 KB 다.
 *     `DICTS` 처럼 정적 import 로 합치면 한국어만 쓰는 행사(대부분이다)의 방문자도
 *     세 언어 분량을 통째로 내려받는다. 그래서 **고른 언어의 번역만 동적 import** 한다.
 *  2. **키가 다르다.** UI 는 한국어 원문이 키지만, 카드 의미는 문단이라 원문을 키로 쓰면
 *     `docs/cards/*.md` 를 한 글자만 다듬어도 번역이 조용히 떨어져 나간다.
 *     여기는 **카드 id 와 필드 이름**이 키다 — 원문을 고쳐도 번역은 그대로 붙어 있다
 *     (뜻이 달라졌으면 번역도 손봐야 한다는 건 사람이 기억할 일).
 *
 * 폴백은 UI 와 같은 결이다: **번역이 없으면(아직 안 왔으면) 한국어 원문.**
 * 로드는 비동기지만 화면은 기다리지 않는다 — 처음 한 렌더는 한국어였다가 곧 바뀐다.
 *
 * `symbolism`(그림 묘사)은 아직 번역하지 않았다 — 도감 상세에서만 보이고,
 * 번역이 오면 여기 로더는 그대로 쓸 수 있다 (필드 단위 폴백이라).
 */

/** 카드 한 장의 번역 — 필드 단위로 부분일 수 있다 (없는 필드는 한국어 폴백) */
export interface CardTextEntry {
  name?: string
  keywords?: string[]
  symbolism?: string
  upright?: Partial<CardReading>
  reversed?: Partial<CardReading>
}

export type CardTextDict = Record<string, CardTextEntry>

/**
 * 스위트별로 파일을 나눴다 — 한 파일 78장은 저작(사람이 채우는 일)이 힘들다.
 * Vite 는 이 명시적 import 목록을 각각 청크로 쪼갠다.
 */
const LOADERS: Partial<Record<Lang, () => Promise<CardTextDict>>> = {
  en: async () => merge(await Promise.all([
    import('@/data/cardText/en/major.json'),
    import('@/data/cardText/en/wands.json'),
    import('@/data/cardText/en/cups.json'),
    import('@/data/cardText/en/swords.json'),
    import('@/data/cardText/en/pentacles.json'),
  ])),
  zh: async () => merge(await Promise.all([
    import('@/data/cardText/zh/major.json'),
    import('@/data/cardText/zh/wands.json'),
    import('@/data/cardText/zh/cups.json'),
    import('@/data/cardText/zh/swords.json'),
    import('@/data/cardText/zh/pentacles.json'),
  ])),
  ja: async () => merge(await Promise.all([
    import('@/data/cardText/ja/major.json'),
    import('@/data/cardText/ja/wands.json'),
    import('@/data/cardText/ja/cups.json'),
    import('@/data/cardText/ja/swords.json'),
    import('@/data/cardText/ja/pentacles.json'),
  ])),
}

function merge(mods: { default: CardTextDict }[]): CardTextDict {
  return Object.assign({}, ...mods.map((m) => m.default))
}

/** 언어별 캐시 — 한 번 내려받으면 언어를 오가도 다시 안 받는다 */
const cache = new Map<Lang, CardTextDict>()
const pending = new Map<Lang, Promise<CardTextDict>>()

function load(lang: Lang): Promise<CardTextDict> | null {
  const loader = LOADERS[lang]
  if (!loader) return null // 한국어 — 원문이 곧 답
  const hit = cache.get(lang)
  if (hit) return Promise.resolve(hit)
  let p = pending.get(lang)
  if (!p) {
    p = loader()
      .then((dict) => {
        cache.set(lang, dict)
        return dict
      })
      .finally(() => pending.delete(lang))
    pending.set(lang, p)
  }
  return p
}

/** 카드에 번역을 덧입힌다 — 없는 필드는 한국어 그대로 (필드 단위 폴백) */
function localize(card: Card, dict: CardTextDict | null): Card {
  const e = dict?.[card.id]
  if (!e) return card
  return {
    ...card,
    name: e.name ?? card.name,
    keywords: e.keywords ?? card.keywords,
    symbolism: e.symbolism ?? card.symbolism,
    upright: { ...card.upright, ...e.upright },
    reversed: { ...card.reversed, ...e.reversed },
  }
}

/**
 * `const lc = useCardText()` → `lc(card)` 가 지금 언어의 카드를 준다.
 *
 * 화면은 **뽑기 직전이 아니라 그리기 직전에** 이걸 통과시킨다 — 저장된 뽑기 기록·URL 은
 * 언제나 한국어 원본 카드로 남아 있고(언어를 바꿔도 기록이 안 흔들린다), 번역은 보여줄 때만
 * 덧입힌다.
 */
export function useCardText(): (card: Card) => Card {
  const { lang } = useLang()
  const [dict, setDict] = useState<CardTextDict | null>(() => cache.get(lang) ?? null)

  useEffect(() => {
    // 언어가 바뀐 순간 이전 언어 사전은 버린다 — 안 그러면 내려받는 동안 옛 언어가 보인다.
    // 캐시에 있으면 그 자리에서 붙고, 없으면 잠깐 한국어(폴백)였다가 도착하는 대로 바뀐다.
    const hit = cache.get(lang)
    setDict(hit ?? null)
    if (hit) return
    const p = load(lang)
    if (!p) return
    let alive = true
    void p.then((d) => {
      if (alive) setDict(d)
    })
    return () => {
      alive = false
    }
  }, [lang])

  // 사전이 같은 동안은 함수도 같다 — effect 의존성에 넣어도 사전이 도착할 때만 다시 돈다
  return useCallback((card: Card) => localize(card, dict), [dict])
}
