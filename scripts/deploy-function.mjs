/**
 * Edge Function 배포 — **Supabase CLI 없이** Management API 로 올린다.
 *
 *   node scripts/deploy-function.mjs admin
 *
 * `.env.local` 의 `SUPABASE_ACCESS_TOKEN`(개인 액세스 토큰)과 `VITE_SUPABASE_URL` 을 쓴다.
 * CLI(`supabase functions deploy admin`)와 하는 일이 같다 — 여기서 도는 이유는 이 작업 환경에
 * CLI 가 없어서다. **결과는 반드시 확인한다**(200 이어도 함수가 죽어 있을 수 있어 GET 으로 되읽는다).
 *
 * 여러 파일을 import 하는 함수는 그 파일들도 같이 올려야 한다 — 폴더 안 `.ts` 를 전부 담는다.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)

const TOKEN = env.SUPABASE_ACCESS_TOKEN
const REF = (env.VITE_SUPABASE_URL ?? '').match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]
const NAME = process.argv[2]

if (!TOKEN || !REF || !NAME) {
  console.error('사용법: node scripts/deploy-function.mjs <함수이름>  (.env.local 에 SUPABASE_ACCESS_TOKEN 필요)')
  process.exit(1)
}

const dir = join('supabase', 'functions', NAME)
const files = readdirSync(dir).filter((f) => statSync(join(dir, f)).isFile() && /\.(ts|js|json)$/.test(f))
if (!files.includes('index.ts')) {
  console.error(`${dir}/index.ts 가 없어요`)
  process.exit(1)
}

const form = new FormData()
form.append(
  'metadata',
  new Blob([JSON.stringify({ name: NAME, entrypoint_path: `${NAME}/index.ts`, verify_jwt: false })], {
    type: 'application/json',
  })
)
for (const f of files) {
  form.append('file', new Blob([readFileSync(join(dir, f))], { type: 'application/typescript' }), `${NAME}/${f}`)
}

const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/functions/deploy?slug=${NAME}`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${TOKEN}` },
  body: form,
})
const text = await res.text()
console.log(res.status, text.slice(0, 600))
if (!res.ok) process.exit(1)

// 배포된 버전을 되읽어 확인한다 — 200 만 보고 넘어가면 옛 코드가 도는 걸 못 본다
const check = await fetch(`https://api.supabase.com/v1/projects/${REF}/functions/${NAME}`, {
  headers: { Authorization: `Bearer ${TOKEN}` },
})
const info = await check.json()
console.log('배포됨:', info.slug, 'version', info.version, 'status', info.status)
