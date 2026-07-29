-- 타로 포켓 — 초기 스키마
--
-- 이 파일이 하는 일의 절반은 테이블이고, 절반은 **격리**다.
-- 지금은 "리안 관리자가 하온 슬롯을 못 건드린다"를 프론트가 지키는데(useAdminAuth 의 slug 비교),
-- 프론트는 얼마든지 우회된다. anon 키는 브라우저에 내려가므로 누구나 그 키로 아무 테이블이나
-- 부를 수 있다 — **RLS 를 켜야 비로소 진짜가 된다.**
--
-- 적용:
--   Supabase 대시보드 → SQL Editor 에 통째로 붙여넣고 Run
--   (또는 supabase CLI: npx supabase db push)

-- ══ 역할 ══════════════════════════════════════════
-- auth.users 는 Supabase 가 관리한다. 우리는 "누가 무엇을 관리하나"만 갖는다.

-- 최고관리자 — 슬롯을 만들고 테마를 정한다. 슬롯에 매이지 않는다.
create table public.owners (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- 주최자 — **계정 하나에 슬롯 하나.** (user_id 가 PK 인 이유)
--
-- 코드가 이미 그 전제로 돼 있다 (AdminUser 에 slug 가 하나뿐이고, useAdminAuth 가
-- user.slug === slug 로 비교한다). DB 가 여러 슬롯을 허용하면 "그래서 지금 어느 슬롯이지?"가
-- 생기고 그 순간 격리가 흔들린다. 한 사람이 두 이벤트를 하면 계정을 두 개 준다.
create table public.slot_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  slug text not null,
  created_at timestamptz not null default now()
);

