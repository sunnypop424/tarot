-- **주최자가 적는 값의 다국어 — 둘째 묶음.** 모의고사 문항·보기·모범답안, 그리고 보상 이름.
--
-- 0046 이 경품·포토카드·설문을 덮었다. 남은 건 모의고사인데, 여기는 앞의 넷과 사정이 다르다:
-- **문항은 공개고 정답은 비공개다.** 그 경계가 어디에 뭘 붙일지를 그대로 정한다.
--
-- ── 공개된 값: 문항 테이블에 붙인다 ────────────────
--
-- `quiz_questions.body` 와 `choices` 는 방문자가 풀기 전에 읽는다(anon select 가 열려 있다).
-- 그래서 그 옆에 `_i18n` 을 달아도 새로 새는 게 없다 — 이미 보이는 값의 번역일 뿐이다.
--
-- ── 숨긴 값: 정답 테이블에 붙이고, 서버가 고른다 ────
--
-- 주관식 모범답안은 `quiz_answers` 에 있고 **anon 이 통째로 못 읽는다**(0024 §revoke).
-- 그러니 번역을 `quiz_questions` 쪽에 두면 안 된다 — 풀기도 전에 정답이 보인다.
-- 채점 함수(`quiz_submit`)가 **지금 언어를 받아** 그 언어의 모범답안을 담아 준다.
--
--   · 파라미터를 더하면 3인자 호출과 헷갈리므로(기본값이 있어도 모호해진다) 먼저 drop 한다.
--   · 나머지 본문은 0025 와 **한 글자도 안 다르다** — 바뀐 자리에 「0047」 이라고 적어 뒀다.
--
-- ── 채점은 안 건드린다 ─────────────────────────────
--
-- `answers_i18n` 은 **보여줄 답**이지 **인정할 답**이 아니다. 일본어로 적은 방문자의 답을
-- 맞다고 볼지는 다른 판단이고, 그건 이미 길이 있다 — 주최자가 `answers` 에 그 말을 더하면
-- 된다("오답 처리가 불만의 주된 원천이라 주최자가 나중에 더할 수 있다", 0024). 채점 규칙을
-- 언어로 가르면 **같은 답이 언어에 따라 맞았다 틀렸다** 하게 된다.
--
-- 재채점(`quiz_regrade`)도 그대로다 — 그건 `score`·`correct` 만 고치고 `detail` 은 안 건드린다.
-- 그래서 "응시할 때의 언어" 를 따로 기억해 둘 필요가 없다.
--
-- ── 보상 이름은 설정에 붙인다 ──────────────────────
--
-- 방문자 화면에 뜨는 건 `rewards.label`(응모할 때 박제된 값)인데, 거기에 번역을 실으려면
-- `reward_claim` 을 고쳐야 한다. 그 함수는 스탬프·모의고사·포토카드가 **같이 쓴다** —
-- 이름 하나 옮기자고 열 자리가 아니다. 화면은 설정(`*_settings.reward_label_i18n`)에서 고른다.
-- 주최자가 나중에 이름을 바꾸면 예전 보상도 새 번역으로 보이는데, 원문(`label`)은 그대로라
-- 스태프가 교환할 때 보는 값은 안 흔들린다.

alter table public.quiz_questions add column if not exists body_i18n jsonb;
alter table public.quiz_questions add column if not exists choices_i18n jsonb;
alter table public.quiz_answers add column if not exists answers_i18n jsonb;
alter table public.quiz_settings add column if not exists reward_label_i18n jsonb;
alter table public.stamp_settings add column if not exists reward_label_i18n jsonb;

comment on column public.quiz_questions.body_i18n is
  '언어 코드 → 그 언어로 적은 문항. 없으면 body 를 쓴다 (src/data/multilingual.ts)';
comment on column public.quiz_questions.choices_i18n is
  '언어 코드 → 그 언어 보기 **배열**. choices 와 같은 순서·같은 길이. 없거나 짧으면 그 자리는 choices';
comment on column public.quiz_answers.answers_i18n is
  '언어 코드 → 그 언어로 **보여줄** 주관식 모범답안. 인정할 답은 answers 하나뿐이다';
comment on column public.quiz_settings.reward_label_i18n is
  '언어 코드 → 그 언어로 적은 보상 이름. 없으면 reward_label 을 쓴다';
comment on column public.stamp_settings.reward_label_i18n is
  '언어 코드 → 그 언어로 적은 보상 이름. 없으면 reward_label 을 쓴다';

-- ══ 채점 — 0025 에 `lang` 한 자리만 더한다 ═════════
drop function if exists public.quiz_submit(text, text, jsonb);

create or replace function public.quiz_submit(target text, subj text, payload jsonb, lang text default 'ko')
  returns jsonb
  language plpgsql security definer set search_path = public
as $$
declare
  s public.slots;
  cfg public.quiz_settings;
  q public.quiz_questions;
  ans jsonb;
  ans_i18n jsonb;          -- 0047
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
    -- 0047: 보여줄 번역도 같이 꺼낸다 (인정할 답은 아래에서 `ans` 하나만 본다)
    select a.answers, a.answers_i18n into ans, ans_i18n
      from public.quiz_answers a where a.question_id = q.id;

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
     *
     * 0047: 보기 글자는 **지금 언어로** 돌려준다. 객관식 문항·보기의 번역은 화면이
     * `quiz_questions` 에서 직접 읽어 갈아 끼울 수 있지만(공개된 값이다), 여기서 이미
     * 글자로 바꿔 내보내는 값은 화면이 어느 보기였는지 되짚어야 해서 여기서 골라 준다.
     */
    shown := case
      when given is null or given = '' then given
      when q.kind = 'choice' and given ~ '^[0-9]+$'
        then coalesce(
          nullif(q.choices_i18n -> lang ->> given::int, ''),
          q.choices ->> given::int
        )
      else given
    end;

    -- `showAnswers` 정책에 따라 **서버가 잘라서** 담는다 (클라이언트가 거르면 그건 안 가린 것이다)
    detail := detail || jsonb_build_object(
      'id', q.id, 'order', q."order", 'ok', ok,
      -- 0047: 문항 본문도 지금 언어로 (없으면 원문)
      'body', case
        when coalesce(cfg.show_answers, 'wrongOnly') = 'none' then null
        else coalesce(nullif(q.body_i18n ->> lang, ''), q.body)
      end,
      'given', case when coalesce(cfg.show_answers, 'wrongOnly') = 'none' then null else shown end,
      'answer', case
        when coalesce(cfg.show_answers, 'wrongOnly') = 'none' then null
        when coalesce(cfg.show_answers, 'wrongOnly') = 'wrongOnly' and ok then null
        -- 0047: 정답도 지금 언어로. 주관식 모범답안은 여기서만 나갈 수 있다 (숨긴 표라서)
        when q.kind = 'choice' then coalesce(
          nullif(q.choices_i18n -> lang -> (ans ->> 0)::int, 'null'::jsonb),
          q.choices -> (ans ->> 0)::int
        )
        else to_jsonb(coalesce(nullif(ans_i18n ->> lang, ''), ans ->> 0))
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
revoke execute on function public.quiz_submit(text, text, jsonb, text) from public;
grant execute on function public.quiz_submit(text, text, jsonb, text) to anon, authenticated;
