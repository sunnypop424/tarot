/**
 * **카드 의미 번역이 온전한가** — 서버 없이 파일만 읽는다.
 *
 *   node scripts/verify-cardtext.mjs
 *
 * 78장 × 3언어 × (이름·키워드·그림 묘사·정/역 여섯 관점)이라 손으로는 못 센다.
 * 여기서 보는 것:
 *
 *  · **빠진 카드·빠진 필드** — 하나라도 비면 그 자리만 한국어로 떨어진다(폴백은 설계지만,
 *    다 채웠다고 생각하는 것과 실제로 찬 것은 다르다)
 *  · **언어가 섞였나** — 영어 사전에 한글이, 중국어 사전에 가나가 들어간 자리.
 *    옮기다 보면 한 문장을 통째로 빠뜨리고 원문을 그대로 두는 일이 실제로 난다.
 *  · **원문이 그대로 복사됐나** — 한국어 원문과 글자가 같으면 번역이 아니다
 *
 * 일본어는 한자를 중국어와 공유하므로 **가나(ひらがな·カタカナ)** 로만 판정한다.
 */
import { readFileSync } from 'node:fs'

const LANGS = ['en', 'ja', 'zh']
const SUITES = ['major', 'wands', 'cups', 'swords', 'pentacles']
const ASPECTS = ['core', 'general', 'love', 'money', 'career', 'advice']

const HANGUL = /[가-힣]/
const KANA = /[぀-ゟ゠-ヿ]/

const cards = JSON.parse(readFileSync('src/data/cards.json', 'utf8'))

let failed = 0
const bad = (note) => {
  console.log(`✗ ${note}`)
  failed++
}

for (const lang of LANGS) {
  const dict = {}
  for (const s of SUITES) {
    Object.assign(dict, JSON.parse(readFileSync(`src/data/cardText/${lang}/${s}.json`, 'utf8')))
  }

  const miss = []
  const fields = []
  const mixed = []
  const copied = []

  for (const card of cards) {
    const e = dict[card.id]
    if (!e) {
      miss.push(card.id)
      continue
    }
    if (!e.name) fields.push(`${card.id}.name`)
    if (!Array.isArray(e.keywords) || e.keywords.length === 0) fields.push(`${card.id}.keywords`)
    if (!e.symbolism) fields.push(`${card.id}.symbolism`)
    for (const o of ['upright', 'reversed']) {
      for (const f of ASPECTS) if (!e[o]?.[f]) fields.push(`${card.id}.${o}.${f}`)
    }

    /** 그 언어에 있으면 안 되는 글자 — 한글은 어느 언어에도 없어야 한다 */
    const texts = [
      ['name', e.name],
      ['symbolism', e.symbolism],
      ...['upright', 'reversed'].flatMap((o) =>
        ASPECTS.map((f) => [`${o}.${f}`, e[o]?.[f]])
      ),
      ...(e.keywords ?? []).map((k, i) => [`keywords[${i}]`, k]),
    ].filter(([, v]) => typeof v === 'string' && v)

    for (const [where, v] of texts) {
      if (HANGUL.test(v)) mixed.push(`${card.id}.${where} 에 한글`)
      // 일본어 사전이 아닌데 가나가 있으면 섞인 것 (영어·중국어엔 가나가 없다)
      if (lang !== 'ja' && KANA.test(v)) mixed.push(`${card.id}.${where} 에 가나`)
    }

    if (e.symbolism && e.symbolism === card.symbolism) copied.push(`${card.id}.symbolism`)
    for (const o of ['upright', 'reversed']) {
      for (const f of ASPECTS) {
        if (e[o]?.[f] && e[o][f] === card[o]?.[f]) copied.push(`${card.id}.${o}.${f}`)
      }
    }
  }

  const notes = []
  if (miss.length) notes.push(`빠진 카드 ${miss.length}장 (${miss.slice(0, 3).join(', ')}…)`)
  if (fields.length) notes.push(`빈 필드 ${fields.length}곳 (${fields.slice(0, 3).join(', ')}…)`)
  if (mixed.length) notes.push(`언어 섞임 ${mixed.length}곳 (${mixed.slice(0, 3).join(', ')}…)`)
  if (copied.length) notes.push(`원문 그대로 ${copied.length}곳 (${copied.slice(0, 3).join(', ')}…)`)

  if (notes.length) bad(`${lang} — ${notes.join(' · ')}`)
  else console.log(`✓ ${lang} — 78장 · 이름·키워드·그림 묘사·정역 12관점 모두 참`)
}

console.error(failed === 0 ? '\n카드 의미 세 언어 완전' : `\n${failed}개 언어에 문제가 있어요`)
process.exit(failed === 0 ? 0 : 1)
