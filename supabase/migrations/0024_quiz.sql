-- 최애 모의고사 — 문제를 풀고 점수·칭호를 받는다. 커트라인을 넘으면 보상(0019 공용)으로 이어진다.
--
-- **이 레포에서 처음 하는 조합이다: anon + 서버 계산 + 서버 비밀.**
-- 럭키드로우는 서버 계산이지만 로그인이 필요했고, 롤링페이퍼는 anon 이지만 계산이 없었다.
-- 여기는 방문자가 로그인 없이 제출하는데 **정답은 절대 안 내려가야** 한다.
--
-- ══ 정답을 왜 별도 테이블로 빼는가 ═══════════════
--
-- **RLS 는 행(row)을 거르지 열(column)을 못 가린다.** `quiz_questions` 를 anon 에게 열면
-- `select *` 한 방에 정답이 그대로 온다. 컬럼 단위 grant 로 막는 길도 있지만 그러면
-- `select *` 가 통째로 실패하고, 컬럼을 하나 더할 때마다 grant 를 손봐야 한다 —
-- `SLOT_COLUMNS` 와 똑같은 함정을 하나 더 만드는 셈이다.
--
-- 그래서 **정답만 다른 테이블로 옮겨 anon grant 를 아예 안 준다.** 열 문제를 행 문제로
-- 바꾼 것이고, 채점은 definer 함수가 그 테이블을 읽어서 한다.
-- **정답이 브라우저에 한 번도 안 내려간다** — 이 한 줄이 이 서비스의 전부다.

-- ══ 1. 문항 ═══════════════════════════════════════
create table if not exists public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  slug text not null references public.slots(slug) on delete cascade on update cascade,
  "order" int not null default 0,
  kind text not null default 'choice' check (kind in ('choice', 'short')),
  body text not null,
  image text,
  -- 객관식 보기. 주관식이면 빈 배열
  choices jsonb not null default '[]'::jsonb,
  points int not null default 1,
  hidden boolean not null default true,   -- **기본 비공개** — 정답을 채우기 전에 방문자에게 보이면 안 된다
  created_at timestamptz not null default now()
);
create index if not exists quiz_questions_slug_idx on public.quiz_questions (slug, "order");

