# 코드 리뷰 — 다국어 전수 작업

`code-review-tutoring.md` 의 형식·판단 기준을 따른다.

## 0) 범위

- 대상: `4bfd474..36b4b34`
- 호출 형태: 단일 경로 (`@path1` 만). **코드 퀄리티 변화 분석은 수행하지 않는다** —
  비교 기준(`@path2`)이 주어지지 않았다.
- 리뷰 축: 다국어(사전·입력값·고르개 배치)와 그에 딸린 DB 마이그레이션·검증 스크립트.
  이 범위 밖의 파일(카드 의미 JSON 등 데이터 파일)은 기계 생성분이라 지적 대상에서 뺀다.

## 1) 결론 (상태 + 근거)

**통과.** Blocking 0건(1건은 고침), Non-blocking 3건 남음.

근거:

- 빌드·타입 검사 통과 (`npm run build`, `tsc --noEmit` 무출력).
- 아래 2-1 (보기 삭제 시 번역이 밀림)과 3-1 (주석이 코드와 반대)은 **이 리뷰 뒤 고쳤다** —
  기록을 남기려고 항목은 지우지 않고 「고침」 표시만 단다.

### 실행 기록 (근거 아님 — 재현용)

| 스크립트 | 결과 |
|---|---|
| `scripts/verify-i18n-leak.mjs` | 0종 (420·1280 두 폭) |
| `scripts/verify-langbar.mjs` | 21화면 × 3폭 전부 통과 |
| `scripts/i18n-parity.mjs` | 1,178키 × 3언어, 빠짐 0 |
| `scripts/verify-quiz.mjs` | 전부 통과 |
| `scripts/verify-i18n-usertext.mjs` | 5/5 |
| `scripts/verify-i18n-select.mjs` | 0곳 |
| `scripts/verify-noimg.mjs` | 전부 통과 |
| `scripts/verify-editor-fields.mjs` | 설정 220개 전부 칸 있음 |
| `scripts/verify-editor-toggle.mjs` | Field 51개 확인 |
| `scripts/verify-subtitle.mjs` | 7개 서비스 전부 |
| `scripts/verify-header-uniform.mjs` | 일곱 헤더 동일 |
| `scripts/verify-header-align.mjs` | 정렬 셋 전부 |
| `scripts/verify-group-apply.mjs` | 6/6 |
| `scripts/verify-quiz.mjs` | 전부 통과 |
| `scripts/verify-tokens.mjs` | 0자리 |

## 2) Blocking (필수 수정)

### 2-1. 보기를 지우면 언어별 보기가 한 칸씩 밀린다 — **고침**

- 근거: `src/admin/quiz/Questions.tsx:735-741` (보기 삭제 `onClick`)
- 관찰: 삭제 핸들러가 `choices` 는 `filter` 하고 `answers` 는 비우는데,
  `choicesI18n` 은 **손대지 않는다.**
- 영향: `choicesI18n` 은 언어당 **배열 하나**이고 순서가 곧 보기 순서다
  (`src/data/multilingual.ts:101-107` `pickList`). 2번 보기를 지우면 원문은
  `['가','다','라']` 가 되는데 영어는 `['A','B','C','D']` 그대로라,
  방문자 화면에서 `다` 자리에 `B` 가 붙는다. 객관식 정답 인덱스와 얽히는 구조
  (`quiz_answers.answers` 가 `'0'`·`'2'` 로 가리킨다)라 **오답 문의로 이어진다.**
- 심각도 근거: 요구사항 위반 (주최자가 적은 값이 다른 항목으로 표시된다).
- 수정 방향: 삭제 핸들러에서 같은 인덱스를 `choicesI18n` 의 모든 언어 배열에서도 뺀다.
  `answers` 를 비우는 것과 같은 이유·같은 자리다.
- **처리:** `dropChoiceAlt` 를 더해 삭제 핸들러에서 같이 민다 (`src/admin/quiz/Questions.tsx`).

## 3) Non-blocking (권장)

### 3-1. 주석이 코드와 반대로 적혀 있다 — **고침**

- 근거: `src/admin/QuestionEditor.tsx:451-453`
- 관찰: 주석은 "검수 중(AI 초안)에는 언어별 칸을 안 건다" 인데, 바로 아래 `editAlt` 는
  `pending` 여부와 무관하게 `onChangeAlt` 를 부른다. 같은 파일 448행의 `edit` 는
  `pending` 을 실제로 가른다.
- 영향: 이 저장소는 주석을 판단 근거로 쓰는 문서 문화다(CLAUDE.md). 반대로 적힌 주석은
  다음 사람이 "안 걸리는구나" 하고 그 경로를 안 보게 만든다.
