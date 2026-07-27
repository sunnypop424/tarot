-- 포토카드 뽑기 — **가장 큰 서비스.** 운영 방식이 셋으로 갈린다.
--
--   save : 방문자 폰에서 뽑고 이미지를 저장한다. 실물 없음
--   gift : 방문자 폰이 뽑기권을 만들고, **스태프 기기**가 그 번호로 뽑아 실물을 준다
--   sale : **스태프 기기**에서만. 현장 결제 뒤 N연차. 방문자 화면엔 안내 한 장뿐
--
-- **실물이 걸리면 뽑기는 항상 스태프 기기에서 일어난다.** 방문자 폰이 단독으로 실물을
-- 결정하는 경로가 없다 — 이게 이 설계의 뼈대다.
--
-- ══ 럭키드로우에서 **반드시 바꿔야 하는** 한 줄 ══════
--
-- `draw_prizes`(0007)는 `weight = remaining` 이다 — "남은 게 많을수록 잘 나온다".
-- 재고 비례가 럭드에서는 옳다(경품은 수량이 곧 등급이다).
--
-- **포토카드는 아니다. SSR 이 1장 남아도 SSR 확률로 나와야 한다.**
-- 그래서 여기서는 `weight = rarity` 이고 `remaining` 은 **필터로만** 쓴다
-- (0이면 후보에서 빠지고, null 이면 영원히 후보).
--
-- 0007 을 복사해 오면 이 한 줄이 틀린 채 배포되고, **증상이 "확률이 좀 이상한데" 라서
-- 아무도 못 찾는다.** 고치기 전에 이 문단을 읽을 것.

