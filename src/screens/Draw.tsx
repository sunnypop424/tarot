import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Download, Info, Share2 } from 'lucide-react'

import { CardDraw } from '@/components/CardDraw'
import { ReadingCard } from '@/components/ReadingCard'
import { ReadingLoader } from '@/components/ReadingLoader'
import { SavableImage } from '@/components/SavableImage'
import { Synthesis } from '@/components/Synthesis'
import { releaseResult, saveResult, shareResult, type ResultImage } from '@/lib/compose'
import { cardFrontSrc } from '@/lib/theme'
import { readingOf } from '@/lib/deck'
import { drawResultCard } from './resultCard'
import { repo } from '@/lib/repo'
import { getCategory, positionsFor, type Category } from '@/data/categories'
import { getCardById } from '@/data/cards'
import { verdictOf, VERDICT_LABEL, VERDICT_NOTE } from '@/data/yesno'
import { savePeriodDraw, loadPeriodDraw } from '@/lib/storage'
import { useSlot } from '@/slot/SlotProvider'
import { effectiveDeck } from '@/data/slots'
import { useSlotPath } from '@/slot/useSlotPath'
import type { SpreadOptions } from '@/lib/deck'
import type { CategorySetting, Slot } from '@/types/slot'
import type { DrawnCard } from '@/types/card'
import { NotReady } from './NotReady'
import styles from './Draw.module.css'
import { useLang, useT } from '@/i18n'
import { useCardText } from '@/i18n/cardText'

export function Draw() {
  const t = useT()
  const { categoryId } = useParams<{ categoryId: string }>()
  const category = categoryId ? getCategory(categoryId) : undefined

  if (!category) return <NotReady title={t('없는 운세')} />
  // 카테고리가 바뀌면 뽑기 상태를 전부 새로 시작한다
  return <DrawFlow key={category.id} category={category} />
}

/** 이번 기간에 뽑아둔 카드를 되살린다 (기간 카테고리가 아니면 없음) */
function restorePeriodDraw(category: Category): DrawnCard[] | null {
  if (!category.period) return null
  const saved = loadPeriodDraw(category.id, category.period)
  if (!saved) return null

  const drawn = saved
    .map(({ cardId, orientation }) => {
      const card = getCardById(cardId)
      return card ? { card, orientation } : null
    })
    .filter((d): d is DrawnCard => d !== null)

  // 카드 데이터가 바뀌어 못 찾는 게 섞이면 저장분을 버리고 다시 뽑게 한다
  return drawn.length === saved.length ? drawn : null
}

/**
 * 슬롯의 이벤트 설정 → 덱 옵션. 덱은 슬롯 범위로 캡한다(22장 슬롯이면 마이너 안 나온다).
 * 역방향 확률은 설정에 없다 — 고정 50% (REVERSED_RATE).
 */
function spreadOptionsFrom(setting: CategorySetting | undefined, slot: Slot): SpreadOptions {
  return {
    deck: effectiveDeck(slot, setting?.deck),
    spreadCount: setting?.spreadCount,
    allowReversed: setting?.allowReversed,
  }
}

function DrawFlow({ category }: { category: Category }) {
  const { go } = useSlotPath()
  const slot = useSlot()
  const setting = slot.event[category.id]
  // 기간 카테고리는 이미 뽑았으면 저장된 결과로 바로 들어간다
  const [revealed, setRevealed] = useState<DrawnCard[] | null>(() => restorePeriodDraw(category))
  /** 리딩을 만드는 중 — 이 동안 화면을 통째로 덮는다 */
  const [reading, setReading] = useState(false)
  const [synthesis, setSynthesis] = useState<string | null>(null)

  /**
   * 고르기가 끝나면 **결과로 바로 가지 않는다.**
   * 여러 장이면 리딩을 먼저 다 만들고(전면 로더), 카드와 리딩이 함께 등장한다.
   * 한 장은 그 자체로 완결된 해석이라 AI 를 아예 부르지 않는다 — 기다릴 이유가 없다.
   */
  const handleComplete = useCallback(
    async (picked: DrawnCard[]) => {
      if (category.period) {
        savePeriodDraw(
          category.id,
          category.period,
          picked.map(({ card, orientation }) => ({ cardId: card.id, orientation }))
        )
      }

      /**
       * **체험 슬롯은 AI 를 안 부른다.** 여기는 랜딩이 링크하는 공개 주소라, 3장을 뽑을
       * 때마다 실제 API 가 돌고 그만큼 돈이 나간다. AI 가 빠져도 앱은 카드별 해석으로
       * 그대로 돈다(`CLAUDE.md` — `ready()` 가 false 일 때와 같은 길이라 화면이 이미 안다).
       * 서버도 같은 판정을 한다 — 화면만 막으면 요청을 직접 보내는 걸 못 막는다.
       */
      if (picked.length > 1 && !slot.demo && (await repo.ai.ready())) {
        setReading(true)
        try {
          const positions = positionsFor(category, picked.length)
          const text = await repo.ai.synthesize(slot.slug, {
            category: category.label,
            aspect: category.aspect,
            // 고른 순서 = 포지션 순서 = 리딩의 흐름
            drawn: picked.map(({ card, orientation }, i) => ({
              cardId: card.id,
              orientation,
              position: positions[i],
            })),
          })
          setSynthesis(text)
        } catch {
          // 실패해도 결과는 보여준다 — 종합만 빠지고 카드별 해석은 그대로 (앱이 멈추면 안 된다)
          setSynthesis(null)
        } finally {
          setReading(false)
        }
      }

      setRevealed(picked)
    },
    [category, slot.slug]
  )

  if (reading) return <ReadingLoader />

  if (revealed) {
    return (
      <Result
        category={category}
        drawn={revealed}
        synthesis={synthesis}
        onRedraw={() => {
          setRevealed(null)
          setSynthesis(null)
        }}
        onDone={() => go()}
      />
    )
  }

  // 슬롯이 뽑는 수를 지정했으면 그걸, 아니면 카테고리 기본값
  const positions = positionsFor(category, setting?.cardCount ?? category.defaultCount)

  return (
    <CardDraw
      title={category.label}
      lead={category.prompt}
      note={category.renews}
      cardCount={positions.length}
      positions={positions}
      spread={spreadOptionsFrom(setting, slot)}
      onComplete={handleComplete}
    />
  )
}

