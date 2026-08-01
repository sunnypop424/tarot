/**
 * **편집기에 칸이 빠진 설정 찾기.**
 *
 *   node scripts/verify-editor-fields.mjs
 *
 * 서비스 겉모습은 `src/data/<svc>.ts` 의 `<Svc>Display` 가 전부다. 그 값을 정하는 사람은
 * 최고관리자고, 정하는 자리는 슬롯 편집기 하나다. 그래서 **타입에 있는 필드는 편집기에도
 * 칸이 있어야 한다.**
 *
 * 안 그러면 조용히 못 쓰는 설정이 된다 — 포토존의 `logoAlign` 이 실제로 그랬다.
 * 타입에도 있고, 기본값도 있고, 화면도 읽는데(`align={display.logoAlign}`) 편집기에만
 * 칸이 없어서 최고관리자는 기본값에서 바꿀 방법이 없었다. **아무것도 안 깨져서** 빌드도
 * 타입 검사도 통과하고, 화면은 기본값으로 멀쩡히 그려진다.
 *
 * 여기서 재는 것: `<Svc>Display` 의 필드 이름이 그 서비스의 편집기 코드에 나오는가.
 * 나오면 통과다 — 어떤 모양의 칸인지까지는 안 본다(그건 화면 검증의 몫이다).
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'

/** 서비스 → [타입 파일, 편집기 파일들] */
const SERVICES = {
  wish: ['src/data/wish.ts', ['src/owner/service/WishCard.tsx']],
  rolling: ['src/data/rolling.ts', ['src/owner/SlotEditor.tsx']],
  cheer: ['src/data/cheer.ts', ['src/owner/service/CheerCard.tsx']],
  poll: ['src/data/poll.ts', ['src/owner/service/PollCard.tsx']],
  stamp: ['src/data/stamp.ts', ['src/owner/service/StampCard.tsx']],
  quiz: ['src/data/quiz.ts', ['src/owner/service/QuizCard.tsx']],
  photocard: ['src/data/photocard.ts', ['src/owner/service/PhotocardCard.tsx']],
  luckydraw: ['src/data/luckydraw.ts', ['src/owner/service/LuckydrawCard.tsx']],
  photozone: ['src/data/photozone.ts', ['src/owner/service/PhotozoneCard.tsx']],
}

/**
 * 편집기에 칸이 없어도 되는 필드 — **왜인지 여기 적는다.**
 * 적을 이유가 안 떠오르면 그건 빠진 칸이다.
 */
const OK_WITHOUT_FIELD = {
  // 주최자가 언어별로 적는 값이 사는 자리 — 칸은 `I18nRow` 가 값마다 따로 띄운다
  i18n: '언어별 값 묶음 (I18nRow 가 값마다 띄운다)',
}

let failed = 0
const bad = (label, note) => {
  console.log(`✗ ${label} — ${note}`)
  failed++
}

let checked = 0
for (const [svc, [typeFile, editors]] of Object.entries(SERVICES)) {
  if (!existsSync(typeFile)) {
    bad(svc, `${typeFile} 이 없어요 — 이 표를 고치세요`)
    continue
  }
  const src = readFileSync(typeFile, 'utf8')

  /** `export interface XxxDisplay { … }` 안의 최상위 필드 이름 */
  const m = /export interface \w*Display\s*\{([\s\S]*?)\n\}/.exec(src)
  if (!m) {
    bad(svc, `${typeFile} 에서 Display 인터페이스를 못 찾았어요`)
    continue
  }
  const body = m[1]
  // 주석·중첩 객체를 걷어내고 `이름:` 또는 `이름?:` 만 — 들여쓰기 2칸(최상위)만 본다
  const fields = [...body.matchAll(/^ {2}(\w+)\??\s*:/gm)].map((x) => x[1])

  /**
   * 편집기 코드 + **공용 부품 전부**.
   *
   * 칸을 서비스 카드에 직접 안 두고 부품에 맡기는 자리가 있다 — 포토카드의 박스 꾸밈은
   * `BoxFields` 가 통째로 그린다. 카드 파일만 읽으면 그 11개가 "빠진 칸" 으로 잡혀서,
   * 진짜 빠진 칸(`drawLabel` 같은)이 그 소음에 묻힌다.
   */
  const shared = readdirSync('src/owner/service')
    .filter((f) => f.endsWith('.tsx') && !f.endsWith('Card.tsx'))
    .map((f) => `src/owner/service/${f}`)
  const editorSrc = [...editors, ...shared]
    .filter(existsSync)
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n')
  if (!editorSrc) {
    bad(svc, `편집기 파일을 못 읽었어요 — ${editors.join(', ')}`)
    continue
  }

  const missing = []
  for (const f of fields) {
    checked++
    if (f in OK_WITHOUT_FIELD) continue
    // 이름이 편집기 코드 어디든 나오면 통과 (`d.f`·`patch({ f: … })`·`value={d.f}` …)
    if (new RegExp(`\\b${f}\\b`).test(editorSrc)) continue
    missing.push(f)
  }
  if (missing.length) bad(svc, `편집기에 칸이 없는 설정 — ${missing.join(' · ')}`)
  else console.log(`✓ ${svc} — ${fields.length}개 전부 편집기에 있어요`)
}

console.error(
  failed === 0
    ? `\n설정 ${checked}개 전부 편집기에 칸이 있어요`
    : `\n${failed}개 서비스에 빠진 칸이 있어요 (설정 ${checked}개 확인)`
)
process.exit(failed === 0 ? 0 : 1)
