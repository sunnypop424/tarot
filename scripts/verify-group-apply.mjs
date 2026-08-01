/**
 * **묶음에 같이 적용이 실제로 도는가.**
 *
 *   node scripts/verify-group-apply.mjs
 *
 * 한 행사가 슬롯 여럿을 얹으면(포토카드 + 스탬프 + 모의고사) 색·글꼴·로고가 셋이 같아야
 * 하는데, 지금까지는 **같은 값을 세 번 손으로 넣었다.** 하나를 고치고 나머지를 잊는 게
 * 기본값이라, 편집기에 "묶음에 같이 적용" 을 뒀다 (`src/owner/GroupApply.tsx`).
 *
 * 여러 슬롯을 한 번에 덮어쓰는 일이라 **잘못 돌면 손해가 크다.** 그래서 실제로 찔러본다:
 *
 *  · 같은 묶음의 슬롯에만 닿는다 (남의 묶음은 안 건드린다)
 *  · 고른 항목만 옮긴다 (로고를 안 골랐으면 상대 로고가 그대로다)
 *  · 로고 정렬은 **서비스가 달라도** 옮겨진다 (필드 이름이 같다)
 *
 * `.env.local` 의 Supabase 자격이 필요하다 — 슬롯을 만들고 지운다.
 */
import { readFileSync } from 'node:fs'

const env = {}
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim())
  if (m) env[m[1]] = m[2]
}
const URL_ = env.VITE_SUPABASE_URL
const KEY = env.VITE_SUPABASE_ANON_KEY

const auth = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: KEY, 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'owner@example.com', password: env.SEED_PASSWORD ?? 'tarot1234' }),
})
const { access_token } = await auth.json()
if (!access_token) {
  console.error('최고관리자 로그인 실패 — .env.local 의 SEED_PASSWORD 를 보세요')
  process.exit(1)
}
const H = { apikey: KEY, authorization: `Bearer ${access_token}`, 'content-type': 'application/json' }

let failed = 0
const check = (label, ok, note = '') => {
  console.log(`${ok ? '✓' : '✗'} ${label}${note ? ` — ${note}` : ''}`)
  if (!ok) failed++
}

const TAG = `ga-${Date.now().toString(36)}`
const slugs = [`${TAG}-a`, `${TAG}-b`, `${TAG}-c`]
const cleanup = () =>
  Promise.all(slugs.map((s) => fetch(`${URL_}/rest/v1/slots?slug=eq.${s}`, { method: 'DELETE', headers: H })))

const make = (slug, group, body) =>
  fetch(`${URL_}/rest/v1/slots`, {
    method: 'POST',
    headers: { ...H, Prefer: 'return=minimal' },
    body: JSON.stringify({ slug, name: slug, group_name: group, theme: {}, event: {}, ...body }),
  })

const read = async (slug) => {
  const r = await fetch(`${URL_}/rest/v1/slots?slug=eq.${slug}&select=*`, { headers: H })
  return (await r.json())[0]
}

try {
  await cleanup()
  // A·B 는 같은 묶음, C 는 다른 묶음
  await make(slugs[0], TAG, { service: 'photocard', photocard: { logoAlign: 'right', title: 'A' } })
  await make(slugs[1], TAG, { service: 'stamp', stamp: { logoAlign: 'left', title: 'B' }, theme: { font: 'noto' } })
  await make(slugs[2], `${TAG}-other`, { service: 'poll', poll: { logoAlign: 'left' } })

  /**
   * 화면 코드를 그대로 부를 수 없으니(브라우저 밖이다) **같은 규칙을 여기서 다시 쓴다.**
   * 규칙이 갈리면 이 검사는 자기 자신만 확인하게 되므로, 옮기는 항목은
   * `GroupApply.tsx` 와 나란히 두고 바꿀 때 같이 고친다.
   */
  const A = await read(slugs[0])
  const SERVICE_KEYS = ['luckydraw', 'rolling', 'photozone', 'wish', 'poll', 'stamp', 'quiz', 'photocard', 'cheer']
  const align = SERVICE_KEYS.map((k) => A[k]?.logoAlign).find(Boolean) ?? null

  const list = await (await fetch(`${URL_}/rest/v1/slots?group_name=eq.${TAG}&select=*`, { headers: H })).json()
  const mates = list.filter((s) => s.slug !== A.slug)
  check('같은 묶음만 잡힌다', mates.length === 1 && mates[0].slug === slugs[1], `${mates.length}개`)

  for (const mate of mates) {
    const body = { theme: { ...mate.theme, font: A.theme.font } }
    for (const k of SERVICE_KEYS) {
      if (mate[k] && typeof mate[k] === 'object' && align) body[k] = { ...mate[k], logoAlign: align }
    }
    const r = await fetch(`${URL_}/rest/v1/slots?slug=eq.${mate.slug}`, {
      method: 'PATCH',
      headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify(body),
    })
    check(`${mate.slug} 저장`, r.ok, r.ok ? '' : await r.text())
  }

  const B = await read(slugs[1])
  const C = await read(slugs[2])
  check('로고 정렬이 다른 서비스로도 옮겨졌다', B.stamp?.logoAlign === 'right', `실제 ${B.stamp?.logoAlign}`)
  check('안 고른 값은 그대로다 (제목)', B.stamp?.title === 'B', `실제 ${B.stamp?.title}`)
  check('글꼴이 A 의 값으로 비워졌다', B.theme?.font === A.theme?.font, `실제 ${JSON.stringify(B.theme?.font)}`)
  check('다른 묶음은 안 건드린다', C.poll?.logoAlign === 'left', `실제 ${C.poll?.logoAlign}`)
} finally {
  await cleanup()
}

console.error(failed === 0 ? '\n묶음 적용이 제대로 돌아요' : `\n${failed}개가 어긋나요`)
process.exit(failed === 0 ? 0 : 1)
