-- AI 예산 방어 — Edge Function 이 쓰는 것들 (docs/BACKEND.md §4-3)
--
-- 개발 서버 미들웨어에선 사용량이 **프로세스 메모리**라 재시작하면 0 이 됐다.
-- 배포에선 그게 곧 "재시작할 때마다 예산이 리셋된다" 는 뜻이라 DB 로 옮긴다.

-- ══ 1. 한도는 슬롯 행에 굳어 있다 ══════════════════
--
-- 플랜(무료·라이트·스탠다드·프리미엄)은 슬롯을 **만들 때** limits 로 굳는다
-- (src/data/slots.ts 의 createSlot). 그래서 서버는 플랜표를 몰라도 되고,
-- 슬롯 행 하나만 읽으면 된다 — 플랜표 사본을 함수에 두면 그게 곧 드리프트다.
--
-- 혹시 limits 가 빈 슬롯이 있으면 플랜 기본값으로 채운다 (한 번만 도는 백필).
-- 값은 src/data/plans.json 과 같다.
update public.slots set limits = jsonb_build_object('reading', 0, 'answerGen', 0)
  where coalesce(plan, 'free') = 'free' and (limits is null or limits = '{}'::jsonb);
update public.slots set limits = jsonb_build_object('reading', 0, 'answerGen', 15)
  where plan = 'light' and (limits is null or limits = '{}'::jsonb);
update public.slots set limits = jsonb_build_object('reading', 1500, 'answerGen', 50)
  where plan = 'standard' and (limits is null or limits = '{}'::jsonb);
update public.slots set limits = jsonb_build_object('reading', 6000, 'answerGen', 150)
  where plan = 'premium' and (limits is null or limits = '{}'::jsonb);

-- ══ 2. 사용량을 원자적으로 깎는다 ══════════════════
--
-- **읽고-검사하고-쓰면 새는다.** 새로고침을 연타하면 여러 요청이 동시에 "아직 한도 남았네"
-- 를 보고 전부 통과한다. 한 문장(update ... where 현재값 < 한도)으로 붙여야
-- 행 잠금이 순서를 만들어 준다.
--
-- 한도는 여기서 슬롯 행을 직접 읽는다 — 호출자가 한도를 넘겨주면 그쪽이 우기면 그만이다.
-- 돌려주는 값: true = 깎았다(써도 된다), false = 한도 초과.
create or replace function public.claim_ai_usage(target text, kind text)
  returns boolean language plpgsql security definer
  set search_path = public
as $$
declare
  cap int;
  claimed int;
begin
  if kind not in ('reading', 'answer_gen') then
    raise exception '알 수 없는 종류: %', kind;
  end if;

  select coalesce((s.limits ->> case kind when 'reading' then 'reading' else 'answerGen' end)::int, 0)
    into cap
    from public.slots s where s.slug = target;

  -- 없는 슬롯이거나 한도 0 이면 아예 못 쓴다 (fail closed — 모르면 안 써주는 쪽이 맞다)
  if cap is null or cap <= 0 then return false; end if;

  insert into public.ai_usage (slug) values (target) on conflict (slug) do nothing;

  if kind = 'reading' then
    update public.ai_usage set reading = reading + 1, updated_at = now()
      where slug = target and reading < cap;
  else
    update public.ai_usage set answer_gen = answer_gen + 1, updated_at = now()
      where slug = target and answer_gen < cap;
  end if;

  get diagnostics claimed = row_count;
  return claimed > 0;
end;
$$;

-- 생성이 실패하면 되돌린다 — 실패에 돈을 물리지 않는다
create or replace function public.release_ai_usage(target text, kind text)
  returns void language plpgsql security definer
  set search_path = public
as $$
begin
  if kind = 'reading' then
    update public.ai_usage set reading = greatest(reading - 1, 0), updated_at = now()
      where slug = target;
  elsif kind = 'answer_gen' then
    update public.ai_usage set answer_gen = greatest(answer_gen - 1, 0), updated_at = now()
      where slug = target;
  end if;
end;
$$;

-- ══ 3. 레이트리밋 ═════════════════════════════════
--
-- 한도(슬롯당 수천 회)는 **예산**을 지키지 새로고침 연타를 막지 못한다.
-- 한 사람이 1분에 리딩 100번을 부르면 한도 안에서도 돈이 순식간에 나간다.
create table if not exists public.ai_rate (
  id           text primary key,   -- '{종류}:{슬러그}:{누구}'
  window_start timestamptz not null default now(),
  count        int not null default 0
);

-- 오래된 창은 남겨둘 이유가 없다 — 청소는 아래 함수가 지나가며 한다
create index if not exists ai_rate_window_idx on public.ai_rate (window_start);

-- true = 통과, false = 너무 잦다. 창이 지났으면 초기화하고 다시 센다.
create or replace function public.bump_ai_rate(rate_id text, per_window int, window_seconds int)
  returns boolean language plpgsql security definer
  set search_path = public
as $$
declare
  now_count int;
begin
  insert into public.ai_rate (id) values (rate_id) on conflict (id) do nothing;

  update public.ai_rate
    set count = case when window_start < now() - make_interval(secs => window_seconds) then 1 else count + 1 end,
        window_start = case when window_start < now() - make_interval(secs => window_seconds) then now() else window_start end
    where id = rate_id
    returning count into now_count;

  return now_count <= per_window;
end;
$$;

-- ══ 4. 권한 ═══════════════════════════════════════
--
-- 이 함수들은 **Edge Function(service_role)만** 부른다. 브라우저가 직접 부르면
-- release_ai_usage 로 사용량을 0 으로 되돌려 예산 방어를 통째로 무력화할 수 있다.
--
-- **`from anon, authenticated` 로 뺏으면 안 뺏긴다.** create function 은 EXECUTE 를
-- **PUBLIC** 에게 주고, anon·authenticated 는 PUBLIC 을 통해 상속받는다 — 그 두 롤에서만
-- revoke 해도 PUBLIC 권한이 그대로 남는다. (실제로 그렇게 썼다가 anon 키로 200 이 떴다.)
-- PUBLIC 에서 뺏고, 필요한 롤에만 도로 준다.
revoke execute on function public.claim_ai_usage(text, text) from public;
revoke execute on function public.release_ai_usage(text, text) from public;
revoke execute on function public.bump_ai_rate(text, int, int) from public;

grant execute on function public.claim_ai_usage(text, text) to service_role;
grant execute on function public.release_ai_usage(text, text) to service_role;
grant execute on function public.bump_ai_rate(text, int, int) to service_role;

alter table public.ai_rate enable row level security;
-- 정책을 하나도 안 만든다 = service_role 말고는 아무도 못 본다 (service_role 은 RLS 를 지나친다)