-- **anon grant 없음.** definer 함수만 읽는다
create table if not exists public.quiz_answers (
  question_id uuid primary key references public.quiz_questions(id) on delete cascade,
  slug text not null references public.slots(slug) on delete cascade on update cascade,
  /*
   * 허용 정답 목록.
   * - 객관식: 보기 **인덱스**를 문자열로 ('0','2'). 복수 정답도 되지만 v1 화면은 하나만 만든다
   * - 주관식: 정규화된 문자열. 오답 처리가 불만의 주된 원천이라 주최자가 나중에 더할 수 있다
   */
  answers jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.quiz_settings (
  slug text primary key references public.slots(slug) on delete cascade on update cascade,
  reward_mode text not null default 'none' check (reward_mode in ('none','threshold','raffle')),
  reward_min_score int not null default 0,
  reward_label text not null default '선물',
  entry_fields jsonb not null default '{"handle":true,"contact":false,"address":false}'::jsonb,
  time_limit_sec int not null default 0,     -- 0 = 무제한
  /*
   * **보상이 있으면 재응시를 못 한다.**
   *
   * period_key 가 attempt_id 라 재응시마다 새 보상이 나오는 게 구조상 막히지 않는다.
   * 그럼 threshold 에서 될 때까지 눌러 전원이 당첨된다. 화면이 아니라 **설정 단계에서**
   * 잠근다 — 아래 트리거가 강제한다.
   */
  allow_retry boolean not null default true,
  show_answers text not null default 'wrongOnly' check (show_answers in ('none','after','wrongOnly')),
  closed boolean not null default false,
  updated_at timestamptz not null default now()
);

create or replace function public._quiz_settings_guard() returns trigger
  language plpgsql as $$
begin
  if new.reward_mode <> 'none' then new.allow_retry := false; end if;
  return new;
end;
$$;
drop trigger if exists quiz_settings_guard on public.quiz_settings;
create trigger quiz_settings_guard before insert or update on public.quiz_settings
  for each row execute function public._quiz_settings_guard();

create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  slug text not null references public.slots(slug) on delete cascade on update cascade,
  subject text not null,
  score int not null,
  total int not null,
  correct int not null,
  count int not null,
  -- 문항별 정오. 주최자 통계가 이걸 센다
  detail jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists quiz_attempts_lookup on public.quiz_attempts (slug, subject, created_at desc);

alter table public.quiz_questions enable row level security;
alter table public.quiz_answers enable row level security;
alter table public.quiz_settings enable row level security;
alter table public.quiz_attempts enable row level security;

-- ══ 2. 정책 ═══════════════════════════════════════
--
-- 방문자는 **공개된 문항만** 읽는다. `quiz_answers` 와 `quiz_attempts` 는 anon 정책이 아예 없다:
-- 전자는 정답, 후자는 남의 점수(닉네임을 붙이면 준-PII 다).

drop policy if exists "anyone reads open questions" on public.quiz_questions;
create policy "anyone reads open questions" on public.quiz_questions for select
  using (
    hidden = false
    and exists (
      select 1 from public.slots s
      where s.slug = quiz_questions.slug and public.slot_visible(s.period, s.service)
    )
  );

drop policy if exists "managers manage questions" on public.quiz_questions;
create policy "managers manage questions" on public.quiz_questions for all
  using (public.manages_slot(slug)) with check (public.manages_slot(slug));
drop policy if exists "owner manages questions" on public.quiz_questions;
create policy "owner manages questions" on public.quiz_questions for all
  using (public.is_owner()) with check (public.is_owner());

-- 정답 — **방문자 정책 없음.** 주최자·최고관리자만
drop policy if exists "managers manage answers" on public.quiz_answers;
create policy "managers manage answers" on public.quiz_answers for all
  using (public.manages_slot(slug)) with check (public.manages_slot(slug));
drop policy if exists "owner manages answers" on public.quiz_answers;
create policy "owner manages answers" on public.quiz_answers for all
  using (public.is_owner()) with check (public.is_owner());

drop policy if exists "anyone reads quiz settings" on public.quiz_settings;
create policy "anyone reads quiz settings" on public.quiz_settings for select
  using (exists (
    select 1 from public.slots s
    where s.slug = quiz_settings.slug and public.slot_visible(s.period, s.service)
  ));
drop policy if exists "managers manage quiz settings" on public.quiz_settings;
create policy "managers manage quiz settings" on public.quiz_settings for all
  using (public.manages_slot(slug)) with check (public.manages_slot(slug));
drop policy if exists "owner manages quiz settings" on public.quiz_settings;
create policy "owner manages quiz settings" on public.quiz_settings for all
  using (public.is_owner()) with check (public.is_owner());

drop policy if exists "managers read attempts" on public.quiz_attempts;
create policy "managers read attempts" on public.quiz_attempts for all
  using (public.manages_slot(slug)) with check (public.manages_slot(slug));
drop policy if exists "owner reads attempts" on public.quiz_attempts;
create policy "owner reads attempts" on public.quiz_attempts for all
  using (public.is_owner()) with check (public.is_owner());

/*
 * **grant 를 눈으로 본다** (0010 의 교훈 — `expired_slots` 가 anon 에게 열려 있었다).
 * quiz_answers 에는 어떤 형태로도 anon 이 닿지 않는다: revoke 를 먼저 걸고 시작한다.
 */
revoke all on public.quiz_answers from public, anon;
revoke all on public.quiz_attempts from public, anon;
grant select on public.quiz_questions to anon, authenticated;
grant select on public.quiz_settings to anon, authenticated;
grant select, insert, update, delete on public.quiz_questions to authenticated;
grant select, insert, update, delete on public.quiz_answers to authenticated;
grant select, insert, update, delete on public.quiz_settings to authenticated;
grant select, insert, update, delete on public.quiz_attempts to authenticated;

-- ══ 3. 정규화 ═════════════════════════════════════
-- 주관식 비교용. 공백·문장부호를 빼고 소문자로 — "Hello World!" 와 "helloworld" 가 같아진다.
-- **주최자가 오답을 정답으로 인정하는 경로**(허용 목록 추가)와 같은 함수를 써야 한다.
create or replace function public.quiz_norm(raw text)
  returns text language sql immutable
as $$
  select lower(regexp_replace(coalesce(raw, ''), '[[:space:][:punct:]]', '', 'g'));
$$;
grant execute on function public.quiz_norm(text) to anon, authenticated;

-- ══ 4. 제출 ═══════════════════════════════════════
--
-- payload: [{"id":"<question uuid>","value":"2"}, ...]
--   객관식 value = 고른 보기 인덱스(문자열) · 주관식 value = 적은 답
create or replace function public.quiz_submit(target text, subj text, payload jsonb)
  returns jsonb
  language plpgsql security definer set search_path = public
as $$
declare
  s public.slots;
  cfg public.quiz_settings;
  q public.quiz_questions;
  ans jsonb;
  item jsonb;
  given text;
  ok boolean;
  score int := 0;
  total int := 0;
  correct int := 0;
  cnt int := 0;
  detail jsonb := '[]'::jsonb;
  att public.quiz_attempts;
  rw public.rewards;
  passed boolean := false;
  -- `found` 는 **다음 질의마다 덮인다.** 루프와 insert 를 지난 뒤에 보면 cfg 유무와 상관없는 값이다
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

  -- 재응시 금지면 이미 낸 사람은 여기서 막는다 (보상 모드에서는 트리거가 이걸 강제로 켠다)
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
     * **`showAnswers` 정책에 따라 서버가 잘라서 담는다.**
     * 클라이언트가 걸러 보여주기로 하면 그건 안 가린 것이다 — 응답 본문에 정답이 있으면
     * 개발자도구로 그냥 읽힌다. 'none' 이면 정답도 내 답도 안 담는다.
     */
    detail := detail || jsonb_build_object(
      'id', q.id, 'order', q."order", 'ok', ok,
      'body', case when coalesce(cfg.show_answers, 'wrongOnly') = 'none' then null else q.body end,
      'given', case when coalesce(cfg.show_answers, 'wrongOnly') = 'none' then null else given end,
      'answer', case
        when coalesce(cfg.show_answers, 'wrongOnly') = 'none' then null
        when coalesce(cfg.show_answers, 'wrongOnly') = 'wrongOnly' and ok then null
        when q.kind = 'choice' then q.choices -> (ans ->> 0)::int
        else to_jsonb(ans ->> 0)
      end
    );
  end loop;

  if cnt = 0 then raise exception '아직 문제가 준비되지 않았어요' using errcode = 'P0001'; end if;

  insert into public.quiz_attempts(slug, subject, score, total, correct, count, detail)
  values (target, subj, score, total, correct, cnt, detail)
  returning * into att;

  -- 보상 (0019 공용). **score 를 같이 넣는다** — 이 한 줄 덕에 추첨 RPC 가 모의고사를 몰라도 점수순이 된다
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

-- ══ 5. 재채점 ═════════════════════════════════════
--
-- 주관식 오답 처리가 불만의 주된 원천이다. 주최자가 "이 답도 정답으로" 를 누르면 허용 목록에
-- 붙는데, **이미 낸 사람들은 그대로 오답**으로 남는다 — 그래서 되짚어 다시 채점한다.
-- 점수만 고치고 `rewards` 는 손대지 않는다: 이미 나간 교환권을 회수하는 건 다른 문제다
-- (커트라인을 새로 넘긴 사람은 주최자가 화면에서 확인하고 따로 처리한다).
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
  -- **컬럼 이름과 겹치면 안 된다** — `set score = score` 는 plpgsql 이 모호하다고 거절한다
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
      select d ->> 'given' into given
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

-- ══ 6. 슬롯 설정 ══════════════════════════════════
alter table public.slots add column if not exists quiz jsonb not null default '{}'::jsonb;
