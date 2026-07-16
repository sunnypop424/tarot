/**
 * docs/cards/*.md → src/data/cards.json 변환
 *
 * 카드 md는 모든 카드가 동일한 필드 구조를 갖는다는 전제로 파싱한다.
 * 구조가 어긋나면 조용히 넘어가지 않고 에러로 중단시킨다 — 데이터 누락이
 * 런타임에 빈 화면으로 나타나는 것보다 빌드 실패가 낫다.
 *
 *   node scripts/build-cards.mjs           변환 + 저장
 *   node scripts/build-cards.mjs --verify  검증만 (파일 미생성)
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CARDS_DIR = join(ROOT, 'docs', 'cards')
/**
 * 카드 데이터는 **두 곳에서 필요하다** — 화면(도감·해석)과 AI 서버(프롬프트).
 *
 * Edge Function 은 자기 폴더 밖 파일을 번들에 못 넣어서 함수 안에 사본이 있어야 한다.
 * 그래서 **손으로 복사하지 않고 여기서 같이 뽑는다** — 저작 소스는 docs/cards/*.md 하나뿐이고,
 * 사본이 어긋날 길이 없다. (프롬프트에 들어갈 의미 텍스트는 서버가 이 파일에서 직접 읽는다 —
 * 클라이언트가 보낸 텍스트를 쓰면 프롬프트를 조작당한다)
 */
const OUT_FILES = [
  join(ROOT, 'src', 'data', 'cards.json'),
  join(ROOT, 'supabase', 'functions', 'ai', 'cards.json'),
]

/** 파일별 기대 사양 — 장수가 어긋나면 즉시 잡힌다 */
const SOURCES = [
  { file: 'major-arcana.md', arcana: 'major', suit: null, expect: 22 },
  { file: 'wands.md', arcana: 'minor', suit: 'wands', expect: 14 },
  { file: 'cups.md', arcana: 'minor', suit: 'cups', expect: 14 },
  { file: 'swords.md', arcana: 'minor', suit: 'swords', expect: 14 },
  { file: 'pentacles.md', arcana: 'minor', suit: 'pentacles', expect: 14 },
]

/** md 라벨 → JSON 키 */
const ORIENTATION_FIELDS = {
  핵심: 'core',
  종합: 'general',
  애정: 'love',
  금전: 'money',
  직업: 'career',
  조언: 'advice',
}

const errors = []
const fail = (msg) => errors.push(msg)

/** `- **라벨:** 값` 한 줄에서 값 추출 */
function field(block, label) {
  const m = block.match(new RegExp(`^-\\s*\\*\\*${label}:\\*\\*\\s*(.+)$`, 'm'))
  return m ? m[1].trim() : null
}

/** `### 정방향` / `### 역방향` 아래, 다음 `### ` 또는 카드 끝까지의 블록 */
function parseOrientation(cardBody, heading, cardLabel) {
  const marker = `### ${heading}`
  const start = cardBody.indexOf(marker)
  if (start === -1) {
    fail(`${cardLabel}: "${marker}" 섹션 없음`)
    return null
  }
  const after = cardBody.slice(start + marker.length)
  const next = after.indexOf('\n### ')
  const block = next === -1 ? after : after.slice(0, next)

  const out = {}
  for (const [label, key] of Object.entries(ORIENTATION_FIELDS)) {
    const value = field(block, label)
    if (!value) fail(`${cardLabel} > ${heading}: "${label}" 필드 없음`)
    out[key] = value ?? ''
  }
  return out
}

function parseFile(raw, spec) {
  // `## {번호}. {한글이름} ({English Name})` 기준으로 카드 분할
  const chunks = raw.split(/^##\s+(?=\d+\.)/m).slice(1)
  const cards = []

  for (const chunk of chunks) {
    const body = '## ' + chunk
    const head = body.match(/^##\s+(\d+)\.\s*(.+?)\s*\((.+?)\)\s*$/m)
    if (!head) {
      fail(`${spec.file}: 카드 제목 형식 오류 — "${body.split('\n')[0]}"`)
      continue
    }

    const [, numStr, name, nameEn] = head
    const number = Number(numStr)
    const id = spec.arcana === 'major' ? `major-${number}` : `${spec.suit}-${number}`
    const label = `${spec.file} > ${id} ${name}`

    const keywordsRaw = field(body, '키워드')
    if (!keywordsRaw) fail(`${label}: "키워드" 필드 없음`)
    const symbolism = field(body, '상징')
    if (!symbolism) fail(`${label}: "상징" 필드 없음`)

    cards.push({
      id,
      name,
      nameEn,
      arcana: spec.arcana,
      suit: spec.suit,
      number,
      keywords: keywordsRaw ? keywordsRaw.split(',').map((k) => k.trim()).filter(Boolean) : [],
      symbolism: symbolism ?? '',
      upright: parseOrientation(body, '정방향', label) ?? {},
      reversed: parseOrientation(body, '역방향', label) ?? {},
    })
  }

  if (cards.length !== spec.expect) {
    fail(`${spec.file}: 카드 ${spec.expect}장이어야 하는데 ${cards.length}장 파싱됨`)
  }
  return cards
}

const verifyOnly = process.argv.includes('--verify')
const all = []

for (const spec of SOURCES) {
  const raw = await readFile(join(CARDS_DIR, spec.file), 'utf8')
  all.push(...parseFile(raw, spec))
}

// 전역 검증
if (all.length !== 78) fail(`전체 78장이어야 하는데 ${all.length}장`)

const ids = new Set()
for (const card of all) {
  if (ids.has(card.id)) fail(`중복 id: ${card.id}`)
  ids.add(card.id)
  if (card.keywords.length === 0) fail(`${card.id}: 키워드가 비어 있음`)
}

if (errors.length > 0) {
  console.error(`\n카드 데이터 검증 실패 — ${errors.length}건\n`)
  for (const e of errors) console.error(`  · ${e}`)
  process.exit(1)
}

const summary = SOURCES.map(
  (s) => `${s.file.replace('.md', '')} ${all.filter((c) => (s.suit ? c.suit === s.suit : c.arcana === 'major')).length}`
).join(' · ')

if (verifyOnly) {
  console.log(`검증 통과 — 78장 (${summary})`)
} else {
  const json = JSON.stringify(all, null, 2) + '\n'
  for (const out of OUT_FILES) {
    await mkdir(dirname(out), { recursive: true })
    await writeFile(out, json, 'utf8')
  }
  console.log(`생성 완료 — 78장 (${summary})`)
  for (const out of OUT_FILES) console.log(`  · ${relative(ROOT, out)}`)
}
