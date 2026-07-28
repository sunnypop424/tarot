-- 0033_demo_photocard_read.sql — 체험 슬롯의 스태프 화면이 카드를 읽게
--
-- 0032 는 체험 슬롯에서 **뽑기 RPC** 만 열었다. 그런데 스태프 화면은 뽑기 전에
-- **카드 목록**(`photocards`)과 **오늘 집계**(`photocard_draws`)를 직접 읽는다 —
-- 그 둘이 anon 에게 막혀 있어 랜딩의 스태프 데모가 401 을 계속 던지고 빈 화면이 됐다.
-- (열어야 할 문을 하나만 열었던 것이다. 화면이 무엇을 읽는지는 화면에 물어봐야 한다.)
--
-- **여는 범위는 `slots.demo = true` 한 줄로 못 박는다.** 고객 슬롯의 카드 목록은 그대로
-- 못 읽는다 — 전체 목록·레어도·재고가 보이면 뽑는 재미가 없고 확률이 노출된다(0026 §2).
-- 체험 슬롯의 카드는 우리가 넣은 샘플이라 숨길 것이 없다.
--
-- `photocard_tickets` 는 **열지 않는다** — 뽑기권 번호는 체험이어도 남의 것이라 목록이
-- 열리면 긁어서 먼저 내밀 수 있고, 데모에 뽑기권 화면을 싣지도 않았다.

drop policy if exists "anyone reads demo photocards" on public.photocards;
create policy "anyone reads demo photocards" on public.photocards for select
  using (exists (select 1 from public.slots s where s.slug = photocards.slug and coalesce(s.demo, false)));

drop policy if exists "anyone reads demo draws" on public.photocard_draws;
create policy "anyone reads demo draws" on public.photocard_draws for select
  using (exists (select 1 from public.slots s where s.slug = photocard_draws.slug and coalesce(s.demo, false)));

-- grant 는 테이블 단위라 **행을 거르는 건 위 정책이다** (0010 의 교훈: 권한은 믿지 말고 본다).
-- select 만 준다 — 쓰기는 여전히 RPC 와 관리자만.
grant select on public.photocards to anon;
grant select on public.photocard_draws to anon;
