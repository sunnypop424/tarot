-- 럭키드로우 — 두 번째 서비스 (docs/LUCKYDRAW-REVIEW.md)
--
-- 옮겨오는 원본(Firebase)은 **추첨 로직이 통째로 클라이언트에 있었다.** Firestore 트랜잭션
-- 안에서 재고를 읽고 뽑고 깎았다 — 관리자 토큰만 있으면 remaining 을 마음대로 쓸 수 있는 구조다.
-- 게다가 supabase-js 에는 클라이언트 트랜잭션이 아예 없다. 그래서 **추첨은 RPC 한 발**이다.
--
-- 지켜야 하는 불변식 하나: **관리자가 "남은 수량" 칸에 적은 수 = 지금 뽑을 수 있는 수.**
-- 현장 운영이 이 위에 서 있다 (전날 밤에 내일 나갈 수량을 적어 두고, 당일엔 그만큼 뽑는다).
-- 아래 모든 설계가 이 한 줄을 안 깨는 쪽으로 정해졌다 — 특히 §5 의 cap 해제.

-- ══ 1. 상품 ═══════════════════════════════════════
--
-- **`remaining` 이 단일 진실이다.** 원본에는 quantity(전체)·remaining(남은)·consumed(소진)가
-- 나란히 있었는데, quantity 를 고치면 remaining 이 그 값으로 덮이는 구조라 '전체' 라는 이름이
-- 매일 재입력하는 순간 거짓이 됐다. 이름과 동작을 일치시킨다 — 칸은 하나고, 적은 값이 곧 재고다.
--
-- 소진 수량은 **컬럼으로 두지 않는다** — draw_logs 에서 센다 (§3). 카운터를 따로 들면
-- 재고 직접 입력과 어긋나는 순간이 오고(관리자가 40 → 90 으로 채워 넣으면 누적 소진은 그대로여야
-- 한다), '오늘' 카운터는 자정마다 누가 0 으로 돌려야 하는 문제까지 생긴다.
create table public.prizes (
  id uuid primary key default gen_random_uuid(),
  slug text not null references public.slots(slug) on update cascade on delete cascade,
  -- 표의 행 순서 = 등수. 1등이 위
  rank int not null,
  name text not null default '',
  -- 지금 뽑을 수 있는 수량. 음수 재고는 없다
  remaining int not null default 0 check (remaining >= 0),
  -- 당첨되면 배송지를 받아야 하는 상품인가
  requires_shipping boolean not null default false,
  /*
   * 다중 뽑기에서 이 상품이 한 묶음에 나올 수 있는 최대 비율 (§5).
   * null = 이 상품은 제한 없음. 0 은 막는다 — "영영 안 나오는 상품"은 재고 0 으로 표현할 일이지
   * 비율로 표현할 일이 아니고, 실수로 0 을 넣으면 왜 안 나오는지 아무도 못 찾는다.
   */
  batch_cap_ratio numeric check (batch_cap_ratio is null or (batch_cap_ratio > 0 and batch_cap_ratio <= 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index prizes_slug_idx on public.prizes (slug, rank);

-- ══ 2. 운영 설정 ══════════════════════════════════
--
-- **slots.theme·event 에 넣지 않는다.** 저건 최고관리자 것이고(RLS: owner 만 쓴다),
-- 여기 있는 값은 **주최자가 행사 중에 바꾸는** 것들이다. 한 테이블에 두면 둘 중 하나가
-- 잘못된 권한을 갖는다 — 주최자에게 slots 쓰기를 주면 그 순간 테마도 열린다.
create table public.luckydraw_settings (
  slug text primary key references public.slots(slug) on update cascade on delete cascade,
  -- 당첨 결과에 무엇을 보여줄까: 'rank' | 'prize' | 'both'
  display_mode text not null default 'both' check (display_mode in ('rank', 'prize', 'both')),
  -- 설정 잠금 — 스태프 오입력 방지 (추첨은 계속 된다)
  locked boolean not null default false,
  -- 행사 마감 — 추첨이 막힌다. 화면이 아니라 아래 RPC 가 막는다
  closed boolean not null default false,
  /*
   * 리허설 모드 — 뽑아도 재고가 안 깎인다. **기본값이 true 인 게 중요하다.**
   * 전날 시연에서 실수로 재고를 태우는 사고가, 실운영인 줄 알고 리허설로 도는 사고보다 훨씬 비싸다
   * (후자는 화면 곳곳의 노란 배너가 계속 알려준다).
   */
  rehearsal boolean not null default true,
  -- 다중 뽑기 출현 제한 마스터 스위치 (§5). 기본 off — 원하는 주최자만 켠다
  batch_cap_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

-- ══ 3. 추첨 로그 ══════════════════════════════════
--
-- 마감 리포트("오늘 뭐가 몇 개 나갔나")·분쟁 확인·이월 계산이 전부 여기서 나온다.
-- 상품명을 **스냅샷으로 박아 둔다** — 상품이 지워지거나 이름이 바뀌어도 지난 리포트는
-- 그때 그대로여야 한다. prize_id 는 지워지면 null 이 되게 두고(로그는 남는다), 이름으로 읽는다.
create table public.draw_logs (
  id bigserial primary key,
  slug text not null references public.slots(slug) on update cascade on delete cascade,
  prize_id uuid references public.prizes(id) on delete set null,
  prize_name text not null,
  rank int not null,
  -- 한 번의 뽑기(5개 뽑기 = 5행)를 묶는다
  batch_id uuid not null,
  -- 리허설분은 리포트에서 빼야 한다 — 재고를 안 깎았으므로 소진이 아니다
  rehearsal boolean not null default false,
  -- cap 이 모자라 제한을 풀고 채운 분 (§5 의 B). 관리자만 본다
  cap_overflow boolean not null default false,
  created_at timestamptz not null default now()
);

create index draw_logs_slug_idx on public.draw_logs (slug, created_at desc);

-- ══ 4. 배송 정보 ══════════════════════════════════
--
-- **PII 다.** 원본은 Firestore 에 그냥 넣고 "배송 끝나면 지우세요" 를 화면 문구로 부탁했다.
-- 여기서는 정책으로 막는다: 방문자는 **넣을 수만** 있고(자기가 넣은 것도 못 읽는다),
-- 읽고 지우는 건 그 슬롯 주최자뿐이다.
create table public.shipping_entries (
  id uuid primary key default gen_random_uuid(),
  slug text not null references public.slots(slug) on update cascade on delete cascade,
  name text not null,
  phone text not null,
  address text not null,
  -- [{rank, name, count}] — 당첨 시점 스냅샷
  prizes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index shipping_entries_slug_idx on public.shipping_entries (slug, created_at desc);

-- ══ 5. 추첨 ═══════════════════════════════════════
--
-- 이 함수 하나가 원본의 클라이언트 트랜잭션을 전부 대신한다.
--
-- **security definer 라 RLS 를 지나간다** → 권한을 여기서 직접 막지 않으면 anon 키로 그냥 뽑힌다.
-- (AI 쪽에서 실제로 뚫렸던 자리다 — 0003 §4 참고.)
--
-- 동시성: 같은 슬롯의 추첨은 settings 행 잠금으로 **직렬화**한다. 부스 태블릿 한두 대라
-- 정교한 행별 잠금이 필요 없고, 직렬화가 "두 기기가 마지막 한 개를 동시에 뽑는" 사고를 없앤다.
--
-- 뽑는 방식: 원본은 남은 수량만큼 티켓을 배열에 깔고 균등 추출했다. 여기서는 **가중 추출**로
-- 같은 분포를 만든다 (재고 비례). 수천 개짜리 배열을 만들지 않아도 결과가 동일하다.
create or replace function public.draw_prizes(target text, draw_count int)
  returns jsonb language plpgsql security definer
  set search_path = public
as $$
declare
  st          record;
  rec         record;
  ids         uuid[] := '{}';
  names       text[] := '{}';
  ranks       int[]  := '{}';
  ships       boolean[] := '{}';
  remain      int[]  := '{}';
  ratios      numeric[] := '{}';
  caps        int[]  := '{}';
  taken       int[]  := '{}';
  n           int := 0;
  i           int;
  k           int;
  total       int := 0;
  weight      int;
  r           int;
  acc         int;
  picked      int;
  overflow    boolean;
  batch       uuid := gen_random_uuid();
  results     jsonb := '[]'::jsonb;
begin
  -- ── 권한 ──
  if not (public.is_owner() or public.manages_slot(target)) then
    raise exception '이 슬롯의 추첨 권한이 없어요';
  end if;

  if draw_count is null or draw_count < 1 or draw_count > 100 then
    raise exception '뽑기 수가 올바르지 않아요';
  end if;

  -- 기간이 끝난 슬롯은 아무것도 못 한다 (최고관리자는 예외 — 사고 수습·점검)
  if not exists (
    select 1 from public.slots s
    where s.slug = target and (public.is_owner() or public.slot_open(s.period))
  ) then
    raise exception '지금은 열려 있지 않은 슬롯이에요';
  end if;

  -- ── 잠금 + 마감 검사 ──
  -- for update 가 이 슬롯의 다른 추첨을 여기서 줄 세운다
  select * into st from public.luckydraw_settings where slug = target for update;
  if not found then
    raise exception '럭키드로우 설정이 없어요';
  end if;
  if st.closed then
    raise exception '럭키드로우가 마감되었습니다';
  end if;

  -- ── 재고 적재 ──
  for rec in
    select p.id, p.rank, p.name, p.remaining, p.requires_shipping, p.batch_cap_ratio
    from public.prizes p where p.slug = target order by p.rank
  loop
    n := n + 1;
    ids[n] := rec.id;
    ranks[n] := rec.rank;
    names[n] := rec.name;
    remain[n] := rec.remaining;
    ships[n] := rec.requires_shipping;
    ratios[n] := rec.batch_cap_ratio;
    taken[n] := 0;
    total := total + rec.remaining;
  end loop;

  -- **불변식:** 남은 수량 합계만큼은 언제나 뽑힌다
  if total < draw_count then
    raise exception '남은 상품 수량보다 더 많이 뽑을 수 없습니다';
  end if;

  -- ── 묶음 상한 ──
  -- 스위치가 꺼져 있으면 cap = 재고 = 제한 없음. 켠 슬롯만 계산이 달라진다
  for i in 1..n loop
    if st.batch_cap_enabled and ratios[i] is not null then
      caps[i] := least(remain[i], ceil(draw_count * ratios[i])::int);
    else
      caps[i] := remain[i];
    end if;
  end loop;

  -- ── 뽑기 ──
  for k in 1..draw_count loop
    -- cap 에 안 걸린 상품들의 잔여 가중치
    weight := 0;
    for i in 1..n loop
      if taken[i] < caps[i] then weight := weight + (remain[i] - taken[i]); end if;
    end loop;

    /*
     * cap 합계가 남은 뽑기 수보다 모자란 순간이 온다 (행사 말미, 저순위만 잔뜩 남았을 때).
     * 여기서 실패를 내면 "10개 뽑기 눌렀는데 에러" 가 현장에서 터진다 — 그건 최악이고,
     * 무엇보다 맨 위의 불변식을 cap 이 깨는 셈이 된다.
     * → **cap 을 풀고 채운다.** 대신 그 분은 로그에 표시해 관리자가 나중에 알 수 있게 한다.
     */
    overflow := false;
    if weight = 0 then
      overflow := true;
      for i in 1..n loop weight := weight + (remain[i] - taken[i]); end loop;
    end if;

    r := floor(random() * weight)::int;
    acc := 0;
    picked := 0;
    for i in 1..n loop
      if overflow or taken[i] < caps[i] then
        acc := acc + (remain[i] - taken[i]);
        if r < acc then picked := i; exit; end if;
      end if;
    end loop;

    taken[picked] := taken[picked] + 1;

    results := results || jsonb_build_object(
      'prizeId', ids[picked],
      'rank', ranks[picked],
      'name', names[picked],
      'requiresShipping', ships[picked]
    );

    insert into public.draw_logs (slug, prize_id, prize_name, rank, batch_id, rehearsal, cap_overflow)
    values (target, ids[picked], names[picked], ranks[picked], batch, st.rehearsal, overflow);
  end loop;

  -- ── 재고 반영 ──
  -- 리허설이면 로그만 남기고 재고는 그대로 둔다 (그게 리허설의 정의다)
  if not st.rehearsal then
    for i in 1..n loop
      if taken[i] > 0 then
        update public.prizes
          set remaining = remaining - taken[i], updated_at = now()
          where id = ids[i];
      end if;
    end loop;
  end if;

  -- 화면이 곧바로 재고를 다시 그릴 수 있게 같이 돌려준다 (왕복 한 번 아낀다)
  return jsonb_build_object(
    'batchId', batch,
    'rehearsal', st.rehearsal,
    'results', results,
    'prizes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'rank', p.rank, 'name', p.name,
        'remaining', p.remaining, 'requiresShipping', p.requires_shipping
      ) order by p.rank)
      from public.prizes p where p.slug = target
    ), '[]'::jsonb)
  );
end;
$$;

-- ══ 6. 마감 리포트 ════════════════════════════════
--
-- 운영 2단계("오늘 안 나간 잔여 확인")를 화면이 대신해 준다.
-- 관리자는 이 잔여에 내일 물량을 더해 "남은 수량" 칸에 적는다 — **덧셈은 사람이 한다.**
-- (+내일 수량만 입력하는 증분 방식은 현장에서 헷갈린다는 이유로 기각됐다.)
--
-- '오늘' 은 KST 기준이다. UTC 로 세면 한국 자정~오전 9시에 어제 것이 섞인다 (0005 의 today_kst).
create or replace function public.luckydraw_report(target text)
  returns jsonb language plpgsql security definer
  set search_path = public
as $$
begin
  if not (public.is_owner() or public.manages_slot(target)) then
    raise exception '이 슬롯의 조회 권한이 없어요';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id,
      'rank', p.rank,
      'name', p.name,
      'remaining', p.remaining,
      'requiresShipping', p.requires_shipping,
      'batchCapRatio', p.batch_cap_ratio,
      -- 리허설분은 재고를 안 깎았으므로 소진이 아니다
      'consumedToday', (
        select count(*) from public.draw_logs d
        where d.prize_id = p.id and not d.rehearsal
          and (d.created_at at time zone 'Asia/Seoul')::date = public.today_kst()
      ),
      'consumedTotal', (
        select count(*) from public.draw_logs d
        where d.prize_id = p.id and not d.rehearsal
      )
    ) order by p.rank)
    from public.prizes p where p.slug = target
  ), '[]'::jsonb);