interface ResultProps {
  category: Category
  drawn: DrawnCard[]
  /** 미리 만들어둔 종합 — 없으면(1장이거나 실패) 블록이 통째로 빠진다 */
  synthesis: string | null
  onRedraw: () => void
  onDone: () => void
}

function Result({ category, drawn, synthesis, onRedraw, onDone }: ResultProps) {
  const t = useT()
  // 기간 카테고리는 그 기간에 한 번뿐 — 다시 뽑을 수 없다
  const canRedraw = !category.period
  const isYesNo = category.id === 'yesno'
  const positions = positionsFor(category, drawn.length)
  const { image, note, save, share } = useResultImage(category, drawn, synthesis, positions)

  return (
    <div className={`screen ${styles.resultScreen}`}>
      <h1 className="t-title-l screen__title">{t(category.label)}</h1>
      {category.renews && <p className="t-text-xs t-muted screen__lead">{t(category.renews)}</p>}

      <div className={styles.results}>
        {/* 카드들 — 여러 장이면 넓은 화면에서 한 줄로 나열 */}
        <div className={styles.spread}>
          {drawn.map((item, i) => (
            <ReadingCard
              key={item.card.id}
              drawn={item}
              position={positions[i]}
              aspect={category.aspect}
              // 3장 나열은 길어진다 — 각 장을 짧게
              brief={drawn.length > 1}
              verdict={isYesNo ? verdictFor(item) : undefined}
            />
          ))}
        </div>

        {/* 카드 아래 — 각 장을 읽고 나서 "그래서 종합하면?" 이 오는 자리 */}
        {synthesis && <Synthesis text={synthesis} />}
      </div>

      {/**
        * **가져갈 수 있게 한다.** 열 서비스 중 포토존·모의고사·포토카드는 결과물을 가져가는데
        * 타로만 없었다 — 화면을 닫으면 사라지고, 기간이 지나면 다시 볼 수도 없었다.
        *
        * 그림을 못 만들었으면 **버튼을 아예 안 그린다.** 눌러도 아무 일이 없는 버튼은
        * 없는 것보다 나쁘다 (카드 이미지를 못 받아 왔을 때 그렇게 된다).
        */}
      {image && (
        <div className={styles.saveRow}>
          <button type="button" className="btn btn--sm btn--slight" onClick={() => void save()} data-save>
            <Download size={16} aria-hidden="true" /> {t('저장')}
          </button>
          <button type="button" className="btn btn--sm btn--slight" onClick={() => void share()} data-share>
            <Share2 size={16} aria-hidden="true" /> {t('공유')}
          </button>
        </div>
      )}
      {note && (
        <p className={`t-text-xs t-muted ${styles.saveNote}`}>
          <Info size={14} aria-hidden="true" /> {t(note)}
        </p>
      )}
      {/*
        * 화면엔 안 그린다 — 저장·공유의 원본이다. `SavableImage` 는 `ResultImage` 만 받으므로
        * 슬롯 자산 URL 이 이 자리에 오는 건 **타입이 막는다** (CLAUDE.md 의 `<img>` 예외).
        */}
      {image && (
        <div style={{ display: 'none' }} aria-hidden="true">
          <SavableImage image={image} alt={t('{category} 결과', { category: t(category.label) })} />
        </div>
      )}

      <div className={styles.resultActions}>
        {canRedraw ? (
          <button type="button" className="btn btn--md btn--slight btn--block" onClick={onRedraw}>
            {t('다시 뽑기')}
          </button>
        ) : (
          <button type="button" className="btn btn--md btn--block" disabled>
            {category.locked && t(category.locked)}
          </button>
        )}
        <button type="button" className="btn btn--sm btn--ghost btn--block" onClick={onDone}>
          {t('홈으로')}
        </button>
      </div>

      <p className="t-text-xxs disclaimer">{t('타로는 재미와 성찰을 위한 것이에요.')}</p>
    </div>
  )
}

