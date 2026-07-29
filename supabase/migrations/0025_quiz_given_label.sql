-- 결과의 "내 답" 이 객관식에서 **숫자로 나왔다.**
--
-- 객관식 답은 보기 *인덱스*로 오가는데(0024), 다시보기 화면에 그 값을 그대로 실어 보내니
-- 방문자 화면에 "내 답 2" 가 떴다. 정답은 보기 글자로 나오는데 내 답만 숫자라 비교가 안 된다.
--
-- 고치는 자리는 **서버**다. 화면에서 인덱스를 보기 글자로 되돌리려면 그 문항의 보기 배열이
-- 필요한데, 채점 결과에는 문항이 안 실려 있다(정답이 딸려 갈 수 있어서 일부러 안 싣는다).
-- 그러니 이미 보기를 들고 있는 서버가 바꿔서 주는 게 맞다.
--
-- 나머지는 0024 와 같다.

create or replace function public.quiz_submit(target text, subj text, payload jsonb)
  returns jsonb
  language plpgsql security definer set search_path = public
as $$
declare
  s public.slots;
  cfg public.quiz_settings;
  q public.quiz_questions;
  ans jsonb;
  given text;
  shown text;
  ok boolean;
  score int := 0;
  total int := 0;
  correct int := 0;
  cnt int := 0;
  detail jsonb := '[]'::jsonb;
  att public.quiz_attempts;
  rw public.rewards;
  passed boolean := false;
  has_cfg boolean := false;
begin
  select * into s from public.slots where slug = target;
  if not found then raise exception '없는 이벤트예요' using errcode = 'P0001'; end if;
  if coalesce(s.service, 'tarot') <> 'quiz' then
    raise exception '이 이벤트에는 모의고사가 없어요' using errcode = 'P0001';
  end if;
  if not public.slot_open(s.period) then
    raise exception '지금은 참여할 수 없어요' using errcode = 'P0001';
  end if;

  select * into cfg from public.quiz_settings where slug = target;
  has_cfg := found;
  if has_cfg and cfg.closed then raise exception '마감됐어요' using errcode = 'P0001'; end if;

  perform public.rate_check(target, 'quiz', subj, 12, 400, 600);

  if has_cfg and not coalesce(cfg.allow_retry, true)
     and exists (select 1 from public.quiz_attempts where slug = target and subject = subj) then
    raise exception '이미 참여하셨어요' using errcode = 'P0001';
  end if;

  /*
   * **채점은 문항 테이블을 돌면서 한다** — payload 를 도는 게 아니다.
   * payload 를 기준으로 돌면 안 보낸 문항이 채점에서 통째로 빠지고, 그럼 한 문제만 맞히고
   * 나머지를 안 보내면 "1문항 중 1문항 정답" 이 되어 만점이 나온다.
   */
  for q in
    select * from public.quiz_questions
     where slug = target and hidden = false order by "order", created_at
  loop
    cnt := cnt + 1;
    total := total + greatest(q.points, 0);
    select a.answers into ans from public.quiz_answers a where a.question_id = q.id;

    select p ->> 'value' into given
      from jsonb_array_elements(coalesce(payload, '[]'::jsonb)) p
     where p ->> 'id' = q.id::text
     limit 1;

    ok := false;
    if ans is not null and jsonb_array_length(ans) > 0 and given is not null then
      if q.kind = 'choice' then
        ok := exists (select 1 from jsonb_array_elements_text(ans) x where x = given);
      else
        ok := exists (
          select 1 from jsonb_array_elements_text(ans) x
           where public.quiz_norm(x) = public.quiz_norm(given) and public.quiz_norm(given) <> ''
        );
      end if;
    end if;

    if ok then
      score := score + greatest(q.points, 0);
      correct := correct + 1;
    end if;

    /*
     * **화면에 보여줄 "내 답" 은 인덱스가 아니라 보기 글자다.**
     * 인덱스를 그대로 내려보내면 "내 답 2 / 정답 2015" 처럼 서로 다른 종류가 나란히 뜬다.
     * 되돌리는 데 보기 배열이 필요한데 그건 서버만 갖고 있으니 여기서 바꾼다.
     * (범위를 벗어난 값이면 `->>` 가 null 을 주므로 화면은 "—" 로 그린다.)
     */
    shown := case
      when given is null or given = '' then given
      when q.kind = 'choice' and given ~ '^[0-9]+$' then q.choices ->> given::int
      else given
    end;

    -- `showAnswers` 정책에 따라 **서버가 잘라서** 담는다 (클라이언트가 거르면 그건 안 가린 것이다)
    detail := detail || jsonb_build_object(
      'id', q.id, 'order', q."order", 'ok', ok,
      'body', case when coalesce(cfg.show_answers, 'wrongOnly') = 'none' then null else q.body end,
      'given', case when coalesce(cfg.show_answers, 'wrongOnly') = 'none' then null else shown end,
      'answer', case
        when coalesce(cfg.show_answers, 'wrongOnly') = 'none' then null
        when coalesce(cfg.show_answers, 'wrongOnly') = 'wrongOnly' and ok then null
        when q.kind = 'choice' then q.choices -> (ans ->> 0)::int
        else to_jsonb(ans ->> 0)
      end,
      /*
       * 재채점(`quiz_regrade`)이 다시 채점하려면 **원본 값**이 필요하다 — 위의 `given` 은
       * 보기 글자로 바뀌어 있어서 그걸로 다시 채점하면 객관식이 전부 오답이 된다.
       * `showAnswers` 와 무관하게 늘 담되, 이건 주최자만 읽는 `quiz_attempts.detail` 안에만
       * 남는다 (anon 은 그 테이블을 못 읽는다).
       */
      'raw', given
    );
  end loop;

  if cnt = 0 then raise exception '아직 문제가 준비되지 않았어요' using errcode = 'P0001'; end if;

  insert into public.quiz_attempts(slug, subject, score, total, correct, count, detail)
  values (target, subj, score, total, correct, cnt, detail)
  returning * into att;

  if has_cfg and coalesce(cfg.reward_mode, 'none') <> 'none' then
    passed := cfg.reward_mode = 'raffle' or score >= coalesce(cfg.reward_min_score, 0);
    if passed then
      rw := public.reward_claim(
        target, 'quiz', subj, att.id::text, att.id::text,
        coalesce(nullif(cfg.reward_label, ''), '선물'),
        case when cfg.reward_mode = 'threshold' then 'guaranteed' else 'raffle' end,
        score
      );
    end if;
  end if;

  return jsonb_build_object(
    'attemptId', att.id,
    'score', score, 'total', total, 'correct', correct, 'count', cnt,
    'detail', detail,
    'rewardCode', rw.code,
    'rewardKind', rw.kind
  );