end;
$$;

-- ══ 7. RLS ════════════════════════════════════════
alter table public.prizes enable row level security;
alter table public.luckydraw_settings enable row level security;
alter table public.draw_logs enable row level security;
alter table public.shipping_entries enable row level security;

-- ── 상품 · 설정: 방문자는 읽는다 ──
-- 화면이 "N개 남았습니다" 배지와 마감·리허설 배너를 그리려면 읽어야 한다.
-- 상품명은 비밀이 아니다 — 행사장에 붙어 있는 정보다.
-- 다만 **기간이 열린 슬롯만** (0005 의 슬롯 정책과 같은 기준으로 맞춘다).
create policy "anyone reads prizes of open slots"
  on public.prizes for select
  using (exists (
    select 1 from public.slots s
    where s.slug = prizes.slug and (public.is_owner() or public.slot_open(s.period))
  ));

create policy "anyone reads settings of open slots"
  on public.luckydraw_settings for select
  using (exists (
    select 1 from public.slots s
    where s.slug = luckydraw_settings.slug and (public.is_owner() or public.slot_open(s.period))
  ));

-- 쓰기는 주최자·최고관리자만. using 과 with check 를 둘 다 건다 —
-- using 만 걸면 남의 슬롯으로 slug 를 바꿔 넣을 수 있다 (0001 의 questions 와 같은 이유).
create policy "organizer manages own prizes"
  on public.prizes for all
  using (public.manages_slot(slug)) with check (public.manages_slot(slug));
