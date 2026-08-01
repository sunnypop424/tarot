/**
 * **'화면에 보이기' 토글이 라벨과 같은 줄에 있는가.**
 *
 *   node scripts/verify-editor-toggle.mjs
 *
 * 제목·부제 칸은 `[라벨 ────── 토글]` 한 줄 뒤에 입력칸이 오는 모양이다. 그런데
 * `<Field label="부제">` 안에 토글을 넣으면 **`Field` 가 라벨을 자기 줄에 그려서**
 * 토글이 아랫줄로 밀린다 — "부제 / 화면에 보이기 / 입력칸" 세 줄이 된다.
 *
 * 화면이 깨지지도, 타입이 틀리지도 않는다. 같은 편집기 안에서 어떤 서비스는 두 줄,
 * 어떤 서비스는 세 줄로 보일 뿐이라 나란히 놓고 봐야 알아챈다.
 *
 * 그래서 소스에서 센다: `ShowToggle` 을 쓰는 자리는 **`Field` 안이 아니어야** 한다.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const DIR = 'src/owner/service'
let failed = 0
let checked = 0

for (const file of readdirSync(DIR).filter((f) => f.endsWith('Card.tsx'))) {
  const path = join(DIR, file)
  const src = readFileSync(path, 'utf8')
  if (!src.includes('<ShowToggle')) continue

  /**
   * `<Field …>` 부터 `</Field>` 까지를 잘라 그 안에 토글이 있는지 본다.
   * 중첩 `Field` 는 이 저장소에 없어서 단순 짝맞춤으로 충분하다.
   */
  const bad = []
  const re = /<Field\b([^>]*)>([\s\S]*?)<\/Field>/g
  let m
  while ((m = re.exec(src))) {
    checked++
    if (!m[2].includes('<ShowToggle')) continue
    const label = /label="([^"]*)"/.exec(m[1])?.[1] ?? '(라벨 없음)'
    bad.push(label)
  }

  if (bad.length) {
    console.log(`✗ ${path} — Field 안의 토글: ${bad.join(' · ')} (라벨 줄로 옮기세요)`)
    failed++
  } else {
    console.log(`✓ ${path}`)
  }
}

console.error(
  failed === 0
    ? `\n토글이 전부 라벨 줄에 있어요 (Field ${checked}개 확인)`
    : `\n${failed}개 파일에서 토글이 아랫줄로 밀려요`
)
process.exit(failed === 0 ? 0 : 1)
