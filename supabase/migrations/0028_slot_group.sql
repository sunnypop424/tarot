-- 0028_slot_group.sql — 슬롯 묶음 (최고관리자 정리용)
--
-- **한 행사가 슬롯 여러 개를 쓴다.** 같은 생일카페에 포토카드 뽑기·스탬프·모의고사를 같이
-- 얹으면 슬롯이 셋인데, 목록에서는 남의 행사와 뒤섞여 이름으로만 구분됐다.
--
-- **묶음은 최고관리자의 정리 도구지 권한이 아니다.**
--  · 접근은 지금처럼 slug 스코프다 — 같은 묶음이라고 주최자가 옆 슬롯을 볼 수 있게 되지 않는다.
--  · 그래서 RLS 도 안 건드린다. 컬럼 하나가 전부다.
--  · 주최자 계정(organizers)으로 묶지 않는 이유: 한 계정이 여러 행사를 맡을 수도 있고,
--    계정을 나중에 만들기도 한다. 묶음은 **행사 단위**여야 해서 사람과 독립이어야 한다.
--
-- 이름은 `group` 이 아니라 `group_name` 이다 — `group` 은 SQL 예약어라 인용부호 없이는 못 쓴다.

alter table public.slots
  add column if not exists group_name text;

-- 목록을 묶음으로 정렬해 훑는다 (최고관리자 화면 하나뿐이라 인덱스는 이거면 충분하다)
create index if not exists slots_group_name on public.slots (group_name) where group_name is not null;

comment on column public.slots.group_name is
  '최고관리자용 묶음 이름. 권한과 무관하며(접근은 slug 스코프), 목록 정리에만 쓴다.';
