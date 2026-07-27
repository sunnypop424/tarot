-- 한 사람이 한 설문에 **한 번만** 찍게 한다.
--
-- 0020 은 `unique (poll_id, subject, option_id)` 로 막으려 했는데, 그건 "같은 선택지에
-- 두 번" 만 막는다. **다른 선택지를 고르면 그대로 또 찍혔다** — `verify-poll.mjs` 가 잡았다.
--
-- 컬럼 제약만으로는 못 막는 이유: '여러 개 고르기' 설문은 한 사람이 여러 행을 정상적으로
-- 갖는다. 그래서 "이 설문에 이 사람 행이 하나라도 있나" 를 **RPC 안에서** 본다.
-- 제약은 그대로 둔다 — 같은 선택지 중복이라는 다른 사고를 막는 백스톱이다.
--
-- 그리고 `poll_mine` 을 방문자가 "내가 뭘 찍었나" 로 쓰는데, 여러 개 고르기에서 여러 행이
-- 오는 건 정상이다. 검증이 "1행" 을 기대했던 건 검증 쪽 오해라 그쪽을 고쳤다.

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
  if coalesce(s.service, 'tarot') <> 'poll' then
    raise exception '이 이벤트에는 투표가 없어요' using errcode = 'P0001';
  end if;
  if not public.slot_open(s.period) then
    raise exception '지금은 참여할 수 없어요' using errcode = 'P0001';
  end if;

  select * into p from public.poll_polls where id = poll and slug = target;
  if not found then raise exception '없는 설문이에요' using errcode = 'P0001'; end if;
  if p.closed or p.hidden then raise exception '마감된 설문이에요' using errcode = 'P0001'; end if;

  -- **이미 찍었나** — 컬럼 제약이 못 잡는 자리(다른 선택지로 다시 찍기)를 여기서 막는다
  if exists (select 1 from public.poll_votes v where v.poll_id = poll and v.subject = subj) then
    raise exception '이미 투표하셨어요' using errcode = 'P0001';
  end if;

  n := coalesce(array_length(options, 1), 0);
  if n = 0 then raise exception '하나 이상 골라 주세요' using errcode = '22023'; end if;
  if p.kind = 'single' and n > 1 then
    raise exception '하나만 고를 수 있어요' using errcode = '22023';
  end if;
  if n > greatest(p.max_pick, 1) then
    raise exception '너무 많이 골랐어요' using errcode = '22023';
  end if;

  select count(*) into n from public.poll_options o
   where o.id = any(options) and o.poll_id = poll;
  if n <> coalesce(array_length(options, 1), 0) then
    raise exception '잘못된 선택이에요' using errcode = '22023';
  end if;

  perform public.rate_check(target, 'vote', subj, 20, 400, 60);

  begin
    insert into public.poll_votes(poll_id, option_id, subject)
    select poll, unnest(options), subj;
  exception when unique_violation then
    -- 위 exists 검사와 이 삽입 사이에 같은 사람이 동시에 눌렀다 (더블탭·두 탭)
    raise exception '이미 투표하셨어요' using errcode = 'P0001';
  end;

  update public.poll_options set votes = votes + 1 where id = any(options);

  return public.poll_tally(poll);
end;
$$;
revoke execute on function public.cast_vote(text, uuid, uuid[], text) from public;
grant execute on function public.cast_vote(text, uuid, uuid[], text) to anon, authenticated;
