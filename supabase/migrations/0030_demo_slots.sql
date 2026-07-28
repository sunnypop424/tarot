-- 0030_demo_slots.sql — 체험용 슬롯 (랜딩에서 링크하는 곳)
--
-- 랜딩에 "체험해보기" 를 걸면 그 주소는 **아무나 들어오는 공개 주소**가 된다. 지금 구조로는
-- 방문자가 쪽지를 남기고 투표를 하면 그게 그대로 남아, 다음 사람이 남의 낙서를 보게 된다.
--
-- 그래서 슬롯에 `demo` 플래그를 두고 **남에게 보이는 쓰기만** 막는다:
--
--   막는다  · rolling_messages  (롤페 벽 · 소원나무 · 영상회 오버레이 — 남이 본다)
--           · poll_votes        (집계가 남에게 보인다)
--           · shipping_entries  (개인정보)
--
--   그대로  · 뽑기·체크인·응시 (photocard_draws · stamp_checkins · quiz_attempts)
--             남에게 안 보이고 레이트리밋이 걸려 있다. 막으면 체험 자체가 안 된다 —
--             "뽑아보기" 가 그 서비스의 전부인데 그걸 막으면 보여줄 게 없다.
--             (그 기록은 데모 슬롯을 다시 seed 할 때 지워진다.)
--
-- **화면도 같이 막는다.** RLS 로 막으면 insert 가 0행으로 끝나 화면은 성공한 줄 안다 —
-- 그래서 화면이 `slot.demo` 를 보고 아예 안 보내고 그 기기에만 보여준다(체험용이라고 적는다).
-- 여기 정책은 그 화면을 우회한 호출을 막는 **두 번째 겹**이다.

alter table public.slots
  add column if not exists demo boolean not null default false;

comment on column public.slots.demo is
  '체험용 슬롯. 남에게 보이는 쓰기(쪽지·투표·개인정보)를 서버에서 막는다 — 0030 주석.';

-- ── 쪽지·소원·한마디 ───────────────────────────────
-- 0013 의 정책을 같은 이름으로 다시 만든다 (조건 하나만 더 붙는다)
drop policy if exists "anyone posts to open slots" on public.rolling_messages;
create policy "anyone posts to open slots"
  on public.rolling_messages for insert
  with check (
    exists (
      select 1 from public.slots s
      where s.slug = rolling_messages.slug
        and public.slot_open(s.period)
        -- 체험용 슬롯엔 남기지 않는다 (남이 보는 자리라 낙서가 그대로 남는다)
        and not coalesce(s.demo, false)
    )
  );

-- ── 개인정보 (배송) ────────────────────────────────
drop policy if exists "visitor submits shipping" on public.shipping_entries;
create policy "visitor submits shipping"
  on public.shipping_entries for insert
  with check (exists (
    select 1 from public.slots s
    where s.slug = shipping_entries.slug
      and public.slot_visible(s.period, s.service)
      and not coalesce(s.demo, false)
  ));

-- ── 투표 ───────────────────────────────────────────
-- 집계는 `cast_vote`(security definer)가 올린다 — 정책이 아니라 함수 안에서 막아야 한다.
-- **거절을 예외로 던져도 되는 자리다**: 이 함수는 rate_check 보다 먼저 판정하므로
-- 되감길 카운터 행이 아직 없다 (0023 의 함정과 다른 순서다).
-- **0021 의 본문에서 시작한다.** 0020 을 복사했다가 "한 설문에 한 번" 을 되돌려버렸고
-- (`verify-poll.mjs` 가 그 자리에서 잡았다) — 함수를 다시 정의할 땐 **가장 최근 정의**를 딛는다.
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
  -- 체험용 슬롯 — 집계가 남에게 보이므로 저장하지 않는다 (0030)
  if coalesce(s.demo, false) then
    raise exception '체험용 페이지라 투표는 저장되지 않아요' using errcode = 'P0001';
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
