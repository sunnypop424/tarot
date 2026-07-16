/**
 * 씨앗 SQL 생성 — `src/data/*.json` 을 DB 로 옮기는 INSERT 문을 만든다.
 *
 *   node scripts/seed-supabase.mjs > supabase/seed.sql
 *
 * 왜 스크립트로 만드나: slots.json 을 손으로 SQL 에 옮겨 적으면 반드시 어긋난다.
 * 왜 실행하지 않고 출력만 하나: 쓰려면 service_role 키가 필요한데,
 * **그 키를 로컬 파일에 두지 않는 게 낫다** — RLS 를 통째로 무시하는 키다.
 * SQL Editor 에 붙여넣으면 거기선 이미 그 권한으로 돈다.
 */

import { readFileSync } from 'node:fs'

const read = (p) => JSON.parse(readFileSync(new URL(`../src/data/${p}`, import.meta.url), 'utf8'))
const slots = read('slots.json')
const questions = read('questions.json')

/** 작은따옴표는 두 번 써서 이스케이프 — jsonb 안에 한글·따옴표가 들어간다 */
const q = (v) => `'${String(v).replace(/'/g, "''")}'`
const j = (v) => `${q(JSON.stringify(v))}::jsonb`

const out = []
out.push('-- 자동 생성 — node scripts/seed-supabase.mjs')
out.push('-- SQL Editor 에 붙여넣고 Run. 여러 번 돌려도 안전하다 (upsert).')
out.push('')
out.push('-- 순서가 중요하다: slot_admins·questions 가 slots(slug) 를 참조하므로 슬롯이 먼저다.')
out.push('')
out.push('-- ══ 슬롯 ══════════════════════════════════════════')
out.push('')
for (const s of slots) {
  out.push(`insert into public.slots (slug, name, service, plan, limits, deck, theme, event) values (`)
  out.push(`  ${q(s.slug)}, ${q(s.name)}, ${q(s.service ?? 'tarot')}, ${q(s.plan ?? 'free')},`)
  out.push(`  ${j(s.limits ?? {})}, ${q(s.deck ?? 'full')}, ${j(s.theme)}, ${j(s.event ?? {})}`)
  out.push(`) on conflict (slug) do update set`)
  out.push(`  name = excluded.name, service = excluded.service, plan = excluded.plan,`)
  out.push(`  limits = excluded.limits, deck = excluded.deck, theme = excluded.theme, event = excluded.event;`)
  out.push('')
}

out.push('-- ══ 역할 ══════════════════════════════════════════')
out.push('-- 아래 이메일로 Auth → Users 에서 계정을 먼저 만들어야 한다 (Auto Confirm User 켜기).')
out.push('-- 계정이 없으면 이 문장들은 조용히 0행 (에러 안 남) — 그래서 맨 아래 확인 쿼리가 있다.')
out.push('')
out.push(`insert into public.owners (user_id)`)
out.push(`select id from auth.users where email = 'owner@example.com'`)
out.push(`on conflict (user_id) do nothing;`)
out.push('')

for (const slot of slots) {
  out.push(`insert into public.slot_admins (user_id, slug)`)
  out.push(`select id, ${q(slot.slug)} from auth.users where email = ${q(`${slot.slug}@example.com`)}`)
  out.push(`on conflict (user_id) do update set slug = excluded.slug;`)
  out.push('')
}

out.push('-- ══ 질문 ══════════════════════════════════════════')
out.push('-- questions.json 은 슬롯 구분이 없는 씨앗이다 — demo 슬롯에 넣는다.')
out.push('')
for (const question of questions) {
  out.push(`insert into public.questions (id, slug, published, data) values (`)
  out.push(`  ${q(question.id)}, 'demo', ${question.published}, ${j(question)}`)
  out.push(`) on conflict (id) do update set`)
  out.push(`  published = excluded.published, data = excluded.data;`)
  out.push('')
}

out.push('-- ══ 확인 ══════════════════════════════════════════')
out.push('-- 계정을 안 만들었으면 owners/slot_admins 가 0 이다.')
out.push(`select 'owners' as t, count(*) from public.owners`)
out.push(`union all select 'slot_admins', count(*) from public.slot_admins`)
out.push(`union all select 'slots', count(*) from public.slots`)
out.push(`union all select 'questions', count(*) from public.questions;`)

console.log(out.join('\n'))