create policy "owner manages all prizes"
  on public.prizes for all
  using (public.is_owner()) with check (public.is_owner());

create policy "organizer manages own settings"
  on public.luckydraw_settings for all
  using (public.manages_slot(slug)) with check (public.manages_slot(slug));
create policy "owner manages all settings"
  on public.luckydraw_settings for all
  using (public.is_owner()) with check (public.is_owner());

-- ── 로그: 관리자만 ──
-- 방문자에게 열면 "방금 1등이 나갔다"가 보인다. 쓰기 정책은 없다 —
-- 로그는 draw_prizes(security definer)만 남긴다. 손으로 못 쓴다는 뜻이다.
create policy "organizer reads own draw logs"
  on public.draw_logs for select using (public.manages_slot(slug));
create policy "owner reads all draw logs"
  on public.draw_logs for select using (public.is_owner());

-- ── 배송: 넣기는 아무나, 읽기는 주최자만 ──
-- **select 정책을 방문자에게 주지 않는 게 핵심이다.** 넣은 본인도 다시 못 읽는다 —
-- 읽을 수 있으면 그 슬롯 당첨자 전원의 이름·연락처·주소가 anon 키로 긁힌다.
create policy "visitor submits shipping"
  on public.shipping_entries for insert
  with check (exists (
    select 1 from public.slots s
    where s.slug = shipping_entries.slug and public.slot_open(s.period)
  ));

