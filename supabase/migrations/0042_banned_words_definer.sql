-- 0041 의 금칙어 트리거가 **한 번도 안 걸렸다.** `security definer` 를 안 붙인 게 원인이다.
--
-- 트리거 함수는 기본이 `security invoker` 라 **부른 사람의 권한으로 돈다.** 여기서 부르는
-- 사람은 방문자(anon)이고, `banned_words` 에는 RLS 가 걸려 있는데 anon 정책이 없다
-- (**일부러 없다** — 목록이 읽히면 그게 곧 우회 설명서다).
--
-- 그래서 트리거 안의 `select 1 from banned_words …` 가 **늘 0행**을 봤다. 함수는 잘 돌고,
-- 예외도 안 나고, 그냥 아무것도 안 막았다. 화면도 DB 도 정상으로 보이는 종류의 실패다.
--
-- **`scripts/verify-banned.mjs` 가 이걸 첫 실행에서 잡았다.** 코드리뷰로는 못 잡는다 —
-- 트리거를 읽으면 맞게 생겼기 때문이다. anon 이 직접 쓰는 서비스에서 "안 되는 것" 을 실제로
-- 찔러 봐야 하는 이유가 이것이다 (CLAUDE.md 「검증은 실제로 돌려본다」).
--
-- `security definer` 로 바꿔도 **목록이 새지 않는다.** 이 함수가 밖으로 돌려주는 건
-- "걸렸다/안 걸렸다" 뿐이고, 어떤 단어에 걸렸는지는 여전히 안 알려준다.

create or replace function public.reject_banned_words()
  returns trigger language plpgsql
  security definer
  set search_path = public
as $$
declare
  haystack text := public.normalize_for_ban(new.body) || ' ' || public.normalize_for_ban(new.nickname);
begin
  if exists (
    select 1 from public.banned_words b
    where (b.slug is null or b.slug = new.slug)
      and public.normalize_for_ban(b.word) <> ''
      and haystack like '%' || public.normalize_for_ban(b.word) || '%'
  ) then
    raise exception '이 표현은 남길 수 없어요';
  end if;
  return new;
end;
$$;

-- 트리거 자체는 0041 이 만든 것을 그대로 쓴다 (`create or replace function` 이면 다시 안 걸어도 된다).
-- 그래도 한 번 더 건다 — 0041 이 안 돈 환경에서 이 파일만 돌 수도 있다.
drop trigger if exists reject_banned_words on public.rolling_messages;
create trigger reject_banned_words
  before insert on public.rolling_messages
  for each row execute function public.reject_banned_words();
