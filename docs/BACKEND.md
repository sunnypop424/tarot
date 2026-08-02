# 백엔드 · 배포 준비 — 어디서 뭘 해야 하나

정한 스택: **Vercel**(배포) · **Supabase**(DB · 인증 · 이미지 · 서버 함수) · **Claude API**(AI).
**Cloudflare 는 안 쓴다** — Supabase Edge Functions 가 같은 일(키 숨기고 Claude 부르기)을 하는데 벤더를 하나 더 늘리고 그 사이 인증까지 직접 이어야 했다.

## 지금 어디까지 됐나

**다 나갔다.** https://tarot-btjp.vercel.app — 슬러그로 직접 들어오면 열리고, AI 도 배포에서 돈다.

`node scripts/verify-prod.mjs <주소> <스크린샷>` 이 배포된 주소를 실제로 때려 확인한다 (리딩 1회 ≈5원).

| 기능 | 상태 |
|---|---|
| 슬롯 (생성·테마·플랜) | ✅ **DB** — 저장이 곧 배포. 다른 브라우저에서 열리는 걸 `verify-owner` 가 확인한다 |
| 주최자 답변이 방문자에게 감 | ✅ **DB + RLS** (`verify-supabase` 29종) |
| 로그인 (최고관리자 · 주최자) | ✅ **Supabase 인증** — 역할은 `owners`/`slot_admins` 가 정한다 |
| 주최자 계정 발급 (편집기에서 자동) | ✅ **Edge Function `admin`** — 생성·매핑·비번재발급·삭제를 최고관리자가 편집기에서 (§5) |
| 슬롯 기간 (테스트·대여) | ✅ **DB + RLS** — 대여가 끝나면 최고관리자 말고는 슬롯을 못 읽는다 (`slot_open`, 0005) |
| 슬롯 이미지 | ✅ **Storage** (버킷 `slots`, 쓰기는 최고관리자만) |
| 슬롯 편집기 | ✅ **배포됨** (Supabase 설정된 빌드에만 — §2-3) |
| 3장 리딩 AI 종합 | ✅ **Edge Function** (`supabase/functions/ai`) — 개발도 같은 함수를 쓴다 |
| 질문 × 카드 답변 AI 생성 → 검수 → 저장 | ✅ 위와 같음 · 그 슬롯 주최자만 부를 수 있다 |

| 남은 것 | 메모 |
|---|---|
| 익명 로그인 (선택) | 안 켜도 함수가 IP 로 레이트리밋을 센다. 켜면 세션 단위로 더 촘촘해진다 (§4-4) |
| 커스텀 도메인 | 붙이면 `AI_ALLOWED_ORIGINS` 에 **그 도메인도** 넣어야 한다 |
| 사용량을 보는 화면 | `ai_usage` 는 RLS 로 아무도 못 읽는다(service_role 만). 정산·모니터링이 필요해지면 최고관리자 정책을 연다 |

**경계 덕을 봤다.** 화면은 `src/lib/repo/types.ts` 인터페이스만 알고, 어댑터가 뭔지는 `repo/index.ts` 한 줄만 안다. 이미지도 같은 구조다 (`owner/upload/index.ts`). 여기까지 온 작업의 대부분은 그 어댑터를 새로 쓴 일이다.

## 역할 분담

| 서비스 | 맡는 것 |
|---|---|
| **Vercel** | 정적 앱 배포, 슬러그 라우팅(`/starlit-rian`), 도메인 |
| **Supabase** | 슬롯 · 질문 · 답변 DB, 최고관리자/주최자 인증, 슬롯 이미지 저장, **Edge Function 이 Claude 호출** |
| **Claude API** | 3장 리딩 종합, 질문×카드 답변 일괄 생성 (`claude-haiku-4-5`) |

---

## 1. Supabase — DB · 인증 · 이미지

가장 먼저. 나머지가 전부 여기에 매달린다.

### 1-1. 프로젝트 · 테이블

