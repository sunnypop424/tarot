-- 0036_demo_reset_fix.sql — 0035 의 두 가지 실수
--
-- `verify-demo-admin.mjs` 가 바로 잡아낸 것들이다. 둘 다 **적용하고 나서야** 드러났다 —
-- 문법은 통과하고 실행에서 터지는 종류라, 돌려보지 않았으면 몰랐다.
--
-- ── 1. 출력 컬럼 이름이 표의 컬럼과 겹쳤다 ────────
--
--   returns table (slug text, ...)   ← 이 `slug` 가
--   ... where b.slug = s.slug        ← 여기서 "어느 slug 냐" 로 터진다
--   ERROR 42702: column reference "slug" is ambiguous
--
-- `snapshot_demo` 는 **한 줄도 못 찍고** 400 을 냈다. 그런데 PostgREST 는 에러를 냈어도
-- 호출 자체는 200 처럼 보이는 경로가 있어(다른 함수), "기준을 떴다" 고 믿기 쉬웠다.
-- 그 다음 `reset_demo` 가 빈 기준으로 돌면 **지우기만 하고 되살리지 못한다** — 실제로
-- 검증 중에 체험 쪽지 8장이 그렇게 날아갔다(다시 seed 해 복구).
--
-- 그래서 출력 이름을 표에 없는 것으로 바꾼다. `#variable_conflict` 로 덮지 않는 이유:
-- 그건 파일 전체의 해석 규칙을 바꿔서, 나중에 이 함수를 고치는 사람이 규칙을 모른 채
-- 지역변수를 하나 더 만들면 조용히 반대로 해석된다.
--
-- ── 2. anon 이 reset_demo 를 부를 수 있었다 ───────
--
-- `revoke ... from public` 만으로는 부족했다. Supabase 는 `anon`·`authenticated` 에게
-- 별도로 실행 권한을 준다 — `public` 에서 뺏어도 그 직접 권한이 남는다.
-- 되돌리기는 지우고 다시 넣는 일이라 **아무나 부를 수 있으면 안 된다.**

-- ══ 1. 기준 뜨기 ══════════════════════════════════
drop function if exists public.snapshot_demo(text);
create function public.snapshot_demo(grp text default null)
  returns table (demo_slug text, demo_tbl text, rows_n int)
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
    select sl.slug as slug from public.slots sl
    where coalesce(sl.demo, false) and (grp is null or sl.group_name = grp)
  loop
    for t in select * from public.demo_tables() loop
      execute format(
        'select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.%I x where %s',
        t.tbl, format(t.scope, s.slug)
      ) into payload;

      insert into public.demo_baseline as b (slug, tbl, rows, taken_at)
      values (s.slug, t.tbl, payload, now())
      on conflict (slug, tbl) do update
        set rows = excluded.rows, taken_at = excluded.taken_at;

      demo_slug := s.slug;
      demo_tbl := t.tbl;
      rows_n := jsonb_array_length(payload);
      return next;
    end loop;
  end loop;
end;
$$;

-- ══ 2. 되돌리기 ═══════════════════════════════════
drop function if exists public.reset_demo(text);
create function public.reset_demo(grp text default null)
  returns table (demo_slug text, demo_tbl text, rows_n int)
  language plpgsql security definer set search_path = public
as $$
declare
  s record;
  t record;
  payload jsonb;
begin
  for s in
    select sl.slug as slug from public.slots sl
    where coalesce(sl.demo, false) and (grp is null or sl.group_name = grp)
  loop
    -- **기준이 없으면 아무것도 안 한다.** 없는 채로 지우면 되돌리기가 파괴가 된다
    if not exists (select 1 from public.demo_baseline b where b.slug = s.slug) then
      continue;
    end if;

    for t in select * from public.demo_wipe_tables() loop
      execute format('delete from public.%I where %s', t.tbl, format(t.scope, s.slug));
    end loop;

    for t in select * from public.demo_tables() order by 1 desc loop
      execute format('delete from public.%I where %s', t.tbl, format(t.scope, s.slug));
    end loop;

    for t in select * from public.demo_tables() loop
      select b.rows into payload
      from public.demo_baseline b where b.slug = s.slug and b.tbl = t.tbl;
      if payload is null or jsonb_array_length(payload) = 0 then continue; end if;

      execute format(
        'insert into public.%I select * from jsonb_populate_recordset(null::public.%I, $1)',
        t.tbl, t.tbl
      ) using payload;

      demo_slug := s.slug;
      demo_tbl := t.tbl;
      rows_n := jsonb_array_length(payload);
      return next;
    end loop;
  end loop;
end;
$$;

-- ══ 3. 권한 — 직접 준 것까지 뺏는다 ═══════════════
revoke all on function public.snapshot_demo(text) from public, anon;
revoke all on function public.reset_demo(text) from public, anon, authenticated;

-- 기준 뜨기는 로그인한 사람이 부르고, **판정은 함수 첫 줄의 `is_owner()`** 가 한다
grant execute on function public.snapshot_demo(text) to authenticated, service_role;
-- 되돌리기는 사람이 부르는 일이 아니다 — pg_cron(postgres)과 service_role 만
grant execute on function public.reset_demo(text) to service_role;
