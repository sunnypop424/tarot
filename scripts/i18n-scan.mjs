/**
 * 화면에 보이는 한국어 문장을 긁어 온다 — **번역 사전을 손으로 채우기 위한 목록.**
 *
 *   node scripts/i18n-scan.mjs visitor     ← 방문자 화면
 *   node scripts/i18n-scan.mjs admin       ← 주최자 화면
 *   node scripts/i18n-scan.mjs --missing   ← 사전(en.ts)에 아직 없는 것만
 *
 * **주석을 뺀다.** 이 코드베이스는 주석이 본문보다 많고 전부 한국어라, 안 빼면 목록의
 * 아홉 할이 설계 설명이다.
 *
 * 완벽한 파서가 아니다 — 문자열 리터럴과 JSX 텍스트를 정규식으로 집는다. 놓치는 게 있고
 * 아닌 걸 집는 것도 있다. 사람이 보고 고르라고 만든 목록이지 자동 변환 도구가 아니다.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const VISITOR = [
  'src/screens',
  'src/components',
  // **화면 문구가 여기에도 있다** — 카테고리 이름·안내·판정 문구. 빼먹어서 한참 못 봤다
  'src/data',
  'src/luckydraw',
  'src/rolling',
  'src/wish',
  'src/photozone',
  'src/poll',
  'src/stamp',
  'src/quiz',
  'src/photocard',
  'src/cheer',
  'src/staff',
]
const ADMIN = ['src/admin']

const arg = process.argv[2] ?? 'visitor'
const onlyMissing = process.argv.includes('--missing')
const roots = arg === 'admin' ? ADMIN : arg === 'all' ? [...VISITOR, ...ADMIN] : VISITOR

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (/\.tsx?$/.test(p)) out.push(p)
  }
  return out
}

/** 주석을 지운다 — 블록(/* … *\/)과 줄(//) 둘 다 */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

const HANGUL = /[가-힣]/

/** 문자열 리터럴과 JSX 텍스트 노드 */
const PATTERNS = [
  /'([^'\\\n]*)'/g,
  /"([^"\\\n]*)"/g,
  /`([^`\\$\n]*)`/g,
  />([^<>{}\n]+)</g,
]

const found = new Map() // 문장 → 파일들

for (const root of roots) {
  for (const file of walk(root)) {
    const src = stripComments(readFileSync(file, 'utf8'))
    for (const re of PATTERNS) {
      for (const m of src.matchAll(re)) {
        const text = (m[1] ?? '').trim()
        if (!text || !HANGUL.test(text)) continue
        // import 경로·클래스 이름에 한글이 들어갈 일은 없다 — 그래도 눈에 띄는 것만 거른다
        if (text.startsWith('@/') || text.includes('\n')) continue
        if (!found.has(text)) found.set(text, new Set())
        found.get(text).add(file)
      }
    }
  }
}

let keys = [...found.keys()].sort((a, b) => a.localeCompare(b, 'ko'))

if (onlyMissing) {
  /**
   * **사전이 둘이다** — 방문자(`en.ts`)와 주최자(`admin.en.ts`). 읽는 사람이 달라 파일을
   * 나눴으므로(`admin.en.ts` 머리말) 여기서도 둘 다 봐야 한다. 한쪽만 보면 이미 번역한 것을
   * "아직 없음" 으로 세어, 다 해놓고도 안 끝난 것처럼 보인다.
   */
  const dict = ['src/i18n/en.ts', 'src/i18n/admin.en.ts'].map((p) => readFileSync(p, 'utf8')).join('\n')
  keys = keys.filter((k) => !dict.includes(`'${k}'`) && !dict.includes(`"${k}"`))
}

for (const k of keys) console.log(k)
console.error(`\n${keys.length}개 (${arg}${onlyMissing ? ' · 사전에 없는 것만' : ''})`)
