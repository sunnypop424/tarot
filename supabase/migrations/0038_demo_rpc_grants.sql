-- 0038_demo_rpc_grants.sql — 체험에서 스태프 버튼이 실제로 눌리게
--
-- 0034 로 `manages_slot()` 이 체험 슬롯을 통과시키는데도 **럭키드로우 뽑기가 안 됐다.**
-- 화면은 열렸고 버튼도 켜졌는데 누르면 이렇게 돌아온다:
--
--   42501  permission denied for function draw_prizes
--
-- 게이트가 두 겹이라 그렇다:
--   1) **GRANT** — 이 롤이 함수를 부를 수 있나 (여기서 막혔다)
--   2) 함수 첫 줄의 `is_owner() or manages_slot(target)` — 이 슬롯을 맡았나
--
-- 0034 는 2번만 열었다. anon 은 1번에서 걸려 **판정까지 가지도 못한다.**
-- 화면만 보고 "열었다" 고 믿기 쉬운 자리다 — 버튼이 멀쩡히 켜져 있으니까.
--
-- ── 왜 anon 에게 열어도 되나 ──────────────────────
--
-- 아래 여섯 함수는 **전부 첫 줄이 권한 검사**다(직접 확인했다). 체험이 아닌 슬러그로 부르면
-- `manages_slot` 이 false 라 그대로 거절된다. 즉 GRANT 는 "판정까지 갈 수 있게" 할 뿐,
-- 판정 자체를 무르게 하지 않는다. 0032 가 `photocard_draw_batch` 에 먼저 쓴 방식이다.
--
-- **여기 없는 것은 일부러 없다:** 계정 만들기(Edge Function, 엄격판) · AI 생성(엄격판) ·
-- 배송/응모자 명단(정책이 엄격판) · `snapshot_demo`·`reset_demo`(최고관리자·서버).

-- 럭키드로우 — 뽑기와 현황
grant execute on function public.draw_prizes(text, int) to anon;
grant execute on function public.luckydraw_report(text) to anon;

-- 선물 — 수령 확인 · 추첨 · 되돌리기 (스탬프·모의고사가 같이 쓴다)
grant execute on function public.reward_redeem(text, text) to anon;
grant execute on function public.reward_pick(text, text, int, text) to anon;
grant execute on function public.reward_unpick(text, text, int) to anon;

-- 모의고사 — 정답을 고친 뒤 재채점
grant execute on function public.quiz_regrade(text) to anon;
