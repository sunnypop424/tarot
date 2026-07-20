-- 재고를 **여러 기기가 같이 본다.**
--
-- 부스에 태블릿을 두 대 놓는 행사가 있다. 지금은 자기가 뽑을 때만 재고가 갱신되므로,
-- 옆 기기에서 마지막 하나가 나가도 이쪽 화면은 "1개 남음" 을 그대로 띄우고 있다.
-- 그 상태로 누르면 **서버가 막아 주지만**(draw_prizes 의 재고 검사) 손님 앞에서 에러를 보게 된다.
-- 막는 것과 **애초에 안 보이게 하는 것**은 다르다.
--
-- 옮겨온 원본도 Firestore `onSnapshot` 으로 같은 일을 했다. 그 성질을 잃지 않는다.
--
-- **RLS 는 그대로 적용된다** — Realtime 의 postgres_changes 는 구독자의 권한으로 걸러진다.
-- 즉 남의 슬롯 재고는 여기서도 안 흐른다 (0007 의 정책이 그대로 지킨다).

-- 이 두 테이블만 흘려보낸다.
--  · prizes            — 재고가 줄면 배지·마감이 따라와야 한다
--  · luckydraw_settings — 주최자가 마감을 켜면 모든 기기에서 즉시 막혀야 한다
--
-- **draw_logs 는 넣지 않는다.** 뽑을 때마다 행이 쌓이는 테이블이라 흘려보내면 트래픽만 늘고,
-- 화면이 그걸 볼 일이 없다 (소진 집계는 주최자가 열 때 한 번 계산한다).
alter publication supabase_realtime add table public.prizes;
alter publication supabase_realtime add table public.luckydraw_settings;

-- 확인:
--   select tablename from pg_publication_tables where pubname = 'supabase_realtime';