/** 예/아니오 — 답 한 줄. 해석 맨 앞에 놓인다 */
function verdictFor(drawn: DrawnCard) {
  const verdict = verdictOf(drawn)
  return { label: VERDICT_LABEL[verdict], note: VERDICT_NOTE[verdict] }
}

/**
 * 결과 그림 한 장을 만들어 들고 있는다 — 저장·공유의 원본.
 *
 * **결과 화면에 들어온 순간 만든다.** 누른 뒤에 만들면 캔버스 합성(카드 이미지 내려받기 포함)이
 * 끝날 때까지 기다려야 하고, 그 몇 백 밀리초가 "안 눌리는 버튼" 으로 읽힌다.
 *
 * 못 만들어도 **결과 화면은 그대로 뜬다** — 저장 버튼만 안 생긴다. 카드 이미지를 CORS 로 못
 * 받아오는 슬롯이 있을 수 있는데, 그것 때문에 뽑은 결과를 못 보게 하면 안 된다.
 */
function useResultImage(
  category: Category,
  drawn: DrawnCard[],
  synthesis: string | null,
  positions: string[]
) {
  const slot = useSlot()
  const { lang, t } = useLang()
  const lc = useCardText()
  const [image, setImage] = useState<ResultImage | null>(null)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    let made: ResultImage | null = null
    const c = slot.theme.colors

    /**
     * 본문은 **화면에 이미 있는 글** 중 하나를 고른다 — 새로 쓰지 않는다.
     * 여러 장이면 AI 종합(그게 그 화면의 결론이다), 한 장이면 조언 한 줄.
     * 저장한 그림에만 있는 문장을 만들면 화면과 저장물이 다른 말을 하게 된다.
     * 카드 이름·해석은 화면과 같은 번역을 입힌다 (`i18n/cardText.ts`) — 저장물도 그 언어다.
     */
    const body = drawn.length > 1 ? (synthesis ?? '') : readingOf({ ...drawn[0], card: lc(drawn[0].card) }).advice

    void drawResultCard({
      eventTitle: slot.name,
      kicker: t(category.label),
      // 캔버스 안 글자는 화면의 t() 가 못 닿는다 — 여기서 넘긴다
      reversedLabel: t('역방향'),
      cards: drawn.map((d, i) => ({
        name: lc(d.card).name,
        nameEn: d.card.nameEn,
        reversed: d.orientation === 'reversed',
        // 한 장이면 포지션 라벨이 곧 카테고리라 중복이다 — 비운다
        position: drawn.length > 1 ? t(positions[i]) : '',
        image: cardFrontSrc(slot.theme, d.card.id) ?? undefined,
      })),
      body,
      date: new Date().toLocaleDateString(lang).replace(/\.$/, '').replace(/\s/g, ''),
      logo: slot.theme.assets.logo ?? undefined,
      colors: {
        bg: c.canvas,
        head: c.fg1,
        sub: c.fg2,
        line: c.border,
        accent: c.primary,
        // 이미지 없는 슬롯의 카드 바탕 — 화면 폴백과 같은 두 색을 그대로 넘긴다
        cardFrom: c.cardBackFrom,
        cardTo: c.cardBackTo,
      },
      // 슬롯이 웹폰트를 쓰면 그것도 이미 문서에 붙어 있다 — 캔버스는 그 이름을 그대로 쓴다
      fontFamily: getComputedStyle(document.body).fontFamily || 'sans-serif',
    })
      .then((img) => {
        made = img
        if (alive) setImage(img)
        else releaseResult(img)
      })
      .catch(() => {
        /* 못 만들어도 결과는 보여준다 — 저장 버튼만 안 생긴다 */
      })

    return () => {
      alive = false
      if (made) releaseResult(made)
    }
    // 결과 화면은 뽑은 카드가 바뀌면 통째로 다시 만들어진다. 카드 번역 사전이 도착하면
    // (lc 가 그때만 바뀐다 — useCallback) 저장물도 그 언어로 다시 그린다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lc])

  const filename = `${slot.name}-${category.label}.png`

  /**
   * **'저장' 과 '공유' 는 다른 일을 한다** (`compose.ts` 주석 — 모의고사에서 같은 실수가 있었다).
   * 새 탭까지 떨어지면 사용자가 직접 눌러야 하므로 그걸 말해준다.
   */
  const run = async (kind: 'save' | 'share') => {
    if (!image) return
    const how = kind === 'save' ? await saveResult(image, filename) : await shareResult(image, filename)
    setNote(how === 'opened' ? '새 탭에서 사진을 길게 눌러 저장해 주세요.' : null)
  }

  return {
    image,
    note,
    save: () => run('save'),
    share: () => run('share'),
  }
}
