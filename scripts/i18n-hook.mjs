/**
 * `t()` 를 쓰는데 `useT()` 를 안 부른 컴포넌트에 **훅을 넣는다.**
 *
 *   node scripts/i18n-hook.mjs src/poll/PollApp.tsx [--write]
 *
 * `i18n-wrap.mjs` 가 문장을 감싸고 나면 `t` 가 정의되지 않은 컴포넌트가 생긴다.
 * 그걸 손으로 서른 파일에 넣는 대신 여기서 한다.
 *
 * ── 어디에 넣나 ──────────────────────────────────────
 *
 * **`t(` 를 쓰는 함수 컴포넌트의 첫 줄**에 넣는다. 파일 하나에 컴포넌트가 여럿인 경우가
 * 흔해서(`WishApp` 은 나무·작성이 따로다) 파일 단위로 한 번만 넣으면 안 된다.
 *
 * 컴포넌트 판정은 **대문자로 시작하는 함수 선언**이다 — React 규칙이 그렇고, 이 코드베이스도
 * 예외가 없다. 화살표 함수에 담긴 컴포넌트는 이 코드베이스에 없어서 안 다룬다(있으면 손으로).
 *
 * 완벽한 파서가 아니다. `--write` 뒤에 `npx tsc --noEmit` 으로 확인한다.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const file = process.argv[2]
const write = process.argv.includes('--write')
if (!file) {
  console.error('사용법: node scripts/i18n-hook.mjs <파일> [--write]')
  process.exit(1)
}

const src = readFileSync(file, 'utf8')
const lines = src.split(/\r?\n/)

/** 대문자로 시작하는 함수 선언 — `function Wall({...}) {` · `export default function App() {` */
const COMPONENT = /^(?:export\s+)?(?:default\s+)?function\s+([A-Z]\w*)\s*\(/

/** 이 줄이 컴포넌트 본문 시작인가 — 여는 중괄호가 그 줄에서 닫히는 지점 */
function bodyStart(from) {
  let depth = 0
  for (let i = from; i < lines.length && i < from + 40; i++) {
    for (const ch of lines[i]) {
      if (ch === '(') depth++
      else if (ch === ')') depth--
    }
    if (depth === 0 && lines[i].includes('{')) return i
  }
  return -1
}

// 컴포넌트 경계를 모은다
const comps = []
lines.forEach((line, i) => {
  const m = COMPONENT.exec(line)
  if (m) comps.push({ name: m[1], declLine: i })
})
for (let i = 0; i < comps.length; i++) {
  comps[i].endLine = i + 1 < comps.length ? comps[i + 1].declLine - 1 : lines.length - 1
  comps[i].bodyLine = bodyStart(comps[i].declLine)
}

const inserts = []
for (const c of comps) {
  if (c.bodyLine < 0) continue
  const body = lines.slice(c.bodyLine, c.endLine + 1).join('\n')
  // 이미 훅이 있으면 건너뛴다
  if (/const\s+t\s*=\s*useT\(\)/.test(body)) continue
  // 이 컴포넌트 안에서 t( 를 쓰나 — `useT(` 자체는 빼고 본다
  if (!/(?<![\w.])t\(/.test(body.replace(/useT\(/g, ''))) continue
  inserts.push({ at: c.bodyLine + 1, name: c.name })
}

if (inserts.length === 0) {
  console.log(`${file} — 넣을 게 없어요`)
  process.exit(0)
}

if (!write) {
  console.log(`${file} — ${inserts.length}개 컴포넌트: ${inserts.map((i) => i.name).join(', ')}`)
  process.exit(0)
}

// 뒤에서부터 넣어야 앞쪽 줄번호가 안 밀린다
const out = [...lines]
for (const ins of [...inserts].reverse()) {
  out.splice(ins.at, 0, '  const t = useT()')
}

let result = out.join('\n')
/**
 * import 는 파일당 한 번만.
 *
 * **import 가 하나도 없는 파일이 있다** (`NotFound.tsx`) — 그때 `lastIndexOf` 가 -1 이라
 * 파일 맨 앞 줄바꿈을 찾고, 그 자리가 하필 머리말 블록 주석 **안쪽**이었다.
 * 그래서 import 가 주석 안에 박혔다. import 가 없으면 맨 위에 넣는다.
 */
if (!/from '@\/i18n'/.test(result)) {
  const lastImport = result.lastIndexOf('\nimport ')
  if (lastImport < 0) {
    result = "import { useT } from '@/i18n'\n\n" + result
  } else {
    const eol = result.indexOf('\n', lastImport + 1)
    result = result.slice(0, eol) + "\nimport { useT } from '@/i18n'" + result.slice(eol)
  }
}

writeFileSync(file, result, 'utf8')
console.log(`${file} — ${inserts.length}개 컴포넌트에 훅을 넣었어요: ${inserts.map((i) => i.name).join(', ')}`)
