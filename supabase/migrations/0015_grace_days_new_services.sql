-- 유예 기간을 **새 서비스가 붙기 전에** 미리 넓힌다.
--
-- 0009 의 `slot_grace_days` 는 `case when service = 'luckydraw' then 14 else 0 end` 였다.
-- 럭키드로우만 배송 명단이 남았으니 그때는 맞는 값이었다.
--
-- 곧 붙을 네 서비스는 **행사가 끝난 뒤에도 주최자가 꺼내야 할 것이 남는다**:
--   quiz      — 응시 기록·문항별 정답률, 그리고 커트라인 당첨자 명단
--   photocard — 소진 집계, 그리고 실물 교환 내역(누가 받아갔는지)
--   poll      — 투표 결과 (발표·정산이 행사 뒤에 온다)
--   stamp     — 응모자 명단. **닉네임·연락처·주소가 들어 있어 제일 급하다**
--
-- **이 마이그레이션을 서비스보다 먼저 넣는 이유:** 나중에 넣으면 그 사이에 판 슬롯들이
-- 행사가 끝나는 순간 잠긴 뒤다. 주최자가 "당첨자 명단을 못 꺼낸다" 고 연락해 오는 시점엔
-- 이미 늦다 — 0009 §4 의 자동 삭제(마감 +15일)가 그 뒤에 따라오기 때문이다.
-- 지금은 SQL 한 줄이고, 아직 그 서비스의 슬롯이 하나도 없어 부작용도 없다.
--
-- 값은 전부 럭키드로우와 같은 **14일**로 맞춘다. 서비스마다 다르게 줄 근거가 아직 없고,
-- 다르면 안내문(`src/owner/guide.ts`)도 서비스마다 달라져 설명이 늘어난다.
-- 0009 §4 의 삭제 기준(마감 +15일)은 안 건드린다 — 유예보다 하루 길다는 관계가 그대로 유지된다.
--
-- 타로·롤링페이퍼는 0 그대로다. 타로는 방문자 데이터가 남지 않고, 롤링페이퍼의 메시지는
-- 주최자가 꺼내 갈 물건이 아니라 그 자리에서 소비되는 벽이다.

create or replace function public.slot_grace_days(service text)
  returns int language sql immutable
as $$
  select case
    when service in ('luckydraw', 'quiz', 'photocard', 'poll', 'stamp') then 14
    else 0
  end;
$$;

-- 0009 §3 이 준 grant 는 `create or replace` 로 유지되지만, 그 사실에 기대지 않고 다시 준다
-- (0010 §3: 이 함수는 **정책이 부른다** — anon 이 EXECUTE 를 잃으면 슬롯이 아무에게도 안 열린다).
grant execute on function public.slot_grace_days(text) to anon, authenticated;
