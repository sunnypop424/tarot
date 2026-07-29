-- 0034_demo_admin.sql — 체험 슬롯의 관리 화면을 로그인 없이 연다
--
-- 랜딩이 열 가지를 보여주는데, 그 중 절반은 **주최자가 하는 일**이 값어치다:
-- 럭키드로우는 스태프가 뽑고, 스탬프는 수령을 확인하고, 투표는 설문을 만든다.
-- 그게 전부 `/{slug}/admin` 뒤에 있어 체험에서 보이지 않았다 — 반쪽만 보여주고 있었다.
--
-- **계정을 공개하지 않는다.** 0032 가 포토카드 스태프에 쓴 방식 그대로, 서버 판정을
-- 슬롯 단위로 연다. 비밀번호를 번들에 박으면 그 계정으로 할 수 있는 모든 게 공개되고,
-- 누군가 비밀번호를 바꾸면 체험이 통째로 잠긴다.
--
-- ── 어떻게 ────────────────────────────────────────
--
-- `manages_slot()` 은 47곳(정책·RPC)이 부르는 **판정의 단일 창구**다. 여기 한 줄을 열면
-- 관리 화면이 통째로 열린다. 대신 열려선 안 되는 자리는 **엄격판(`manages_slot_strict`)**
-- 으로 따로 잠근다 — 여는 곳을 47곳 고치는 것보다, 닫는 곳 몇 개를 명시하는 쪽이
-- 빠뜨렸을 때 티가 난다.
--
-- ── 닫아 두는 것 ──────────────────────────────────
--
--   · **AI 답변 생성** — 78장이 183원이다. 아무나 누르면 그만큼 실제 돈이 나간다.
--     판정은 Edge Function 이 하므로 거기서 엄격판을 부른다 (`functions/ai/index.ts`).
--   · **응모자 명단**(`reward_entries`) — 닉네임·트위터·연락처·주소가 들어 있다.
--     체험이라도 남이 적은 걸 다음 사람이 읽으면 안 된다.
--   · **배송 명단**(`shipping_entries`) — 같은 이유. 0030 이 쓰기를 이미 막았고
--     여기서 읽기도 엄격판으로 남긴다.
--
-- 남은 위험은 "체험 슬롯의 설정을 아무나 바꾼다" 인데, **그게 체험의 목적**이고
-- 매일 새벽 기준값으로 되돌린다 (`0035_demo_reset.sql`).

-- ══ 1. 엄격판 — 원래 판정 그대로 ══════════════════
--
-- 0001 의 `manages_slot` 본문이다. 이름만 바꿔 남긴다.
create or replace function public.manages_slot_strict(target text)
  returns boolean language sql security definer stable
  set search_path = public
as $$
  select exists (
    select 1 from public.slot_admins
    where user_id = auth.uid() and slug = target
  );
$$;

comment on function public.manages_slot_strict(text) is
  '진짜 주최자만. 체험 슬롯 예외가 없다 — 돈이 나가거나 개인정보를 읽는 자리에 쓴다 (0034).';

-- ══ 2. 일반판 — 체험 슬롯이면 통과 ════════════════
create or replace function public.manages_slot(target text)
  returns boolean language sql security definer stable
  set search_path = public
as $$
  select public.manages_slot_strict(target)
      or exists (
           select 1 from public.slots s
           where s.slug = target and coalesce(s.demo, false)
         );
$$;

comment on function public.manages_slot(text) is
  '주최자이거나 체험 슬롯. 체험 슬롯은 로그인 없이 관리 화면을 연다 (0034).';

-- ══ 3. 개인정보는 엄격판으로 ══════════════════════
--
-- `for all` 이라 읽기·쓰기가 같이 걸린다. 체험 슬롯에서도 이 두 표는 안 열린다.
drop policy if exists "managers read entries" on public.reward_entries;
create policy "managers read entries" on public.reward_entries for all
  using (public.manages_slot_strict(slug)) with check (public.manages_slot_strict(slug));

drop policy if exists "organizer reads own shipping" on public.shipping_entries;
create policy "organizer reads own shipping"
  on public.shipping_entries for select using (public.manages_slot_strict(slug));
drop policy if exists "organizer deletes own shipping" on public.shipping_entries;
create policy "organizer deletes own shipping"
  on public.shipping_entries for delete using (public.manages_slot_strict(slug));

-- 뽑기 명단은 남의 개인정보가 아니라 **당첨 기록**이라 그대로 연다 (draw_logs·reward_picks).
