-- 럭키드로우 **겉모습** — 최고관리자가 슬롯 편집기에서 정한다.
--
-- `luckydraw_settings`(0007)와 갈라 두는 이유는 **권한이 다르기 때문이다.**
-- 저기 있는 값(마감·리허설·잠금·출현제한)은 주최자가 행사 중에 바꾸는 것이고,
-- 여기 있는 값은 테마의 일부라 주최자가 못 건드린다 — slots 는 RLS 가 최고관리자에게만 쓰기를 준다.
-- 한 테이블에 두면 둘 중 하나가 반드시 잘못된 권한을 갖는다.
--
-- theme(jsonb) 옆에 컬럼을 하나 더 두는 이유: theme 은 **서비스와 무관한** 색·형태·이미지고
-- (타로도 럭키드로우도 같은 걸 쓴다), 이건 럭키드로우에만 있는 값이다. 섞으면 타로 슬롯의
-- theme 에 쓸모없는 키가 붙는다. event(카테고리별 뽑기 설정)가 타로 전용인 것과 같은 짝이다.
--
-- 모양: {"highlightRanks":[1,2],"coverMark":"♥","lowStockThreshold":50,
--        "drawLabel":"DRAW!","closedText":"럭키드로우가 마감되었습니다"}
-- 빈 객체 = 전부 기본값 (`src/data/luckydraw.ts` 의 DEFAULT_DISPLAY).
alter table public.slots
  add column if not exists luckydraw jsonb not null default '{}'::jsonb;
