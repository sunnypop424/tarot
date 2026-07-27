-- 보상·교환·추첨 — **세 서비스가 공유한다** (스탬프 완성 / 모의고사 커트라인 / 포토카드 실물).
--
-- 셋 다 흐름이 같다:
--   조건 달성 → (확정) 교환코드 발급 → 스태프가 확인 → 중복 수령 차단
--             → (응모) 연락처 수집 → 주최자가 추첨 → 트위터 발표
-- 서비스마다 만들면 테이블 여섯 개·RPC 아홉 개가 같은 모양으로 중복된다. 한 번 만들고
-- `source` 로 구분한다.

-- ══ 1. 보상 ═══════════════════════════════════════
create table if not exists public.rewards (
  id uuid primary key default gen_random_uuid(),
  slug text not null references public.slots(slug) on delete cascade on update cascade,
  source text not null,                    -- 'stamp' | 'quiz' | 'photocard'
  subject text not null,                   -- 익명 uuid (src/lib/visitor.ts)
  /*
   * **중복 발급을 막는 열쇠.** 서비스마다 "한 번" 의 뜻이 달라서 문자열 하나로 흡수한다:
   *   stamp(일일 리셋 켬) '2026-07-27' · stamp(끔) 'once' · quiz attempt_id · photocard draw_id
   * 이 한 컬럼 덕에 아래 unique 하나가 세 서비스의 규칙을 전부 담는다.
   */
  period_key text not null,
  ref text,                                -- 유래 (draw_id·attempt_id 등, 조회용)
  label text not null,                     -- 폰에 뜨는 내용 ("스페셜 포토카드 실물 1장")
  code text not null unique,               -- 교환코드 (스태프가 손으로 입력한다)
  kind text not null check (kind in ('guaranteed','raffle')),
  score int,                               -- 모의고사만 채운다 → 추첨이 서비스를 몰라도 점수순이 된다
  won boolean not null default false,      -- 응모 추첨 결과
  picked_round int,
  picked_at timestamptz,
  redeemed_at timestamptz,
  redeemed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (slug, source, subject, period_key)
);
create index if not exists rewards_slug_idx on public.rewards (slug, source, created_at desc);
create index if not exists rewards_subject_idx on public.rewards (slug, source, subject);

-- 응모(raffle) 전용 준-PII. shipping_entries 와 같은 급으로 다룬다
create table if not exists public.reward_entries (
  reward_id uuid primary key references public.rewards(id) on delete cascade,
  slug text not null references public.slots(slug) on delete cascade on update cascade,
  nickname text not null,   -- 항상 받는다
  handle text,              -- 트위터 아이디 — 발표·연락 수단
  contact text,
  address text,             -- 배송이 있을 때만
  created_at timestamptz not null default now()
);
create index if not exists reward_entries_slug_idx on public.reward_entries (slug, created_at desc);

