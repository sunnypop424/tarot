-- 방문 스탬프 — 현장 암호로 도장을 찍고, 다 모으면 보상(0019 공용)으로 넘어간다.
--
-- **체크인을 무엇으로 증명하나** 가 이 서비스의 전부다. QR 을 찍기만 하면 찍히는 구조면
-- QR 사진 한 장이 단톡방에 돌고 아무도 카페에 안 와도 다 모은다. 그래서 **현장 암호**다:
-- 스탬프마다 주최자가 정한 코드를 현장에 게시하고 방문자가 입력한다.

-- ══ 1. 암호 ═══════════════════════════════════════
--
-- **anon 에게 grant 를 주지 않는다.** 코드가 읽히면 이 서비스는 의미가 없다
-- (모의고사 정답을 별도 테이블로 빼는 것과 같은 이유 — RLS 는 행을 거르지 열을 못 가린다).
create table if not exists public.stamp_codes (
  slug text not null references public.slots(slug) on delete cascade on update cascade,
  stamp_id text not null,
  code text not null,
  updated_at timestamptz not null default now(),
  primary key (slug, stamp_id)
);
alter table public.stamp_codes enable row level security;

drop policy if exists "managers manage codes" on public.stamp_codes;
create policy "managers manage codes" on public.stamp_codes for all
  using (public.manages_slot(slug)) with check (public.manages_slot(slug));
drop policy if exists "owner manages codes" on public.stamp_codes;
create policy "owner manages codes" on public.stamp_codes for all
  using (public.is_owner()) with check (public.is_owner());
grant select, insert, update, delete on public.stamp_codes to authenticated;

-- ══ 2. 운영 설정 (주최자) ═════════════════════════
create table if not exists public.stamp_settings (
  slug text primary key references public.slots(slug) on delete cascade on update cascade,
  reward_mode text not null default 'none' check (reward_mode in ('none','guaranteed','raffle')),
  /*
   * 켜면 매일 KST 00시에 판이 비워진다. **실제로 지우지 않는다** — 아래 checkins 의
   * `day` 생성 컬럼으로 "오늘 것만" 읽는다. 지우면 집계가 날아가고 00시 cron 도 필요해진다.
   */
  daily_reset boolean not null default false,
  closed boolean not null default false,
  /** 응모 폼에서 받을 필드 — 안 켠 건 폼에도 DB 에도 안 들어간다 */
  entry_fields jsonb not null default '{"handle":true,"contact":false,"address":false}'::jsonb,
  reward_label text not null default '선물',
  updated_at timestamptz not null default now()
);
alter table public.stamp_settings enable row level security;

drop policy if exists "anyone reads stamp settings" on public.stamp_settings;
create policy "anyone reads stamp settings" on public.stamp_settings for select
  using (exists (
    select 1 from public.slots s
    where s.slug = stamp_settings.slug and public.slot_visible(s.period, s.service)
  ));
drop policy if exists "managers manage stamp settings" on public.stamp_settings;
create policy "managers manage stamp settings" on public.stamp_settings for all
  using (public.manages_slot(slug)) with check (public.manages_slot(slug));
drop policy if exists "owner manages stamp settings" on public.stamp_settings;
create policy "owner manages stamp settings" on public.stamp_settings for all
  using (public.is_owner()) with check (public.is_owner());
grant select on public.stamp_settings to anon, authenticated;
grant insert, update, delete on public.stamp_settings to authenticated;

-- ══ 3. 체크인 ═════════════════════════════════════
create table if not exists public.stamp_checkins (
  id uuid primary key default gen_random_uuid(),
  slug text not null references public.slots(slug) on delete cascade on update cascade,
  subject text not null,
  stamp_id text not null,
  created_at timestamptz not null default now(),
  /*
   * **타임존을 명시하지 않으면 한국 새벽 9시에 리셋된다** (서버가 UTC 다).
   * 생성 컬럼이라 값이 어긋날 수가 없다.
   */
  day date not null generated always as (((created_at at time zone 'Asia/Seoul'))::date) stored,
  unique (slug, subject, stamp_id, day)
);
create index if not exists stamp_checkins_lookup on public.stamp_checkins (slug, subject, day);
alter table public.stamp_checkins enable row level security;

-- **anon select 정책이 없다.** anon 은 subject 를 아무거나 주장할 수 있어 RLS 로는 "내 것" 을
-- 가릴 방법이 없다(JWT 가 없다) — 조회는 아래 `stamp_mine` RPC 로만 한다.
drop policy if exists "managers read checkins" on public.stamp_checkins;
create policy "managers read checkins" on public.stamp_checkins for all
  using (public.manages_slot(slug)) with check (public.manages_slot(slug));
drop policy if exists "owner reads checkins" on public.stamp_checkins;
create policy "owner reads checkins" on public.stamp_checkins for all
  using (public.is_owner()) with check (public.is_owner());
grant select, insert, update, delete on public.stamp_checkins to authenticated;

-- ══ 4. 체크인 RPC ═════════════════════════════════
create or replace function public.stamp_checkin(target text, subj text, raw_code text)
  returns jsonb
  language plpgsql security definer set search_path = public