프로젝트를 만들고(리전은 서울 `ap-northeast-2` — 카페에서 폰으로 붙는다) SQL 에디터에서 테이블을 만든다. **슬롯 격리가 전부**라 모든 테이블이 `slug` 를 갖는다.

```sql
-- 슬롯: 지금 slots.json 이 하는 일. 최고관리자만 쓴다.
create table slots (
  slug        text primary key,
  name        text not null,
  service     text not null default 'tarot',
  deck        text not null default 'full',
  theme       jsonb not null,   -- src/types/theme.ts 그대로
  event       jsonb not null default '{}',
  created_at  timestamptz default now()
);

-- 질문: 주최자가 자기 슬롯 것만 만진다.
create table questions (
  id        text primary key,
  slug      text not null references slots(slug) on delete cascade,
  data      jsonb not null,   -- src/types/question.ts 그대로 (answers 포함)
  published boolean not null default false
);

-- 주최자 계정 ↔ 슬롯 매핑. auth.users 는 Supabase 가 관리한다.
create table slot_admins (
  user_id uuid references auth.users(id) on delete cascade,
  slug    text references slots(slug) on delete cascade,
  primary key (user_id, slug)
);

-- 최고관리자.
create table owners (
  user_id uuid primary key references auth.users(id) on delete cascade
);
```

### 1-2. RLS — 격리를 DB 가 강제하게

**이게 이 작업의 핵심이다.** 지금은 "리안 관리자가 하온 슬롯을 못 건드린다"를 프론트가 지킨다(`useAdminAuth` 의 slug 비교). 프론트는 얼마든지 우회된다 — RLS 를 켜야 진짜가 된다.

```sql
alter table slots enable row level security;
alter table questions enable row level security;

-- 방문자: 공개된 질문만 읽는다 (익명 키로)
create policy "public reads published questions"
  on questions for select using (published = true);

-- 방문자: 슬롯 테마는 읽어야 앱이 뜬다
create policy "public reads slots" on slots for select using (true);

-- 주최자: 자기 슬롯 질문만 읽고 쓴다
create policy "organizer manages own slot questions" on questions for all
  using  (exists (select 1 from slot_admins a where a.user_id = auth.uid() and a.slug = questions.slug))
  with check (exists (select 1 from slot_admins a where a.user_id = auth.uid() and a.slug = questions.slug));

-- 최고관리자: 슬롯을 만들고 지운다
create policy "owner manages slots" on slots for all
  using  (exists (select 1 from owners o where o.user_id = auth.uid()))
  with check (exists (select 1 from owners o where o.user_id = auth.uid()));
```

주최자에게 `slots` 쓰기 정책을 **주지 않는다** — 주최자는 테마를 못 건드린다는 역할 분리가 여기서 못 박힌다.

### 1-3. 인증

- Authentication → 이메일/비밀번호 켜기. 자동 가입은 **끈다** (슬롯은 파는 것이지 아무나 만드는 게 아니다).
- **최고관리자는 SQL 로만 만든다** (부트스트랩). 편집기에 그 기능은 없다 — 최고관리자는
  모든 슬롯을 만들고 지우는 권한이라 자주 늘 일이 아니고, UI 로 열었다가 계정 하나가 뚫리면
  피해가 플랫폼 전체다. 방법:
  1. 대시보드 Authentication → Users → **Add user** (Auto Confirm User 켜기)
  2. SQL Editor 에서 `insert into public.owners (user_id) select id from auth.users where email = '그 이메일';`
  - `supabase/seed.sql` 하단에 예시가 있다.
- **주최자 계정은 편집기가 자동으로 만든다** — `/theme-editor/{slug}` 하단 ‘주최자 계정’ 패널에서
  이메일·비밀번호를 넣으면 **계정 생성 + `slot_admins` 매핑을 한 번에** 한다. 대시보드를 열 일이 없다.
  이건 Edge Function `admin` 이 한다 (§5) — 계정 생성은 service_role 키를 요구하는데 그 키는
  브라우저에 못 두기 때문이다. 비밀번호 재발급·계정 삭제도 같은 패널에서 한다.
  - 주최자가 **자기** 비밀번호를 바꾸는 건 함수를 안 거친다 (`/{slug}/admin` → 내 계정) —
    자기 세션으로 자기 비번을 바꾸는 건 anon 키로 되고, service_role 은 남의 계정을 만질 때만 필요하다.

