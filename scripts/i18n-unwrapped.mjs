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
const dictSrc = ['src/i18n/en.ts', 'src/i18n/admin.en.ts', 'src/i18n/admin2.en.ts', 'src/i18n/landing.en.ts']
  .map((p) => readFileSync(p, 'utf8'))
  .join('\n')
const KEYS = [...dictSrc.matchAll(/^ {2}'([^']+)':/gm)].map((m) => m[1])

/** 정규식 특수문자 이스케이프 — 사전 키에 `?`·`(`·`·` 이 흔하다 */
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const found = new Map()
const constants = new Map()

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
       *
       * **자리를 셋으로 가른다** — 바로 앞 글자를 본다:
       *   `t(` 이면 이미 감싼 것.
       *   `:` `=` `,` `[` 이면 **상수 선언 자리** — 규칙상 감싸면 안 되고(모듈 상수엔 `t` 가
       *   없다), 한국어로 두고 **렌더 자리에서** `t(item.label)` 로 번역한다. 그래서 본 숫자에
       *   안 넣고 따로 보여준다 — 렌더 쪽이 감쌌는지는 사람이 확인해야 한다 (변수를 따라갈 수
       *   없어 기계로는 못 본다).
       *   그 밖이면 진짜 안 감싼 자리다.
       */
      const q = esc(ko)
      const standalone = new RegExp(`(['"\`])${q}\\1|>\\s*${q}\\s*<`, 'g')
      let bare = 0
      let decl = 0
      for (const m of src.matchAll(standalone)) {
        const before = src.slice(Math.max(0, m.index - 8), m.index)
        if (/t\($/.test(before)) continue // 감쌌다
        // `new Error('…')` 도 상수 취급 — 모듈 파일이라 훅을 못 쓰고, **보여주는 쪽**이
        // `t(e.message)` 로 번역한다 (QuizApp 의 catch 가 그 예)
        if (/[:=,[?]\s*$|Error\($/.test(before)) decl++
        else bare++
      }
      if (bare > 0) {
        if (!found.has(ko)) found.set(ko, [])
        found.get(ko).push(`${file} (${bare}곳)`)
      } else if (decl > 0) {
        if (!constants.has(ko)) constants.set(ko, [])
        constants.get(ko).push(file)
      }
    }
  }
}

const keys = [...found.keys()].sort((a, b) => a.localeCompare(b, 'ko'))
for (const k of keys) {
  console.log(k)
  for (const where of found.get(k)) console.log(`    ${where}`)
}
if (constants.size) {
  console.log(`\n── 상수 선언 자리 ${constants.size}종 — 감싸지 말고, 렌더 쪽이 t() 하는지만 확인 ──`)
  for (const k of [...constants.keys()].sort((a, b) => a.localeCompare(b, 'ko'))) {
    console.log(`${k}  ←  ${[...new Set(constants.get(k))].join(' · ')}`)
  }
}
console.error(`\n${keys.length}종이 사전에 있는데 안 감싸져 있어요 (${arg})`)
