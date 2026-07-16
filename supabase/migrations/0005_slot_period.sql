-- 슬롯 기간 — **테스트·대여 기간에만 열린다.**
--
-- 슬롯은 파는 물건이다. 이벤트가 끝났는데 링크가 계속 열려 있으면 그건 안 판 것과 같다.
-- 그래서 기간이 지나면 **최고관리자 말고는 아무도** 그 슬롯을 못 읽는다 — 주최자도 못 들어온다.
--
-- **왜 RLS 인가:** 프론트에서 막으면 못 막는다. anon 키는 브라우저에 그대로 내려가므로
-- 누구나 그 키로 `/rest/v1/slots?slug=eq.종료된슬롯` 을 부를 수 있다. 화면 코드를 아무리 잘 짜도
-- 종료된 이벤트의 테마·설정이 그대로 나간다. **읽기 정책 자체를 기간 조건으로 바꿔야** 진짜다.

-- ══ 1. 기간 ═══════════════════════════════════════
--
-- jsonb 한 컬럼인 이유: 화면의 Slot 타입이 컬럼 이름을 그대로 쓴다(`repo/supabase.ts` 의
-- SLOT_COLUMNS — "컬럼 이름이 곧 필드 이름이라 매핑이 얇다"). date 컬럼 4개로 쪼개면
-- test_start·rent_end 같은 snake_case 가 타입에 새고, 그걸 막으려면 매핑 계층이 생긴다.
-- theme·event·limits 가 이미 같은 이유로 jsonb 다.
--
-- 모양: {"test":{"start":"2026-07-01","end":"2026-07-05"},"rent":{"start":...,"end":...}}
-- 없는 키 = 그 기간을 안 정했다. null 인 끝 = 그쪽으로 열려 있다.
alter table public.slots add column if not exists period jsonb not null default '{}'::jsonb;

-- ══ 2. 오늘이 언제인가 ════════════════════════════
--
-- **UTC 로 보면 안 된다.** current_date 는 DB 타임존(UTC)을 따르므로 한국 시간 자정~오전 9시엔
-- 어제를 가리킨다. 생일카페는 한국에서 열리고 카페는 아침에 문을 연다 — 오픈런 하는 방문자가
-- "아직 시작 안 했어요" 를 보게 된다. 화면도 같은 기준을 쓴다 (`data/slots.ts` 의 todayKst).
create or replace function public.today_kst()
  returns date language sql stable
as $$
  select (now() at time zone 'Asia/Seoul')::date;
$$;

-- ══ 3. 열려 있나 ══════════════════════════════════
--
-- 테스트·대여 **둘 중 하나라도** 오늘을 품으면 열린다.
-- 기간을 하나도 안 정했으면 **제한이 없다는 뜻**이라 열어 준다 — 안 그러면 이 마이그레이션을
-- 돌리는 순간 기존 슬롯이 전부 죽는다 (period 기본값이 '{}' 다).
create or replace function public.slot_open(period jsonb)
  returns boolean language plpgsql stable
  set search_path = public
as $$
declare
  today date := public.today_kst();
  kind text;
  s date;
  e date;
  bounded boolean := false;
begin
  if period is null then return true; end if;

  foreach kind in array array['test', 'rent'] loop
    -- nullif: 빈 문자열은 날짜가 아니다. 화면이 입력을 비우면 '' 가 올 수 있다
    s := nullif(period -> kind ->> 'start', '')::date;
    e := nullif(period -> kind ->> 'end', '')::date;

    -- 양끝이 다 없으면 그 기간은 "안 정했다" 는 뜻 — 0일짜리 구간이 아니다
    if s is null and e is null then continue; end if;

    bounded := true;
    if (s is null or today >= s) and (e is null or today <= e) then
      return true;
    end if;
  end loop;

  -- 정해진 기간이 하나도 없었다 = 제한 없음
  return not bounded;
end;
$$;

-- ══ 4. 읽기 정책을 기간으로 ═══════════════════════
--
-- 방문자는 슬러그를 알아야 들어오므로 이건 목록 노출과 다르다 — 다만 **기간 안일 때만**이다.
-- 최고관리자는 늘 읽는다: 목록에서 지난 슬롯을 보고 지워야 하고, 시작 전 슬롯을 만들어야 한다.
drop policy if exists "anyone reads slots" on public.slots;

create policy "anyone reads open slots"
  on public.slots for select
  using (public.is_owner() or public.slot_open(period));

-- 주최자에게 예외를 주지 않는다. "대여가 끝나면 아무도 못 들어온다" 가 요구사항이고,
-- 주최자가 미리 준비할 자리는 **테스트 기간**이 따로 있다.
--
-- questions 정책은 그대로 둔다: 슬롯을 못 읽으면 앱이 아예 안 뜨므로 화면은 이미 닫힌다.
-- (엄밀히는 anon 키로 questions 를 직접 긁으면 종료된 이벤트의 질문이 보인다.
--  거기까지 막으려면 published 정책에 slot_open 을 and 로 붙이면 된다 —
--  지금은 그 데이터가 공개돼도 잃을 게 없다고 보고 정책을 단순하게 뒀다.)

-- ══ 5. 권한 ═══════════════════════════════════════
--
-- 이 함수들은 **정책이 부른다** — 정책은 호출자 롤로 평가되므로 anon·authenticated 가
-- EXECUTE 를 가져야 한다. 0003 의 claim_ai_usage 와는 반대다: 저건 service_role 전용이라
-- PUBLIC 에서 뺏었지만, 이건 뺏으면 정책이 평가되다 죽어 슬롯이 아무에게도 안 열린다.
--
-- 내주고도 안전한 이유: 둘 다 stable 이고 **인자로 받은 값만** 본다. 남의 데이터를 읽지도,
-- 무언가를 바꾸지도 않는다. anon 이 slot_open('{...}') 을 직접 불러 봐야 자기가 준 JSON 을
-- 판정해 줄 뿐이다.
grant execute on function public.today_kst() to anon, authenticated;
grant execute on function public.slot_open(jsonb) to anon, authenticated;
