-- **주최자가 적는 값의 다국어** — 경품 이름·포토카드 이름·설문 제목과 선택지.
--
-- 0044 가 "이 행사에 어떤 언어를 보여줄까" 를 넣었지만, 그건 **우리가 쓴 문구**만 바꾼다
-- (사전이 옮긴다). 방문자가 보는 글자의 절반은 주최자가 적은 것이라 사전으로는 못 푼다 —
-- "1등 사인 폴라로이드" 를 우리가 미리 번역해 둘 방법이 없다. 그래서 주최자가 직접 적는다.
--
-- ── 원문 컬럼은 그대로 둔다 ────────────────────────
--
-- 값을 객체로 바꾸지 않고 **옆에 사전을 하나 더 단다**:
--
--     name      = '1등 사인 폴라로이드'
--     name_i18n = {"en": "Signed Polaroid", "ja": "サイン入りチェキ"}
--
-- 이유가 셋이다:
--
--  1. **이미 도는 행사가 안 깨진다.** `name_i18n` 이 비면 지금과 한 글자도 안 달라진다.
--  2. **함수가 안 깨진다.** `draw_prizes` 는 `p.name` 을 읽어 결과 JSON 에 담고, 그 결과는
--     방문자 화면과 배송 명단이 같이 본다. 컬럼 모양을 바꾸면 저장된 뽑기 기록까지 깨진다.
--  3. **비워 두는 게 고장이 아니다.** 주최자가 영어만 적고 일본어를 안 적어도 화면이 돈다
--     (`src/data/multilingual.ts` 의 `pick` — 없으면 원문).
--
-- ── 왜 검사하지 않나 ───────────────────────────────
--
-- 키가 'en'·'zh'·'ja' 인지 DB 가 안 본다. 0044 와 같은 판단이다 — 모르는 키가 들어와도
-- 화면이 못 찾아 원문으로 떨어질 뿐이라(폴백이 안전하다) 제약이 배포를 막을 이유가 없다.

alter table public.prizes add column if not exists name_i18n jsonb;
alter table public.photocards add column if not exists name_i18n jsonb;
alter table public.poll_polls add column if not exists title_i18n jsonb;
alter table public.poll_options add column if not exists label_i18n jsonb;

comment on column public.prizes.name_i18n is
  '언어 코드 → 그 언어로 적은 경품 이름. 없으면 name 을 쓴다 (src/data/multilingual.ts)';
comment on column public.photocards.name_i18n is
  '언어 코드 → 그 언어로 적은 카드 이름. 없으면 name 을 쓴다';
comment on column public.poll_polls.title_i18n is
  '언어 코드 → 그 언어로 적은 설문 제목. 없으면 title 을 쓴다';
comment on column public.poll_options.label_i18n is
  '언어 코드 → 그 언어로 적은 선택지. 없으면 label 을 쓴다';

-- ── 뽑기 결과는 화면이 맞춘다 (함수를 안 건드린다) ──
--
-- `draw_prizes` 는 결과 JSON 을 서버에서 만들어 준다. 거기에 번역을 실으려면 함수를 고쳐야
-- 하는데, 그 함수는 재고 차감·묶음 상한·리허설 판정을 한 트랜잭션에서 하는 이 서비스의 심장이다
-- (0007 §5). **번역을 붙이자고 열 이유가 없다** — 화면은 이미 경품 표(`listPrizes`)를 들고
-- 있고, 결과의 `prizeId` 로 그 표에서 이름을 찾으면 된다.
--
-- 그래서 이 마이그레이션은 **컬럼만 더한다.** 함수도 RLS 도 그대로다.
