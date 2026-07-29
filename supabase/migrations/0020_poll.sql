-- 실시간 투표 — 방문자가 자기 폰으로 찍고 결과가 그 자리에서 차오른다.
--
-- 조작 주체가 롤링페이퍼와 같다(**anon 이 직접 쓴다**). 럭키드로우처럼 스태프 게이트가 없다.
-- 그래서 지켜야 할 것도 롤페와 같은 종류다: 누가 뭘 찍었는지 안 새는 것, 중복 투표가 안 되는 것.

-- ══ 1. 표 ═════════════════════════════════════════
create table if not exists public.poll_polls (
  id uuid primary key default gen_random_uuid(),
  slug text not null references public.slots(slug) on delete cascade on update cascade,
  title text not null,
  kind text not null default 'single' check (kind in ('single','multi')),
  max_pick int not null default 1,
  closed boolean not null default false,
  hidden boolean not null default false,     -- 주최자가 준비 중인 설문
  "order" int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.poll_polls(id) on delete cascade,
  "order" int not null default 0,
  label text not null,
  image text,
  /*
   * **집계를 컬럼으로 든다 — 럭키드로우와 반대다.**
   *
   * 0007 은 "소진 수량을 컬럼으로 두지 않는다, 로그에서 센다" 를 강하게 못박았다. 거기선
   * 사람이 `remaining` 을 직접 입력해서, 별도 카운터가 사람 입력과 어긋나는 순간이 온다.
   *
   * 투표는 다르다: 아무도 votes 를 손으로 안 고치고, 라이브 결과를 매번 count(*) 로 재면
   * 수백 대 화면이 그 쿼리를 계속 때린다. 그리고 `set votes = votes + 1` 은 읽고 쓰는 게
   * 아니라 **증분**이라 그 자체로 원자적이다(행 잠금) — lost update 가 안 난다.
   * 원장(poll_votes)은 그대로 둔다: 중복 검사·CSV·감사용.
   */
  votes int not null default 0
);
create index if not exists poll_options_poll_idx on public.poll_options (poll_id, "order");
create index if not exists poll_polls_slug_idx on public.poll_polls (slug, "order");

create table if not exists public.poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.poll_polls(id) on delete cascade,
  option_id uuid not null references public.poll_options(id) on delete cascade,
  subject text not null,
  created_at timestamptz not null default now(),
  -- 한 설문에 한 사람 한 번 (여러 개 고르기여도 제출은 한 번이다)
  unique (poll_id, subject, option_id)
);
create index if not exists poll_votes_lookup on public.poll_votes (poll_id, subject);

alter table public.poll_polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;

-- ══ 2. 정책 ═══════════════════════════════════════
--
-- 방문자는 **설문과 집계를 읽기만** 한다. 쓰기 정책은 아예 안 만든다 — cast_vote RPC 만 쓴다.
-- **poll_votes 에는 anon select 정책이 없다**: 누가 뭘 찍었는지 새면 안 된다.

drop policy if exists "anyone reads open polls" on public.poll_polls;
create policy "anyone reads open polls" on public.poll_polls for select
  using (
    hidden = false
    and exists (
      select 1 from public.slots s
      where s.slug = poll_polls.slug and public.slot_visible(s.period, s.service)
    )
  );

drop policy if exists "anyone reads options" on public.poll_options;
create policy "anyone reads options" on public.poll_options for select
  using (exists (
    select 1 from public.poll_polls p join public.slots s on s.slug = p.slug
    where p.id = poll_options.poll_id and p.hidden = false
      and public.slot_visible(s.period, s.service)
  ));

drop policy if exists "managers manage polls" on public.poll_polls;
create policy "managers manage polls" on public.poll_polls for all
  using (public.manages_slot(slug)) with check (public.manages_slot(slug));
drop policy if exists "owner manages polls" on public.poll_polls;
create policy "owner manages polls" on public.poll_polls for all
  using (public.is_owner()) with check (public.is_owner());

drop policy if exists "managers manage options" on public.poll_options;
create policy "managers manage options" on public.poll_options for all
  using (exists (select 1 from public.poll_polls p where p.id = poll_options.poll_id and public.manages_slot(p.slug)))
  with check (exists (select 1 from public.poll_polls p where p.id = poll_options.poll_id and public.manages_slot(p.slug)));
drop policy if exists "owner manages options" on public.poll_options;
create policy "owner manages options" on public.poll_options for all
  using (public.is_owner()) with check (public.is_owner());

drop policy if exists "managers read votes" on public.poll_votes;
create policy "managers read votes" on public.poll_votes for all
  using (exists (select 1 from public.poll_polls p where p.id = poll_votes.poll_id and public.manages_slot(p.slug)))
  with check (exists (select 1 from public.poll_polls p where p.id = poll_votes.poll_id and public.manages_slot(p.slug)));
drop policy if exists "owner reads votes" on public.poll_votes;
create policy "owner reads votes" on public.poll_votes for all
  using (public.is_owner()) with check (public.is_owner());

