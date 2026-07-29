-- 0035_demo_reset.sql — 체험 슬롯을 **매일 기준값으로 되돌린다**
--
-- 0034 로 체험 슬롯의 관리 화면이 열렸다. 이제 아무나 상품 수량을 0으로 만들고 설문을
-- 지울 수 있다 — **그게 체험의 목적**이고, 대신 하루 지나면 원래대로 돌아와야 한다.
--
-- ── 기준값은 어디서 오나 ──────────────────────────
--
-- **seed 코드가 아니라 "그때 찍어 둔 상태"다.** 최고관리자가 체험 슬롯을 원하는 모습으로
-- 맞춰 놓고 `snapshot_demo()` 를 한 번 부르면, 그 순간이 기준이 된다. 럭키드로우 상품과
-- 수량처럼 **기본 설정이 곧 보여줄 내용인** 서비스가 있어서, 기준을 화면에서 만들 수 있어야
-- 한다 — SQL 이나 `seed-demo.mjs` 를 고쳐야 기본값이 바뀌는 구조면 아무도 안 고친다.
--
-- **자동으로 안 찍는다.** 매일 현재 상태를 기준 삼으면 어제 방문자가 어질러 둔 게 오늘의
-- 기본값이 된다. 기준을 바꾸는 건 늘 사람의 명시적 행동이다.
--
-- ── 단위는 묶음이다 ───────────────────────────────
--
-- 체험 슬롯은 열한 개고 한 벌로 움직인다(랜딩이 통째로 링크한다). 그래서 기준 뜨기·되돌리기의
-- 단위를 **묶음(`slots.group_name`, 0028)** 으로 잡는다 — 하나만 고쳐 놓고 그것만 기준을 뜨면
-- 다른 열 개는 옛 기준이라, 어느 게 최신인지 아무도 모르게 된다.
-- 인자를 비우면 **모든 체험 슬롯**이다.
--
-- ── 이미지가 안 지워지는 이유 ─────────────────────
--
-- **`slots` 행을 아예 안 건드린다.** 로고·배경·카드 앞뒤면·앱 아이콘·색·radius·기간이 전부
-- 거기 있다(`slots.theme`). 되돌리는 건 데이터 표뿐이라, 이미지는 손댈 일이 없다.
-- Storage 도 마찬가지다 — 이 함수는 파일을 모른다.

-- ══ 1. 기준표 ═════════════════════════════════════
create table if not exists public.demo_baseline (
  slug text not null,
  tbl text not null,
  rows jsonb not null,
  taken_at timestamptz not null default now(),
  primary key (slug, tbl)
);

alter table public.demo_baseline enable row level security;

-- 최고관리자만 본다 — 남에게 보일 값도 아니고, 되돌리기는 아래 함수가 한다
drop policy if exists "owner manages demo baseline" on public.demo_baseline;
create policy "owner manages demo baseline" on public.demo_baseline for all
  using (public.is_owner()) with check (public.is_owner());

comment on table public.demo_baseline is
  '체험 슬롯의 기준 상태. snapshot_demo() 가 채우고 reset_demo() 가 되돌린다 (0035).';

-- ══ 2. 되돌릴 표 목록 ═════════════════════════════
--
-- **부모 → 자식 순서다.** 넣을 땐 이 순서대로, 지울 땐 거꾸로 간다.
-- `scope` 는 그 표에서 이 슬롯의 행을 고르는 조건이다 — `poll_options` 처럼 slug 칸이
-- 없는 표는 부모를 타고 찾는다. `%L` 자리에 슬러그가 들어간다.
create or replace function public.demo_tables()
  returns table (tbl text, scope text) language sql immutable
as $$
  values
    ('questions',          'slug = %L'),
    ('prizes',             'slug = %L'),
    ('luckydraw_settings', 'slug = %L'),
    ('photocards',         'slug = %L'),
    ('photocard_settings', 'slug = %L'),
    ('poll_polls',         'slug = %L'),
    ('poll_options',       'poll_id in (select id from public.poll_polls where slug = %L)'),
    ('stamp_settings',     'slug = %L'),
    ('stamp_codes',        'slug = %L'),
    ('quiz_settings',      'slug = %L'),
    ('quiz_questions',     'slug = %L'),
    ('quiz_answers',       'question_id in (select id from public.quiz_questions where slug = %L)'),
    ('cheer_settings',     'slug = %L'),
    ('rolling_messages',   'slug = %L'),
    ('rewards',            'slug = %L');
$$;

-- 기준이 없는 표 — **되살리지 않고 지우기만 한다.** 방문자가 만든 기록이라 기준이 없다.
create or replace function public.demo_wipe_tables()
  returns table (tbl text, scope text) language sql immutable
