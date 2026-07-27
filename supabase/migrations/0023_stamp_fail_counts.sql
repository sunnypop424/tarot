-- 스탬프 브루트포스 차단이 **실제로는 안 걸리고 있었다.**
--
-- 0022 는 틀린 암호에 `raise exception` 을 썼다. 그런데 예외는 트랜잭션을 통째로 되감고,
-- 되감기는 것 중에 **바로 앞에서 `rate_check` 가 넣은 `rate_events` 행**이 들어 있다.
-- 즉 실패할 때마다 카운터가 같이 지워져서, 8회 제한이 영원히 1회로 리셋됐다.
-- `scripts/verify-stamp.mjs` 가 14번을 연속으로 틀렸는데도 안 막힌 게 그 증거다.
--
-- 고치는 방법은 **틀린 시도에서 예외를 안 던지는 것**이다 — 실패를 값으로 돌려주면
-- 트랜잭션이 커밋되고 카운터가 남는다. (Postgres 에는 자율 트랜잭션이 없어서,
-- "예외를 던지면서 로그만 남기기" 는 dblink 같은 걸 끌어와야 한다. 그럴 값어치가 없다.)
--
-- **이 함정은 레이트리밋을 쓰는 모든 RPC 에 있다.** 카운터를 넣고 나서 예외로 빠져나가는
-- 경로가 있으면 그 경로는 세지지 않는다. 투표·가챠도 같은 눈으로 볼 것.
--
-- 대신 반환값에 `ok` 가 생긴다 — 화면은 `ok=false` 면 `message` 를 그대로 보여준다.
-- 슬롯 자체가 잘못됐거나(서비스 불일치·기간 종료) 리밋에 걸린 건 그대로 예외다:
-- 그건 "다시 입력해 보세요" 가 아니라 화면이 통째로 다른 상태여야 하는 상황이다.

create or replace function public.stamp_checkin(target text, subj text, raw_code text)
  returns jsonb
  language plpgsql security definer set search_path = public
as $$
declare
  s public.slots;
  cfg public.stamp_settings;
  hit public.stamp_codes;
  today date := (now() at time zone 'Asia/Seoul')::date;
  norm text := upper(regexp_replace(coalesce(raw_code, ''), '[^0-9A-Za-z]', '', 'g'));
  total int;
  got int;
  pkey text;
  rw public.rewards;
  dup boolean := false;
begin
  select * into s from public.slots where slug = target;
  if not found then raise exception '없는 이벤트예요' using errcode = 'P0001'; end if;
  if coalesce(s.service, 'tarot') <> 'stamp' then
    raise exception '이 이벤트에는 스탬프가 없어요' using errcode = 'P0001';
  end if;
  if not public.slot_open(s.period) then
    raise exception '지금은 참여할 수 없어요' using errcode = 'P0001';
  end if;

  select * into cfg from public.stamp_settings where slug = target;
  if found and cfg.closed then raise exception '마감됐어요' using errcode = 'P0001'; end if;

  /*
   * **실패 시도를 먼저, 더 짧은 창으로 센다.** 4자리 코드는 무제한 시도로 뚫린다 —
   * 다른 서비스에서 rate_check 는 남용 완화지만 여기서는 브루트포스 차단 그 자체다.
   * 리밋에 걸리면 여기서 예외가 난다 (그건 되감겨도 상관없다 — 이미 세어져 있다).
   */
  perform public.rate_check(target, 'stamp_fail', subj, 8, 200, 600);

  select * into hit from public.stamp_codes
   where slug = target and upper(regexp_replace(code, '[^0-9A-Za-z]', '', 'g')) = norm;
  if not found then
    -- **예외를 안 던진다** — 던지면 위의 rate_events 행이 같이 사라진다 (이 파일의 요점)
    return jsonb_build_object('ok', false, 'message', '암호가 맞지 않아요');
  end if;

  -- 맞았으면 성공 쪽 리밋도 센다 (연타로 여러 칸을 긁는 걸 막는다)
  perform public.rate_check(target, 'stamp', subj, 30, 400, 600);

  begin
    insert into public.stamp_checkins(slug, subject, stamp_id) values (target, subj, hit.stamp_id);
  exception when unique_violation then
    -- 여기서 잡으면 트랜잭션 전체가 아니라 이 블록만 되감긴다 (savepoint) — 카운터는 남는다
    dup := true;
  end;

  -- 칸 수는 슬롯 설정(jsonb)에 있다 — 화면과 같은 값을 서버가 읽는다
  total := coalesce(jsonb_array_length(s.stamp -> 'stamps'), 0);
  /*
   * **`count(distinct stamp_id)` 여야 한다.** unique 에 day 가 들어 있어서, 일일 리셋을 끈
   * 이벤트에서 같은 칸을 다른 날 또 찍으면 행이 하나 더 생긴다 — 그냥 count(*) 로 세면
   * 한 칸을 이틀 찍은 사람이 두 칸으로 잡힌다.
   */
  if coalesce(cfg.daily_reset, false) then
    select count(distinct stamp_id) into got from public.stamp_checkins
     where slug = target and subject = subj and day = today;
  else
    select count(distinct stamp_id) into got from public.stamp_checkins
     where slug = target and subject = subj;
  end if;

  if dup then
    -- 이미 찍은 칸도 값으로 돌려준다 — 화면은 "이미 찍었어요" 를 띄우고 판은 그대로 둔다
    return jsonb_build_object(
      'ok', false, 'message', '이미 찍은 도장이에요',
      'stampId', hit.stamp_id, 'got', got, 'total', total
    );
  end if;

  -- 다 채웠고 보상이 있으면 **같은 트랜잭션에서** 발급한다 (0019 공용)
  if total > 0 and got >= total and coalesce(cfg.reward_mode, 'none') <> 'none' then
    pkey := case when coalesce(cfg.daily_reset, false) then today::text else 'once' end;
    rw := public.reward_claim(
      target, 'stamp', subj, pkey, null,
      coalesce(nullif(cfg.reward_label, ''), '선물'), cfg.reward_mode, null
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'stampId', hit.stamp_id,
    'got', got,
    'total', total,
    'complete', total > 0 and got >= total,
    'rewardCode', rw.code
  );
end;
$$;
revoke execute on function public.stamp_checkin(text, text, text) from public;
grant execute on function public.stamp_checkin(text, text, text) to anon, authenticated;
