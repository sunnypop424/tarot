/**
 * **부제가 다 같은 이름이고, 다 제목 옆에 있는가.**
 *
 *   node scripts/verify-subtitle.mjs
 *
 * 제목 아래 한 줄은 서비스마다 이름이 달랐다 — `subtitle`·`deckGuide`·`intro`.
 * 이름이 갈리면 두 가지가 같이 어긋난다:
 *
 *  · **정렬**이 안 따라간다. 헤더 밖(`<ServiceHeader/>` 뒤)에 그리면 제목만 움직이고
 *    부제는 왼쪽에 남는다 — 포토존·투표·스탬프가 그랬다.
 *  · **켜고 끄기**가 없다. `showSubtitle` 이 짝으로 안 붙어 있으면 지울 방법이 없다.
 *
 * 눈으로 훑으면 "이건 안내 문구지 부제가 아니지" 하고 넘어가게 된다. 여기서 기계로 센다.
 *
 * 재는 것 — 각 서비스의 `<Svc>Display` 에:
 *  · `subtitle` 이 있나 (다른 이름으로 부제 노릇을 하는 필드가 있나)
 *  · `showSubtitle` 이 짝으로 있나
 *  · 화면이 그 값을 **`ServiceHeader` 의 `below`** 로 그리나 (밖에 그리면 정렬이 안 먹는다)
 */
import { readFileSync, existsSync } from 'node:fs'

/** 헤더(`ServiceHeader`)로 제목을 그리는 서비스만 — 자기 무대를 그리는 셋은 구조가 다르다 */
const SERVICES = {
  wish: ['src/data/wish.ts', 'src/wish/WishApp.tsx'],
  rolling: ['src/data/rolling.ts', 'src/rolling/RollingApp.tsx'],
  cheer: ['src/data/cheer.ts', 'src/cheer/CheerApp.tsx'],
  poll: ['src/data/poll.ts', 'src/poll/PollApp.tsx'],
  stamp: ['src/data/stamp.ts', 'src/stamp/StampApp.tsx'],
  photocard: ['src/data/photocard.ts', 'src/photocard/PhotocardApp.tsx'],
  photozone: ['src/data/photozone.ts', 'src/photozone/PhotozoneApp.tsx'],
}

/**
 * 부제 노릇을 하는 **다른 이름**들. 여기 걸리면 `subtitle` 로 바꾸라는 뜻이다.
 * (이름을 바꿀 땐 저장된 값이 안 사라지게 옛 키를 폴백으로 읽는다 — `photocardDisplay` 참고)
 */
const ALIASES = ['deckGuide', 'treeSubtitle', 'wallSubtitle', 'intro', 'lead', 'guide', 'caption', 'desc', 'description']

let failed = 0
const bad = (label, note) => {
  console.log(`✗ ${label} — ${note}`)
  failed++
}

for (const [svc, [typeFile, appFile]] of Object.entries(SERVICES)) {
  if (!existsSync(typeFile) || !existsSync(appFile)) {
    bad(svc, '파일을 못 찾았어요 — 이 표를 고치세요')
    continue
  }
  const type = readFileSync(typeFile, 'utf8')
  const app = readFileSync(appFile, 'utf8')
  const m = /export interface \w*Display\s*\{([\s\S]*?)\n\}/.exec(type)
  if (!m) {
    bad(svc, `${typeFile} 에서 Display 인터페이스를 못 찾았어요`)
    continue
  }
  const fields = [...m[1].matchAll(/^ {2}(\w+)\??\s*:/gm)].map((x) => x[1])
  const notes = []

  /**
   * **`subtitle` 이 없을 때만** 다른 이름을 의심한다.
   *
   * 둘 다 있으면 그 다른 이름은 부제가 아니라 딴 것이다 — 포토존의 `guide` 는 촬영
   * 화면 상단 안내라 제목 아래 한 줄과 아무 상관이 없다. 처음엔 그것까지 잡아서
   * "포토존도 이름이 틀렸다" 고 잘못 짚었다.
   */
  if (!fields.includes('subtitle')) {
    const alias = ALIASES.filter((a) => fields.includes(a))
    notes.push(alias.length ? `부제가 ${alias.join('·')} 라는 이름이에요 — subtitle 로` : 'subtitle 이 없어요')
  }
  else if (!fields.includes('showSubtitle')) notes.push('showSubtitle 이 없어요 (끌 방법이 없어요)')

  /**
   * **헤더 안에서 그리는가.** `below={…display.subtitle…}` 한 덩어리 안에 있어야 한다.
   * `<ServiceHeader/>` 뒤에 따로 `<p>{display.subtitle}</p>` 를 두면 정렬이 안 따라간다.
   */
  if (fields.includes('subtitle')) {
    const below = /below=\{[\s\S]{0,400}?display\.subtitle/.test(app)
    if (!below) notes.push('subtitle 을 헤더 밖에서 그려요 — below 로 넣으세요')
  }

  if (notes.length) bad(svc, notes.join(' · '))
  else console.log(`✓ ${svc} — subtitle · showSubtitle · 헤더 안`)
}

console.error(failed === 0 ? '\n부제가 전부 같은 이름·같은 자리예요' : `\n${failed}개 서비스가 어긋나요`)
process.exit(failed === 0 ? 0 : 1)
