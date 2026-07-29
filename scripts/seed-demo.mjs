/**
 * 체험용 데모 슬롯 만들기 — **랜딩에서 링크할 슬롯이다.**
 *
 *   node scripts/seed-demo.mjs            (전부)
 *   node scripts/seed-demo.mjs cheer      (하나만)
 *
 * 테스트 슬롯(`pctest` 등)과 **따로** 둔다: 그건 검증하며 데이터를 갈아엎는 자리라
 * 랜딩에 걸면 손님이 빈 화면이나 이상한 데이터를 본다.
 *
 * 여기서 채우는 건 **샘플 데이터와 설정**뿐이다. 이미지는 최고관리자가 편집기에서 올린다
 * (Storage 쓰기가 owner-only 로 잠겨 있고, 그 잠금을 안 푸는 게 이 플랫폼의 설계다).
 *
 * 방문자 쓰기를 막는 건 이 스크립트가 아니라 **슬롯의 `demo` 플래그**다 (0030).
 */
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)
const URL_ = env.VITE_SUPABASE_URL
const KEY = env.VITE_SUPABASE_ANON_KEY
const PW = env.SEED_PASSWORD ?? 'tarot1234'

const auth = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: KEY, 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'owner@example.com', password: PW }),
})
const { access_token } = await auth.json()
if (!access_token) {
  console.error('최고관리자 로그인 실패')
  process.exit(1)
}
const H = { apikey: KEY, Authorization: `Bearer ${access_token}`, 'content-type': 'application/json' }

const rest = (path, init = {}) =>
  fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers ?? {}) } })
const rpc = (fn, body) => fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: 'POST', headers: H, body: JSON.stringify(body) })

/** 데모 슬롯은 전부 이 묶음에 든다 — 목록에서 고객 슬롯과 섞이지 않게 */
const GROUP = '체험용 데모'

/** 밝은 라이트 테마 하나로 통일 — 이미지는 사장님이 올리시고, 색은 그때 맞춘다 */
const THEME = {
  colors: {
    canvas: '#f7f5ff',
    surface: '#ffffff',
    surfaceRaised: '#ffffff',
    wash: '#f0edff',
    primary: '#816bff',
    primaryHover: '#6e58ff',
    primarySoft: '#b7aaff',
    accent: '#d4af37',
    accentSoft: '#e8cf7a',
    high: '#816bff',
    onHigh: '#ffffff',
    fg1: '#1f2937',
    fg2: '#374151',
    fg3: '#6b7280',
    border: '#e5e7eb',
    borderHover: '#d1d5db',
    onPrimary: '#ffffff',
    cardBackFrom: '#2a2b4a',
    cardBackTo: '#14152a',
  },
  shape: { radiusSm: 6, radiusMd: 12, radiusLg: 18 },
  assets: {
    logo: null,
    logoAlt: '체험용 데모',
    logoHeight: 28,
    appIcon: null,
    backgroundPattern: null,
    backgroundPatternSize: 'cover',
    backgroundPatternRepeat: 'no-repeat',
    cardFrontBase: null,
    cardFrontExt: 'webp',
    cardBack: null,
    crystalBall: null,
  },
}

const SLOTS = {
  tarot: { name: '체험 · 타로카드' },
  luckydraw: { name: '체험 · 럭키드로우' },
  rolling: { name: '체험 · 롤링페이퍼' },
  wish: { name: '체험 · 소원나무' },
  photozone: { name: '체험 · 포토존' },
  poll: { name: '체험 · 실시간 투표' },
  stamp: { name: '체험 · 방문 스탬프' },
  quiz: { name: '체험 · 최애 모의고사' },
  photocard: { name: '체험 · 포토카드 뽑기' },
  /**
   * 판매 방식 체험 — **스태프가 뽑는 화면**을 보여주려면 슬롯이 하나 더 필요하다
   * (한 슬롯은 저장용이거나 판매거나 둘 중 하나다). 랜딩이 `/staff` 를 띄운다.
   */
  'photocard-sale': { name: '체험 · 포토카드 (판매)', service: 'photocard' },
  cheer: { name: '체험 · 영상회 응원' },
}