create policy "organizer reads own shipping"
  on public.shipping_entries for select using (public.manages_slot(slug));
create policy "organizer deletes own shipping"
  on public.shipping_entries for delete using (public.manages_slot(slug));
create policy "owner manages all shipping"
  on public.shipping_entries for all
  using (public.is_owner()) with check (public.is_owner());

-- ══ 8. 함수 권한 ══════════════════════════════════
--
-- **`from anon, authenticated` 로 뺏으면 안 뺏긴다.** create function 은 EXECUTE 를 PUBLIC 에게
-- 주고 두 롤은 PUBLIC 을 통해 상속받는다 — PUBLIC 에서 뺏고 필요한 롤에만 도로 준다 (0003 §4).
--
-- 여기서는 0003 과 달리 **authenticated 에게 준다**: 부르는 주체가 Edge Function 이 아니라
-- 로그인한 주최자의 브라우저다. 그래서 함수 안 첫 줄이 권한 검사인 것이고,
-- anon 에게는 주지 않는다 (비로그인 상태에선 DRAW 자체가 없다).
revoke execute on function public.draw_prizes(text, int) from public;
revoke execute on function public.luckydraw_report(text) from public;

grant execute on function public.draw_prizes(text, int) to authenticated, service_role;
grant execute on function public.luckydraw_report(text) to authenticated, service_role;

-- ══ 9. updated_at ═════════════════════════════════
create trigger prizes_touch before update on public.prizes
  for each row execute function public.touch_updated_at();
create trigger luckydraw_settings_touch before update on public.luckydraw_settings
  for each row execute function public.touch_updated_at();
