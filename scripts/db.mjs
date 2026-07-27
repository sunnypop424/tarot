/**
 * 원격 DB 에 SQL 을 실행한다 — **마이그레이션을 손으로 붙여넣지 않기 위한 도구.**
 *
 *   node scripts/db.mjs "select 1"                 ← 한 줄 실행
 *   node scripts/db.mjs --file supabase/migrations/0018_x.sql
 *   node scripts/db.mjs --pending                  ← 아직 적용 안 된 마이그레이션 목록
 *   node scripts/db.mjs --migrate                  ← 안 된 것만 순서대로 적용
 *
 * 대시보드 SQL 편집기가 쓰는 것과 같은 통로(Management API)다. `.env.local` 의
 * `SUPABASE_ACCESS_TOKEN`(개인 액세스 토큰)이 있어야 하고, 그 파일은 커밋되지 않는다.
 *
 * ⚠ **이 토큰은 계정 전체 권한이다.** 그래서 이 스크립트는 `supabase/migrations/` 안의
 * 파일만 실행하고(`--file` 도 그 폴더로 제한), 무엇을 돌릴지 먼저 출력한다.
 *
 * 적용 이력은 `public._applied_migrations` 에 남긴다. Supabase CLI 의
 * `supabase_migrations.schema_migrations` 를 쓰지 않는 이유: 0001~0017 을 사람이 손으로
 * 붙여넣어 적용해서 CLI 이력이 비어 있고, 그 상태로 `db push` 를 돌리면 **처음부터 다시**
 * 밀려고 든다. 여기서 쓰는 이력은 "이 스크립트가 적용한 것" 만 기록하고,
 * 이미 적용된 과거 것들은 `--adopt` 로 한 번에 등록한다.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const env = {}
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim())
  if (m) env[m[1]] = m[2]
}

const TOKEN = env.SUPABASE_ACCESS_TOKEN
const REF = (env.VITE_SUPABASE_URL ?? '').replace(/^https:\/\//, '').split('.')[0]
const DIR = 'supabase/migrations'

if (!TOKEN || !REF) {
  console.error('.env.local 에 SUPABASE_ACCESS_TOKEN / VITE_SUPABASE_URL 이 필요해요')
  process.exit(1)
}

/** Management API 로 SQL 실행. 실패하면 그대로 던진다 — 조용히 넘어가면 안 되는 종류다 */
export async function exec(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${text.slice(0, 600)}`)
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

const files = () => readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()

async function ensureLedger() {
  await exec(`create table if not exists public._applied_migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  );`)
}

async function applied() {
  await ensureLedger()
  const rows = await exec('select name from public._applied_migrations order by name;')
  return new Set((Array.isArray(rows) ? rows : []).map((r) => r.name))
}

const arg = process.argv[2]

if (arg === '--pending' || arg === '--migrate' || arg === '--adopt') {
  const done = await applied()
  const pending = files().filter((f) => !done.has(f))

  if (arg === '--adopt') {
    // 사람이 이미 손으로 적용한 과거 마이그레이션을 이력에만 등록한다 (실행하지 않는다)
    const names = process.argv.slice(3)
    if (!names.length) {
      console.error('등록할 파일명을 주세요 — 예: --adopt 0001_init.sql 0002_storage.sql')
      process.exit(1)
    }
    const values = names.map((n) => `('${n.replace(/'/g, "''")}')`).join(',')
    await exec(`insert into public._applied_migrations(name) values ${values} on conflict do nothing;`)
    console.log(`이력에 등록(실행 안 함): ${names.join(', ')}`)
  } else if (arg === '--pending') {
    console.log(pending.length ? pending.join('\n') : '(없음 — 전부 적용됨)')
  } else {
    if (!pending.length) console.log('적용할 게 없어요.')
    for (const f of pending) {
      process.stdout.write(`▶ ${f} … `)
      await exec(readFileSync(join(DIR, f), 'utf8'))
      await exec(
        `insert into public._applied_migrations(name) values ('${f.replace(/'/g, "''")}') on conflict do nothing;`
      )
      console.log('적용됨')
    }
  }
} else if (arg === '--file') {
  const path = process.argv[3]
  if (!path || !path.replace(/\\/g, '/').startsWith(DIR)) {
    console.error(`${DIR}/ 안의 파일만 실행해요 (받은 값: ${path})`)
    process.exit(1)
  }
  console.log(await exec(readFileSync(path, 'utf8')))
} else if (arg) {
  console.log(JSON.stringify(await exec(arg), null, 2))
} else {
  console.log('사용법은 이 파일 맨 위 주석을 보세요.')
}
