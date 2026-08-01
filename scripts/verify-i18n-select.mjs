/**
 * **`_i18n` 컬럼을 읽어 오기는 하나.**
 *
 *   node scripts/verify-i18n-select.mjs
 *
 * 주최자가 적는 값의 다국어는 `name_i18n`·`title_i18n` 같은 **옆 컬럼**에 산다
 * (`0046`·`0047`). 그런데 컬럼을 만들고, 타입에 넣고, 저장까지 해 놓고 **읽는 자리에서만
 * 빠지는** 사고가 난다 — 설문 제목·선택지와 포토카드 이름이 실제로 그랬다.
 *
 * 이게 지독한 이유는 **아무것도 안 깨지기 때문**이다. `pick()` 은 늘 `undefined` 를 받아
 * 원문(한국어)으로 떨어지고, 화면은 멀쩡하다. 타입 검사도 통과한다(값이 `null` 일 뿐이다).
 * 번역 검사도 통과한다 — 그건 **우리가 쓴 문구**를 보지 사람이 적은 값을 안 본다.
 * 사람이 눈으로 "어? 여기만 한국어네" 하고 알아채는 수밖에 없었다.
 *
 * 그래서 소스를 읽어 대조한다: 저장(`upsert`/`insert`)에 `X_i18n` 을 쓰는 파일이라면,
 * 같은 파일의 `.select(...)` 문자열 중 그 표를 읽는 것에도 `X_i18n` 이 있어야 한다.
 *
 * `select('*')` 는 통과다 — 별표는 새 컬럼도 같이 데려온다.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const DIR = 'src/lib/repo'
let failed = 0
const bad = (label, note) => {
  console.log(`✗ ${label} — ${note}`)
  failed++
}

for (const file of readdirSync(DIR).filter((f) => f.endsWith('.ts'))) {
  const path = join(DIR, file)
  const src = readFileSync(path, 'utf8')

  /**
   * 이 파일이 다루는 `_i18n` 컬럼들. 저장하는 쪽(`name_i18n: …`)에서 모은다 —
   * 거기 있으면 읽는 쪽에도 있어야 한다는 게 이 검사의 전부다.
   */
  const cols = new Set([...src.matchAll(/\b(\w+_i18n)\s*:/g)].map((m) => m[1]))
  if (cols.size === 0) continue

  /**
   * `.select('…')` 안의 문자열들. 여러 줄에 걸쳐 있어도 잡히게 따옴표 안만 본다.
   * 백틱·템플릿은 그대로 두면 `${COLS}` 같은 조각이 섞이는데, 그 조각도 같은 파일의
   * 문자열 상수라 아래에서 함께 훑는다 (파일 전체를 한 덩어리로 본다).
   */
  const selects = [...src.matchAll(/\.select\(\s*([`'"])([\s\S]*?)\1/g)].map((m) => m[2])

  /**
   * 상수로 뺀 컬럼 목록(`const COLS = '…'`)도 읽는 자리로 친다.
   *
   * **이걸 `selects` 와 함께 세지 않으면 검사가 통째로 헛돈다.** `.select(SELECT)` 처럼
   * 상수를 넘기는 파일은 따옴표가 안 잡혀 `selects` 가 빈 배열이 되는데, 거기서 바로
   * 넘겨 버리면 정작 사고가 났던 `poll.ts` 가 검사 대상에서 빠진다 (실제로 그랬다 —
   * 일부러 컬럼을 지워 놓고 돌렸더니 "다 읽어 와요" 가 나왔다).
   */
  const consts = [...src.matchAll(/const\s+\w*(?:COLS|SELECT)\w*\s*=\s*(?:\r?\n\s*)?([`'"])([\s\S]*?)\1/g)].map(
    (m) => m[2]
  )
  const all = [...selects, ...consts]
  if (all.length === 0) continue

  // 별표 하나라도 있으면 그 파일은 통과 — 새 컬럼을 알아서 데려온다
  if (all.some((s) => s.trim() === '*')) continue

  const readable = all.join(' | ')

  for (const col of cols) {
    // 그 컬럼을 **저장**만 하고 읽는 문장이 아예 없는 파일도 있다 (쓰기 전용 어댑터)
    const base = col.replace(/_i18n$/, '')
    if (!new RegExp(`\\b${base}\\b`).test(readable)) continue
    if (readable.includes(col)) continue
    bad(`${path} · ${col}`, `저장은 하는데 select 에 없어요 — 화면은 늘 원문으로 떨어져요`)
  }
}

console.error(failed === 0 ? '\n_i18n 컬럼을 다 읽어 와요' : `\n${failed}곳이 빠졌어요`)
process.exit(failed === 0 ? 0 : 1)
