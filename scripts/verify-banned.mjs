/**
 * 금칙어 필터 검증 — **서버가 실제로 막는가** (`0041_banned_words.sql`).
 *
 *   node scripts/verify-banned.mjs
 *
 * 이 서비스들(롤페·소원나무·영상회)은 **anon 이 직접 INSERT** 한다. 화면에서 거르면
 * 개발자도구로 우회되므로 막는 자리는 트리거뿐이고, 그렇다면 계약도 REST 로 확인해야 한다.
 *
 *  · 기본(전역) 목록이 걸린다 — 슬롯이 아무것도 안 넣어도
 *  · **띄어쓰기·문장부호로 못 피한다** (normalize_for_ban)
 *  · 이름 칸으로도 못 넣는다 — 이름도 벽에 뜬다
 *  · 슬롯이 넣은 말이 그 슬롯에서만 걸린다 (남의 슬롯엔 안 걸린다)
 *  · **방문자는 목록을 못 읽는다** — 읽히면 그게 곧 우회 설명서다
 *  · 정상적인 응원 글은 그대로 통과한다 (오탐이 없어야 쓸 수 있다)
 */
import { readFileSync } from 'node:fs'

const env = {}
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim())
  if (m) env[m[1]] = m[2]
}
const URL_ = env.VITE_SUPABASE_URL
const ANON = env.VITE_SUPABASE_ANON_KEY
const PW = env.SEED_PASSWORD ?? 'tarot1234'

let failed = 0
const check = (name, ok, detail = '') => {
  if (!ok) failed++
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const auth = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: ANON, 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'owner@example.com', password: PW }),
})
if (!auth.ok) {
  console.error('최고관리자 로그인 실패')
  process.exit(1)
}
const { access_token } = await auth.json()
const OWNER = { apikey: ANON, authorization: `Bearer ${access_token}`, 'content-type': 'application/json' }
const ANONH = { apikey: ANON, 'content-type': 'application/json' }
const rest = (p, init = {}) => fetch(`${URL_}/rest/v1/${p}`, init)

const A = `banned-a-${Date.now().toString(36)}`
const B = `banned-b-${Date.now().toString(36)}`

const cleanup = () => rest(`slots?slug=in.(${A},${B})`, { method: 'DELETE', headers: OWNER })

const mk = (slug) =>
  rest('slots', {
    method: 'POST',
    headers: { ...OWNER, prefer: 'return=minimal' },
    body: JSON.stringify({ slug, name: slug, service: 'rolling', theme: {}, event: {} }),
  })

const made = await Promise.all([mk(A), mk(B)])
check('준비: 검증용 슬롯 둘', made.every((r) => r.ok))
if (!made.every((r) => r.ok)) {
  await cleanup()
  process.exit(1)
}

/** 방문자로 한 줄 남겨 본다 — 통과하면 ok:true */
const post = (slug, body, nickname = '방문자') =>
  rest('rolling_messages', {
    method: 'POST',
    headers: { ...ANONH, prefer: 'return=minimal' },
    body: JSON.stringify({ slug, nickname, body, color: '', font: '' }),
  })

try {
  // ── 1. 정상 글은 통과한다 (오탐이 없어야 쓸 수 있다) ─
  {
    const res = await post(A, '생일 축하해요! 오늘도 반짝반짝 빛나길 바라요.')
    check('정상적인 응원 글은 통과한다', res.ok, `HTTP ${res.status}`)
  }

  // ── 2. 기본 목록이 걸린다 ─────────────────────────
  {
    const res = await post(A, '시발 뭐야')
    check('기본 금칙어가 걸린다 (슬롯이 아무것도 안 넣어도)', !res.ok, `HTTP ${res.status}`)
  }

  // ── 3. 띄어쓰기·문장부호로 못 피한다 ──────────────
  //
  // 이게 없으면 목록이 사실상 장식이다 — 한 칸만 띄우면 그냥 통과한다.
  {
    const spaced = await post(A, '시 발 진짜')
    check('띄어쓰기로 못 피한다', !spaced.ok, `HTTP ${spaced.status}`)
    const punct = await post(A, '시.발!')
    check('문장부호로 못 피한다', !punct.ok, `HTTP ${punct.status}`)
    const upper = await post(A, 'FUCK this')
    check('대문자로 못 피한다', !upper.ok, `HTTP ${upper.status}`)
  }

  // ── 4. 이름 칸으로도 못 넣는다 ────────────────────
  //
  // 이름도 쪽지에 그대로 뜬다 — 본문만 보면 반만 막는 것이다.
  {
    const res = await post(A, '축하해요', '병신')
    check('이름 칸으로도 못 넣는다', !res.ok, `HTTP ${res.status}`)
  }

  // ── 5. 슬롯이 넣은 말은 그 슬롯에서만 ─────────────
  {
    const add = await rest('banned_words', {
      method: 'POST',
      headers: { ...OWNER, prefer: 'return=minimal' },
      body: JSON.stringify({ slug: A, word: '금지단어' }),
    })
    check('슬롯 금칙어를 넣는다', add.ok, `HTTP ${add.status}`)

    const blocked = await post(A, '여기 금지단어 들어감')
    check('넣은 슬롯에서는 걸린다', !blocked.ok, `HTTP ${blocked.status}`)

    const other = await post(B, '여기 금지단어 들어감')
    check('다른 슬롯에는 안 걸린다 (슬롯 격리)', other.ok, `HTTP ${other.status}`)
  }

  // ── 6. 방문자는 목록을 못 읽는다 ──────────────────
  {
    const res = await rest('banned_words?select=word', { headers: ANONH })
    const rows = res.ok ? await res.json() : []
    check('방문자는 금칙어 목록을 못 읽는다', rows.length === 0, `${rows.length}행이 샜다`)
  }

  // ── 7. 벽에 실제로 뭐가 남았나 ────────────────────
  //
  // 위 검사들은 전부 "요청이 거절됐나" 인데, 진짜 계약은 **벽에 안 뜨는 것**이다.
  {
    const res = await rest(`rolling_messages?slug=eq.${A}&select=body`, { headers: OWNER })
    const rows = res.ok ? await res.json() : []
    check('막힌 글은 저장 자체가 안 됐다', rows.length === 1, `${rows.length}행 (통과시킨 1행만 있어야 한다)`)
  }
} finally {
  await cleanup()
  const left = await rest(`slots?slug=in.(${A},${B})&select=slug`, { headers: OWNER })
  check('검증이 남긴 게 없다', left.ok && (await left.json()).length === 0)
}

console.log(failed === 0 ? '\n전부 통과' : `\n${failed}개 실패`)
process.exit(failed === 0 ? 0 : 1)