### 1-4. Storage — 슬롯 이미지 ✅

`supabase/migrations/0002_storage.sql` 을 SQL Editor 에서 돌리면 끝난다 (버킷 + 정책).

- 버킷 `slots`, **public read** — 방문자는 로그인하지 않는다. 카페에서 QR 찍고 바로 카드를 보는 화면이라 이미지에 인증을 걸면 그 흐름이 성립하지 않는다.
- 쓰기는 **최고관리자만**. 주최자도 못 올린다 — 이미지는 슬롯 테마의 일부고 테마는 최고관리자 몫이다.
- 경로 규칙은 개발 서버 어댑터와 같다: `{slug}/logo.png`, `{slug}/cards/major-0.webp`. 그래야 `cardFrontSrc` 규칙이 그대로 산다.
- 앱은 이 URL 들을 **전부 `background-image` 로** 깐다 (`src/lib/image.ts`) — 저장소가 바뀌어도 이 규칙은 그대로다.

**버킷이 있는지 목록으로 확인하지 말 것.** `storage.buckets` 에도 RLS 가 걸려 있어 `/storage/v1/bucket` 이 최고관리자에게도 `[]` 를 준다 — 없는 줄 알고 헤맸다. **실제로 올려봐야** 안다.

**캐시:** 같은 경로에 덮어쓰면 URL 이 그대로라 브라우저가 옛 그림을 계속 쓴다 (올렸는데 안 바뀐 것처럼 보인다). Smart CDN 의 자동 무효화는 유료 플랜이고 브라우저 캐시(TTL 1시간)까지는 못 지운다. 그래서 URL 에 `?v=` 를 붙여 **다른 URL 로 만든다** — 캐시를 지우는 대신 비껴간다 (요금제와 무관하게 성립).
카드 앞면은 `cardFrontBase` 하나로 78장을 가리키므로 버전이 테마 필드(`assets.cardFrontVersion`)에 따로 있다. `verify-owner` 가 다시 올려보고 URL 이 바뀌는지 확인한다.

### 1-5. 코드에서 할 일 ✅

전부 끝났다. 실제로 이렇게 됐다:

- `src/lib/repo/supabase.ts` — `Repo` 구현 (slots · questions · auth · ownerAuth). 어댑터 선택은 `repo/index.ts` 한 줄.
- `src/owner/upload/` — 같은 구조 (`dev.ts` / `storage.ts`, 선택은 `index.ts` 한 줄).
- `src/data/slots.ts` 는 순수 함수만 남았다 — 저장은 전부 `repo.slots`.
- supabase-js 는 **동적 import** 다 (`repo/client.ts`). 정적으로 넣으면 초기 번들이 200KB 가 돼 예산(150KB)을 넘는다.
- `scripts/vite-slot-assets.mjs` 는 **안 지웠다** — Supabase 없이도 앱이 도는 성질을 이미지에서도 지킨다.
- 환경변수: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — **anon 키만 클라이언트에 둔다.** `service_role` 키는 절대 프론트에 넣지 않는다 (RLS 를 통째로 무시하는 키다). 그래서 마이그레이션은 SQL Editor 에서 직접 돌린다.

**§1-1·1-2 의 SQL 은 설계 설명용이다.** 실제로 도는 건 `supabase/migrations/` 다 (RLS 헬퍼·인덱스까지 있어 아래 스케치보다 촘촘하다).

---

## 2. Vercel — 배포

### 2-1. 프로젝트 ✅