-- **update 를 anon 에게 주지 않는다.** 주면 RLS 와 무관하게 votes 를 직접 고칠 수 있다
grant select on public.poll_polls to anon, authenticated;
grant select on public.poll_options to anon, authenticated;
grant select, insert, update, delete on public.poll_polls to authenticated;
grant select, insert, update, delete on public.poll_options to authenticated;
grant select, insert, update, delete on public.poll_votes to authenticated;

-- ══ 3. 투표 ═══════════════════════════════════════
create or replace function public.cast_vote(target text, poll uuid, options uuid[], subj text)
  returns jsonb
  language plpgsql security definer set search_path = public
as $$
declare
  p public.poll_polls;
  s public.slots;
  n int;
begin
  select * into s from public.slots where slug = target;
  if not found then raise exception '없는 이벤트예요' using errcode = 'P0001'; end if;
  -- **다른 서비스 슬롯에 투표를 꽂는 걸 막는다** (화면만 갈라놓으면 RPC 는 그대로 열려 있다)
  if coalesce(s.service, 'tarot') <> 'poll' then
    raise exception '이 이벤트에는 투표가 없어요' using errcode = 'P0001';
  end if;
  if not public.slot_open(s.period) then
    raise exception '지금은 참여할 수 없어요' using errcode = 'P0001';
  end if;

  select * into p from public.poll_polls where id = poll and slug = target;
  if not found then raise exception '없는 설문이에요' using errcode = 'P0001'; end if;
  if p.closed or p.hidden then raise exception '마감된 설문이에요' using errcode = 'P0001'; end if;

  n := coalesce(array_length(options, 1), 0);
  if n = 0 then raise exception '하나 이상 골라 주세요' using errcode = '22023'; end if;
  if p.kind = 'single' and n > 1 then
    raise exception '하나만 고를 수 있어요' using errcode = '22023';
  end if;
  if n > greatest(p.max_pick, 1) then
    raise exception '너무 많이 골랐어요' using errcode = '22023';
  end if;

  -- 고른 것들이 정말 이 설문의 선택지인가 (남의 설문 id 를 섞어 보내는 걸 막는다)
  select count(*) into n from public.poll_options o
   where o.id = any(options) and o.poll_id = poll;
  if n <> coalesce(array_length(options, 1), 0) then
    raise exception '잘못된 선택이에요' using errcode = '22023';
  end if;

  -- 레이트리밋 — **재고 차감과 같은 트랜잭션에** 있어야 한다 (0018 주석)
  perform public.rate_check(target, 'vote', subj, 20, 400, 60);

  begin
    insert into public.poll_votes(poll_id, option_id, subject)
    select poll, unnest(options), subj;
  exception when unique_violation then
    raise exception '이미 투표하셨어요' using errcode = 'P0001';
  end;

  update public.poll_options set votes = votes + 1 where id = any(options);

  -- 최신 집계를 함께 돌려준다 — 왕복 한 번을 아낀다 (draw_prizes 가 재고를 동봉하는 것과 같은 결)
  return public.poll_tally(poll);
end;
$$;
revoke execute on function public.cast_vote(text, uuid, uuid[], text) from public;
grant execute on function public.cast_vote(text, uuid, uuid[], text) to anon, authenticated;

-- 집계 한 덩이 — 화면이 그대로 그린다
create or replace function public.poll_tally(poll uuid)
  returns jsonb language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'pollId', poll,
    'total', coalesce((select sum(votes) from public.poll_options where poll_id = poll), 0),
    'options', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'votes', o.votes) order by o."order")
        from public.poll_options o where o.poll_id = poll
    ), '[]'::jsonb)
  );
$$;
revoke execute on function public.poll_tally(uuid) from public;
grant execute on function public.poll_tally(uuid) to anon, authenticated;

-- 내가 뭘 찍었나 — **내 것만** 돌려준다 (남의 선택은 안 준다)
create or replace function public.poll_mine(target text, subj text)
  returns table (poll_id uuid, option_id uuid, created_at timestamptz)
  language sql security definer set search_path = public
as $$
  select v.poll_id, v.option_id, v.created_at
    from public.poll_votes v join public.poll_polls p on p.id = v.poll_id
   where p.slug = target and v.subject = subj;
$$;
revoke execute on function public.poll_mine(text, text) from public;
grant execute on function public.poll_mine(text, text) to anon, authenticated;

-- ══ 4. 실시간 ═════════════════════════════════════
--
-- **집계 행만 publication 에 넣는다.** 원장(poll_votes)을 넣으면 표 하나마다 모든 화면에
-- 이벤트가 가고 그게 곧 전체 리로드다. 옵션 행은 몇 개뿐이라 페이로드가 작고,
-- watch 규약("바뀌었다는 신호만 받고 다시 읽는다")과도 맞다.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'poll_options'
  ) then
    alter publication supabase_realtime add table public.poll_options;
  end if;
end $$;

-- ══ 5. 슬롯 설정 ══════════════════════════════════
alter table public.slots add column if not exists poll jsonb not null default '{}'::jsonb;
