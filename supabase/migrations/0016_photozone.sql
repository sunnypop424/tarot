-- 포토존 프레임 — **테이블도 RLS 도 없는 유일한 서비스.**
--
-- 슬롯에 설정 컬럼 하나를 더하는 게 전부다. 이유를 적어둘 만하다:
--
--   설정        → 여기(slots.photozone jsonb). 최고관리자가 편집기에서 정한다.
--   프레임 PNG  → Storage `slots` 버킷 (`{slug}/photozone/{id}.{ext}`).
--                 0002 의 정책 그대로 — **write 는 is_owner() 만**, read 는 public.
--   방문자 사진 → **서버에 안 온다.** 폰에서 캔버스로 합성해 바로 내려받는다.
--
-- 마지막 줄이 이 서비스의 설계 전부다. 방문자 사진을 서버에 두는 순간 이건 **미성년 팬의 얼굴
-- 사진을 호스팅하는 서비스**가 된다. "공유 링크를 만들어 달라" 는 요구가 와도 열지 않는다 —
-- 공유는 navigator.share 로 파일을 직접 넘기고 URL 을 만들지 않는다.
--
-- 그래서 0002 의 Storage 정책을 **건드리지 않는 것이 곧 설계다.** anon 은 버킷에 못 쓴다.
-- `scripts/verify-photozone.mjs` 가 그걸 실제로 찔러 확인한다(정책 회귀 검사).
--
-- 유예 기간(`slot_grace_days`)도 안 건드린다 — 행사 뒤에 꺼낼 데이터가 없어 0 이 맞다.

alter table public.slots
  add column if not exists photozone jsonb not null default '{}'::jsonb;