- GitHub 레포 연결. Framework: **Vite**. 빌드 `npm run build`, 출력 `dist`.
- 환경변수 3개: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_AI_BASE`. **`ANTHROPIC_API_KEY` 는 여기 넣지 않는다** — Supabase secret 으로만 산다.
- **배포 도메인을 `AI_ALLOWED_ORIGINS` 에 넣어야 한다.** 안 넣으면 함수가 CORS 로 막아 AI 가 통째로 죽는다(앱은 안 멈추고 종합만 빠진다 — 그래서 조용히 지나칠 수 있다):
  `npx supabase secrets set AI_ALLOWED_ORIGINS="https://내도메인,http://localhost:5174" --project-ref <ref>`

  **커스텀 도메인을 붙일 때 실제로 여기서 터졌다.** `olucky.me` 를 연결하고 secret 은 그대로 둬서
  `www.olucky.me` 에서 함수 호출이 전부 막혔다 — `ai` 뿐 아니라 **같은 secret 을 쓰는 `admin`(주최자
  계정·비밀번호)까지** 같이 죽는다. 지금 값은 이렇다:

  ```
  https://www.olucky.me,https://olucky.me,https://tarot-btjp.vercel.app,http://localhost:5174
  ```

  - **맨 앞이 실서비스 도메인이어야 한다.** 모르는 출처엔 함수가 `ALLOWED[0]` 을 돌려주므로
    (`corsHeaders`), 그 자리가 옛 주소면 브라우저 오류 메시지가 엉뚱한 도메인을 가리킨다.
  - apex(`olucky.me`)도 같이 넣는다 — 지금은 `www` 로 308 이지만 apex 로 직접 서빙하면 같은 사고다.
  - 기존 `*.vercel.app` 과 `localhost:5174` 를 **빼지 않는다** (개발도 같은 함수를 쓴다 — `VITE_AI_BASE`).

  **secret 은 값을 못 읽는다**(대시보드·CLI 모두 해시만 보여준다). 지금 무엇이 열려 있는지는
  함수에 직접 물어본다 — 허용된 출처면 그 출처가 그대로 돌아온다:

  ```bash
  curl -s -o /dev/null -D - -X OPTIONS -H "Origin: https://www.olucky.me" \
    https://<ref>.supabase.co/functions/v1/ai/status | grep -i access-control-allow-origin
  ```

### 2-2. SPA 라우팅 — 빠뜨리면 슬러그가 죽는다

`/starlit-rian` 로 **직접 들어오면**(QR 이 바로 그 주소다) Vercel 은 그런 파일이 없다고 404 를 준다. 리라이트를 걸어야 한다:

```json
// vercel.json — 파일이 있으면 그게 먼저고, 없을 때만 index.html 로 간다
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

**같이 필요한 것: `base: '/'`** (vite.config.ts). 상대 경로(`'./'`)면 자산이 `./assets/…` 로 나가고, `/starlit-rian` 로 **직접** 들어온 브라우저는 `/starlit-rian/assets/…` 를 찾아 404 — **빈 화면**이 된다. 리라이트만 걸고 이걸 빠뜨리면 정확히 QR 경로만 죽는다.
### 2-3. 슬롯 편집기를 프로덕션에 열려면

**✅ 열렸다.** 막고 있던 세 가지가 다 풀렸다:

- ~~로그인이 아무 값이나 통과한다~~ → Supabase 인증. 틀린 비번·주최자 계정이 막히는 걸 `verify-owner` 가 확인한다.
- ~~이미지 업로드가 개발 서버 미들웨어라 프로덕션에선 실패한다~~ → Storage (§1-4).
- ~~만든 슬롯이 그 브라우저 localStorage 에만 남는다~~ → DB. `verify-owner` 가 **다른 브라우저에서** 열리는지 확인한다.

가드는 없앤 게 아니라 **조건을 바꿨다**: `DEV` → "Supabase 가 설정됐나"(App.tsx). 환경변수를 빠뜨린 채 배포하면 인증이 local 어댑터로 떨어져 아무나 슬롯을 만들고 지운다 — 그 빌드엔 편집기가 없는 편이 맞다. 조건이 false 면 청크가 통째로 빠진다.

**Vercel 에 `VITE_SUPABASE_URL`·`VITE_SUPABASE_ANON_KEY` 를 넣는 걸 잊으면 편집기가 사라진다** — 그게 의도다. 편집기가 안 보이면 그 환경변수부터 본다.

