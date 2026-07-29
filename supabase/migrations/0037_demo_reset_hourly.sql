-- 0037_demo_reset_hourly.sql — 되돌리기를 사람도 부를 수 있게 + 주기를 한 시간으로
--
-- ── 1. 최고관리자가 직접 되돌릴 수 있어야 한다 ────
--
-- 0036 은 `reset_demo` 를 service_role 에게만 줬다. 그러면 **눈으로 확인할 방법이 없다** —
-- 기준을 뜨고 "정말 돌아오나" 를 보려면 사람이 한 번 눌러봐야 하고, 체험이 이상해졌을 때
-- 다음 정각까지 기다릴 수도 없다.
--
-- 판정을 함수 안으로 옮긴다:
--   · JWT 가 있으면 → **최고관리자여야 한다**
--   · JWT 가 없으면 → 서버가 부른 것이다 (pg_cron·service_role) → 통과
--
-- anon 은 애초에 EXECUTE 가 없어 이 판정까지 오지도 못한다 (0036 에서 뺏었다).
--
-- ── 2. 매일이 아니라 매시간 ───────────────────────
--
-- 하루에 한 번이면, 아침에 누가 상품 수량을 0으로 만들어 두면 **그날 하루 종일** 체험이
-- 죽은 채로 있다. 랜딩에서 링크하는 공개 주소라 그 하루가 그대로 첫인상이 된다.
-- 되돌리기는 슬롯 열한 개 × 표 열다섯 개짜리 작은 일이라 매시간도 부담이 아니다.

create or replace function public.reset_demo(grp text default null)
  returns table (demo_slug text, demo_tbl text, rows_n int)
  language plpgsql security definer set search_path = public
as $$
declare
  s record;
  t record;
  payload jsonb;
begin
  -- 사람이 불렀으면 최고관리자만. 서버(cron·service_role)는 JWT 가 없다
  if auth.uid() is not null and not public.is_owner() then
    raise exception '최고관리자만 되돌릴 수 있어요' using errcode = '42501';
  end if;

  for s in
    select sl.slug as slug from public.slots sl
    where coalesce(sl.demo, false) and (grp is null or sl.group_name = grp)
  loop
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

revoke all on function public.reset_demo(text) from public, anon;
grant execute on function public.reset_demo(text) to authenticated, service_role;

-- ══ 스케줄 — 매시간 정각 ══════════════════════════
--
--   select cron.schedule('reset-demo-slots', '0 * * * *', $cron$
--     select public.reset_demo();
--   $cron$);
--
-- 시각은 UTC 지만 매시간이라 시차가 상관없다 (0009 의 삭제 작업과 다른 점이다).
-- 확인:  select * from cron.job;
-- 끄기:  select cron.unschedule('reset-demo-slots');
