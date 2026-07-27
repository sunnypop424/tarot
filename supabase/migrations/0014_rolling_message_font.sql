-- 0014_rolling_message_font.sql — 쪽지마다 손글씨 폰트
--
-- 방문자가 작성 화면에서 쪽지 폰트를 고른다 (WEBFONTS 의 손글씨 id). 빈 문자열이면 벽 기본 폰트.
-- 값은 폰트 **id 문자열**만 든다 (예: 'nanumPen') — 실제 글꼴은 프론트가 fonts.ts 로 댄다.
-- color 와 같은 결의 컬럼이라 정책·grant 는 그대로 (0013 이 이미 열어둠).

alter table public.rolling_messages
  add column if not exists font text not null default '';