---

## 3. Claude API

### 3-1. 콘솔에서

- 조직/워크스페이스 만들고 **API 키 발급**. 이 키는 **Edge Function secret 으로만** 산다 — 레포·프론트·Vercel 환경변수 어디에도 넣지 않는다.
- 결제 등록 + **사용량 알림(spend limit)** 설정. 카페 이벤트는 트래픽이 몰린다.
- 지금은 로컬 `.env.local` 의 `ANTHROPIC_API_KEY` 를 개발 서버 미들웨어가 읽는다 (`.env.example` 참고). 이 파일은 커밋되지 않고, 빌드 산출물에도 안 들어간다 (`VITE_` 접두사가 아니므로).

### 3-2. 모델 · 가격 (2026-06 기준)

| 모델 | ID | 컨텍스트 | 입력 $/1M | 출력 $/1M |
|---|---|---|---|---|
| **Haiku 4.5** (현재 사용) | `claude-haiku-4-5` | 200K | $1 | $5 |
| Sonnet 5 | `claude-sonnet-5` | 1M | $3 ($2 · 2026-08-31까지 인트로) | $15 ($10 인트로) |
| Opus 4.8 | `claude-opus-4-8` | 1M | $5 | $25 |

타로 리딩은 **입력 작고(카드 3장의 `core`+`symbolism`) 출력 짧다**. → **Haiku 4.5** 로 정했고 품질도 실제로 확인했다. 실측 원가·판매가는 **`docs/PRICING.md`**. 모델 ID 는 위 문자열 그대로 쓴다(날짜 접미사를 붙이지 않는다).

### 3-3. 부를 때 주의 (`supabase/functions/ai/claude.ts` 에 이미 반영돼 있다)

- **Sonnet 5 · Opus 는 적응형 사고가 기본으로 켜진다.** 짧은 리딩엔 지연·비용만 늘어서 `thinking: { type: 'disabled' }` 를 명시한다. Haiku 4.5 는 기본이 사고 없음이라 그냥 둔다 — `THINKS_BY_DEFAULT` 정규식이 이걸 가른다. 모델을 바꿔도 알아서 맞는다.
- **Sonnet 5 는 `temperature`·`top_p` 를 안 받는다**(기본값 아닌 값이면 400). 그래서 아예 안 쓴다 — 화법은 프롬프트로 잡는다.
- 리딩은 **스트리밍**, 답변 생성은 **구조화 출력**(`output_config.format`)으로 JSON. 파싱이 흔들리면 검수 화면이 통째로 깨진다.

---

## 4. Supabase Edge Function — AI 서버 함수

키를 숨기고 Claude 를 부르는 **유일한 자리**. ✅ 끝났다 — `supabase/functions/ai/`.

개발 서버 미들웨어는 **지웠다.** 구현이 둘이면 프롬프트·한도가 어긋난다 — 이 프로젝트에서 그 종류의 버그를 여러 번 겪었다. 그래서 개발도 `VITE_AI_BASE` 로 **같은 배포 함수**를 부른다.

### 4-1. 만들기

```
supabase functions new reading
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...   # 키는 여기에만
supabase functions deploy reading
```

Deno 에선 `npm:@anthropic-ai/sdk` 로 같은 SDK 를 쓴다. `cards.json` 은 함수 폴더에 같이 넣어 import 한다 — **클라이언트가 보낸 의미 텍스트를 프롬프트에 넣지 않는다.** 넣으면 프롬프트를 조작당한다. 클라이언트가 말할 수 있는 건 `cardId`·`orientation`·`position` 뿐이고, 그것도 서버가 검증한다 (모르는 카드는 400).

### 4-2. 옮길 엔드포인트 (계약은 그대로)

| 지금 (개발 서버) | 나중 (배포) |
|---|---|
| `POST /__ai/reading` → SSE 스트림 | `POST /functions/v1/ai/reading` |
| `POST /__ai/answers` → JSON | `POST /functions/v1/ai/answers` (그 슬롯 주최자만) |
| `GET /__ai/status` → `{ready}` | `GET /functions/v1/ai/status` (인증 없이) |

