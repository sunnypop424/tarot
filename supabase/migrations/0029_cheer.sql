-- 0029_cheer.sql — 영상회 라이브 응원 (열 번째 서비스)
--
-- **데이터 테이블을 새로 만들지 않는다.** 한마디 = 닉네임 + 본문 + 숨김 여부라
-- 롤링페이퍼(`rolling_messages`)와 모양이 완전히 같다. 소원나무(`wish`)가 이미 그 테이블을
-- 같이 쓰고 있고(0013 주석), 검수 화면·RLS·verify 를 한 벌 더 만들면 **한쪽만 고치는 날**이 온다.
--
-- 그래서 여기서 만드는 건 둘뿐이다:
--   1. `slots.cheer` — 겉모습 (최고관리자, 편집기)
--   2. `cheer_settings` — 운영값 (주최자, 관리 화면)
--
-- 경계는 다른 서비스와 같다: **행사 중에 바뀌는 값이면 주최자, 배포 전에 정하면 편집기.**
-- 한 화면에 몇 개를 띄울지·글자 수·1인 입력 수는 현장에서 보고 조정하는 값이라 주최자다.

alter table public.slots
  add column if not exists cheer jsonb not null default '{}'::jsonb;

create table if not exists public.cheer_settings (
  slug text primary key references public.slots(slug) on delete cascade on update cascade,
  /** 한 화면에 동시에 띄울 말풍선 수 (1~10). 많으면 영상이 가리고 적으면 한마디가 다 못 나온다 */
  bubbles int not null default 6 check (bubbles between 1 and 10),
  /** 가운데를 비워 둘 비율 — 영상이 뜨는 자리. '16:9' 같은 문자열 */
  ratio text not null default '16:9',
  /**
   * 교체 간격(초). **한꺼번에 갈아치우지 않는다** — 말풍선마다 이 값의 ±30% 로 흩어져
   * 하나씩 바뀐다. 전체가 동시에 깜빡이면 화면이 번쩍여 영상이 안 보인다.
   */
  interval_sec int not null default 6 check (interval_sec between 3 and 15),
  /** 이름을 같이 띄울지 — 익명 행사면 끈다 */
  show_name boolean not null default true,
  /** 한 사람이 남길 수 있는 수 (1~10). localStorage 기준이라 완벽히는 못 막는다 */
  per_person int not null default 3 check (per_person between 1 and 10),
  /** 한마디 글자 수 상한 (10~60). 말풍선에 들어가는 길이가 곧 이 값이다 */
  max_length int not null default 40 check (max_length between 10 and 60),
  /** 마감 — 입력이 막힌다 (상영 중에 더 안 받고 싶을 때) */
  closed boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.cheer_settings enable row level security;

-- 방문자도 읽는다 — 글자 수·1인 입력 수·이름 표시가 **입력 화면에 필요한 값**이다
drop policy if exists "anyone reads cheer settings" on public.cheer_settings;
create policy "anyone reads cheer settings" on public.cheer_settings for select
  using (exists (
    select 1 from public.slots s
    where s.slug = cheer_settings.slug and public.slot_visible(s.period, s.service)
  ));

drop policy if exists "managers manage cheer settings" on public.cheer_settings;
create policy "managers manage cheer settings" on public.cheer_settings for all
  using (public.manages_slot(slug)) with check (public.manages_slot(slug));

drop policy if exists "owner manages cheer settings" on public.cheer_settings;
create policy "owner manages cheer settings" on public.cheer_settings for all
  using (public.is_owner()) with check (public.is_owner());

grant select on public.cheer_settings to anon, authenticated;
grant insert, update, delete on public.cheer_settings to authenticated;

/*
 * **`rolling_messages` 의 정책이 이 서비스에도 그대로 걸린다.**
 * 0013 의 방문자 쓰기 정책은 `slot_open(s.period)` 만 보고 서비스는 안 본다 — 그래서
 * 소원나무가 그랬듯 영상회도 추가 작업 없이 같은 테이블에 쓴다.
 * 마감(`closed`)은 화면과 이 설정이 지키고, 기간은 RLS 가 지킨다.
 */

-- 대여 종료 뒤 유예 — 응모·연락처가 없는 서비스라 롤페와 같은 값이면 충분하다
comment on table public.cheer_settings is
  '영상회 응원 운영값 (주최자). 한마디 자체는 rolling_messages 에 산다 — 0029 주석.';
