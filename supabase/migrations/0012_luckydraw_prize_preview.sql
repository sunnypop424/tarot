-- 경품 미리보기 — 주최자가 운영 설정에서 켜고 끈다 (뽑기 전 상품 노출 · 수량 표기).
--
-- 테마(최고관리자)가 아니라 **운영 결정**이라 luckydraw_settings 에 둔다 (displayMode 와 같은 급).
-- 둘 다 기본 켜짐: 대부분의 행사는 어떤 경품이 있는지 보여주는 게 참여를 돕는다.
--
-- 코드는 이 컬럼이 없어도 안 깨진다: getSettings 는 select('*') 라 없으면 기본 true 로 읽고,
-- saveSettings 는 이 두 값만 별도 update 로 써서 실패해도 나머지 저장(마감·잠금 등)은 그대로 돈다.
-- 그래도 실제로 저장·반영되려면 이 마이그레이션을 적용해야 한다.

alter table public.luckydraw_settings
  add column if not exists show_prize_preview boolean not null default true,
  add column if not exists show_prize_count boolean not null default true;