클라이언트는 **`VITE_AI_BASE` 만 그쪽으로 돌리면 된다** (`src/lib/repo/ai.ts`). 화면은 손댈 게 없다. `status` 가 `ready:false` 면 앱은 조용히 AI 없이 돈다 — 지금 배포하면 그 상태다.

### 4-3. 같이 붙인 것 ✅

돈이 새던 자리들 (`docs/PRICING.md` §5) — 전부 막았고, `verify-ai` 가 실제로 뚫어보며 확인한다:

- **캐시** → `reading_cache` 테이블. 프로세스 메모리였을 땐 재시작하면 날아갔다. 단, 3장 조합이 74,000 가지라 캐시는 원가 절감이 아니라 **새로고침 연타 방어**다.
- **슬롯별 예산 상한** → `claim_ai_usage` (0003). 넘으면 402 → 화면은 폴백(카드별 해석). **원자적이어야 한다**: 읽고-검사-쓰기로 하면 새로고침 연타에 여러 요청이 동시에 "아직 남았네"를 보고 전부 통과한다. `update … where reading < cap` 한 문장이라 행 잠금이 순서를 만든다.
- **레이트리밋** → `bump_ai_rate` (0003). 한도(슬롯당 수천 회)는 **예산**을 지키지 연타를 못 막는다. 리딩 10회/분.
- **답변 생성 권한** → 그 슬롯 주최자만 (`manages_slot()`). 78장 = 209원짜리 버튼이다. 색 만들기는 최고관리자만.
- **CORS** → `AI_ALLOWED_ORIGINS` secret. 지금 값: `https://www.olucky.me,https://olucky.me,https://tarot-btjp.vercel.app,http://localhost:5174` (§2-1 에 왜 이 순서인지 적어 뒀다).

**함수 권한의 함정:** `create function` 은 EXECUTE 를 **PUBLIC** 에 준다. `revoke … from anon, authenticated` 로는 안 뺏긴다(둘 다 PUBLIC 을 통해 상속받는다) — 실제로 그렇게 썼다가 anon 키로 `release_ai_usage` 를 불러 사용량을 되돌릴 수 있었다. `from public` 으로 뺏고 `service_role` 에만 도로 준다.

**상류 과부하:** Claude 가 몰리면 `overloaded_error` 가 **스트림 도중에** 온다 — SDK 자동 재시도가 안 걸린다. 아직 한 글자도 안 보냈으면 다시 시도한다 (`claude.ts`). 그래도 실패하면 화면이 카드별 해석으로 떨어진다 — `verify-ai` 가 한도를 0 으로 만들어 그 경로를 확인한다.

### 4-4. 인증 — 방문자는 로그인을 안 한다

함수를 열어두면 남이 내 Claude 예산을 쓴다. 그런데 **방문자는 로그인하지 않는다** (카페에서 회원가입 없이 뽑는 게 이 앱의 전제). 그래서:

- **3장 리딩**은 실시간 생성이라 미리 만들어둘 수 없다 → Supabase **익명 로그인**을 켜서 방문자에게도 JWT 를 준다. 그래야 레이트리밋·예산을 걸 주체가 생긴다.
- **질문 타로는 그럴 필요가 없다** — 답변은 주최자가 미리 생성·검수해 DB 에 저장하고, 방문자는 읽기만 한다. 이미 그렇게 구현돼 있다.

---

## 5. Supabase Edge Function — 계정 함수 (`admin`)

**주최자 계정을 만드는 유일한 자리** — `supabase/functions/admin/`. AI 함수와 같은 이유로 존재한다:
계정 생성(`auth.admin.createUser`)은 **service_role 키를 요구하는데 그 키는 브라우저에 못 둔다**.
anon 키로 되는 `signUp()` 은 대시보드에서 자동 가입을 켜야 하고, 그 순간 공개된 anon 키로
누구나 계정을 만들 수 있게 된다 (§1-3 이 끈 걸 도로 켜는 셈). 그래서 키는 함수에만 산다.

