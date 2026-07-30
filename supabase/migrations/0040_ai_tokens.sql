-- AI **토큰 사용량**을 남긴다 — 원가를 실제와 맞춰볼 유일한 근거.
--
-- 지금까지 `ai_usage` 는 **횟수**만 셌다(정산·한도의 근거). 응답의 `usage`(입력/출력 토큰)는
-- SSE 로 화면에 보내고 버렸다. 그래서 `docs/PRICING.md` 의 실측치가 지금도 맞는지 확인할
-- 방법이 없었다 — 프롬프트가 길어지거나 모델이 바뀌면 원가가 조용히 달라진다.
--
-- **돈이 새는 자리는 아니었다.** 한도는 `claim_ai_usage` 가 이미 지킨다. 이건 방어가 아니라
-- **눈**이다: 얼마나 쓰고 있는지 못 보면 가격을 못 고친다.
--
-- ── 종류별로 나눠 센다 ──────────────────────────────
-- 리딩(짧은 입력·짧은 출력)과 답변 생성(긴 입력·긴 출력)은 원가 구조가 아예 다르다.
-- 합쳐 두면 "이번 달에 토큰을 많이 썼다" 까지만 알고 **무엇 때문인지**를 못 본다.

alter table public.ai_usage
  add column if not exists reading_in   bigint not null default 0,
  add column if not exists reading_out  bigint not null default 0,
  add column if not exists answer_in    bigint not null default 0,
  add column if not exists answer_out   bigint not null default 0,
  -- 프롬프트 캐시는 아직 안 쓴다(`prompt.ts` 에 cache_control 이 없다). 그래도 자리를 만들어
  -- 두는 이유: 켜는 순간 단가가 달라지는데(읽기 0.1배·쓰기 1.25배), 그때 컬럼이 없으면
  -- 켠 뒤의 원가를 켜기 전과 비교할 수 없다.
  add column if not exists cache_read   bigint not null default 0,
  add column if not exists cache_write  bigint not null default 0;

-- ══ 1. 기록 ═══════════════════════════════════════
--
-- **더하기만 한다.** 실패한 호출은 `release_ai_usage` 가 횟수를 되돌리지만 토큰은 안 되돌린다 —
-- 실패해도 입력 토큰은 이미 청구되기 때문이다. 횟수는 "몇 번 팔았나" 고 토큰은 "얼마 썼나" 라
-- 서로 되감는 기준이 다르다.
--
-- **행이 없으면 만들지 않는다.** 여기까지 왔다는 건 `claim_ai_usage` 가 이미 행을 넣었다는 뜻이다.
-- 없는데 만들면 한도를 안 거친 호출의 토큰이 기록돼 두 숫자가 어긋난다.
create or replace function public.record_ai_tokens(
  target text,
  kind text,
  tok_in bigint,
  tok_out bigint,
  tok_cache_read bigint default 0,
  tok_cache_write bigint default 0
) returns void language plpgsql security definer
  set search_path = public
as $$
begin
  if kind = 'reading' then
    update public.ai_usage
      set reading_in = reading_in + greatest(coalesce(tok_in, 0), 0),
          reading_out = reading_out + greatest(coalesce(tok_out, 0), 0),
          cache_read = cache_read + greatest(coalesce(tok_cache_read, 0), 0),
          cache_write = cache_write + greatest(coalesce(tok_cache_write, 0), 0),
          updated_at = now()
      where slug = target;
  elsif kind = 'answer_gen' then
    update public.ai_usage
      set answer_in = answer_in + greatest(coalesce(tok_in, 0), 0),
          answer_out = answer_out + greatest(coalesce(tok_out, 0), 0),
          cache_read = cache_read + greatest(coalesce(tok_cache_read, 0), 0),
          cache_write = cache_write + greatest(coalesce(tok_cache_write, 0), 0),
          updated_at = now()
      where slug = target;
  end if;
end;
$$;

-- ══ 2. 권한 ═══════════════════════════════════════
--
-- 0003 §4 와 같은 이유·같은 방식: `create function` 이 EXECUTE 를 **PUBLIC** 에게 주므로
-- anon·authenticated 에서만 revoke 하면 안 뺏긴다. PUBLIC 에서 뺏고 service_role 에만 준다.
-- (브라우저가 부를 수 있으면 남의 슬롯 사용량을 부풀려 정산을 흔들 수 있다.)
revoke execute on function public.record_ai_tokens(text, text, bigint, bigint, bigint, bigint) from public;
grant execute on function public.record_ai_tokens(text, text, bigint, bigint, bigint, bigint) to service_role;

-- ══ 3. 최고관리자가 읽는다 ════════════════════════
--
-- `ai_usage` 는 지금까지 정책이 하나도 없어서 **아무도 못 읽었다**(service_role 만).
-- 그건 방문자·주최자에겐 맞다 — 남의 슬롯이 얼마나 쓰는지 알 이유가 없다. 하지만 최고관리자는
-- 정산을 해야 하고, 지금은 그걸 보려면 SQL 에디터를 직접 열어야 한다.
--
-- **읽기만 연다.** 쓰기를 열면 사용량을 0 으로 돌려 한도를 무력화할 수 있다 —
-- 그건 최고관리자라도 화면으로 할 일이 아니다(고쳐야 하면 한도를 올리는 게 맞다).
drop policy if exists "owner reads ai usage" on public.ai_usage;
create policy "owner reads ai usage"
  on public.ai_usage for select
  using (public.is_owner());