const only = process.argv[2]
const targets = only ? [only] : Object.keys(SLOTS)

const MESSAGES = [
  ['리안', '오늘 너무 기다렸어요'],
  ['', '최고의 무대!'],
  ['별하나', '행복한 하루 되세요'],
  ['팬1', '우리 계속 함께해요'],
  ['', '사랑해요'],
  ['노을', '영상회 최고'],
  ['파도', '다음에도 꼭 올게요'],
  ['', '오늘 정말 즐거웠어요'],
]

for (const key of targets) {
  const slug = `demo-${key}`
  const meta = SLOTS[key]
  if (!meta) {
    console.error(`모르는 서비스: ${key}`)
    continue
  }
  /** 키가 곧 서비스는 아니다 — 같은 서비스를 방식만 달리해 두 슬롯으로 두기도 한다 */
  const service = meta.service ?? key

  // 슬롯 (있으면 덮어쓴다 — 설정만 바꾸고 데이터는 아래에서 다시 채운다)
  const up = await rest('slots', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      slug,
      name: meta.name,
      service,
      group_name: GROUP,
      demo: true,
      plan: 'free',
      deck: 'full',
      period: {},
      theme: THEME,
      event: {},
    }),
  })
  if (!up.ok) {
    console.error(slug, up.status, await up.text())
    continue
  }

  // 서비스별 샘플 — **없으면 체험이 빈 화면이다**
  if (service === 'tarot') {
    await rest(`questions?slug=eq.${slug}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
    await rest('questions', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(
        ['오늘 나에게 필요한 말은?', '요즘 내 마음은 어떤가요?', '이번 주에 조심할 것은?'].map((q, i) => ({
          id: `${slug}-q${i}`,
          slug,
          question: q,
          published: true,
          card_count: 1,
          deck: 'full',
          spread_count: 12,
        }))
      ),
    })
  }

  if (service === 'luckydraw') {
    await rest(`prizes?slug=eq.${slug}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
    await rest('prizes', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify([
        { slug, rank: 1, name: '사인 폴라로이드', remaining: 3, requires_shipping: false },
        { slug, rank: 2, name: '아크릴 스탠드', remaining: 20, requires_shipping: false },
        { slug, rank: 3, name: '포토카드', remaining: 120, requires_shipping: false },
        { slug, rank: 4, name: '스티커', remaining: 300, requires_shipping: false },
      ]),
    })
    await rest('luckydraw_settings', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ slug, rehearsal: true, closed: false }),
    })
  }

  if (service === 'rolling' || service === 'wish' || service === 'cheer') {
    await rest(`rolling_messages?slug=eq.${slug}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
    /**
     * **색을 돌려 가며 넣는다.** 색을 비우면 화면이 팔레트의 첫 색으로 그려서 벽이든 나무든
     * 전부 한 가지 색이 된다 — 체험에서 제일 먼저 눈에 띄는 게 그 단조로움이다.
     * (영상회는 말풍선 색을 상영 화면이 무작위로 고르므로 색을 안 쓴다.)
     */
    const palette =
      service === 'wish'
        ? ['#efe8cd', '#e9d3c4', '#d8dfd0', '#dcd4e6', '#e4dcc2', '#dfe3ea']
        : ['#f4efe2', '#eef1e6', '#eceff4', '#f4ecec', '#f1ecf4', '#e9f0ef']
    const fonts = ['pretendard', 'gaegu', 'nanumPen']
    await rest('rolling_messages', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(
        MESSAGES.map(([nickname, body], i) => ({
          slug,
          nickname,
          body,
          color: service === 'cheer' ? '' : palette[i % palette.length],
          font: service === 'cheer' ? '' : fonts[i % fonts.length],
          hidden: false,
        }))
      ),
    })
  }

  if (service === 'poll') {
    await rest(`poll_polls?slug=eq.${slug}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
    const made = await rest('poll_polls', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ slug, title: '오늘의 최애 컨셉은?', kind: 'single', max_pick: 1, closed: false, hidden: false, "order": 1 }),
    })
    const poll = (await made.json())[0]
    if (poll) {
      await rest('poll_options', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(
          [
            ['청량', 42],
            ['청순', 31],
            ['걸크러시', 27],
            ['레트로', 18],
          ].map(([label, votes], i) => ({ poll_id: poll.id, "order": i + 1, label, votes }))
        ),
      })
    }
  }

  if (service === 'stamp') {
    await rest('stamp_settings', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ slug, reward_mode: 'guaranteed', daily_reset: false, closed: false, reward_label: '스페셜 굿즈' }),
    })
    // 칸 정의는 슬롯 jsonb 다 (편집기 값) — 여섯 칸
    await rest(`slots?slug=eq.${slug}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        stamp: {
          title: '체험 스탬프',
          stamps: ['포토존 인증', '굿즈 구매', '컵홀더 수령', '방명록 작성', 'SNS 인증', '이벤트 참여'].map((name, i) => ({
            id: `s${i + 1}`,
            name,
          })),
        },
      }),
    })
  }

  if (service === 'quiz') {
    await rest(`quiz_questions?slug=eq.${slug}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
    const qs = [
      ['우리 최애가 데뷔한 해는?', ['2015년', '2016년', '2017년', '2018년'], '2'],
      ['최애의 포지션은?', ['보컬', '댄서', '래퍼', '올라운더'], '3'],
      ['최애가 가장 좋아하는 음식은?', ['떡볶이', '초밥', '파스타', '치킨'], '0'],
    ]
    for (const [i, [body, choices, answer]] of qs.entries()) {
      const made = await rest('quiz_questions', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ slug, "order": i + 1, kind: 'choice', body, choices, points: 10, hidden: false }),
      })
      const row = (await made.json())[0]
      if (row)
        await rest('quiz_answers', {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify({ question_id: row.id, answers: [answer] }),
        })
    }
    await rest('quiz_settings', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ slug, reward_mode: 'none', closed: false }),
    })
  }

  if (service === 'photocard') {
    await rest(`photocards?slug=eq.${slug}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
    await rest('photocards', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(
        [
          ['봄 컨셉', 1],
          ['여름 컨셉', 2],
          ['가을 컨셉', 3],
          ['겨울 컨셉', 4],
          ['시크릿 컷', 5],
        ].map(([name, rarity], i) => ({
          slug,
          name,
          rarity,
          image: '',
          remaining: null,
          lucky: rarity >= 4,
          "order": i + 1,
        }))
      ),
    })
    await rest('photocard_settings', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(
        key === 'photocard-sale'
          ? // 판매 — 스태프가 N연차를 뽑는다 (랜딩이 `/staff` 를 띄운다)
            { slug, mode: 'sale', batch_count: 10, rehearsal: false, closed: false, allow_save: false }
          : { slug, mode: 'save', draws_per_visitor: 3, rehearsal: false, closed: false, allow_save: true }
      ),
    })
  }

  if (service === 'cheer') {
    await rest('cheer_settings', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ slug, bubbles: 7, ratio: '16:9', interval_sec: 6, show_name: true, per_person: 3, max_length: 40 }),
    })
  }

  console.log(`✓ /${slug}`)
}

// 데모 슬롯이 전부 demo 플래그를 갖고 있는지 되읽는다 — 하나라도 빠지면 그 슬롯은 쓰기가 열린다
const check = await rest(`slots?slug=like.demo-*&select=slug,demo`)
const rows = check.ok ? await check.json() : []
const open = rows.filter((r) => !r.demo)
console.log(open.length === 0 ? '\n전부 demo 로 잠겼습니다' : `\n주의: demo 가 아닌 슬롯 ${open.map((r) => r.slug).join(', ')}`)
void rpc
