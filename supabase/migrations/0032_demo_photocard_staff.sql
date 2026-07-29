-- 0032_demo_photocard_staff.sql — 체험 슬롯의 스태프 뽑기
--
-- 랜딩에서 포토카드를 보여줄 때 **방문자 폰만으로는 절반만 보여주는 것**이다. 이 서비스의
-- 값어치는 "판매·1장 증정에서 스태프가 뽑는다" 쪽에 있고, 그 화면(`/{slug}/staff`)은
-- 로그인 뒤에 있다. 체험 슬롯에 계정을 만들어 공개할 수는 없다(그 계정으로 다른 걸 만질 수 있다).
--
-- 그래서 **체험 슬롯에 한해** 스태프 뽑기 RPC 가 `manages_slot` 대신 `demo` 를 본다.
-- 열어주는 범위를 좁게 못 박는다:
--   · `slots.demo = true` 인 슬롯에서만
--   · 뽑기 자체는 그대로 서버가 한다(확률·재고·레이트리밋 전부 유효)
--   · 체험 슬롯의 카드는 재고가 무제한이라 **깎일 재고가 없다**
--   · 뽑기권 소각(gift)은 열지 않는다 — 그건 방문자가 만든 뽑기권을 태우는 일이라
--     공개 슬롯에서 남이 남의 뽑기권을 태울 수 있게 된다
--
-- 화면도 같이 연다: `/staff` 는 체험 슬롯이면 로그인을 묻지 않는다 (staff/StaffApp.tsx).

-- **0026 의 본문에서 시작한다** (함수 재정의는 가장 최근 정의를 딛는다 — 0030 의 교훈)
create or replace function public.photocard_draw_batch(target text, cnt int)
  returns jsonb
  language plpgsql security definer set search_path = public
as $$
declare
  st public.photocard_settings;
begin
  /*
   * 스태프 게이트 — **체험 슬롯만 예외다** (0032 주석). 화면 disabled 로는 아무것도 못 막으므로
   * 판정은 여기서 한다. 체험 슬롯은 재고가 무제한이라 깎일 재고가 없고, 레이트리밋은 그대로다.
   */
  if not (public.is_owner() or public.manages_slot(target)
          or exists (select 1 from public.slots s where s.slug = target and coalesce(s.demo, false))) then
    raise exception '권한이 없어요' using errcode = '42501';
  end if;

  select * into st from public.photocard_settings where slug = target;
  if not found or st.mode <> 'sale' then
    raise exception '이 이벤트는 묶음 뽑기를 쓰지 않아요' using errcode = 'P0001';
  end if;

  -- **화면 값을 믿지 않는다** — 하드 상한 50 + 슬롯 설정 중 작은 쪽 (draw_prizes 와 같은 결)
  if cnt is null or cnt < 1 or cnt > least(greatest(st.batch_count, 1), 50) then
    raise exception '뽑는 장수가 올바르지 않아요' using errcode = '22023';
  end if;

  return public._photocard_pick(target, cnt, 'sale', null);
end;
$$;

-- 체험 슬롯에서 방문자가 직접 눌러 보므로 anon 에도 준다 (판정은 함수 안의 demo 검사가 한다)
revoke execute on function public.photocard_draw_batch(text, int) from public;
grant execute on function public.photocard_draw_batch(text, int) to anon, authenticated, service_role;
