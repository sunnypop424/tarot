/**
 * **정의되지 않은 CSS 변수를 쓰는 자리**를 찾는다.
 *
 *   node scripts/verify-tokens.mjs
 *
 * 이 검사가 생긴 이유: `LangPicker.module.css` 가 `var(--color-fg2)` 라고 적고 있었다.
 * 실제 토큰은 `--color-fg-1`·`--color-fg-2` 로 **하이픈이 있다.** 없는 변수를 쓰면 그
 * `color` 선언이 통째로 무효가 되고 색이 부모에서 상속되는데, 밝은 배경에서는 우연히
 * 읽히고 **어두운 배경 슬롯에서만 글자가 사라졌다.**
 *
 * 이런 오타는 빌드도 타입 검사도 안 잡고, 화면이 깨지지도 않는다 — 글자만 사라진다.
 * 그래서 눈으로는 원인을 못 찾고, 슬롯 색을 바꿔봐야 재현된다. 기계가 볼 일이다.
 *
 * **폴백이 있으면 봐준다.** `var(--ld-modal-bg, var(--color-surface))` 의 앞 변수는
 * 런타임에 JS 가 심는 값이라(`LuckydrawApp` 의 `root.style.setProperty`) CSS 어디에도
 * 선언이 없는 게 정상이다. 폴백이 그 자리를 지키므로 문제가 아니다.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOTS = ['src']

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (p.endsWith('.css')) out.push(p)
  }
  return out
}

const files = ROOTS.flatMap(walk)
const sources = files.map((f) => [f, readFileSync(f, 'utf8')])

/**
 * **`tokens.css` 가 주는 이름만 본다.**
 *
 * 서비스별 변수(`--wt-*`·`--ld-*`·`--cp-*`)는 JS 가 인라인 스타일이나 `setProperty` 로
 * 심는다 — CSS 어디에도 선언이 없는 게 정상이라 전부 검사하면 오탐 460개가 나온다
 * (실제로 그랬다). 그 목록은 아무도 안 읽는다.
 *
 * 반대로 **디자인 토큰은 선언 자리가 하나**라(`tokens.css`), 여기서 못 찾은 이름은
 * 예외 없이 오타다. 좁게 보는 대신 확실하게 잡는다.
 */
const TOKEN_PREFIX = /^--(color|space|radius|text|shadow|weight|dur|ease|font|z)-/

const defined = new Set()
for (const [, src] of sources) {
  for (const m of src.matchAll(/(--[\w-]+)\s*:/g)) defined.add(m[1])
}

const bad = []
for (const [file, src] of sources) {
  const lines = src.split('\n')
  lines.forEach((line, i) => {
    // 폴백이 없는 var() 만 본다 — `var(--x, …)` 는 폴백이 자리를 지킨다
    for (const m of line.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)) {
      const name = m[1]
      if (!TOKEN_PREFIX.test(name)) continue // 런타임이 심는 서비스 변수 — 선언이 없는 게 정상
      if (defined.has(name)) continue
      bad.push({ file, line: i + 1, name, text: line.trim() })
    }
  })
}

for (const b of bad) {
  console.log(`${b.file}:${b.line}  ${b.name}`)
  console.log(`    ${b.text}`)
  // 가장 흔한 사고 — 하이픈 하나 차이. 비슷한 이름을 짚어 준다
  const near = [...defined].filter(
    (d) => d.replace(/-/g, '') === b.name.replace(/-/g, '')
  )
  if (near.length) console.log(`    → 혹시 ${near.join(' · ')} ?`)
}

console.error(`\n${bad.length}자리가 정의되지 않은 변수를 폴백 없이 쓰고 있어요`)
process.exit(bad.length === 0 ? 0 : 1)
