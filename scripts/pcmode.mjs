/** 포토카드 운영 방식 임시 변경 (검증용): node scripts/pcmode.mjs <slug> <save|gift|sale> */
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)
const URL_ = env.VITE_SUPABASE_URL
const KEY = env.VITE_SUPABASE_ANON_KEY
const [slug, mode] = process.argv.slice(2)

const auth = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: KEY, 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'owner@example.com', password: env.SEED_PASSWORD ?? 'tarot1234' }),
})
const { access_token } = await auth.json()

const r = await fetch(`${URL_}/rest/v1/photocard_settings?slug=eq.${slug}`, {
  method: 'PATCH',
  headers: {
    apikey: KEY,
    Authorization: `Bearer ${access_token}`,
    'content-type': 'application/json',
    Prefer: 'return=representation',
  },
  body: JSON.stringify({ mode }),
})
console.log(r.status, await r.text())
