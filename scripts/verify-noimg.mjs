/**
 * `<img>` 금지 규칙의 회귀 검사 — **소스를 읽는다. 서버도 브라우저도 필요 없다.**
 *
 *   node scripts/verify-noimg.mjs
 *
 * 슬롯 이미지(로고·배경·카드 앞뒷면·프레임)를 `<img>` 로 그리면 모바일에서 길게 눌러
 * 저장된다 — 주최자가 돈 주고 만든 자산이라 그러면 안 된다 (CLAUDE.md).
 *
 * 예외는 `src/components/SavableImage.tsx` 하나뿐이고, 그 파일이 받는 값은
 * `src/lib/compose.ts` 만 만들 수 있는 `ResultImage` 라 **슬롯 자산 URL 은 타입상 못 들어간다.**
 * 이 스크립트는 그 예외가 하나로 유지되는지만 본다 — 타입이 못 잡는 건 "새 `<img>` 가
 * 늘었는가" 뿐이라서다.
 *
 * 검사 대상에서 주석은 뺀다: 규칙을 설명하는 주석에 `<img>` 라는 글자가 자주 나온다.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = 'src'
const ALLOWED = ['src/components/SavableImage.tsx']

let failed = 0
const check = (name, ok, detail = '') => {
  if (!ok) failed++
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

/** 블록·줄 주석과 문자열을 지운 뒤 본다 (주석 속 `<img>` 는 설명이지 코드가 아니다) */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(tsx|ts)$/.test(name)) out.push(p)
  }
  return out
}

const offenders = []
for (const file of walk(ROOT)) {
  const rel = relative('.', file).replaceAll('\\', '/')
  const code = stripComments(readFileSync(file, 'utf8'))
  // JSX 여는 태그만 — `<image>`(SVG)나 `<imgSomething>` 은 아니다
  const hits = code.match(/<img[\s/>]/g)
  if (hits && !ALLOWED.includes(rel)) offenders.push(`${rel} (${hits.length}개)`)
}

check(
  '**`<img>` 는 SavableImage.tsx 에만 있다**',
  offenders.length === 0,
  offenders.length ? offenders.join(' · ') : `예외 ${ALLOWED.length}곳`
)

// 예외 파일이 실제로 존재하고 ResultImage 만 받는지 (통째로 지우고 규칙만 남는 걸 막는다)
{
  const src = readFileSync(ALLOWED[0], 'utf8')
  check(
    '예외 파일은 `ResultImage` 만 받는다 (문자열 URL 을 못 넣는다)',
    /image:\s*ResultImage/.test(src) && /<img/.test(src),
    ALLOWED[0]
  )
}

// `compose.ts` 만 ResultImage 를 만든다 — 다른 데서 캐스팅으로 만들면 예외가 샌다
{
  const minters = walk(ROOT)
    .filter((f) => {
      const rel = relative('.', f).replaceAll('\\', '/')
      if (rel === 'src/lib/compose.ts') return false
      return /as unknown as ResultImage|as ResultImage/.test(readFileSync(f, 'utf8'))
    })
    .map((f) => relative('.', f).replaceAll('\\', '/'))
  check(
    '**`ResultImage` 를 만드는 곳은 compose.ts 뿐이다** (캐스팅으로 못 만든다)',
    minters.length === 0,
    minters.join(' · ') || '없음'
  )
}

console.log(failed === 0 ? '\n전부 통과' : `\n${failed}개 실패`)
process.exit(failed === 0 ? 0 : 1)
