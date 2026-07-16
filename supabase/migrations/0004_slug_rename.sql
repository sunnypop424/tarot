-- 슬러그를 바꾸면 그 슬롯의 질문이 통째로 사라졌다.
--
-- 편집기는 슬러그를 바꿔 저장할 때 **새 행을 넣고 옛 행을 지웠다** (SlotEditor 의 handleSave).
-- 그런데 questions.slug 가 slots(slug) 를 `on delete cascade` 로 참조하므로,
-- 옛 행이 지워지는 순간 그 슬롯의 질문·답변이 **전부 같이 지워진다.**
-- 주최자가 78장씩 검수해 채운 답변이 슬러그 오타 한 번 고치다 날아간다는 뜻이다.
--
-- 고치는 방향: 지우고 다시 만드는 대신 **slug 를 update 한다** (repo.slots.save 의 prevSlug).
-- 그러려면 FK 가 update 를 따라와야 한다 — `on update cascade` 가 그 일을 한다.
-- 이건 한 문장이라 원자적이다: 옛 행이 잠깐이라도 사라지는 순간이 없으므로
-- 그 사이에 cascade 가 끼어들 자리도 없다.
--
-- **on delete cascade 는 그대로 둔다.** 슬롯을 정말 지울 땐 질문도 같이 지워지는 게 맞다
-- (이벤트가 끝나 슬롯을 내리는 자리). 지금 문제는 "지운다" 가 아니라 "이름을 바꾼다" 였다.

-- 기존 제약을 떼고 on update cascade 를 더해 다시 건다.
-- drop 과 add 를 같은 alter 문에 넣는다 — 나뉘면 그 사이에 참조 무결성이 잠시 풀린다.

alter table public.questions
  drop constraint questions_slug_fkey,
  add constraint questions_slug_fkey foreign key (slug)
    references public.slots(slug) on update cascade on delete cascade;

alter table public.slot_admins
  drop constraint slot_admins_slug_fkey,
  add constraint slot_admins_slug_fkey foreign key (slug)
    references public.slots(slug) on update cascade on delete cascade;

alter table public.ai_usage
  drop constraint ai_usage_slug_fkey,
  add constraint ai_usage_slug_fkey foreign key (slug)
    references public.slots(slug) on update cascade on delete cascade;

alter table public.reading_cache
  drop constraint reading_cache_slug_fkey,
  add constraint reading_cache_slug_fkey foreign key (slug)
    references public.slots(slug) on update cascade on delete cascade;

-- reading_cache.key 안에도 슬러그가 박혀 있지만(키가 JSON 배열의 첫 원소다) 손대지 않는다.
-- 그건 캐시라 안 맞으면 한 번 더 만들 뿐이고, 그 비용은 리딩 한 번(5원)이다.