### 5-1. 배포

```
supabase functions deploy admin
# secret 은 이미 있다 — SUPABASE_URL·SERVICE_ROLE_KEY·ANON_KEY 는 런타임이 자동 주입,
# AI_ALLOWED_ORIGINS 는 ai 함수와 공유한다 (따로 두면 도메인 하나만 고치고 다른 쪽이 죽는다).
```

`config.toml` 에 `[functions.admin] verify_jwt = false` 를 둔다 — ai 와 같은 이유다.
**필요한 건 "로그인했나"가 아니라 "최고관리자인가"** 이고, 그 판정은 함수 안의 `is_owner()`(RPC)가 한다.
verify_jwt 를 켜면 게이트웨이가 CORS 헤더 없이 401 을 줘 브라우저엔 CORS 오류로 보인다.

### 5-2. 엔드포인트 (전부 최고관리자만)

| 경로 | 하는 일 |
|---|---|
| `GET  /admin/organizers?slug=` | 그 슬롯 주최자 목록 (이메일은 `auth.users` 라 service_role 로만 읽힌다) |
| `POST /admin/organizers` | 계정 생성 + `slot_admins` 매핑 **한 번에** (매핑 실패 시 계정 롤백) |
| `POST /admin/password` | 임시 비밀번호 **발급** (서버가 만들어 한 번만 보여준다 — 주최자가 받아서 바꾼다) |
| `POST /admin/revoke` | 계정 삭제 (매핑만이 아니라 계정째 — 유령 계정을 안 남긴다) |

비번 재발급·삭제는 대상이 **주최자인지(`slot_admins` 에 있는지) 먼저 본다** — 안 그러면 최고관리자가
다른 최고관리자의 비번을 바꾸거나 계정을 지울 수 있다. 최고관리자 계정은 SQL 로만 다룬다.

화면은 `repo.organizers` (`src/lib/repo/organizers.ts`) 만 안다. `ready()` 가 false 면
(=Supabase 미설정) 편집기가 계정 패널을 **통째로 안 띄운다** — localStorage 로 계정을 흉내 내면
"만들었다" 고 해놓고 아무도 로그인하지 못한다.

---

## 6. 슬롯 기간 — 대여가 끝나면 닫힌다 (`0005_slot_period.sql`)

슬롯은 파는 물건이다. 이벤트가 끝났는데 링크가 열려 있으면 안 판 것과 같다. 그래서:

- `slots.period` (jsonb) 에 **테스트·대여** 두 기간을 둔다. 둘 중 하나라도 오늘을 품으면 열린다.
- **판정은 RLS 가 한다** — `anyone reads slots` 정책을 `is_owner() or slot_open(period)` 로 바꿨다.
  프론트에서만 막으면 anon 키로 `/rest/v1/slots?slug=eq.종료슬롯` 을 그대로 부를 수 있다.
- 대여가 끝나면 **주최자도 못 들어온다** (요구사항). 주최자가 미리 준비할 자리는 **테스트 기간**이다.
- 날짜는 **KST 기준** (`today_kst()`) — UTC current_date 는 한국 자정~오전 9시에 어제를 가리켜
  오픈런 방문자가 "아직 시작 안 함"을 본다. 화면도 같은 기준을 쓴다 (`data/slots.ts` 의 `todayKst`).
- `slot_open`·`today_kst` 는 **anon·authenticated 에 EXECUTE 를 준다** — 정책이 호출자 롤로
  평가되므로 뺏으면 슬롯이 아무에게도 안 열린다. AI 함수들과 반대다 (저건 service_role 전용).
- 최고관리자 목록은 지난 슬롯을 **빨간 테두리 + "삭제해야 하는 슬롯" 안내**로 보여준다 (`SlotList`).

