/**
 * 화면 문장을 `t()` 로 감싸는 **기계적인 변환**.
 *
 *   node scripts/i18n-wrap.mjs src/poll/PollApp.tsx          ← 미리보기 (안 고친다)
 *   node scripts/i18n-wrap.mjs src/poll/PollApp.tsx --write   ← 실제로 고친다
 *
 * 감싸는 건 **사전에 이미 있는 문장만**이다. 사전에 없는 문장은 건드리지 않는다 —
 * 감싸 봐야 한국어 그대로 나오고, 나중에 사전을 채울 때 `i18n-scan --missing` 이
 * 못 찾게 되기 때문이다(감싼 것과 안 감싼 것을 구분할 수 없어진다).
 *
 * ── 세 가지 자리만 건드린다 ──────────────────────────
 *
 *   1. JSX 텍스트 노드        `>메시지<`            → `>{t('메시지')}<`
 *   2. 문자열 속성            `placeholder="이름"`  → `placeholder={t('이름')}`
 *   3. JSX 안 문자열 표현식   `{'이름'}`            → `{t('이름')}`
 *
 * **주석·import·CSS 클래스·객체 키는 안 건드린다.** 완벽한 파서가 아니므로 `--write` 전에
 * 미리보기로 확인하고, 고친 뒤에는 `npx tsc --noEmit` 과 verify 를 돌린다.
 *
 * 이 스크립트를 남겨 두는 이유: 화면이 늘 때마다 같은 일을 손으로 1,500번 하지 않기 위해서다.
 */
import { readFileSync, writeFileSync } from 'node:fs'

import { EN } from '../src/i18n/en.ts'
import { ADMIN_EN } from '../src/i18n/admin.en.ts'
import { ADMIN2_EN } from '../src/i18n/admin2.en.ts'
import { LANDING_EN } from '../src/i18n/landing.en.ts'

const file = process.argv[2]
const write = process.argv.includes('--write')
if (!file) {
  console.error('사용법: node scripts/i18n-wrap.mjs <파일> [--write]')
  process.exit(1)
}

/** 사전에 있는 문장만 — 긴 것부터 봐야 짧은 것이 긴 것 안을 먼저 먹지 않는다.
 *  사전 셋을 다 합친다 (`index.tsx` 의 `DICTS` 와 같은 판단 — 화면은 어차피 `t()` 하나다) */
const KEYS = Object.keys({ ...EN, ...ADMIN_EN, ...ADMIN2_EN, ...LANDING_EN }).sort((a, b) => b.length - a.length)
const KEYSET = new Set(KEYS)

const src = readFileSync(file, 'utf8')
const lines = src.split(/\r?\n/)

/** 주석 줄인가 — 블록 주석 안쪽은 `*` 로 시작한다 (이 코드베이스의 규칙) */
let inBlock = false
const isComment = (line) => {
  const t = line.trim()
  if (inBlock) {
    if (t.includes('*/')) inBlock = false
    return true
  }
  if (t.startsWith('/*')) {
    if (!t.includes('*/')) inBlock = true
    return true
  }
  return t.startsWith('//') || t.startsWith('*')
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
let count = 0
const hits = []

const out = lines.map((line) => {
  if (isComment(line)) return line
  // import 줄엔 한글이 올 일이 없고, 와도 경로다
  if (/^\s*import\b/.test(line)) return line

  let next = line
  for (const ko of KEYS) {
    if (!next.includes(ko)) continue

    const before = next

    const q = esc(ko)

    // 1. 속성값  attr="문장"  또는 attr='문장'
    next = next.replace(new RegExp(`([a-zA-Z-]+)=(["'])${q}\\2`, 'g'), `$1={t('${ko}')}`)

    // 2. JSX 안 문자열 표현식  {'문장'}  {"문장"}
    next = next.replace(new RegExp(`\\{(["'])${q}\\1\\}`, 'g'), `{t('${ko}')}`)

    /*
     * 3. JSX 텍스트 노드 — `>문장<` 또는 한 줄을 통째로 차지하는 텍스트.
     */
    next = next.replace(new RegExp(`>\\s*${q}\\s*<`, 'g'), `>{t('${ko}')}<`)
    if (next.trim() === ko) next = next.replace(ko, `{t('${ko}')}`)

    /*
     * 4. **삼항 · 기본값** — `cond ? '가' : '나'` · `x || '문장'` · `x ?? '문장'`.
     *    화면 문구의 절반이 여기 있다(마감/진행 중, 저장 중/저장하기 …). 처음엔 안 건드렸는데
     *    그래서 방문자 화면에 한국어가 잔뜩 남았다.
     */
    next = next.replace(new RegExp(`([?:]|\\|\\||\\?\\?)(\\s*)(["'])${q}\\3`, 'g'), `$1$2t('${ko}')`)

    /*
     * 5. **화면에 그대로 나가는 함수 인자** — 이름으로 고른다.
     *    아무 함수나 감싸면 안 된다: `localStorage.getItem('키')` 같은 자리를 번역하면
     *    키가 바뀌어 저장소가 통째로 어긋난다. 여기 적힌 것만 문구를 받는 함수다.
     */
    next = next.replace(
      new RegExp(`\\b(toast|setError|setNote|setNotice|setMessage|alert)\\((["'])${q}\\2`, 'g'),
      `$1(t('${ko}')`
    )

    /*
     * 6. **문구를 담는 객체 키** — `title: '문장'` 같은 자리 (`confirmAction`·표 머리말).
     *    키 이름을 못박는다: `id`·`key`·`mode` 처럼 **값이 식별자인** 자리를 감싸면
     *    비교가 깨진다 (`mode === 'sale'` 이 영영 거짓이 된다).
     */
    next = next.replace(
      new RegExp(`\\b(title|desc|okLabel|label|placeholder|hint|unit|note|text|body|sub|badge|detail)(\\s*:\\s*)(["'])${q}\\3`, 'g'),
      `$1$2t('${ko}')`
    )

    if (next !== before) {
      count++
      hits.push(ko)
    }
  }
  return next
})

const result = out.join('\n')

if (!write) {
  console.log(`${file} — ${count}곳 바뀔 예정`)
  for (const h of [...new Set(hits)]) console.log(`  · ${h}`)
  process.exit(0)
}

if (count === 0) {
  console.log(`${file} — 바꿀 게 없어요`)
  process.exit(0)
}

writeFileSync(file, result, 'utf8')
console.log(`${file} — ${count}곳 감쌌어요 (${new Set(hits).size}종)`)
void KEYSET