- 성격: Non-blocking (동작은 의도대로 — 원문은 초안, 번역은 즉시 저장).
- **처리:** 주석을 실제 동작대로 다시 썼다.

### 3-2. `myReward` 가 보상마다 설정 행을 한 번 더 읽는다

- 근거: `src/lib/repo/quiz.ts` `myReward` / `src/lib/repo/stamp.ts` `myReward`
- 관찰: 보상 이름의 번역을 붙이려고 `quiz_settings` / `stamp_settings` 를 별도 왕복으로 읽는다.
- 영향: 화면 한 번에 왕복이 하나 는다. 보상 화면은 방문자당 몇 번 안 열리는 자리라
  실측 비용은 작지만, 호출이 잦아지면 먼저 눈에 띌 자리다.
- 성격: Non-blocking. (대안인 `rewards.label_i18n` 스냅샷은 `reward_claim` 을 고쳐야 하고,
  그 함수는 스탬프·모의고사·포토카드가 공유한다 — 지금 선택이 더 작은 변경이다.)

### 3-3. `useLocalizedDisplay` 가 `i18n` 키를 결과에 그대로 남긴다

- 근거: `src/i18n/display.ts:37-50`
- 관찰: 루프에서 `if (k === 'i18n') continue` 로 건너뛸 뿐, 반환 객체에는 남는다.
- 영향: 지금은 무해하다(어느 화면도 `display` 를 DOM 속성으로 펼치지 않는다).
  다만 나중에 `{...display}` 로 펼치는 코드가 생기면 객체가 속성으로 새어 나간다.
- 성격: Non-blocking.

### 3-4. 넓은 폭 누출 검사가 영어 한 언어만 돈다

- 근거: `scripts/verify-i18n-leak.mjs` `PASSES`
- 관찰: 1280px 패스는 `langs: ['en']` 이다.
- 영향: **감싸기 누락**은 언어를 안 타므로 이 선택이 맞다(주석에 근거가 적혀 있다).
  다만 "넓은 화면에서만 뜨는 줄이 사전에는 있는데 특정 언어만 빈" 경우는
  `i18n-parity` 가 대신 본다는 전제에 기대고 있다 — 그 전제가 깨지면 사각지대가 된다.
- 성격: Non-blocking (문서화된 트레이드오프).

## 4) 학습 포인트 태그

`#인덱스-정합성` `#통로-하나로-모으기` `#검사도-실패시켜보기` `#CSS-특이도`
`#절대배치와-패딩박스` `#security-definer-재작성` `#주석-정확성`

## 5) 강점 (이번 제출물 기준)

**5-1. 번역을 통로 하나에 모아 렌더 코드를 안 고쳤다**

- 관찰: 서비스 표시값의 번역을 필드마다 두지 않고 `display.i18n` 한 묶음으로 두고,
  이미 아홉 서비스가 통과하던 훅에서 갈아 끼웠다. 질문 타로도 같은 방식으로
  `answerFor` 한 함수에서 언어를 받았다.
- 근거: `src/i18n/display.ts:37-44` (`useLocalizedDisplay`), `src/lib/answer.ts` `answerFor`,
  `src/data/multilingual.ts:87-92` (`DisplayI18n`)
- 왜 강점인지: **확장성.** 편집기 입력값 43곳이 렌더 코드 수정 0줄로 번역 대상이 됐다.
  필드마다 `titleI18n`·`subtitleI18n` 을 두는 대안이었다면 타입·저장·렌더 세 곳 × 45필드였다.

**5-2. 화면이 안 깨지는 부류의 결함에 소스 대조 검사가 있다**

- 관찰: `verify-i18n-select.mjs` 는 저장 쪽에서 `\w+_i18n:` 을 모으고, 읽는 쪽으로
  `.select()` 리터럴과 `const COLS|SELECT` 상수를 **함께** 모아 대조한다
  (`all.length === 0` 가드 — 상수만 쓰는 파일이 검사에서 빠지지 않는다).
- 근거: `scripts/verify-i18n-select.mjs:38-72`, `src/lib/repo/poll.ts:54-61` `SELECT`,
  `src/lib/repo/photocard.ts:88, 166`
- 왜 강점인지: **테스트 용이성.** 이 결함은 tsc·번역 검사·화면이 모두 통과한다 —
  `pick()` 이 `undefined` 를 받아 원문으로 떨어지므로 화면에 오류가 안 난다
  (`src/data/multilingual.ts:43-47`). 정적 대조가 그 사각을 덮는다.

**5-3. 숨긴 값과 공개 값의 경계를 지키며 번역을 붙였다**

