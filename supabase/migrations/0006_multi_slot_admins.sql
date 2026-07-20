-- 주최자 계정 하나가 슬롯 **여럿**을 맡는다.
--
-- 0001 은 반대로 못박아 뒀다: `slot_admins.user_id` 가 PK 라 계정 하나에 슬롯 하나였고,
-- 주석도 "한 사람이 두 이벤트를 하면 계정을 두 개 준다" 였다. 그 전제를 여기서 뒤집는다.
--
-- **왜 뒤집나:** 럭키드로우가 두 번째 서비스로 붙으면서, 같은 행사 주최자가 타로 슬롯과
-- 럭키드로우 슬롯을 동시에 갖는 경우가 생겼다 (docs/LUCKYDRAW-REVIEW.md §3 의 ②안).
-- 계정을 두 개 주면 그 사람은 행사 당일 두 번 로그인해야 하고, 어느 쪽 비밀번호였는지 헷갈린다.
-- 슬롯 격리는 그대로다 — **매핑이 있는 슬롯만** 만질 수 있고, 그 판정은 여전히 RLS 가 한다.
--
-- 0001 의 걱정("그래서 지금 어느 슬롯이지?")은 유효하지만 답이 있다: 화면은 이미 URL 에서
-- 슬러그를 얻는다 (SlotProvider). 계정이 여러 슬롯을 가져도 "지금 슬롯"은 늘 주소가 정한다.

-- ══ 1. PK 를 (user_id, slug) 로 ═══════════════════
--
-- user_id 가 선두 컬럼이라 "내 슬롯 목록" 조회는 이 인덱스를 그대로 탄다.
alter table public.slot_admins drop constraint slot_admins_pkey;
alter table public.slot_admins add primary key (user_id, slug);

-- 슬롯 쪽에서 훑는 경로(purgeSlot: "이 슬롯의 주최자가 누구인가")는 선두 컬럼이 아니라
-- 인덱스를 못 탄다. 슬롯 삭제 때마다 풀스캔할 이유가 없다.
create index if not exists slot_admins_slug_idx on public.slot_admins (slug);

-- ══ 2. RLS 는 손댈 게 없다 ════════════════════════
--
-- `manages_slot(target)` 은 `where user_id = auth.uid() and slug = target` 의 exists 라
-- 행이 여러 개여도 그대로 맞다. "자기 행만 읽는다" 정책도 여러 행 select 가 자연스럽다.
-- 즉 **격리는 이 마이그레이션 전후로 동일하다** — 바뀐 건 한 계정이 가질 수 있는 행 수뿐이다.

-- ══ 3. 여기서 안 하는 것 (같이 고쳐야 하는 코드) ══
--
-- DB 는 이걸로 끝이지만, 단수 slug 를 전제한 코드가 남아 있으면 **조용히** 깨진다.
-- 아래는 이 마이그레이션과 **함께** 고쳐야 하는 목록이다 (안 고치면 겸직 계정이 망가진다):
--
--  a. `repo/supabase.ts` myAdminSlug() 의 `.maybeSingle()`
--     → 행이 2개면 에러다. 겸직 주최자는 **로그인 자체가 안 된다.**
--  b. `supabase/functions/admin/index.ts` organizerSlug() 의 `.maybeSingle()`
--     → 에러를 삼키고 null 을 돌려준다 → "주최자 계정이 아니에요" 404.
--       비밀번호 재설정도 계정 삭제도 막힌다. **조용히 망가지는 쪽이라 더 나쁘다.**
--  c. 같은 파일 purgeSlot / revokeOrganizer
--     → 슬롯 A 를 지울 때 slug=A 인 user 를 **계정째** 지운다. 겸직 계정이면
--       B 슬롯의 로그인까지 증발한다. **마지막 매핑일 때만** 계정을 지우도록 바꿔야 한다.
--  d. createOrganizer
--     → 이미 있는 이메일을 409 로 막는다. "기존 주최자에게 슬롯을 하나 더" 경로가 없다.
--  e. `AdminUser.slug: string` → `slugs: string[]`, useAdminAuth 의 일치 검사
