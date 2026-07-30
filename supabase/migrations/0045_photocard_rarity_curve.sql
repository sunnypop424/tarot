-- 포토카드 레어도를 **뒤집는다** — 숫자가 클수록 **덜** 나온다.
--
-- 0026 은 `weight = rarity` 였다. 그런데 화면은 5 를 '전설' 이라 부른다 —
-- **가장 귀한 카드가 가장 자주 나오고 있었다.** 뽑기에서 이건 거의 항상 주최자가 의도한
-- 반대인데, 확률표를 화면에 붙이기 전까지는 아무도 볼 수 없었다(그 표는 이번에 붙였다).
--
-- 0026 이 "이 두 줄이 이 파일에서 가장 중요하다" 고 적어 둔 자리가 여기다. 그 문단은
-- **여전히 맞다** — 재고가 아니라 레어도가 가중치다. 바뀌는 건 **방향**뿐이다.
--
-- ── 곡선을 주최자가 고른다 ─────────────────────────
--
--   완만(gentle)  가중치 = 6 − 레어도      → 5·4·3·2·1   (전설이 기본보다 5배 귀함)
--   가파름(steep) 가중치 = 2^(5 − 레어도)  → 16·8·4·2·1  (16배 귀함)
--
-- 왜 고르게 하나: 100명이 드는 행사에서 가파름을 쓰면 전설이 서너 장밖에 안 나와 민원이 되고,
-- 1,000명 행사에서 완만을 쓰면 "전설이 흔하다" 가 된다. 규모를 아는 사람은 주최자다.
-- 기본은 **완만** — 덜 극단적인 쪽이 안전하고, 확률표가 주최자 화면에 있어 바로 확인된다.
--
-- ── 기존 슬롯의 데이터는 안 건드린다 ───────────────
--
-- 레어도 값을 재배치하지 않는다. 주최자가 '전설=5' 로 적어 둔 건 **귀하다는 뜻**이었고,
-- 이제 그 뜻대로 동작한다. 값을 옮기면 오히려 의도를 두 번 추측하는 셈이다.
-- (오늘 붙인 "희귀한 카드일수록 자주 나온다" 경고를 보고 거꾸로 맞춰 둔 슬롯이 있을 수는
--  있는데, 그 경고는 오늘 배포 전에만 있었으므로 실제로는 없다.)

alter table public.photocard_settings
  add column if not exists rarity_curve text not null default 'gentle'
    check (rarity_curve in ('gentle', 'steep'));

-- ══ 가중치 한 곳 ══════════════════════════════════
--
-- **함수로 뺀다.** 뽑기 안에 산식을 두 번 적으면(후보 고를 때·누적 더할 때) 한쪽만 고치는
-- 날이 온다 — 그리고 그 증상은 "확률이 좀 이상한데" 라서 아무도 못 찾는다. 화면(`photocardOdds`)도
-- 같은 산식을 쓰므로, 여기를 고치면 저기도 같이 고쳐야 한다는 걸 이름이 상기시킨다.
create or replace function public.photocard_weight(rarity int, curve text)
  returns numeric language sql immutable
as $$
  select case when curve = 'steep'
    -- 2^(5-r) — r 이 1이면 16, 5면 1
    then power(2, 5 - greatest(least(coalesce(rarity, 1), 5), 1))::numeric
    -- 6-r — r 이 1이면 5, 5면 1
    else (6 - greatest(least(coalesce(rarity, 1), 5), 1))::numeric
  end;
$$;

grant execute on function public.photocard_weight(int, text) to anon, authenticated;

-- ══ 뽑기 ══════════════════════════════════════════
--
-- 0026 §4 의 `_photocard_pick` 을 그대로 두고 **가중치 두 줄만** 바꾼다.
-- 나머지(재고 필터·묶음 상한·overflow 처리·로그)는 손대지 않는다.
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
  wgt         numeric[] := '{}';   -- 레어도에서 곡선으로 뽑은 가중치
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
    -- **여기가 뒤집힌 자리다** — 레어도가 클수록 가중치가 작다
    wgt[n] := public.photocard_weight(rec.rarity, st.rarity_curve);
    remain[n] := coalesce(rec.remaining, -1);
    ratios[n] := rec.batch_cap_ratio;
    taken[n] := 0;
  end loop;

  if n = 0 then raise exception '남은 카드가 없어요' using errcode = 'P0001'; end if;

  for i in 1..n loop
    if st.batch_cap_enabled and ratios[i] is not null and cnt > 1 then
      caps[i] := greatest(1, ceil(cnt * ratios[i])::int);
    else
      caps[i] := cnt;
    end if;
    if remain[i] >= 0 then caps[i] := least(caps[i], remain[i]); end if;
  end loop;

  for k in 1..cnt loop
    weight := 0;
    for i in 1..n loop
      if taken[i] < caps[i] and (remain[i] < 0 or taken[i] < remain[i]) then
        weight := weight + wgt[i];
      end if;
    end loop;

    overflow := false;
    if weight = 0 then
      overflow := true;
      for i in 1..n loop
        if remain[i] < 0 or taken[i] < remain[i] then weight := weight + wgt[i]; end if;
      end loop;
    end if;
    if weight = 0 then raise exception '남은 카드가 모자라요' using errcode = 'P0001'; end if;

    r := random() * weight;
    acc := 0; picked := 0;
    for i in 1..n loop
      if (overflow or taken[i] < caps[i]) and (remain[i] < 0 or taken[i] < remain[i]) then
        acc := acc + wgt[i];
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

-- 0026 §4 와 **같은 revoke** — `create or replace` 는 권한을 안 지우지만 그 사실에 기대지 않는다.
-- 부르는 건 wrapper 셋(`photocard_draw_self`·`_ticket`·`_batch`)뿐이고 그것들이 security definer 다.
revoke execute on function public._photocard_pick(text, int, text, text) from public, anon, authenticated;
