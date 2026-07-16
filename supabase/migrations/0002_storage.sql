-- 슬롯 이미지 버킷 — 로고 · 배경 · 카드 앞/뒷면 · 수정구슬
--
-- 경로 규칙은 개발 서버 어댑터와 같다: {slug}/logo.png, {slug}/cards/major-0.webp
-- (docs/BACKEND.md §1-4). 그래야 cardFrontSrc 의 규칙이 저장소와 무관하게 성립한다.
--
-- 공개 읽기인 이유: 방문자는 로그인하지 않는다. 카페에서 QR 을 찍고 바로 카드를 본다 —
-- 이미지에 인증을 걸면 그 화면이 성립하지 않는다. 대신 **쓰기는 최고관리자만** 한다.
-- 주최자도 못 올린다: 이미지는 슬롯 테마의 일부고, 테마는 최고관리자 몫이다
-- (역할 분리 — CLAUDE.md).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'slots',
  'slots',
  true,
  5 * 1024 * 1024, -- 5MB — 카드 한 장이 이보다 크면 카페 모바일에서 안 뜬다
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 정책은 storage.objects 에 건다 (버킷이 public 이어도 쓰기는 정책이 정한다).
-- 이름을 고정해 다시 돌려도 같은 상태가 되게 한다.
drop policy if exists "slots read" on storage.objects;
drop policy if exists "slots insert" on storage.objects;
drop policy if exists "slots update" on storage.objects;
drop policy if exists "slots delete" on storage.objects;

-- 방문자(anon 포함) 는 읽기만
create policy "slots read" on storage.objects
  for select using (bucket_id = 'slots');

-- 쓰기 3종은 최고관리자만 — is_owner() 는 0001 에서 만든 security definer 헬퍼
create policy "slots insert" on storage.objects
  for insert with check (bucket_id = 'slots' and public.is_owner());

create policy "slots update" on storage.objects
  for update using (bucket_id = 'slots' and public.is_owner())
  with check (bucket_id = 'slots' and public.is_owner());

create policy "slots delete" on storage.objects
  for delete using (bucket_id = 'slots' and public.is_owner());
