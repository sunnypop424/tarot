/**
 * 언어 사이의 **구멍**을 찾는다 — 영어엔 있는데 중국어·일본어엔 없는 문장.
 *
 *   node scripts/i18n-parity.mjs          ← 언어별로 몇 개가 비었는지
 *   node scripts/i18n-parity.mjs zh       ← 중국어에 없는 키만 (영어 번역을 옆에 붙여서)
 *
 * `i18n-scan --missing` 은 **영어 사전만** 본다. 그래서 영어를 다 채우고 나면 0 이 뜨는데,
 * 중국어 사전엔 그 문장이 없어서 화면엔 한국어가 그대로 나온다 — 폴백이라 고장으로 안 보이고,
 * 그래서 눈으로는 절대 안 잡힌다. 이 스크립트가 그 자리를 센다.
 *
 * 완벽한 파서가 아니다 — `'키':` 로 시작하는 줄을 정규식으로 집는다 (사전 파일의 모양이
 * 그것 하나라 충분하다). 사전 파일을 새로 만들면 아래 `FILES` 에 넣는다.
 */
import { readFileSync } from 'node:fs'

/** 언어 → 그 언어의 사전 파일들 (`src/i18n/index.tsx` 의 `DICTS` 와 짝이다) */
const FILES = {
  en: ['src/i18n/en.ts', 'src/i18n/admin.en.ts', 'src/i18n/admin2.en.ts', 'src/i18n/landing.en.ts'],
  zh: ['src/i18n/zh.ts', 'src/i18n/admin.zh.ts', 'src/i18n/admin2.zh.ts', 'src/i18n/landing.zh.ts'],
  ja: ['src/i18n/ja.ts', 'src/i18n/admin.ja.ts', 'src/i18n/admin2.ja.ts', 'src/i18n/landing.ja.ts'],
}

const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/** `  '홈': 'Home',` → `홈` → `Home` */
function entries(paths) {
  const map = new Map()
  for (const p of paths) {
    const src = stripComments(readFileSync(p, 'utf8'))
    for (const m of src.matchAll(/^\s*'((?:[^'\\]|\\.)*)'\s*:\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/gm)) {
      map.set(m[1], m[2] ?? m[3] ?? '')
    }
  }
  return map
}

const dicts = Object.fromEntries(Object.entries(FILES).map(([lang, paths]) => [lang, entries(paths)]))
const want = process.argv[2]

if (want) {
  if (!dicts[want]) {
    console.error(`모르는 언어: ${want} (${Object.keys(dicts).join(' · ')})`)
    process.exit(1)
  }
  // 영어를 기준으로 삼는다 — 가장 많이 채워져 있고, 번역할 때 옆에 두고 보면 빠르다
  const base = dicts.en
  const missing = [...base.keys()].filter((k) => !dicts[want].has(k))
  for (const k of missing) console.log(`'${k}': '',  // ${base.get(k)}`)
  console.error(`\n${missing.length}개 (${want} · 영어엔 있는데 없는 것)`)
} else {
  const all = new Set(Object.values(dicts).flatMap((d) => [...d.keys()]))
  console.log(`전체 키 ${all.size}종\n`)
  for (const [lang, d] of Object.entries(dicts)) {
    console.log(`${lang}  ${String(d.size).padStart(4)}개  (빠짐 ${all.size - d.size})`)
  }
}
