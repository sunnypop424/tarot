-- anon 이 부르는 RPC 의 레이트리밋 — **네 서비스가 같이 쓴다.**
--
-- `docs/PRICING.md` §5 가 "없음" 이라고 적어둔 구멍이다. 곧 붙을 투표·스탬프·포토카드·모의고사가
-- 전부 **로그인 없는 손님이 직접 부르는 RPC** 라, 하나씩 만들면 같은 코드가 네 벌이 된다.
--
-- ══ 왜 Edge Function 이 아니라 Postgres 인가 ══════
--
-- 이 호출들은 이미 Postgres RPC 다. 앞에 함수를 하나 더 두면 홉이 늘고, 무엇보다
-- **레이트리밋 검사가 재고 차감과 같은 트랜잭션에 있어야 한다.** 밖에 두면
-- "재고를 태우고 나서 리밋에 걸리는" 순서가 생긴다 — 한정 포토카드에서 그건 그냥 사고다.
--
-- ══ 정직하게 적어둘 한계 ══════════════════════════
--
-- **공개 anon 엔드포인트에서 사람은 식별할 수 없다.**
--   · subject 는 브라우저가 만든 uuid(`src/lib/visitor.ts`) — 지우면 초기화된다
--   · IP 는 카페 NAT 하나 = 방문자 전원이 같은 IP 다
-- 그래서 IP 캡은 "1인 규칙" 이 아니라 **자동화 천장**으로만 쓴다(슬롯당 시간당 수백 회).
-- 막을 수 있는 건 실수 연타와 정직한 반복까지고, 작정한 사람은 못 막는다.
-- 진짜 1인 1회가 필요하면 스태프가 개입하는 장치(발급 코드 확인)가 있어야 한다.
-- **"1인 1회 보장" 을 주최자에게 약속하면 안 된다.**

-- ══ 1. 기록 ═══════════════════════════════════════
create table if not exists public.rate_events (
  id bigserial primary key,
  slug text not null references public.slots(slug) on delete cascade on update cascade,
  -- 'gacha' | 'vote' | 'stamp' | 'stamp_fail' | 'quiz' | 'ticket'
  action text not null,
  subject text not null,
  ip inet,
  created_at timestamptz not null default now()
);

-- 창(window) 조회가 전부라 (slug, action, 주체, 시간) 순서로 건다
create index if not exists rate_events_subject_idx
  on public.rate_events (slug, action, subject, created_at desc);
create index if not exists rate_events_ip_idx
  on public.rate_events (slug, action, ip, created_at desc);

alter table public.rate_events enable row level security;
-- 정책을 하나도 안 만든다: **definer 함수만 읽고 쓴다.** anon 이 직접 볼 이유가 없다
-- (누가 언제 뭘 했는지가 담긴 로그다).

-- ══ 2. 검사 ═══════════════════════════════════════
--
-- 통과하면 이번 호출을 기록하고 조용히 돌아온다. 넘치면 **예외를 던진다** —
-- 부르는 쪽이 검사 결과를 무시하고 진행하는 일이 없게 (반환값이면 무시가 가능하다).
create or replace function public.rate_check(
  target text,
  act text,
  subj text,
  per_subject int,
  per_ip int,
  window_secs int
) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  since timestamptz := now() - make_interval(secs => greatest(window_secs, 1));
  addr inet;
  n int;
begin
  if subj is null or length(subj) = 0 then
    raise exception '잘못된 요청이에요' using errcode = '22023';
  end if;

  -- 요청 IP — definer 안에서도 GUC 는 요청 컨텍스트라 읽힌다.
  -- 프록시를 여러 번 거치면 쉼표로 이어지므로 **첫 홉**만 본다.
  begin
    addr := split_part(
      coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''),
      ',', 1
    )::inet;
  exception when others then
    addr := null;  -- 로컬 호출 등 헤더가 없을 때 — IP 캡만 건너뛴다
  end;

  if per_subject > 0 then
    select count(*) into n
      from public.rate_events e
     where e.slug = target and e.action = act and e.subject = subj and e.created_at >= since;
    if n >= per_subject then
      raise exception '잠시 후 다시 시도해 주세요' using errcode = 'P0001';
    end if;
  end if;

  if per_ip > 0 and addr is not null then
    select count(*) into n
      from public.rate_events e
     where e.slug = target and e.action = act and e.ip = addr and e.created_at >= since;
    if n >= per_ip then
      raise exception '잠시 후 다시 시도해 주세요' using errcode = 'P0001';
    end if;
  end if;

  insert into public.rate_events(slug, action, subject, ip) values (target, act, subj, addr);

  /*
   * 뒷정리 — **cron 을 안 만든다.** 100번에 한 번꼴로 오래된 것을 같이 지운다.
   * 별도 스케줄러를 두면 그게 안 도는 걸 아무도 모르는 채로 테이블만 커진다.
   * 이틀이면 어떤 창(window)보다도 길다.
   */
  if random() < 0.01 then
    delete from public.rate_events where created_at < now() - interval '2 days';
  end if;
end;
$$;

-- ══ 3. 권한 ═══════════════════════════════════════
--
-- **anon 은 이 함수를 직접 못 부른다.** 부를 수 있으면 리밋을 미리 태워
-- 남의 뽑기를 막을 수 있다(레이트리밋으로 레이트리밋을 공격하는 꼴).
-- 각 서비스 RPC(security definer)가 자기 안에서 부른다.
--
-- 0010 의 교훈대로 **먼저 뺏고 명시적으로 준다** — default privileges 가 PUBLIC 에 주는 분이 있다.
revoke execute on function public.rate_check(text, text, text, int, int, int) from public, anon, authenticated;
grant execute on function public.rate_check(text, text, text, int, int, int) to service_role;