-- ══ 슬롯 ══════════════════════════════════════════
-- 지금 src/data/slots.json 이 하는 일. 최고관리자만 쓴다.
create table public.slots (
  slug text primary key,
  name text not null,
  service text not null default 'tarot',
  -- 플랜 = AI 예산 상한 (src/data/plans.json)
  plan text not null default 'free',
  -- 플랜 기본 한도를 덮어쓸 때 { "reading": n, "answerGen": n }
  limits jsonb not null default '{}'::jsonb,
  deck text not null default 'full',
  -- src/types/theme.ts 그대로 (색·형태·이미지 URL)
  theme jsonb not null,
  -- 카테고리별 뽑기 설정 {categoryId: {cardCount, ...}}
  event jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.slot_admins
  add constraint slot_admins_slug_fkey foreign key (slug)
  references public.slots(slug) on delete cascade;

-- ══ 질문 ══════════════════════════════════════════
-- data 에 Question 전체를 담는다 (answers 포함 — 78장 × 정/역이면 156개라 컬럼으로 못 쪼갠다).
-- published 만 컬럼으로 뺀 이유: **RLS 가 이 값으로 방문자를 거른다.** jsonb 안에 있으면 정책이 못 본다.
create table public.questions (
  id text primary key,
  slug text not null references public.slots(slug) on delete cascade,
  published boolean not null default false,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index questions_slug_idx on public.questions (slug);
create index questions_slug_published_idx on public.questions (slug, published);

-- ══ AI 사용량 · 캐시 ═══════════════════════════════
-- 지금은 개발 서버 미들웨어의 프로세스 메모리라 재시작하면 0 이 된다 (docs/PRICING.md §5).
-- Edge Function 이 붙으면 여기를 쓴다. **service_role 로만 접근한다** — 방문자가 못 고쳐야 한다.
create table public.ai_usage (
  slug text primary key references public.slots(slug) on delete cascade,
  reading int not null default 0,
  answer_gen int not null default 0,
  updated_at timestamptz not null default now()
);

-- 같은 조합이면 다시 만들지 않는다. 원가 절감은 1~4% 뿐이고(조합이 74,000가지),
-- 진짜 이유는 **일관성** — 같은 방문자가 새로고침하면 같은 리딩이 나와야 한다.
create table public.reading_cache (
  key text primary key,
  slug text not null references public.slots(slug) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);

create index reading_cache_slug_idx on public.reading_cache (slug);

-- ══ 권한 검사 함수 ═════════════════════════════════
-- security definer 인 이유: 정책 안에서 owners/slot_admins 를 조회하는데,
-- 그 테이블에도 RLS 가 걸려 있으면 서브쿼리가 아무것도 못 읽어 정책이 항상 false 가 된다.
-- search_path 를 못박는다 — 안 그러면 호출자가 search_path 를 바꿔 다른 테이블을 보게 할 수 있다.

create or replace function public.is_owner()
  returns boolean language sql security definer stable
  set search_path = public
as $$
  select exists (select 1 from public.owners where user_id = auth.uid());
$$;

create or replace function public.manages_slot(target text)
  returns boolean language sql security definer stable
  set search_path = public
as $$
  select exists (
    select 1 from public.slot_admins
    where user_id = auth.uid() and slug = target
  );
$$;

-- ══ RLS ═══════════════════════════════════════════
alter table public.owners enable row level security;
alter table public.slot_admins enable row level security;
alter table public.slots enable row level security;
alter table public.questions enable row level security;
alter table public.ai_usage enable row level security;
alter table public.reading_cache enable row level security;

-- ── 역할 ──────────────────────────────────────────
-- **자기 것만 읽는다.** 화면이 "나는 무슨 역할이고 어느 슬롯을 맡았나"를 알아야 하기 때문이다.
-- 쓰기 정책은 없다 — 계정 매핑은 최고관리자가 대시보드에서 직접 넣는다 (슬롯을 열어줄 때).
-- 남의 행은 못 읽는다: 누가 어느 슬롯 관리자인지는 남이 알 일이 아니다.
create policy "user reads own owner row"
  on public.owners for select
  using (user_id = auth.uid());

create policy "user reads own admin row"
  on public.slot_admins for select
  using (user_id = auth.uid());

-- ── 슬롯 ──────────────────────────────────────────
-- 방문자: 읽어야 앱이 뜬다 (테마·플랜). 슬러그를 알아야 들어오므로 목록 노출과는 다르다.
create policy "anyone reads slots"
  on public.slots for select
  using (true);

-- 최고관리자만 만들고 고치고 지운다. 주최자에게 쓰기를 주지 않는 게 역할 분리의 핵심이다.
create policy "owner writes slots"
  on public.slots for all
  using (public.is_owner())
  with check (public.is_owner());

-- ── 질문 ──────────────────────────────────────────
-- 방문자: **공개된 것만.** 비공개 질문은 존재 자체가 안 보인다.
create policy "anyone reads published questions"
  on public.questions for select
  using (published = true);

-- 주최자: 자기 슬롯 질문만 (비공개 포함) 읽고 쓴다.
-- using 과 with check 를 둘 다 건다 — using 만 걸면 남의 슬롯으로 slug 를 바꿔 넣을 수 있다.
create policy "organizer manages own slot questions"
  on public.questions for all
  using (public.manages_slot(slug))
  with check (public.manages_slot(slug));

-- 최고관리자: 전부 (대신 만들어주거나 사고를 수습해야 한다)
create policy "owner manages all questions"
  on public.questions for all
  using (public.is_owner())
  with check (public.is_owner());

-- ── AI 사용량 · 캐시 ───────────────────────────────
-- 정책 없음 = anon/authenticated 접근 불가. Edge Function 이 service_role 로만 만진다.
-- 방문자가 카운터를 0 으로 돌릴 수 있으면 한도가 한도가 아니다.

-- ══ updated_at ════════════════════════════════════
create or replace function public.touch_updated_at()
  returns trigger language plpgsql
  set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger slots_touch before update on public.slots
  for each row execute function public.touch_updated_at();
create trigger questions_touch before update on public.questions
  for each row execute function public.touch_updated_at();
