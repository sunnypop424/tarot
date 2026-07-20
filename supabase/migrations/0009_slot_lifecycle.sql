-- 슬롯 수명 — **행사가 끝난 뒤**를 정한다.
--
-- 0005 는 "행사 기간에만 열린다" 까지였다. 그런데 럭키드로우가 붙으면서 구멍이 드러났다:
-- 행사가 끝나는 순간 슬롯이 닫히면 **주최자가 배송 정보를 못 꺼낸다.** 당첨된 경품을 보내야
-- 하는데 명단이 잠긴 채로 사라지는 셈이다.
--
-- 그래서 두 개념을 나눈다:
--   slot_open(period)              — **행사 중인가.** 추첨은 이때만 된다 (0005 그대로, 안 건드린다)
--   slot_visible(period, service)  — **접근할 수 있나.** 럭키드로우는 마감 +14일까지 더 열린다
--
-- 나눠야 하는 이유: 유예 기간에도 뽑을 수 있으면 그건 행사가 안 끝난 것이다.
-- 유예는 **뒷정리를 위한 시간**이지 행사 연장이 아니다.
--
-- 그리고 마감 +15일이 지나면 **통째로 지운다** (§3).

-- ══ 1. 서비스별 유예 ══════════════════════════════
--
-- 타로는 0 이다 — 행사가 끝나면 주최자가 더 볼 게 없다 (질문·답변은 주최자가 만든 것이고
-- 방문자 데이터가 남지 않는다). 럭키드로우는 배송 명단이 남으므로 14일을 준다.
create or replace function public.slot_grace_days(service text)
  returns int language sql immutable
as $$
  select case when service = 'luckydraw' then 14 else 0 end;
$$;

-- ══ 2. 접근 판정 ══════════════════════════════════
create or replace function public.slot_visible(period jsonb, service text)
  returns boolean language plpgsql stable
  set search_path = public
as $$
declare
  grace int := public.slot_grace_days(service);
  rent_end date;
  today date := public.today_kst();
begin
  -- 행사 중이면 볼 것도 없다
  if public.slot_open(period) then return true; end if;
  if grace <= 0 then return false; end if;

  rent_end := nullif(period -> 'rent' ->> 'end', '')::date;
  if rent_end is null then return false; end if;

  /*
   * **`today > rent_end` 를 반드시 같이 본다.**
   * 이게 없으면 행사 *시작 전*에도 (rent_end 가 미래라) 조건이 참이 되어 슬롯이 미리 열린다 —
   * 유예가 앞으로도 적용되는 셈이다. 유예는 끝난 뒤에만 있다.
   */
  return today > rent_end and today <= rent_end + grace;
end;
$$;

-- ══ 3. 정책을 유예 기준으로 ═══════════════════════
--
-- slot_open 을 부르던 정책들을 slot_visible 로 옮긴다. 타로 슬롯은 grace 가 0 이라
-- **판정이 전과 완전히 같다** — 바뀌는 건 럭키드로우뿐이다.
drop policy if exists "anyone reads open slots" on public.slots;
create policy "anyone reads visible slots"
  on public.slots for select
  using (public.is_owner() or public.slot_visible(period, service));

drop policy if exists "anyone reads prizes of open slots" on public.prizes;
create policy "anyone reads prizes of visible slots"
  on public.prizes for select
  using (exists (
    select 1 from public.slots s
    where s.slug = prizes.slug and (public.is_owner() or public.slot_visible(s.period, s.service))
  ));

drop policy if exists "anyone reads settings of open slots" on public.luckydraw_settings;
create policy "anyone reads settings of visible slots"
  on public.luckydraw_settings for select
  using (exists (
    select 1 from public.slots s
    where s.slug = luckydraw_settings.slug
      and (public.is_owner() or public.slot_visible(s.period, s.service))
  ));

-- 배송 제출도 유예를 따른다 — 23:55 에 뽑고 00:05 에 제출하는 사람을 막을 이유가 없다
drop policy if exists "visitor submits shipping" on public.shipping_entries;
create policy "visitor submits shipping"
  on public.shipping_entries for insert
  with check (exists (
    select 1 from public.slots s
    where s.slug = shipping_entries.slug and public.slot_visible(s.period, s.service)
  ));

-- **추첨은 유예를 안 받는다.** draw_prizes 안의 검사는 slot_open 그대로 둔다 (0007) —
-- 유예 중에 뽑히면 그건 행사가 안 끝난 것이다.

grant execute on function public.slot_grace_days(text) to anon, authenticated;
grant execute on function public.slot_visible(jsonb, text) to anon, authenticated;

-- ══ 4. 자동 삭제 대상 ═════════════════════════════
--
-- 마감 +15일이 지나면 슬롯을 통째로 지운다 (주최자 계정·질문·상품·배송명단·이미지까지).
--
-- **마감일이 없으면 영원히 안 지운다.** 옮겨온 원본에도 같은 장치가 있었고(`isProtected`),
-- 이유가 옳다: 기간을 안 정한 슬롯은 "언제 끝나는지 모른다" 는 뜻이지 "지금 지워도 된다" 가 아니다.
-- 여기서 fail-closed 를 안 하면 기간 없는 슬롯이 만든 다음 날 사라진다.
--
-- 유예(14일)보다 하루 길다 — 접근이 막힌 채로 하루가 남는다. 그 하루가 "어? 안 들어가져요" 를
-- 듣고 되살릴 수 있는 마지막 창이다.
create or replace function public.expired_slots()
  returns table (slug text, name text, service text, rent_end date, delete_on date)
  language sql stable
  set search_path = public
as $$
  select s.slug, s.name, s.service,
         nullif(s.period -> 'rent' ->> 'end', '')::date,
         nullif(s.period -> 'rent' ->> 'end', '')::date + 15
    from public.slots s
   where nullif(s.period -> 'rent' ->> 'end', '') is not null
     and public.today_kst() > (nullif(s.period -> 'rent' ->> 'end', '')::date + 15)
   order by 4;
$$;

-- **service_role 만.** 이건 "무엇을 지울까" 목록이라 남에게 보일 값이 아니고,
-- 실제로 지우는 건 Edge Function 이다 (계정·이미지는 SQL 로 못 지운다).
revoke execute on function public.expired_slots() from public;
grant execute on function public.expired_slots() to service_role;

-- ══ 5. 스케줄은 여기서 켜지 않는다 ════════════════
--
-- **이 마이그레이션은 아무것도 지우지 않는다.** 지우는 일은 사람이 켜야 한다.
--
-- 먼저 눈으로 확인한다:
--   select * from public.expired_slots();
--
-- 목록이 납득되면 pg_cron 으로 매일 Edge Function 을 부른다 (KST 새벽 4시 = UTC 19시):
--   select cron.schedule('purge-expired-slots', '0 19 * * *', $cron$
--     select net.http_post(
--       url := 'https://<프로젝트>.supabase.co/functions/v1/admin/purge-expired',
--       headers := '{"x-cron-secret":"<CRON_SECRET>"}'::jsonb
--     );
--   $cron$);
--
-- CRON_SECRET 은 Edge Function secret 으로 넣는다 (`supabase secrets set CRON_SECRET=...`).
-- 왜 SQL 이 직접 안 지우나: 주최자 **계정**(auth.users)과 **이미지**(Storage)는 service_role
-- 이라야 지워지고, 그 로직은 이미 admin 함수의 purgeSlot 에 있다. 여기에 또 쓰면 둘이 어긋난다.
