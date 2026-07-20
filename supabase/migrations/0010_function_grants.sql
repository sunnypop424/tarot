-- 함수 권한을 **실제로** 뺏는다.
--
-- 0009 를 올린 뒤 anon 키로 찔러보니 이렇게 나왔다:
--
--   POST /rest/v1/rpc/expired_slots   (anon)  →  200  []
--
-- 즉 **만료 예정 슬롯 목록이 방문자에게 열려 있었다.** 지금은 만료된 슬롯이 없어 빈 배열이지만,
-- 하나라도 생기는 순간 누구나 남의 이벤트 슬러그·행사명·마감일을 긁을 수 있다.
-- anon 키는 브라우저 번들에 그대로 들어 있으므로 "주소를 아는 사람만" 이 아니라 **아무나** 다.
-- 이건 이 플랫폼의 첫 번째 규칙(배포 루트에 슬롯 목록을 노출하지 않는다)을 정면으로 깬다.
--
-- **원인:** 0009 는 `revoke execute ... from public` 만 했다. 그런데 Supabase 는 public 스키마에
-- 새로 생기는 함수의 EXECUTE 를 anon·authenticated·service_role 에게 **직접** 준다
-- (default privileges). PUBLIC 에서 뺏어도 그 직접 부여분은 그대로 남는다.
--
-- 0003(AI 함수)은 같은 코드로 썼는데 잠겨 있었다 — 그래서 "PUBLIC 에서만 뺏으면 된다" 는
-- 교훈이 굳어 있었다. 두 경우가 갈린 이유까지는 확정하지 못했다(생성 시점의 default privileges 가
-- 달랐을 가능성이 크다). 확정 못 한 채로 남겨 두면 안 되는 종류의 차이라,
-- **양쪽 다 명시적으로 뺏는다.** 어느 쪽이 원인이든 결과가 같아진다.
--
-- 이 파일은 여러 번 돌려도 안전하다 (revoke·grant 는 멱등이다).

-- ══ 1. 만료 목록 — service_role 전용 ══════════════
--
-- 함수 안에 권한 검사가 **없다**. 부르는 주체가 Edge Function(service_role) 하나뿐이라
-- 검사를 안 넣었는데, 그 전제가 grant 로 지켜지지 않으면 그대로 유출이 된다.
revoke execute on function public.expired_slots() from public, anon, authenticated;
grant execute on function public.expired_slots() to service_role;

-- ══ 2. 추첨·리포트 — 로그인한 주최자까지만 ════════
--
-- 이 둘은 함수 첫 줄이 권한 검사라(`is_owner() or manages_slot()`) anon 이 불러도 데이터가
-- 새지는 않았다 — 실제로 400 '권한이 없어요' 가 떴다. 그래도 뺏는다:
-- **문을 잠그는 일과 방을 잠그는 일은 다르다.** 방만 믿으면 다음에 검사 없는 함수를 추가하는
-- 사람이 "grant 가 막아주겠지" 라고 생각하게 된다.
revoke execute on function public.draw_prizes(text, int) from public, anon;
revoke execute on function public.luckydraw_report(text) from public, anon;
grant execute on function public.draw_prizes(text, int) to authenticated, service_role;
grant execute on function public.luckydraw_report(text) to authenticated, service_role;

-- ══ 3. 여기서 뺏으면 안 되는 것 ═══════════════════
--
-- `today_kst` · `slot_open` · `slot_grace_days` · `slot_visible` 은 **정책이 부른다.**
-- 정책은 호출자 롤로 평가되므로 anon 이 EXECUTE 를 잃으면 평가되다 죽어 **슬롯이 아무에게도
-- 안 열린다.** 내주고도 안전한 이유는 0005 §5 에 적힌 그대로다: 전부 stable 이고 인자로 받은
-- 값만 본다 — 남의 데이터를 읽지도, 무언가를 바꾸지도 않는다.

-- ══ 4. 확인 ═══════════════════════════════════════
--
-- 누가 무엇을 부를 수 있는지는 **믿지 말고 본다**:
--
--   select p.proname,
--          coalesce(array_to_string(p.proacl, E'\n'), '(기본 — PUBLIC 포함)') as acl
--     from pg_proc p
--    where p.pronamespace = 'public'::regnamespace
--      and p.proname in ('expired_slots','draw_prizes','luckydraw_report',
--                        'claim_ai_usage','slot_visible','slot_open')
--    order by 1;
--
-- `expired_slots` 의 acl 에 `anon=X` 가 없어야 한다.
-- 그리고 진짜 확인은 anon 키로 실제로 찔러보는 것이다 — `scripts/verify-luckydraw.mjs` 가 한다.