end;
$$;
revoke execute on function public.quiz_submit(text, text, jsonb) from public;
grant execute on function public.quiz_submit(text, text, jsonb) to anon, authenticated;

-- 재채점도 **`raw`** 를 봐야 한다. 없는 옛 행은 `given` 으로 물러선다 (0024 로 만든 응시분).
create or replace function public.quiz_regrade(target text)
  returns int
  language plpgsql security definer set search_path = public
as $$
declare
  a public.quiz_attempts;
  q public.quiz_questions;
  ans jsonb;
  given text;
  ok boolean;
  new_score int;
  new_correct int;
  n int := 0;
begin
  if not (public.is_owner() or public.manages_slot(target)) then
    raise exception '권한이 없어요' using errcode = '42501';
  end if;

  for a in select * from public.quiz_attempts where slug = target loop
    new_score := 0; new_correct := 0;
    for q in select * from public.quiz_questions where slug = target and hidden = false loop
      select x.answers into ans from public.quiz_answers x where x.question_id = q.id;
      select coalesce(d ->> 'raw', d ->> 'given') into given
        from jsonb_array_elements(a.detail) d where d ->> 'id' = q.id::text limit 1;
      ok := false;
      if ans is not null and jsonb_array_length(ans) > 0 and given is not null then
        if q.kind = 'choice' then
          ok := exists (select 1 from jsonb_array_elements_text(ans) x where x = given);
        else
          ok := exists (
            select 1 from jsonb_array_elements_text(ans) x
             where public.quiz_norm(x) = public.quiz_norm(given) and public.quiz_norm(given) <> ''
          );
        end if;
      end if;
      if ok then new_score := new_score + greatest(q.points, 0); new_correct := new_correct + 1; end if;
    end loop;
    if new_score <> a.score or new_correct <> a.correct then
      update public.quiz_attempts set score = new_score, correct = new_correct where id = a.id;
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;
revoke execute on function public.quiz_regrade(text) from public, anon;
grant execute on function public.quiz_regrade(text) to authenticated, service_role;
