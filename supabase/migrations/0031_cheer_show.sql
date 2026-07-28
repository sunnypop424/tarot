-- 0031_cheer_show.sql — 영상회 상영 제어 (시작 · 감추기 · 엔딩크레딧)
--
-- **영상과 동기화하지 않는다.** 영상 소스가 매번 다르고(노트북 파일·유튜브·DVD·실시간),
-- 재생 위치를 알려면 영상을 우리 페이지에서 재생해야 하는데 그건 저작권 있는 파일을 우리
-- 화면에 올리는 일이다 — 이 플랫폼이 계속 피해온 자리다.
--
-- 대신 **사람이 누른 시각 하나를 기준점**으로 삼는다:
--
--   idle    상영 전 (아무것도 안 뜬다)
--   live    말풍선이 뜬다              ← '상영 시작' 을 누른 순간 started_at 이 박힌다
--   hidden  잠시 감춤 (중요한 장면)
--   credits 엔딩크레딧
--
-- `runtime_sec`(영상 길이)를 적어두면 상영 화면이 **경과 시간을 보고 스스로** 크레딧으로
-- 넘어간다(10초 카운트다운 + 취소). 기준은 여전히 '시작' 을 누른 시각이라, 오차는 그때 한 번의
-- 오차뿐이다 — **프레임 단위는 이 방식으로 못 맞춘다**(그건 우리가 영상을 재생해야 가능하다).
--
-- 제어는 주최자(폰)가 하고 상영 화면은 **실시간으로 구독**한다. 그래서 이 테이블을
-- publication 에 넣는다 — 상태 행 하나라 페이로드가 작다(0020 이 poll_options 만 넣은 것과 같은 결).

alter table public.cheer_settings
  add column if not exists show_state text not null default 'idle'
    check (show_state in ('idle', 'live', 'hidden', 'credits')),
  add column if not exists started_at timestamptz,
  /** 영상 길이(초) — 0 이면 자동 전환 안 함 */
  add column if not exists runtime_sec int not null default 0 check (runtime_sec between 0 and 36000);

comment on column public.cheer_settings.show_state is
  '상영 상태. 제어판(주최자)이 쓰고 상영 화면이 실시간으로 받는다 — 0031 주석.';

-- 실시간 — 이미 들어 있으면 두 번 넣지 않는다 (0013 과 같은 멱등 do-block)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'cheer_settings'
  ) then
    alter publication supabase_realtime add table public.cheer_settings;
  end if;
end $$;
