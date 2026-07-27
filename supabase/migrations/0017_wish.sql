-- 소원 나무 — **테이블을 새로 만들지 않는다. 롤링페이퍼 것을 그대로 쓴다.**
--
-- 소원 하나는 롤페 메시지 하나와 데이터 모양이 정확히 같다:
--   닉네임 + 본문 + 색 + 글꼴 + 장식 + 숨김(후검수) + 작성시각.
-- 다른 건 그리는 방법뿐이다 — 벽에 붙은 포스트잇이냐, 나뭇가지에 매달린 등불이냐.
--
-- 그래서 `rolling_messages` 를 공유하고 필드 셋을 재해석한다 (`src/data/wish.ts`):
--   color   → 등불 색
--   font    → 손글씨 (그대로)
--   sticker → 매다는 장식
--
-- **RLS 를 손댈 필요가 없다는 걸 확인하고 이렇게 정했다.** 0013 의 정책 넷은 슬롯의 service 를
-- `slot_visible(s.period, s.service)` 에 **넘기기만** 하고 `'rolling'` 을 하드코딩하지 않는다.
-- `slot_grace_days('wish')` 는 0 이라(0015 에서 안 늘렸다 — 주최자가 행사 뒤에 꺼낼 게 없다)
-- 롤페와 판정이 정확히 같다. 즉 wish 슬롯의 메시지는 처음부터 옳게 보호된다.
-- `scripts/verify-rolling.mjs` 를 service='wish' 로 한 번 더 돌려 그걸 실증한다.
--
-- ⚠ **다음 사람에게:** `rolling_messages` 를 고칠 땐 소원나무도 같이 본다.
--    이 사실은 `src/lib/repo/types.ts` 의 `RollingRepo` 주석에도 적어뒀다.
--    `wish_messages` 를 새로 만들지 말 것 — 만드는 순간 후검수 화면이 둘로 갈린다.

alter table public.slots
  add column if not exists wish jsonb not null default '{}'::jsonb;
