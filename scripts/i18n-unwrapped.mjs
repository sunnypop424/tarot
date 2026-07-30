/**
 * **사전에는 있는데 `t()` 로 안 감싼 자리**를 찾는다.
 *
 *   node scripts/i18n-unwrapped.mjs visitor
 *   node scripts/i18n-unwrapped.mjs admin
 *
 * `i18n-scan --missing` 은 "사전에 없는 문장" 을 세고, 이건 반대다 — **번역은 해 뒀는데
 * 화면이 안 쓰는 자리.** 둘 다 0 이어야 그 화면이 진짜로 번역된 것이다.
 *
 * 이게 왜 생기나: `i18n-wrap.mjs` 는 안전한 세 자리만 감싼다(속성값·JSX 텍스트·`{'…'}`).
 * 객체 리터럴 값, 삼항 안, 템플릿 문자열, 함수 인자에 있는 문장은 **일부러** 건드리지 않는다 —
 * 잘못 감싸면 문법이 깨지기 때문이다. 그래서 그런 자리는 사람이 손으로 옮겨야 하고,
 * 이 스크립트가 그 목록을 준다.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const VISITOR = [
  'src/screens', 'src/components', 'src/data', 'src/luckydraw', 'src/rolling', 'src/wish',
  'src/photozone', 'src/poll', 'src/stamp', 'src/quiz', 'src/photocard', 'src/cheer', 'src/staff',
]
const ADMIN = ['src/admin']

const arg = process.argv[2] ?? 'visitor'
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

const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/** 사전에 있는 문장들 — 방문자·주최자 사전을 합쳐 본다 */
const dictSrc = ['src/i18n/en.ts', 'src/i18n/admin.en.ts']
  .map((p) => readFileSync(p, 'utf8'))
  .join('\n')
const KEYS = [...dictSrc.matchAll(/^ {2}'([^']+)':/gm)].map((m) => m[1])

/** 정규식 특수문자 이스케이프 — 사전 키에 `?`·`(`·`·` 이 흔하다 */
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const found = new Map()

for (const root of roots) {
  for (const file of walk(root)) {
    const src = stripComments(readFileSync(file, 'utf8'))
    for (const ko of KEYS) {
      if (!src.includes(ko)) continue
      /**
       * **부분 문자열을 세면 안 된다.** '개' 는 '몇 개를 뽑을까요?' 안에도 있어서, 단순히
       * `includes` 로 세면 이미 다 감싼 파일도 "안 감쌌다" 로 나온다 (실제로 159종이 나왔다).
       *
       * 그래서 `i18n-wrap.mjs` 가 **실제로 감쌀 수 있는 자리**와 같은 모양만 센다:
       * 따옴표로 감싼 문장 전체이거나, JSX 텍스트 노드로 홀로 선 자리.
       * 그 밖(다른 문장 속 글자, 이미 `t(...)` 안)은 셀 이유가 없다.
       */
      const q = esc(ko)
      const standalone = new RegExp(
        // 'ko'  "ko"  `ko`   또는   >ko<
        `(['"\`])${q}\\1|>\\s*${q}\\s*<`,
        'g'
      )
      const wrappedRe = new RegExp(`t\\((['"\`])${q}\\1`, 'g')
      const all = (src.match(standalone) ?? []).length
      const wrapped = (src.match(wrappedRe) ?? []).length
      if (all > wrapped) {
        if (!found.has(ko)) found.set(ko, [])
        found.get(ko).push(`${file} (${all - wrapped}곳)`)
      }
    }
  }
}

const keys = [...found.keys()].sort((a, b) => a.localeCompare(b, 'ko'))
for (const k of keys) {
  console.log(k)
  for (const where of found.get(k)) console.log(`    ${where}`)
}
console.error(`\n${keys.length}종이 사전에 있는데 안 감싸져 있어요 (${arg})`)