-- ══ 1. 카드 ═══════════════════════════════════════
create table if not exists public.photocards (
  id uuid primary key default gen_random_uuid(),
  slug text not null references public.slots(slug) on delete cascade on update cascade,
  name text not null,
  /** 1~5. **이게 곧 가중치다** (재고가 아니다 — 위 문단) */
  rarity int not null default 1 check (rarity between 1 and 5),
  image text not null,
  /** null = 무제한. 0 = 소진 */
  remaining int,
  /** 한 묶음(N연차)에서 이 카드가 차지할 수 있는 최대 비율 — 0.2 면 10연차에 2장까지 */
  batch_cap_ratio numeric check (batch_cap_ratio is null or (batch_cap_ratio > 0 and batch_cap_ratio <= 1)),
  "order" int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists photocards_slug_idx on public.photocards (slug, "order");

create table if not exists public.photocard_settings (
  slug text primary key references public.slots(slug) on delete cascade on update cascade,
  mode text not null default 'save' check (mode in ('save','gift','sale')),
  /** save 모드에서 한 사람이 뽑을 수 있는 횟수 */
  draws_per_visitor int not null default 1,
  /** sale 모드 N연차 상한 — 화면 값을 믿지 않는 하드 천장 */
  batch_count int not null default 10,
  batch_cap_enabled boolean not null default true,
  /** gift 모드에서 방문자가 결과 이미지를 저장할 수 있나 */
  allow_save boolean not null default false,
  closed boolean not null default false,
  /** **기본 켬** — 전날 시연에서 한정 카드를 태우는 사고가 더 비싸다 (럭드와 같다) */
  rehearsal boolean not null default true,
  updated_at timestamptz not null default now()
);

/*
 * 뽑기권 (gift 전용).
 *   unique(slug, code)    — 스태프가 번호로 찾는다
 *   unique(slug, subject) — **재발급 불가.** 한 폰은 뽑기권 하나
 *
 * 한계를 정직하게 적어둔다: `subject` 는 localStorage 라 **브라우저를 지우면 새 뽑기권이
 * 나온다.** 방문자가 스스로 발급하는 구조의 필연이다. 완화는 셋 — 발급 레이트리밋,
 * 스태프 화면의 발급/소각 현황, 그리고 실물을 건네는 순간 스태프가 얼굴을 본다는 것.
 * **"1인 1회가 완벽히 막힌다" 고 주최자에게 말하면 안 된다.**
 */
create table if not exists public.photocard_tickets (
  id uuid primary key default gen_random_uuid(),
  slug text not null references public.slots(slug) on delete cascade on update cascade,
  code text not null,
  subject text not null,
  status text not null default 'open' check (status in ('open','drawn')),
  card_id uuid references public.photocards(id) on delete set null,
  card_name text,
  card_image text,
  issued_at timestamptz not null default now(),
  drawn_at timestamptz,
  drawn_by uuid references auth.users(id) on delete set null,
  unique (slug, code),
  unique (slug, subject)
);

create table if not exists public.photocard_draws (
  id uuid primary key default gen_random_uuid(),
  slug text not null references public.slots(slug) on delete cascade on update cascade,
  card_id uuid references public.photocards(id) on delete set null,
  card_name text not null,
  rarity int not null,
  subject text,
  source text not null,          -- 'save' | 'gift' | 'sale'
  batch_id uuid,
  rehearsal boolean not null default false,
  cap_overflow boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists photocard_draws_lookup on public.photocard_draws (slug, created_at desc);
create index if not exists photocard_draws_subject on public.photocard_draws (slug, subject);

alter table public.photocards enable row level security;
alter table public.photocard_settings enable row level security;
alter table public.photocard_tickets enable row level security;
alter table public.photocard_draws enable row level security;

-- ══ 2. 정책 ═══════════════════════════════════════
--
-- **`photocards` 에 anon select 를 안 준다.** 전체 목록·레어도·재고가 보이면 뽑는 재미가
-- 없고 확률이 그대로 노출된다. "N종 중 M종" 같은 건 RPC 가 개수만 준다.
--
-- **`photocard_tickets` 도 anon select 없음.** 목록이 열리면 남의 뽑기권 번호를 긁어
-- 스태프에게 먼저 내밀 수 있다. 조회는 코드를 아는 사람만 RPC 로.

drop policy if exists "managers manage photocards" on public.photocards;
create policy "managers manage photocards" on public.photocards for all
  using (public.manages_slot(slug)) with check (public.manages_slot(slug));
drop policy if exists "owner manages photocards" on public.photocards;
create policy "owner manages photocards" on public.photocards for all
  using (public.is_owner()) with check (public.is_owner());

-- 설정은 읽혀도 된다 — 화면이 모드에 따라 통째로 달라져서 방문자도 알아야 한다
drop policy if exists "anyone reads photocard settings" on public.photocard_settings;
create policy "anyone reads photocard settings" on public.photocard_settings for select
  using (exists (
    select 1 from public.slots s
    where s.slug = photocard_settings.slug and public.slot_visible(s.period, s.service)
  ));
drop policy if exists "managers manage photocard settings" on public.photocard_settings;
create policy "managers manage photocard settings" on public.photocard_settings for all
  using (public.manages_slot(slug)) with check (public.manages_slot(slug));
drop policy if exists "owner manages photocard settings" on public.photocard_settings;
create policy "owner manages photocard settings" on public.photocard_settings for all
  using (public.is_owner()) with check (public.is_owner());

drop policy if exists "managers read tickets" on public.photocard_tickets;
create policy "managers read tickets" on public.photocard_tickets for all
  using (public.manages_slot(slug)) with check (public.manages_slot(slug));
drop policy if exists "owner reads tickets" on public.photocard_tickets;
create policy "owner reads tickets" on public.photocard_tickets for all
  using (public.is_owner()) with check (public.is_owner());

drop policy if exists "managers read draws" on public.photocard_draws;
create policy "managers read draws" on public.photocard_draws for all
  using (public.manages_slot(slug)) with check (public.manages_slot(slug));
drop policy if exists "owner reads draws" on public.photocard_draws;
create policy "owner reads draws" on public.photocard_draws for all
  using (public.is_owner()) with check (public.is_owner());

revoke all on public.photocards from public, anon;
revoke all on public.photocard_tickets from public, anon;
revoke all on public.photocard_draws from public, anon;
grant select on public.photocard_settings to anon, authenticated;
grant select, insert, update, delete on public.photocards to authenticated;
grant select, insert, update, delete on public.photocard_settings to authenticated;
grant select, insert, update, delete on public.photocard_tickets to authenticated;
grant select, insert, update, delete on public.photocard_draws to authenticated;

-- ══ 3. 추첨 알맹이 ════════════════════════════════
--
-- **게이트가 없는 내부 함수다.** 실행 주체가 모드마다 달라서(anon / 스태프 / 스태프) 바깥
-- 함수 셋이 각자의 게이트만 지고, 뽑는 일은 여기 하나로 모은다. 0007 은 첫 줄이
-- `is_owner() or manages_slot` 하나였지만 여기서는 그게 셋으로 갈린다.
--
-- `_` 로 시작하는 이름 + anon revoke 로 "직접 부르면 안 되는 것" 임을 못박는다.
create or replace function public._photocard_pick(target text, cnt int, src text, subj text)
  returns jsonb
  language plpgsql security definer set search_path = public
as $$
declare
  st          public.photocard_settings;
  rec         record;
  ids         uuid[] := '{}';
  names       text[] := '{}';
  images      text[] := '{}';
  rar         int[]  := '{}';
  remain      int[]  := '{}';   -- -1 = 무제한
  ratios      numeric[] := '{}';
  caps        int[]  := '{}';
  taken       int[]  := '{}';
  n int := 0;
  i int; k int;
  weight numeric;
  r numeric;
  acc numeric;
  picked int;
  overflow boolean;
  finite_stock boolean := false;
  batch uuid := gen_random_uuid();
  results jsonb := '[]'::jsonb;
begin
  /*
   * **`for update` 의 대가가 모드마다 다르다.**
   * gift·sale 은 스태프 기기 1~2대라 직렬화가 공짜다. save 만 방문자 수백 명이 동시에 누른다.
   * 그래서 **재고가 유한한 카드가 하나라도 있을 때만** 잠근다 — 전부 무제한이면 차감이
   * 없으니 잠글 이유가 없다. 무심코 무조건 잠금으로 되돌리지 말 것.
   */
  select exists (select 1 from public.photocards where slug = target and remaining is not null)
    into finite_stock;

  if finite_stock then
    select * into st from public.photocard_settings where slug = target for update;
  else
    select * into st from public.photocard_settings where slug = target;
  end if;
  if not found then raise exception '포토카드 설정이 없어요' using errcode = 'P0001'; end if;
  if st.closed then raise exception '마감됐어요' using errcode = 'P0001'; end if;

  for rec in
    select p.id, p.name, p.image, p.rarity, p.remaining, p.batch_cap_ratio
      from public.photocards p
     where p.slug = target and (p.remaining is null or p.remaining > 0)
     order by p."order", p.created_at
  loop
    n := n + 1;
    ids[n] := rec.id; names[n] := rec.name; images[n] := rec.image;
    rar[n] := greatest(rec.rarity, 1);
    remain[n] := coalesce(rec.remaining, -1);
    ratios[n] := rec.batch_cap_ratio;
    taken[n] := 0;
  end loop;

  if n = 0 then raise exception '남은 카드가 없어요' using errcode = 'P0001'; end if;

  -- 묶음 상한 (sale 의 N연차에서 "10연차에 SSR 5장" 같은 사고를 막는다)
  for i in 1..n loop
    if st.batch_cap_enabled and ratios[i] is not null and cnt > 1 then
      caps[i] := greatest(1, ceil(cnt * ratios[i])::int);
    else
      caps[i] := cnt;
    end if;
    if remain[i] >= 0 then caps[i] := least(caps[i], remain[i]); end if;
  end loop;

  for k in 1..cnt loop
    /*
     * **가중치는 레어도다 — 남은 수량이 아니다.**
     * 재고는 위에서 후보를 거를 때만 썼고(0이면 안 담았다), 여기서는 안 본다.
     * 이 두 줄이 이 파일에서 가장 중요하다.
     */
    weight := 0;
    for i in 1..n loop
      if taken[i] < caps[i] and (remain[i] < 0 or taken[i] < remain[i]) then
        weight := weight + rar[i];
      end if;
    end loop;

    -- cap 이 남은 뽑기 수를 못 채우는 순간 — 실패를 내면 현장에서 "N장 뽑기 눌렀는데 에러" 다.
    -- cap 을 풀고 채우되 그 분은 로그에 표시한다 (0007 과 같은 판단).
    overflow := false;
    if weight = 0 then
      overflow := true;
      for i in 1..n loop
        if remain[i] < 0 or taken[i] < remain[i] then weight := weight + rar[i]; end if;
      end loop;
    end if;
    if weight = 0 then raise exception '남은 카드가 모자라요' using errcode = 'P0001'; end if;

    r := random() * weight;
    acc := 0; picked := 0;
    for i in 1..n loop
      if (overflow or taken[i] < caps[i]) and (remain[i] < 0 or taken[i] < remain[i]) then
        acc := acc + rar[i];
        if r < acc then picked := i; exit; end if;
      end if;
    end loop;
    if picked = 0 then raise exception '남은 카드가 모자라요' using errcode = 'P0001'; end if;

    taken[picked] := taken[picked] + 1;
    results := results || jsonb_build_object(
      'cardId', ids[picked], 'name', names[picked],
      'image', images[picked], 'rarity', rar[picked]
    );

    insert into public.photocard_draws(slug, card_id, card_name, rarity, subject, source, batch_id, rehearsal, cap_overflow)
    values (target, ids[picked], names[picked], rar[picked], subj, src, batch, st.rehearsal, overflow);
  end loop;

  -- 리허설이면 로그만 남기고 재고는 그대로 (그게 리허설의 정의다 — 럭드와 같다)
  if not st.rehearsal then
    for i in 1..n loop
      if taken[i] > 0 and remain[i] >= 0 then
        update public.photocards set remaining = greatest(0, remaining - taken[i]) where id = ids[i];
      end if;
    end loop;
  end if;

  return jsonb_build_object('batchId', batch, 'cards', results, 'rehearsal', st.rehearsal);
end;
$$;
revoke execute on function public._photocard_pick(text, int, text, text) from public, anon, authenticated;

-- ══ 4. save — 방문자가 자기 폰으로 ════════════════
create or replace function public.photocard_draw_self(target text, subj text)
  returns jsonb
  language plpgsql security definer set search_path = public
as $$
declare
  s public.slots;
  st public.photocard_settings;
  used int;
begin
  select * into s from public.slots where slug = target;
  if not found then raise exception '없는 이벤트예요' using errcode = 'P0001'; end if;
  if coalesce(s.service, 'tarot') <> 'photocard' then
    raise exception '이 이벤트에는 포토카드가 없어요' using errcode = 'P0001';
  end if;
  if not public.slot_open(s.period) then
    raise exception '지금은 참여할 수 없어요' using errcode = 'P0001';
  end if;

  select * into st from public.photocard_settings where slug = target;
  /*
   * **모드 검사가 여기 있어야 한다.** 화면만 갈라놓으면 gift 슬롯에 이 함수를 직접 때려서
   * 실물을 공짜로 확정할 수 있다.
   */
  if not found or st.mode <> 'save' then
    raise exception '이 이벤트는 카운터에서 뽑아요' using errcode = 'P0001';
  end if;

  perform public.rate_check(target, 'photocard', subj, 20, 500, 600);

  select count(*) into used from public.photocard_draws
   where slug = target and subject = subj and source = 'save';
  if used >= greatest(st.draws_per_visitor, 1) then
    raise exception '뽑을 수 있는 횟수를 다 쓰셨어요' using errcode = 'P0001';
  end if;

  return public._photocard_pick(target, 1, 'save', subj);
end;
$$;
revoke execute on function public.photocard_draw_self(text, text) from public;
grant execute on function public.photocard_draw_self(text, text) to anon, authenticated;

-- 남은 횟수 · 수집 현황 (방문자). **카드 목록은 안 준다** — 개수만
create or replace function public.photocard_mine(target text, subj text)
  returns jsonb
  language plpgsql security definer set search_path = public
as $$
declare
  st public.photocard_settings;
  used int;
  kinds int;
  got int;
begin
  select * into st from public.photocard_settings where slug = target;
  select count(*) into used from public.photocard_draws
   where slug = target and subject = subj and source = 'save';
  select count(*) into kinds from public.photocards where slug = target;
  select count(distinct card_id) into got from public.photocard_draws
   where slug = target and subject = subj;
  return jsonb_build_object(
    'used', used,
    'left', greatest(0, coalesce(st.draws_per_visitor, 1) - used),
    'kinds', kinds,
    'got', got
  );
end;
$$;
revoke execute on function public.photocard_mine(text, text) from public;
grant execute on function public.photocard_mine(text, text) to anon, authenticated;

-- ══ 5. gift — 뽑기권 ══════════════════════════════
--
-- 코드는 **Crockford Base32**(I·L·O·U 없음). 스태프가 손으로 입력하는 값이라 혼동 문자가
-- 곧 현장 컴플레인이다. 4자리 = 100만 조합.
create or replace function public.photocard_issue_ticket(target text, subj text)
  returns jsonb
  language plpgsql security definer set search_path = public
as $$
declare
  s public.slots;
  st public.photocard_settings;
  t public.photocard_tickets;
  chars text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  code text;
  i int;
  tries int := 0;
begin
  select * into s from public.slots where slug = target;
  if not found then raise exception '없는 이벤트예요' using errcode = 'P0001'; end if;
  if coalesce(s.service, 'tarot') <> 'photocard' then
    raise exception '이 이벤트에는 포토카드가 없어요' using errcode = 'P0001';
  end if;
  if not public.slot_open(s.period) then
    raise exception '지금은 참여할 수 없어요' using errcode = 'P0001';
  end if;

  select * into st from public.photocard_settings where slug = target;
  if not found or st.mode <> 'gift' then
    raise exception '이 이벤트는 뽑기권을 쓰지 않아요' using errcode = 'P0001';
  end if;
  if st.closed then raise exception '마감됐어요' using errcode = 'P0001'; end if;

  -- **이미 있으면 그걸 돌려준다** — 재발급이 아니라 재조회다. 화면을 닫아도 다시 볼 수 있어야 한다
  select * into t from public.photocard_tickets where slug = target and subject = subj;
  if found then
    return jsonb_build_object(
      'code', t.code, 'status', t.status,
      'cardName', t.card_name, 'cardImage', t.card_image, 'issuedAt', t.issued_at
    );
  end if;

  perform public.rate_check(target, 'photocard_ticket', subj, 5, 300, 600);

  loop
    tries := tries + 1;
    code := '';
    for i in 1..4 loop
      code := code || substr(chars, floor(random() * length(chars))::int + 1, 1);
    end loop;
    begin
      insert into public.photocard_tickets(slug, code, subject) values (target, code, subj)
      returning * into t;
      exit;
    exception when unique_violation then
      -- subject 충돌이면 동시에 두 번 눌린 것 — 이미 있는 걸 돌려준다
      select * into t from public.photocard_tickets where slug = target and subject = subj;
      if found then exit; end if;
      if tries >= 5 then raise; end if;
    end;
  end loop;

  return jsonb_build_object(
    'code', t.code, 'status', t.status,
    'cardName', t.card_name, 'cardImage', t.card_image, 'issuedAt', t.issued_at
  );
end;
$$;
revoke execute on function public.photocard_issue_ticket(text, text) from public;
grant execute on function public.photocard_issue_ticket(text, text) to anon, authenticated;

-- 내 뽑기권 상태 — **코드를 아는 사람만.** 목록 조회가 아니다
create or replace function public.photocard_ticket(target text, raw_code text)
  returns jsonb
  language plpgsql security definer set search_path = public
as $$
declare
  t public.photocard_tickets;
  norm text := upper(regexp_replace(coalesce(raw_code, ''), '[^0-9A-Za-z]', '', 'g'));
begin
  select * into t from public.photocard_tickets where slug = target and code = norm;
  if not found then return null; end if;
  return jsonb_build_object(
    'code', t.code, 'status', t.status,
    'cardName', t.card_name, 'cardImage', t.card_image, 'issuedAt', t.issued_at
  );
end;
$$;
revoke execute on function public.photocard_ticket(text, text) from public;
grant execute on function public.photocard_ticket(text, text) to anon, authenticated;

-- 스태프가 뽑기권 번호로 뽑는다 — **manages_slot 게이트**
create or replace function public.photocard_draw_ticket(target text, raw_code text)
  returns jsonb
  language plpgsql security definer set search_path = public
as $$
declare
  st public.photocard_settings;
  t public.photocard_tickets;
  norm text := upper(regexp_replace(coalesce(raw_code, ''), '[^0-9A-Za-z]', '', 'g'));
  res jsonb;
  card jsonb;
begin
  if not (public.is_owner() or public.manages_slot(target)) then
    raise exception '권한이 없어요' using errcode = '42501';
  end if;

  select * into st from public.photocard_settings where slug = target;
  if not found or st.mode <> 'gift' then
    raise exception '이 이벤트는 뽑기권을 쓰지 않아요' using errcode = 'P0001';
  end if;

  -- **한 번만 소각된다.** for update 로 같은 번호를 동시에 두 번 넣는 걸 줄 세운다
  select * into t from public.photocard_tickets
   where slug = target and code = norm for update;
  if not found then raise exception '없는 번호예요' using errcode = 'P0001'; end if;
  if t.status = 'drawn' then
    raise exception '이미 뽑은 번호예요' using errcode = 'P0001';
  end if;

  res := public._photocard_pick(target, 1, 'gift', t.subject);
  card := res -> 'cards' -> 0;

  update public.photocard_tickets
     set status = 'drawn', card_id = (card ->> 'cardId')::uuid,
         card_name = card ->> 'name', card_image = card ->> 'image',
         drawn_at = now(), drawn_by = auth.uid()
   where id = t.id;

  return jsonb_build_object('code', t.code, 'status', 'drawn', 'card', card);
end;
$$;
revoke execute on function public.photocard_draw_ticket(text, text) from public, anon;
grant execute on function public.photocard_draw_ticket(text, text) to authenticated, service_role;

-- ══ 6. sale — 스태프 N연차 ════════════════════════
create or replace function public.photocard_draw_batch(target text, cnt int)
  returns jsonb
  language plpgsql security definer set search_path = public
as $$
declare
  st public.photocard_settings;
begin
  if not (public.is_owner() or public.manages_slot(target)) then
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
revoke execute on function public.photocard_draw_batch(text, int) from public, anon;
grant execute on function public.photocard_draw_batch(text, int) to authenticated, service_role;

-- ══ 7. 슬롯 설정 ══════════════════════════════════
alter table public.slots add column if not exists photocard jsonb not null default '{}'::jsonb;

-- ══ 8. 유예 ═══════════════════════════════════════
-- 뽑기 로그·뽑기권을 행사 뒤에도 봐야 한다 (재고 정산·컴플레인 확인) — 럭드와 같은 14일
create or replace function public.slot_grace_days(service text)
  returns int language sql immutable
as $$
  select case when service in ('luckydraw','quiz','photocard','poll','stamp') then 14 else 0 end;
$$;
