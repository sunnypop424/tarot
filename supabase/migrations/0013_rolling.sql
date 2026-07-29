-- 0013_rolling.sql — 롤링페이퍼 (세 번째 서비스)
--
-- 방문자가 자기 폰으로 응원 메시지를 남기는 **공개 벽 + 후검수** 서비스.
-- 럭키드로우와 반대다: 스태프 로그인이 아니라 anon 이 직접 쓴다.
--   - 방문자는 열린 슬롯의 **숨김 아닌** 메시지를 읽고, 열린 슬롯에 남긴다.
--   - 주최자/최고관리자(manages_slot)는 전부(숨김 포함) 읽고, 숨기고, 지운다 (후검수).

-- 1) 슬롯에 롤링페이퍼 겉모습(최고관리자가 정하는 룩) — luckydraw 컬럼과 같은 짝.
--    빈 객체 = 전부 기본값 (rollingDisplay 가 키 단위로 채운다).
alter table public.slots
  add column if not exists rolling jsonb not null default '{}'::jsonb;

-- 2) 메시지 테이블
create table if not exists public.rolling_messages (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null references public.slots(slug) on delete cascade on update cascade,
  nickname   text not null default '',
  body       text not null,
  color      text not null default '',
  sticker    text,
  hidden     boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists rolling_messages_slug_created
  on public.rolling_messages (slug, created_at desc);

alter table public.rolling_messages enable row level security;

-- 3) 권한 — RLS 가 행을 거르지만, 테이블 접근 자체는 grant 로 연다.
--    (anon 은 읽고/남기고, 관리자만 고치고/지운다. RLS 가 실제 범위를 좁힌다.)
grant select, insert on public.rolling_messages to anon, authenticated;
grant update, delete on public.rolling_messages to authenticated;

-- 4) RLS
--
-- slot_open/slot_visible 은 **slug 가 아니라 슬롯의 period(jsonb)** 를 받는다 (0005/0009) —
-- prizes·shipping_entries 처럼 slots 를 조인하는 서브쿼리로 그 슬롯의 상태를 본다.
--   · 읽기(방문자)  : slot_visible(period, service) — 행사 + 유예기간 (prizes read, 0009 와 같은 결)
--   · 쓰기(방문자)  : slot_open(period)            — 행사 중에만 (shipping insert, 0007 과 같은 결)

-- 방문자: 열린(보이는) 슬롯의 **숨김 아닌** 메시지를 읽는다
drop policy if exists "anyone reads visible messages" on public.rolling_messages;
create policy "anyone reads visible messages"
  on public.rolling_messages for select
  using (
    hidden = false
    and exists (
      select 1 from public.slots s
      where s.slug = rolling_messages.slug
        and public.slot_visible(s.period, s.service)
    )
  );

-- 방문자: 행사 중인 슬롯에 남긴다 (스태프 게이트 없음 — 방문자가 직접 쓴다)
drop policy if exists "anyone posts to open slots" on public.rolling_messages;
create policy "anyone posts to open slots"
  on public.rolling_messages for insert
  with check (
    exists (
      select 1 from public.slots s
      where s.slug = rolling_messages.slug
        and public.slot_open(s.period)
    )
  );

-- 주최자: 자기 슬롯의 전부(숨김 포함)를 읽고·숨기고·지운다 (후검수) — luckydraw manages_slot 정책과 같은 짝
drop policy if exists "managers manage messages" on public.rolling_messages;
create policy "managers manage messages"
  on public.rolling_messages for all
  using (public.manages_slot(slug))
  with check (public.manages_slot(slug));

-- 최고관리자: 어느 슬롯이든 전부 (고객 대신 사고 수습) — luckydraw is_owner 정책과 같은 짝
drop policy if exists "owner manages all messages" on public.rolling_messages;
create policy "owner manages all messages"
  on public.rolling_messages for all
  using (public.is_owner())
  with check (public.is_owner());

-- 5) 실시간 — 벽이 다른 기기의 새 메시지를 받는다 (supabaseRolling.watch).
--    이미 추가돼 있으면 건너뛴다 — 마이그레이션을 다시 돌려도 안전하게.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'rolling_messages'
  ) then
    alter publication supabase_realtime add table public.rolling_messages;
  end if;
end $$;