as $$
  values
    ('poll_votes',        'poll_id in (select id from public.poll_polls where slug = %L)'),
    ('photocard_draws',   'slug = %L'),
    ('photocard_tickets', 'slug = %L'),
    ('stamp_checkins',    'slug = %L'),
    ('quiz_attempts',     'slug = %L'),
    ('draw_logs',         'slug = %L'),
    ('reward_entries',    'slug = %L'),
    ('reward_picks',      'slug = %L'),
    ('shipping_entries',  'slug = %L');
$$;

-- ══ 3. 기준 뜨기 ══════════════════════════════════
create or replace function public.snapshot_demo(grp text default null)
  returns table (slug text, tbl text, n int)
  language plpgsql security definer set search_path = public
as $$
declare
  s record;
  t record;
  payload jsonb;
begin
  if not public.is_owner() then
    raise exception '최고관리자만 기준을 뜰 수 있어요' using errcode = '42501';
  end if;

  for s in
    select sl.slug from public.slots sl
    where coalesce(sl.demo, false) and (grp is null or sl.group_name = grp)
  loop
    for t in select * from public.demo_tables() loop
      execute format(
        'select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.%I x where %s',
        t.tbl, format(t.scope, s.slug)
      ) into payload;

      insert into public.demo_baseline (slug, tbl, rows, taken_at)
      values (s.slug, t.tbl, payload, now())
      on conflict (slug, tbl) do update
        set rows = excluded.rows, taken_at = excluded.taken_at;

      slug := s.slug;
      tbl := t.tbl;
      n := jsonb_array_length(payload);
      return next;
    end loop;
  end loop;
end;
$$;

revoke execute on function public.snapshot_demo(text) from public;
grant execute on function public.snapshot_demo(text) to authenticated, service_role;

-- ══ 4. 되돌리기 ═══════════════════════════════════
--
-- **기준이 없으면 아무것도 안 한다.** 기준을 안 뜬 슬롯을 비워버리면 체험이 통째로 빈다 —
-- 되돌리기가 파괴가 되는 순간이다.
create or replace function public.reset_demo(grp text default null)
  returns table (slug text, tbl text, n int)
  language plpgsql security definer set search_path = public
as $$
declare
  s record;
  t record;
  payload jsonb;
begin
  for s in
    select sl.slug from public.slots sl
    where coalesce(sl.demo, false) and (grp is null or sl.group_name = grp)
  loop
    if not exists (select 1 from public.demo_baseline b where b.slug = s.slug) then
      continue;
    end if;

    -- 방문자 기록부터 비운다 (아래 표들을 참조하는 쪽이라 먼저 간다)
    for t in select * from public.demo_wipe_tables() loop
      execute format('delete from public.%I where %s', t.tbl, format(t.scope, s.slug));
    end loop;

    -- 기준 있는 표는 **자식 → 부모** 순으로 지우고
    for t in select * from public.demo_tables() order by 1 desc loop
      execute format('delete from public.%I where %s', t.tbl, format(t.scope, s.slug));
    end loop;

    -- **부모 → 자식** 순으로 되살린다
    for t in select * from public.demo_tables() loop
      select b.rows into payload
      from public.demo_baseline b where b.slug = s.slug and b.tbl = t.tbl;
      if payload is null or jsonb_array_length(payload) = 0 then continue; end if;

      execute format(
        'insert into public.%I select * from jsonb_populate_recordset(null::public.%I, $1)',
        t.tbl, t.tbl
      ) using payload;

      slug := s.slug;
      tbl := t.tbl;
      n := jsonb_array_length(payload);
      return next;
    end loop;
  end loop;
end;
$$;

revoke execute on function public.reset_demo(text) from public;
grant execute on function public.reset_demo(text) to service_role;

-- ══ 5. 스케줄 ═════════════════════════════════════
--
-- 0009 와 같은 자리다. **이 마이그레이션은 스케줄을 켜지 않는다** — 기준을 뜨기 전에 돌면
-- 아무 일도 안 하지만(4번), 사람이 한 번 눈으로 보고 켜는 편이 맞다.
--
--   1) 체험 슬롯을 보여주고 싶은 모습으로 맞춘다 (관리 화면에서)
--   2) select * from public.snapshot_demo('체험');   ← 그 묶음의 기준 뜨기 (비우면 전부)
--   3) select * from public.reset_demo('체험');      ← 되돌아오는지 눈으로 확인
--   4) 매시간 정각에 돌린다 (0037 에서 매일 → 매시간으로 바꿨다):
--        select cron.schedule('reset-demo-slots', '0 * * * *', $cron$
--          select public.reset_demo();
--        $cron$);
--
-- 0009 의 삭제와 달리 **Edge Function 이 필요 없다** — 계정도 이미지도 안 건드리고
-- DB 안에서 끝나는 일이라 pg_cron 이 SQL 을 바로 부른다.
