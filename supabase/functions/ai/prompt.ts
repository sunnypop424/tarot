/**
 * 프롬프트 조립 — **서버 쪽에서만 돈다.**
 *
 * 카드 의미(core·symbolism)는 클라이언트가 보낸 걸 쓰지 않고 여기서 cards.json 을 직접 읽는다.
 * 클라이언트가 준 텍스트를 그대로 프롬프트에 넣으면 프롬프트를 조작당한다 —
 * 클라이언트는 "어떤 카드가 어느 포지션에 어느 방향으로 나왔는지"(id·orientation·position)만 말할 수 있다.
 *
 * core·symbolism 은 애초에 "AI 프롬프트 컨텍스트용"으로 저작해둔 필드다 (PLANNING.md §6).
 * cards.json 은 `npm run cards:build` 가 docs/cards/*.md 에서 여기로도 뽑아준다 — 손으로 복사하지 않는다.
 */

import cardsJson from './cards.json' with { type: 'json' }

export type Orientation = 'upright' | 'reversed'

interface Meaning {
  core: string
  general: string
  love: string
  money: string
  career: string
  advice: string
}

export interface Card {
  id: string
  name: string
  nameEn: string
  symbolism: string
  upright: Meaning
  reversed: Meaning
}

const deck = new Map<string, Card>((cardsJson as Card[]).map((c) => [c.id, c]))

export const getCard = (cardId: string): Card | undefined => deck.get(cardId)

const ORIENTATION_LABEL: Record<Orientation, string> = {
  upright: '정방향',
  reversed: '역방향',
}

/**
 * 타로 리더의 화법 — PLANNING.md §1 핵심 원칙 2 ("단정하지 않게").
 * 운세는 예언이 아니라 흐름과 조언이다. 공포 조장·과몰입 유도 금지.
 */
const VOICE = `화법:
- 한국어 존댓말("~해요" 체). 부드럽고 다정하게, 카페에서 리더가 마주 앉아 말해주듯이.
- 타로는 예언이 아니라 흐름과 조언이에요. 단정하지 않아요 — "반드시", "틀림없이", "~할 것입니다" 같은 확정 표현을 쓰지 않아요.
- 겁주지 않아요. 어려운 카드도 대비할 수 있는 이야기로 풀어요.
- 과몰입을 유도하지 않아요. 결정을 대신해주지 않고, 생각할 거리를 건네요.
- 제목·목록·마크다운·이모지 없이 줄글로만 써요.`

/** 뽑힌 카드 한 장을 프롬프트 문단으로 */
function cardBlock(card: Card, orientation: Orientation, index: number, position: string): string {
  const meaning = card[orientation]
  return [
    `${index + 1}. ${position} — ${card.name}(${card.nameEn}) ${ORIENTATION_LABEL[orientation]}`,
    `   카드의 본질: ${meaning.core}`,
    `   그림과 상징: ${card.symbolism}`,
  ].join('\n')
}

export interface DrawnItem {
  cardId: string
  orientation: Orientation
  position: string
}

/**
 * 3장(이상) 리딩 종합.
 *
 * **포지션 순서가 핵심이다.** "나의 마음 → 상대의 마음 → 관계의 흐름"은 세 덩어리가 아니라
 * 하나의 흐름이다. 카드를 하나씩 설명해 나열하는 건 지금도 화면이 하고 있으니,
 * AI 가 할 일은 그 사이를 잇는 것뿐이다.
 */
export function synthesisPrompt({
  category,
  aspect,
  drawn,
  question,
}: {
  category: string
  aspect: string
  drawn: DrawnItem[]
  question?: string
}): { system: string; user: string } {
  const blocks = drawn.map((item, i) => {
    const card = deck.get(item.cardId)
    if (!card) throw new Error(`모르는 카드: ${item.cardId}`)
    return cardBlock(card, item.orientation, i, item.position)
  })

  const system = `당신은 아이돌 생일카페 이벤트의 타로 리더예요. 방문자가 직접 고른 카드들을 **하나의 리딩**으로 종합해 들려줘요.

${VOICE}

리딩 규칙:
- 포지션에는 **순서와 역할**이 있어요. 1번에서 2번, 3번으로 이어지는 하나의 이야기로 읽어요.
- 카드를 한 장씩 끊어 설명하지 않아요. **카드들이 서로 어떻게 이어지는지가 이 리딩의 전부예요** — 각 장의 개별 설명은 이미 화면에 따로 나와 있어요.
- 카드 이름과 포지션은 자연스럽게 언급하되, 키워드를 나열하지 않아요.
- 마지막 한 문장은 지금 해볼 수 있는 조언으로 맺어요.
- 4~6문장, 300자 내외.`

  const lines = [`카테고리: ${category}`]
  if (question) lines.push(`방문자의 질문: ${question}`)
  lines.push(`관점: ${aspect}`, '', '뽑힌 카드 (고른 순서대로):', '', blocks.join('\n\n'))

  return { system, user: lines.join('\n') }
}

/**
 * 슬롯 테마 색 생성 (편집기 "AI로 색 만들기").
 *
 * **AI 에게 대비를 맡기지 않는다.** 모델은 색 감각(어울리는 색조·분위기)에 쓰고,
 * 읽히는지는 클라이언트가 `readableShade` 로 강제한다 (src/owner/aiTheme.ts).
 * "4.5:1 넘게 해줘"라고 부탁하면 대충 맞춰 오고, 대충 맞은 색은 카페에서 안 읽힌다.
 */