- 관찰: 모의고사 문항·보기는 공개된 값이라 문항 테이블에 `_i18n` 을 달고, 주관식
  모범답안은 anon 이 못 읽는 표에 있으므로 **서버가 언어를 받아** 결과에만 담게 했다.
  채점 규칙은 건드리지 않았다.
- 근거: `supabase/migrations/0047_quiz_i18n.sql` (머리말 + `answer` 조립부),
  `src/lib/repo/quiz.ts` `submit`
- 왜 강점인지: **보안.** 번역을 문항 쪽에 뒀다면 풀기 전에 정답이 노출됐다.
  또 채점을 언어로 가르지 않아 "같은 답이 언어에 따라 맞았다 틀렸다" 를 막았다.

## 6) 약점 (이번 제출물 기준)

**6-1. 순서가 뜻을 갖는 배열을 다루면서 삭제 경로를 안 맞췄다**

- 관찰: `pickList`·`cleanList`·`setChoiceAlt` 는 인덱스 정합을 의식해 만들었는데
  (빈칸 패딩, 길이 맞추기), 정작 인덱스가 실제로 밀리는 **삭제** 경로가 빠졌다.
- 근거: `src/data/multilingual.ts:101-123`, `src/admin/quiz/Questions.tsx:735-741`
- 영향: 번역이 다른 보기에 붙는다 (2-1).
- 성격: **Blocking**

**6-2. 배열 방식과 항목별 사전 방식을 한 작업 안에서 섞었다**

- 관찰: 스탬프 칸은 항목마다 자기 사전을 들고(`StampCell.nameI18n`), 모의고사 보기는
  언어당 배열 하나를 공유한다(`choicesI18n`). 전자는 순서가 바뀌어도 안 어긋나고,
  후자는 어긋난다.
- 근거: `src/data/stamp.ts` `StampCell`, `src/lib/repo/types.ts` `QuizQuestion.choicesI18n`
- 영향: 두 방식의 취약점이 서로 다르다. 배열을 고른 근거(정답 인덱스와의 정합)는
  주석에 적혀 있지만, 그 선택이 삭제·재정렬을 **호출자 책임**으로 만든다는 점은 안 적혀 있다.
- 성격: Non-blocking (설계 선택 자체는 근거가 있다)

**6-3. 주석과 코드가 어긋난 자리가 남았다**

- 관찰: `QuestionEditor` 의 `editAlt` 주석이 실제 동작과 반대다.
- 근거: `src/admin/QuestionEditor.tsx:451-453`
- 영향: 이 저장소는 주석을 판단 근거로 쓰므로, 다음 사람이 그 경로를 안 본다.
- 성격: Non-blocking

## 7) 학습 방향성 (우선순위 1~2개)

**7-1. 인덱스가 뜻을 갖는 자료를 만들 때, 인덱스를 흔드는 경로를 먼저 센다**

- 목표: 순서 의존 배열을 도입하면 그 순서를 바꾸는 **모든** 경로(추가·삭제·재정렬)에서
  짝 자료를 같이 옮긴다.
- 이번 코드에서의 근거: `src/admin/quiz/Questions.tsx:735-741` 은 `answers` 는 비우면서
  `choicesI18n` 은 안 옮겼다. 같은 파일 `setChoiceAlt` 는 추가 경로만 맞춰 놨다.
- 다음 제출물에서 체크할 기준:
  1. (PASS/FAIL) 순서 의존 배열을 새로 도입하면, 그 배열을 바꾸는 핸들러가 몇 개인지
     주석이나 커밋 메시지에 적혀 있다.
  2. (PASS/FAIL) 삭제·재정렬 경로에 대한 검증(스크립트 또는 수동 절차)이 존재한다.

**7-2. 검사 스크립트가 "본 것" 과 "찾은 것" 을 둘 다 출력한다**

- 목표: verify 스크립트의 통과 출력에 **검사 대상 개수**가 포함되어, 0이
  "결함이 없어서 0" 인지 "대상이 없어서 0" 인지 구분된다.
- 이번 코드에서의 근거: `scripts/verify-i18n-select.mjs:72` 는 실패 건수만 출력한다.
  같은 스크립트의 `all.length === 0` 가드(`:66`)는 대상이 없는 파일을 조용히 건너뛰므로,
  통과 출력만으로는 몇 개 파일을 실제로 본 것인지 알 수 없다.
  대비되는 예: `scripts/verify-langbar.mjs` 는 화면마다 좌표를 찍어 본 대상이 드러난다.
- 다음 제출물에서 체크할 기준:
  1. (PASS/FAIL) 새 verify 스크립트의 통과 출력에 검사한 대상 수가 들어 있다.
  2. (PASS/FAIL) 건너뛴 대상이 있으면 그 수를 따로 출력한다.
