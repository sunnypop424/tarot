-- 자동 생성 — node scripts/seed-supabase.mjs
-- SQL Editor 에 붙여넣고 Run. 여러 번 돌려도 안전하다 (upsert).

-- 순서가 중요하다: slot_admins·questions 가 slots(slug) 를 참조하므로 슬롯이 먼저다.

-- ══ 슬롯 ══════════════════════════════════════════

insert into public.slots (slug, name, service, plan, limits, deck, theme, event) values (
  'demo', '데모 생일카페', 'tarot', 'premium',
  '{"reading":6000,"answerGen":150}'::jsonb, 'full', '{"colors":{"canvas":"#0F1020","surface":"#1A1B2E","surfaceRaised":"#242537","wash":"#241F45","primary":"#816BFF","primaryHover":"#6E58FF","primarySoft":"#B7AAFF","accent":"#D4AF37","accentSoft":"#E8CF7A","fg1":"#F2F0FA","fg2":"#C6C3D8","fg3":"#9A97B0","border":"#2E2F45","borderHover":"#3A3B57","onPrimary":"#FFFFFF","cardBackFrom":"#1E1F3E","cardBackTo":"#101127"},"shape":{"radiusSm":4,"radiusMd":8,"radiusLg":16},"assets":{"logo":null,"logoAlt":"데모 생일카페","logoHeight":28,"backgroundPattern":null,"backgroundPatternOpacity":0.12,"backgroundPatternSize":"cover","backgroundPatternRepeat":"no-repeat","cardFrontBase":null,"cardFrontExt":"webp","cardBack":null,"crystalBall":null}}'::jsonb, '{}'::jsonb
) on conflict (slug) do update set
  name = excluded.name, service = excluded.service, plan = excluded.plan,
  limits = excluded.limits, deck = excluded.deck, theme = excluded.theme, event = excluded.event;

insert into public.slots (slug, name, service, plan, limits, deck, theme, event) values (
  'sample-pink', '샘플 생일카페 (핑크)', 'tarot', 'standard',
  '{"reading":1500,"answerGen":50}'::jsonb, 'full', '{"colors":{"canvas":"#1A0F16","surface":"#2A1823","surfaceRaised":"#3A2130","wash":"#3D1B2E","primary":"#FF6BA8","primaryHover":"#FF4F95","primarySoft":"#FFB3D1","accent":"#FFD9E8","accentSoft":"#FFF0F6","fg1":"#FFF5F9","fg2":"#E8CDDA","fg3":"#B08A9C","border":"#452433","borderHover":"#5A2F43","onPrimary":"#FFFFFF","cardBackFrom":"#3A1F2E","cardBackTo":"#1F1018"},"shape":{"radiusSm":4,"radiusMd":12,"radiusLg":20},"assets":{"logo":null,"logoAlt":"샘플 생일카페","logoHeight":28,"backgroundPattern":null,"backgroundPatternOpacity":0.12,"backgroundPatternSize":"cover","backgroundPatternRepeat":"no-repeat","cardFrontBase":null,"cardFrontExt":"webp","cardBack":null,"crystalBall":null}}'::jsonb, '{"love":{"cardCount":3}}'::jsonb
) on conflict (slug) do update set
  name = excluded.name, service = excluded.service, plan = excluded.plan,
  limits = excluded.limits, deck = excluded.deck, theme = excluded.theme, event = excluded.event;

-- ══ 역할 ══════════════════════════════════════════
-- 아래 이메일로 Auth → Users 에서 계정을 먼저 만들어야 한다 (Auto Confirm User 켜기).
-- 계정이 없으면 이 문장들은 조용히 0행 (에러 안 남) — 그래서 맨 아래 확인 쿼리가 있다.

insert into public.owners (user_id)
select id from auth.users where email = 'owner@example.com'
on conflict (user_id) do nothing;

insert into public.slot_admins (user_id, slug)
select id, 'demo' from auth.users where email = 'demo@example.com'
on conflict (user_id) do update set slug = excluded.slug;

insert into public.slot_admins (user_id, slug)
select id, 'sample-pink' from auth.users where email = 'sample-pink@example.com'
on conflict (user_id) do update set slug = excluded.slug;

-- ══ 질문 ══════════════════════════════════════════
-- questions.json 은 슬롯 구분이 없는 씨앗이다 — demo 슬롯에 넣는다.

insert into public.questions (id, slug, published, data) values (
  'q-001', 'demo', true, '{"id":"q-001","question":"지금 이직해도 괜찮을까요?","published":true,"cardCount":1,"deck":"major","spreadCount":null,"allowReversed":true,"reversedRate":30,"fallbackAspect":"career","answers":{}}'::jsonb
) on conflict (id) do update set
  published = excluded.published, data = excluded.data;

insert into public.questions (id, slug, published, data) values (
  'q-002', 'demo', true, '{"id":"q-002","question":"그 사람과 다시 만날 수 있을까요?","published":true,"cardCount":1,"deck":"major","spreadCount":null,"allowReversed":true,"reversedRate":30,"fallbackAspect":"love","answers":{}}'::jsonb
) on conflict (id) do update set
  published = excluded.published, data = excluded.data;

insert into public.questions (id, slug, published, data) values (
  'q-003', 'demo', true, '{"id":"q-003","question":"올해 안에 목돈을 모을 수 있을까요?","published":true,"cardCount":1,"deck":"major","spreadCount":null,"allowReversed":true,"reversedRate":30,"fallbackAspect":"money","answers":{}}'::jsonb
) on conflict (id) do update set
  published = excluded.published, data = excluded.data;

insert into public.questions (id, slug, published, data) values (
  'q-004', 'demo', true, '{"id":"q-004","question":"이 관계를 계속 이어가도 될까요?","published":true,"cardCount":1,"deck":"major","spreadCount":null,"allowReversed":true,"reversedRate":30,"fallbackAspect":"love","answers":{}}'::jsonb
) on conflict (id) do update set
  published = excluded.published, data = excluded.data;

insert into public.questions (id, slug, published, data) values (
  'q-005', 'demo', true, '{"id":"q-005","question":"새로 시작한 일이 잘 풀릴까요?","published":true,"cardCount":1,"deck":"major","spreadCount":null,"allowReversed":true,"reversedRate":30,"fallbackAspect":"career","answers":{}}'::jsonb
) on conflict (id) do update set
  published = excluded.published, data = excluded.data;

-- ══ 확인 ══════════════════════════════════════════
-- 계정을 안 만들었으면 owners/slot_admins 가 0 이다.
select 'owners' as t, count(*) from public.owners
union all select 'slot_admins', count(*) from public.slot_admins
union all select 'slots', count(*) from public.slots
union all select 'questions', count(*) from public.questions;