export function themePrompt({
  baseColor,
  mode,
  eventName,
}: {
  baseColor: string
  mode: 'light' | 'dark'
  eventName?: string
}): { system: string; user: string; schema: unknown } {
  const dark = mode === 'dark'

  const system = `당신은 아이돌 생일카페 이벤트 페이지의 색을 설계해요. 대표 색 하나를 받아 화면 전체 색을 만들어요.

원칙:
- **대표 색이 주인공이에요.** 그 색을 CTA(primary)에 쓰고, 나머지는 그 색을 받쳐주는 역할이에요.
- ${dark ? '어두운 화면이에요. 바탕은 깊고, 글자는 밝아요.' : '밝은 화면이에요. 바탕은 밝고, 글자는 어두워요.'}
- 바탕(canvas·surface)에 대표 색의 색조를 아주 옅게 섞어요 — 회색 화면에 색만 얹으면 이벤트가 아니라 관공서가 돼요.
- 생일카페예요. 팬이 좋아하는 색이 화면을 물들이는 게 목적이에요.

각 색의 자리:
- canvas: 화면 바탕 (제일 넓은 면)
- surface: 카드·타일 (canvas 위에 얹히는 면)
- surfaceRaised: 떠 있는 표면 (surface 보다 한 단계 더 위)
- wash: 보조 버튼·칩 배경 (대표 색을 옅게 깐 면)
- primary: 주요 CTA 버튼
- primaryHover: CTA 에 마우스 올렸을 때 (primary 보다 약간 진하게)
- onPrimary: CTA 위의 글자 (primary 위에서 또렷해야 해요)
- accent: **어두운 카드 뒷면 위의 장식** — 카드 테두리, 별 문양. cardBack 위에서 반짝여야 해요
- fg1: 본문 글자 / fg2: 보조 글자 / fg3: 흐린 글자
- border: 구분선 / borderHover: 강조된 구분선
- cardBackFrom: 카드 뒷면 그라디언트 안쪽 / cardBackTo: 바깥쪽 (${dark ? '' : '화면이 밝아도 '}카드 뒷면은 깊은 색이 어울려요)

전부 #RRGGBB 6자리 hex 로만 답해요.`

  const user = [
    `대표 색: ${baseColor}`,
    `모드: ${dark ? '다크' : '라이트'}`,
    eventName ? `이벤트: ${eventName}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  const hex = { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' }
  const keys = [
    'canvas', 'surface', 'surfaceRaised', 'wash',
    'primary', 'primaryHover', 'onPrimary', 'accent',
    'fg1', 'fg2', 'fg3', 'border', 'borderHover',
    'cardBackFrom', 'cardBackTo',
  ]
  const schema = {
    type: 'object',
    properties: Object.fromEntries(keys.map((k) => [k, hex])),
    required: keys,
    additionalProperties: false,
  }

  return { system, user, schema }
}

/**
 * 질문 × 카드 답변 일괄 생성 (관리자 화면 "AI로 전체 생성").
 * 한 번에 여러 장을 묶어 요청하고 JSON 으로 받는다 — 카드마다 왕복하면 78장이 78번이 된다.
 */
export function answersPrompt({
  question,
  aspect,
  cardIds,
  allowReversed,
}: {
  question: string
  aspect: string
  cardIds: string[]
  allowReversed: boolean
}): { system: string; user: string; schema: unknown } {
  const blocks = cardIds.map((id) => {
    const card = deck.get(id)
    if (!card) throw new Error(`모르는 카드: ${id}`)
    const parts = [`- id: ${card.id} / 이름: ${card.name}`, `  정방향 본질: ${card.upright.core}`]
    if (allowReversed) parts.push(`  역방향 본질: ${card.reversed.core}`)
    parts.push(`  그림과 상징: ${card.symbolism}`)
    return parts.join('\n')
  })

  const system = `당신은 아이돌 생일카페 이벤트의 타로 리더예요. **하나의 질문**에 대해, 카드마다 그 카드가 나왔을 때 들려줄 답변을 써요.

${VOICE}

답변 규칙:
- 각 답변은 **그 질문에 대한 답**이에요. 카드의 일반적인 의미 설명이 아니에요.
- 카드의 본질과 상징을 질문에 비추어 풀어요.
- 2~3문장, 120자 내외. 방문자가 카페에서 서서 읽어요.
- 질문을 그대로 되풀이하지 않고 바로 답으로 들어가요.${
    allowReversed
      ? '\n- 정방향과 역방향은 **다른 답**이에요. 역방향이라고 무조건 나쁘게 쓰지 않아요 — 흐름이 안으로 향하거나 지연되거나 다른 각도로 나타난다고 읽어요.'
      : ''
  }`

  const user = [
    `질문: ${question}`,
    `관점: ${aspect}`,
    '',
    `아래 ${cardIds.length}장 각각에 대해 답변을 써주세요.`,
    '',
    blocks.join('\n\n'),
  ].join('\n')

  /** 구조화 출력 — 파싱이 흔들리면 검수 화면이 통째로 깨진다 */
  const schema = {
    type: 'object',
    properties: {
      answers: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            cardId: { type: 'string' },
            upright: { type: 'string' },
            ...(allowReversed ? { reversed: { type: 'string' } } : {}),
          },
          required: ['cardId', 'upright', ...(allowReversed ? ['reversed'] : [])],
          additionalProperties: false,
        },
      },
    },
    required: ['answers'],
    additionalProperties: false,
  }

  return { system, user, schema }
}