**슬러그 변경 버그도 같이 고쳤다 (`0004_slug_rename.sql`):** 편집기가 슬러그를 바꿀 때
새 행을 만들고 옛 행을 지웠는데, `questions`·`slot_admins` 가 `on delete cascade` 라
**질문·계정이 통째로 날아갔다.** FK 에 `on update cascade` 를 더하고, 편집기·어댑터를
"지우고 새로 만들기"에서 **"slug 를 update"** 로 바꿨다 (`repo.slots.save(slot, prevSlug)`).

---

## 순서

AI·화면·편집기는 **이미 다 됐다.** 남은 건 전부 "이 브라우저 밖으로 꺼내는" 일이다.

1. ~~**Supabase 테이블 + RLS + 인증** → `repo/supabase.ts` → `repo/index.ts` 한 줄 교체~~ **✅ 끝**
   → *제일 큰 구멍이 막혔다. 주최자 답변이 방문자에게 가고, 슬롯이 진짜로 만들어지고, 로그인이 진짜다.*
   → 통과 조건 확인함: `verify-owner` 의 "방금 만든 슬롯이 다른 브라우저에서 열린다" (세션 없는 별도 컨텍스트로 연다).
   → 서버도 플랜 한도를 **DB 에서** 읽는다 — `verify-ai` 가 DB 한도만 0 으로 낮춰 402 를 확인한다.
2. ~~**Supabase Storage** + `owner/upload.ts` 교체~~ **✅ 끝** → 슬롯 편집기가 개발 서버에서 풀려났다
   → `owner/upload/` 가 `repo/` 와 같은 어댑터 구조다 (`dev.ts` / `storage.ts`, 선택은 `index.ts` 한 줄).
   → `scripts/vite-slot-assets.mjs` 는 **안 지웠다** — Supabase 없이도 앱이 도는 성질을 이미지에서도 지킨다 (`repo/` 의 local 어댑터와 같은 이유).
   → 버킷·정책은 `supabase/migrations/0002_storage.sql`. 쓰기는 최고관리자만이고, `verify-supabase` 가 방문자·주최자 업로드가 막히는지 실제로 올려보며 확인한다.
3. ~~**Edge Function** + `VITE_AI_BASE`~~ **✅ 끝** — AI 가 배포에서도 산다. 개발 미들웨어는 지웠다 (구현은 하나).
   → 예산 상한·레이트리밋·권한을 **같이** 붙였다 (§4-3). `verify-ai` 47종이 전부 배포된 함수를 때린다.
   → 남은 건 `AI_ALLOWED_ORIGINS` 에 배포 도메인 추가 (지금은 localhost:5174 만).
4. ~~**Vercel** 배포 + `vercel.json` 리라이트~~ **✅ 끝** — https://tarot-btjp.vercel.app
   → `node scripts/verify-prod.mjs <주소> <스크린샷>` 이 배포된 주소를 실제로 때린다 (리딩 1회 ≈5원).
5. ~~`App.tsx` 의 슬롯 편집기 **DEV 가드 해제**~~ **✅ 끝** — 이제 "Supabase 가 설정된 빌드" 조건이다 (§2-3)
6. **주최자 계정 자동화 + 슬롯 기간** — 편집기에서 계정을 발급하고, 대여가 끝나면 슬롯이 닫힌다.
   → 마이그레이션 `0004_slug_rename.sql`·`0005_slot_period.sql` 을 SQL Editor 에서 돌린다.
   → `supabase functions deploy admin` (§5-1). `AI_ALLOWED_ORIGINS` 에 배포 도메인이 있어야 한다.
   → `verify-owner` 가 슬러그를 바꿔도 질문이 안 날아가는지, 종료된 슬롯이 익명 컨텍스트에서 막히는지 확인한다.

1~3 이 끝나면 **localStorage 를 쓰는 데이터는 하나도 안 남는다.** 남는 건 기간 잠금(오늘의 카드를 그 기기에 고정하는 `src/lib/storage.ts`)뿐인데, 그건 방문자가 로그인을 안 하니 localStorage 가 맞는 자리다.

각 단계 후 `scripts/verify-*.mjs` 를 돌린다. 특히 1번 뒤엔 **다른 브라우저에서** 답변이 보이는지 확인한다 — 그게 이 작업의 통과 조건이다.
