/**
 * 슬롯 이미지 저장소 경계 — 화면은 이 인터페이스만 안다.
 *
 * `repo/` 와 같은 이유로 경계를 긋는다: 편집기 화면이 "파일이 `public/slots/` 에 떨어진다"는
 * 사실을 알면, 저장소를 Storage 로 바꾸는 순간 화면이 조용히 거짓말한다.
 * 경로 규칙(`{slug}/logo.png`, `{slug}/cards/major-0.webp`)은 어느 어댑터든 같다 —
 * 그래야 `cardFrontSrc` 의 규칙이 그대로 산다 (docs/BACKEND.md §1-4).
 */
export interface AssetStore {
  /** 올리고 **최종 URL** 을 돌려준다 — 캐시 무효화용 버전이 붙어 있을 수 있다 */
  upload(slug: string, name: string, file: File): Promise<string>
  remove(slug: string, name: string): Promise<void>
  /** 슬롯 폴더 기준 상대 경로 (예: `logo.png`, `cards/major-0.webp`) */
  list(slug: string): Promise<string[]>
  /** 올리지 않고 URL 규칙만 — 카드 앞면 base 를 만들 때 쓴다 */
  urlFor(slug: string, name: string): string
}