-- 추첨 실행 로그 — 감사용. 럭드가 draw_logs 로 배운 것과 같다
create table if not exists public.reward_picks (
  id uuid primary key default gen_random_uuid(),
  slug text not null references public.slots(slug) on delete cascade on update cascade,
  source text not null,
  method text not null,     -- 'random' | 'score'
  count int not null,
  round int not null,
  picked_by uuid references auth.users(id) on delete set null,
  undone_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.rewards enable row level security;
alter table public.reward_entries enable row level security;
alter table public.reward_picks enable row level security;

-- ══ 2. 정책 ═══════════════════════════════════════
--
-- **방문자는 rewards 를 직접 못 읽는다.** subject 를 아무거나 주장할 수 있어 RLS 로는
-- "내 것" 을 가릴 방법이 없다(JWT 가 없다). 조회는 아래 reward_mine RPC 로만 한다.
--
-- **reward_entries 는 anon 정책이 아예 없다** — 닉네임·연락처·주소가 들어 있다
-- (shipping_entries 와 같은 결). 주최자만 본다.

drop policy if exists "managers manage rewards" on public.rewards;
create policy "managers manage rewards" on public.rewards for all
  using (public.manages_slot(slug)) with check (public.manages_slot(slug));
drop policy if exists "owner manages rewards" on public.rewards;
create policy "owner manages rewards" on public.rewards for all
  using (public.is_owner()) with check (public.is_owner());

drop policy if exists "managers read entries" on public.reward_entries;
create policy "managers read entries" on public.reward_entries for all
  using (public.manages_slot(slug)) with check (public.manages_slot(slug));
drop policy if exists "owner reads entries" on public.reward_entries;
create policy "owner reads entries" on public.reward_entries for all
  using (public.is_owner()) with check (public.is_owner());

drop policy if exists "managers read picks" on public.reward_picks;
create policy "managers read picks" on public.reward_picks for all
  using (public.manages_slot(slug)) with check (public.manages_slot(slug));
drop policy if exists "owner reads picks" on public.reward_picks;
create policy "owner reads picks" on public.reward_picks for all
  using (public.is_owner()) with check (public.is_owner());

-- ══ 3. 교환코드 ═══════════════════════════════════
--
-- **스태프가 손님 폰을 보고 자기 기기에 손으로 입력하는 값이다.** 그래서 혼동 문자를
-- 문자셋에서 아예 뺀다 (Crockford Base32 — I·L·O·U 없음). 0/O, 1/I/L 을 헷갈리는 순간
-- 그건 현장 컴플레인이 된다.
create or replace function public.reward_code()
  returns text language plpgsql volatile
as $$
declare
  alphabet text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  out text := '';
  i int;
begin
  for i in 1..8 loop
    out := out || substr(alphabet, floor(random() * 32)::int + 1, 1);
    if i = 4 then out := out || '-'; end if;   -- XXXX-XXXX 로 끊어 읽기 쉽게
  end loop;
  return out;
end;
$$;

/** 입력값 정규화 — 소문자·하이픈·공백을 흡수한다 (스태프가 어떻게 치든 같은 코드로) */
create or replace function public.reward_normalize(raw text)
  returns text language sql immutable
as $$
  select upper(regexp_replace(coalesce(raw, ''), '[^0-9A-Za-z]', '', 'g'));
$$;

-- ══ 4. 발급 ═══════════════════════════════════════
--
-- **anon 이 직접 못 부른다.** label·kind 를 클라이언트가 주면 아무 보상이나 만들 수 있다.
-- 각 서비스 RPC(stamp_checkin·quiz_submit·photocard_draw…)가 **조건을 서버에서 검증한 뒤**
-- 자기 안에서 부른다.
--
-- 동시에 두 번 눌러도 코드가 하나만 나오는 건 `on conflict` 한 줄로 끝난다 —
-- 럭드식 `for update` 보다 싸고 정확하다.
create or replace function public.reward_claim(
  target text, src text, subj text, pkey text, ref_id text, lbl text, k text, sc int default null
) returns public.rewards
  language plpgsql security definer set search_path = public
as $$
declare
  row public.rewards;
  tries int := 0;
begin
  -- 이미 있으면 그걸 돌려준다 (다시 눌러도 같은 코드가 보여야 한다)
  select * into row from public.rewards
   where slug = target and source = src and subject = subj and period_key = pkey;
  if found then return row; end if;

  loop
    tries := tries + 1;
    begin
      insert into public.rewards(slug, source, subject, period_key, ref, label, code, kind, score)
      values (target, src, subj, pkey, ref_id, lbl, public.reward_code(), k, sc)
      returning * into row;
      return row;
    exception
      when unique_violation then
        -- (slug,source,subject,period_key) 충돌이면 남이 방금 만든 것 — 그걸 읽어 돌려준다
        select * into row from public.rewards
         where slug = target and source = src and subject = subj and period_key = pkey;
        if found then return row; end if;
        -- 아니면 code 충돌 — 다시 뽑는다
        if tries > 5 then raise; end if;
    end;
  end loop;
end;
$$;
revoke execute on function public.reward_claim(text,text,text,text,text,text,text,int) from public, anon, authenticated;
grant execute on function public.reward_claim(text,text,text,text,text,text,text,int) to service_role;

-- ══ 5. 내 보상 보기 (방문자) ══════════════════════
create or replace function public.reward_mine(target text, src text, subj text)
  returns table (code text, label text, kind text, redeemed_at timestamptz, entered boolean, created_at timestamptz)
  language sql security definer set search_path = public
as $$
  -- **응모 정보(닉네임·연락처·주소)는 절대 안 돌려준다** — 냈는지 여부만.
  select r.code, r.label, r.kind, r.redeemed_at,
         exists(select 1 from public.reward_entries e where e.reward_id = r.id),
         r.created_at
    from public.rewards r
   where r.slug = target and r.source = src and r.subject = subj
   order by r.created_at desc;
$$;
revoke execute on function public.reward_mine(text,text,text) from public;
grant execute on function public.reward_mine(text,text,text) to anon, authenticated;

-- ══ 6. 응모 ═══════════════════════════════════════
create or replace function public.reward_enter(
  target text, raw_code text, nick text, tw text default null, ct text default null, addr text default null
) returns void
  language plpgsql security definer set search_path = public
as $$
declare
  r public.rewards;
begin
  if coalesce(trim(nick), '') = '' then
    raise exception '닉네임을 적어 주세요' using errcode = '22023';
  end if;

  select * into r from public.rewards
   where slug = target and code = public.reward_normalize(raw_code)
     -- 코드를 정규화해 비교하되 저장된 값에도 하이픈이 있으므로 양쪽을 맞춘다
     or (slug = target and public.reward_normalize(code) = public.reward_normalize(raw_code));
  if not found then raise exception '코드를 찾을 수 없어요' using errcode = 'P0001'; end if;
  if r.kind <> 'raffle' then raise exception '응모 대상이 아니에요' using errcode = 'P0001'; end if;

  -- 폼을 직접 때려 응모하는 걸 막는다 (보상 행이 있어야만 응모가 성립한다)
  insert into public.reward_entries(reward_id, slug, nickname, handle, contact, address)
  values (r.id, target, trim(nick), nullif(trim(coalesce(tw,'')),''), nullif(trim(coalesce(ct,'')),''), nullif(trim(coalesce(addr,'')),''))
  on conflict (reward_id) do update
    set nickname = excluded.nickname, handle = excluded.handle,
        contact = excluded.contact, address = excluded.address;
end;
$$;
revoke execute on function public.reward_enter(text,text,text,text,text,text) from public;
grant execute on function public.reward_enter(text,text,text,text,text,text) to anon, authenticated;

-- ══ 7. 수령 확인 (스태프) ═════════════════════════
--
-- **anon 이 못 부른다.** 부를 수 있으면 방문자가 자기 코드를 스스로 "수령완료" 처리할 수 있고,
-- 그러면 스태프 화면이 있으나 마나다. 중복 수령을 실제로 막는 건 이 게이트 하나다.
create or replace function public.reward_redeem(target text, raw_code text)
  returns table (ok boolean, label text, already boolean, redeemed_at timestamptz)
  language plpgsql security definer set search_path = public
as $$
declare
  r public.rewards;
begin
  if not (public.is_owner() or public.manages_slot(target)) then
    raise exception '권한이 없어요' using errcode = '42501';
  end if;

  select * into r from public.rewards
   where slug = target and public.reward_normalize(code) = public.reward_normalize(raw_code);
  if not found then
    return query select false, null::text, false, null::timestamptz;
    return;
  end if;
  if r.redeemed_at is not null then
    return query select true, r.label, true, r.redeemed_at;
    return;
  end if;

  update public.rewards set redeemed_at = now(), redeemed_by = auth.uid()
   where id = r.id returning * into r;
  return query select true, r.label, false, r.redeemed_at;
end;
$$;
revoke execute on function public.reward_redeem(text,text) from public, anon;
grant execute on function public.reward_redeem(text,text) to authenticated, service_role;

-- ══ 8. 추첨 (주최자) ══════════════════════════════
--
-- 발표는 주최자가 트위터로 한다 — 방문자에게 당첨을 알리는 화면이 없다.
-- 그래서 이 함수의 결과가 곧 발표 명단이고, 화면은 그걸 복사하기 좋게만 보여주면 된다.
create or replace function public.reward_pick(target text, src text, cnt int, method text)
  returns setof public.rewards
  language plpgsql security definer set search_path = public
as $$
declare
  nxt int;
begin
  if not (public.is_owner() or public.manages_slot(target)) then
    raise exception '권한이 없어요' using errcode = '42501';
  end if;
  if cnt is null or cnt < 1 or cnt > 500 then
    raise exception '뽑을 인원이 올바르지 않아요' using errcode = '22023';
  end if;

  select coalesce(max(picked_round), 0) + 1 into nxt
    from public.rewards where slug = target and source = src;

  return query
  with pool as (
    select r.id from public.rewards r
     where r.slug = target and r.source = src and r.kind = 'raffle' and r.won = false
       -- **응모를 실제로 낸 사람만 후보다.** 연락처를 안 낸 사람은 당첨돼도 연락할 수 없다
       and exists (select 1 from public.reward_entries e where e.reward_id = r.id)
     order by
       case when method = 'score' then r.score end desc nulls last,
       -- 점수순에서도 **커트라인 동점자는 무작위**로 갈린다 (정원은 정확히 맞는다)
       random()
     limit cnt
  )
  update public.rewards r
     set won = true, picked_round = nxt, picked_at = now()
    from pool p where r.id = p.id
  returning r.*;

  insert into public.reward_picks(slug, source, method, count, round, picked_by)
  values (target, src, method, cnt, nxt, auth.uid());
end;
$$;
revoke execute on function public.reward_pick(text,text,int,text) from public, anon;
grant execute on function public.reward_pick(text,text,int,text) to authenticated, service_role;

-- 되돌리기 — **추첨은 되돌릴 수 없으면 사고가 크다** (럭드에 없던 개념)
create or replace function public.reward_unpick(target text, src text, rnd int)
  returns int
  language plpgsql security definer set search_path = public
as $$
declare
  n int;
begin
  if not (public.is_owner() or public.manages_slot(target)) then
    raise exception '권한이 없어요' using errcode = '42501';
  end if;
  update public.rewards
     set won = false, picked_round = null, picked_at = null
   where slug = target and source = src and picked_round = rnd;
  get diagnostics n = row_count;
  update public.reward_picks set undone_at = now()
   where slug = target and source = src and round = rnd and undone_at is null;
  return n;
end;
$$;
revoke execute on function public.reward_unpick(text,text,int) from public, anon;
grant execute on function public.reward_unpick(text,text,int) to authenticated, service_role;

grant select, insert, update, delete on public.rewards to authenticated;
grant select, insert, update, delete on public.reward_entries to authenticated;
grant select on public.reward_picks to authenticated;

-- ══ 9. 유예 ═══════════════════════════════════════
-- 응모 명단을 행사 뒤에 꺼내야 하므로 세 서비스 모두 이미 14일이다 (0015).
-- 여기서 더 손댈 게 없다는 걸 적어둔다 — 다음 사람이 또 찾아보지 않게.