as $$
declare
  s public.slots;
  cfg public.stamp_settings;
  hit public.stamp_codes;
  today date := (now() at time zone 'Asia/Seoul')::date;
  norm text := upper(regexp_replace(coalesce(raw_code, ''), '[^0-9A-Za-z]', '', 'g'));
  total int;
  got int;
  pkey text;
  rw public.rewards;
begin
  select * into s from public.slots where slug = target;
  if not found then raise exception '없는 이벤트예요' using errcode = 'P0001'; end if;
  if coalesce(s.service, 'tarot') <> 'stamp' then
    raise exception '이 이벤트에는 스탬프가 없어요' using errcode = 'P0001';
  end if;
  if not public.slot_open(s.period) then
    raise exception '지금은 참여할 수 없어요' using errcode = 'P0001';
  end if;

  select * into cfg from public.stamp_settings where slug = target;
  if found and cfg.closed then raise exception '마감됐어요' using errcode = 'P0001'; end if;

  /*
   * **실패 시도를 먼저, 더 짧은 창으로 센다.** 4자리 코드는 무제한 시도로 뚫린다 —
   * 다른 서비스에서 rate_check 는 남용 완화지만 여기서는 브루트포스 차단 그 자체다.
   */
  perform public.rate_check(target, 'stamp_fail', subj, 8, 200, 600);

  select * into hit from public.stamp_codes
   where slug = target and upper(regexp_replace(code, '[^0-9A-Za-z]', '', 'g')) = norm;
  if not found then
    raise exception '암호가 맞지 않아요' using errcode = 'P0001';
  end if;

  -- 맞았으면 성공 쪽 리밋도 센다 (연타로 여러 칸을 긁는 걸 막는다)
  perform public.rate_check(target, 'stamp', subj, 30, 400, 600);

  begin
    insert into public.stamp_checkins(slug, subject, stamp_id) values (target, subj, hit.stamp_id);
  exception when unique_violation then
    raise exception '이미 찍은 도장이에요' using errcode = 'P0001';
  end;

  -- 칸 수는 슬롯 설정(jsonb)에 있다 — 화면과 같은 값을 서버가 읽는다
  total := coalesce(jsonb_array_length(s.stamp -> 'stamps'), 0);
  /*
   * **`count(distinct stamp_id)` 여야 한다.** unique 에 day 가 들어 있어서, 일일 리셋을 끈
   * 이벤트에서 같은 칸을 다른 날 또 찍으면 행이 하나 더 생긴다 — 그냥 count(*) 로 세면
   * 한 칸을 이틀 찍은 사람이 두 칸으로 잡힌다.
   */
  if coalesce(cfg.daily_reset, false) then
    select count(distinct stamp_id) into got from public.stamp_checkins
     where slug = target and subject = subj and day = today;
  else
    select count(distinct stamp_id) into got from public.stamp_checkins
     where slug = target and subject = subj;
  end if;

  -- 다 채웠고 보상이 있으면 **같은 트랜잭션에서** 발급한다 (0019 공용)
  if total > 0 and got >= total and coalesce(cfg.reward_mode, 'none') <> 'none' then
    pkey := case when coalesce(cfg.daily_reset, false) then today::text else 'once' end;
    rw := public.reward_claim(
      target, 'stamp', subj, pkey, null,
      coalesce(nullif(cfg.reward_label, ''), '선물'), cfg.reward_mode, null
    );
  end if;

  return jsonb_build_object(
    'stampId', hit.stamp_id,
    'got', got,
    'total', total,
    'complete', total > 0 and got >= total,
    'rewardCode', rw.code
  );
end;
$$;
revoke execute on function public.stamp_checkin(text, text, text) from public;
grant execute on function public.stamp_checkin(text, text, text) to anon, authenticated;

-- 내 판 — **응모 정보는 절대 안 준다** (그건 주소가 새는 것이다)
create or replace function public.stamp_mine(target text, subj text)
  returns jsonb
  language plpgsql security definer set search_path = public
as $$
declare
  cfg public.stamp_settings;
  today date := (now() at time zone 'Asia/Seoul')::date;
  ids jsonb;
begin
  select * into cfg from public.stamp_settings where slug = target;
  if coalesce(cfg.daily_reset, false) then
    select coalesce(jsonb_agg(distinct stamp_id), '[]'::jsonb) into ids
      from public.stamp_checkins where slug = target and subject = subj and day = today;
  else
    select coalesce(jsonb_agg(distinct stamp_id), '[]'::jsonb) into ids
      from public.stamp_checkins where slug = target and subject = subj;
  end if;
  return jsonb_build_object('stampIds', ids, 'day', case when coalesce(cfg.daily_reset,false) then today::text else null end);
end;
$$;
revoke execute on function public.stamp_mine(text, text) from public;
grant execute on function public.stamp_mine(text, text) to anon, authenticated;

-- ══ 5. 슬롯 설정 ══════════════════════════════════
alter table public.slots add column if not exists stamp jsonb not null default '{}'::jsonb;
