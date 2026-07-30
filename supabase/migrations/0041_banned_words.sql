-- 금칙어 1차 필터 — **롤링페이퍼·소원나무·영상회.**
--
-- 이 셋은 방문자가 남긴 글이 **즉시 남에게 보이는** 유일한 자리다(후검수). 주최자가 볼 때까지
-- 몇 시간이 걸릴 수 있고, 그동안 부적절한 글이 벽에 그대로 걸린다 — 영상회는 상영 화면에 뜬다.
--
-- **완벽할 필요가 없다.** 작정하고 우회하는 사람은 어떤 목록으로도 못 막는다. 목표는
-- "사람이 볼 때까지의 시간을 줄이는 것" 이지 검수를 없애는 게 아니다 — 후검수는 그대로 남는다.
--
-- ── 화면이 아니라 DB 가 막는 이유 ──────────────────
-- 화면에서 거르면 개발자도구로 우회된다. 이 서비스들은 **anon 이 직접 INSERT** 하므로
-- (럭드처럼 서버 함수를 거치지 않는다) 막는 자리는 트리거뿐이다.
--
-- ── 예외를 던져도 되는 자리다 ──────────────────────
-- CLAUDE.md 의 「레이트리밋 뒤에서 예외를 던지지 않는다」는 **앞에서 카운터 행을 넣었을 때**의
-- 이야기다(0023). 여기는 트리거가 INSERT 를 막는 게 전부라 되감길 부작용이 없다.

create table if not exists public.banned_words (
  id         bigserial primary key,
  -- null = **전역** (모든 슬롯에 걸린다). 값이 있으면 그 슬롯에서만
  slug       text references public.slots(slug) on delete cascade,
  word       text not null,
  created_at timestamptz not null default now()
);

-- 같은 단어를 두 번 넣지 않는다. **전역과 슬롯별을 나눠 건다** — unique 제약은 NULL 을 서로
-- 다른 값으로 보므로(PG15 미만) `unique(slug, word)` 하나로는 전역 중복이 안 막힌다.
create unique index if not exists banned_words_slot_idx on public.banned_words (slug, word) where slug is not null;
create unique index if not exists banned_words_global_idx on public.banned_words (word) where slug is null;

-- ══ 1. 비교 규칙 ══════════════════════════════════
--
-- **공백·문장부호를 걷어내고 소문자로 맞춰** 비교한다. 안 그러면 'ㅅ ㅂ' 처럼 한 칸만 띄워도
-- 그냥 통과한다. 여기서 더 나가면(자모 분해·유사글자 치환) 오탐이 늘기 시작한다 —
-- 정상적인 응원 글이 막히는 게 욕 하나가 지나가는 것보다 나쁘다.
create or replace function public.normalize_for_ban(src text)
  returns text language sql immutable
as $$
  select lower(regexp_replace(coalesce(src, ''), '[[:space:][:punct:]]', '', 'g'));
$$;

-- ══ 2. 트리거 ═════════════════════════════════════
--
-- 본문과 **이름을 함께** 본다 — 이름 칸에 적으면 그대로 벽에 뜬다.
-- 어떤 단어에 걸렸는지는 **안 알려준다.** 알려주면 목록을 역으로 훑어 우회할 수 있다.
create or replace function public.reject_banned_words()
  returns trigger language plpgsql
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

drop trigger if exists reject_banned_words on public.rolling_messages;
create trigger reject_banned_words
  before insert on public.rolling_messages
  for each row execute function public.reject_banned_words();

-- ══ 3. 권한 ═══════════════════════════════════════
--
-- **방문자는 목록을 못 읽는다.** 읽히면 그게 곧 우회 설명서다.
-- 주최자는 자기 슬롯 단어만 읽고 고친다. 전역 목록은 최고관리자만 만진다.
alter table public.banned_words enable row level security;

drop policy if exists "owner manages banned words" on public.banned_words;
create policy "owner manages banned words"
  on public.banned_words for all
  using (public.is_owner()) with check (public.is_owner());

drop policy if exists "organizer manages own banned words" on public.banned_words;
create policy "organizer manages own banned words"
  on public.banned_words for all
  using (slug is not null and public.manages_slot(slug))
  with check (slug is not null and public.manages_slot(slug));

grant select, insert, delete on public.banned_words to authenticated;
grant usage on sequence public.banned_words_id_seq to authenticated;
grant execute on function public.normalize_for_ban(text) to anon, authenticated;

-- ══ 4. 기본 목록 ══════════════════════════════════
--
-- 흔한 한국어 욕설 몇 개만 심는다. **짧고 확실한 것만** — 'ㅅㅂ' 처럼 두 글자짜리를 넣으면
-- 정상적인 문장 안에서 우연히 걸린다(오탐). 슬롯마다 필요한 단어는 주최자가 자기 화면에서 더한다.
insert into public.banned_words (slug, word)
values
  (null, '시발'), (null, '씨발'), (null, '개새끼'), (null, '병신'),
  (null, '좆'), (null, '지랄'), (null, '썅'), (null, '니미'),
  (null, 'fuck'), (null, 'shit'), (null, 'bitch')
on conflict do nothing;
