import type { ResultImage } from '@/lib/compose'

/**
 * **코드베이스에서 `<img>` 가 등장하는 유일한 파일.**
 *
 * 슬롯 이미지는 전부 `background-image` 로 그린다 — 모바일에서 `<img>` 는 길게 누르면
 * "이미지 저장" 이 뜨고, 로고·카드 앞면은 주최자가 돈 주고 만든 자산이라 그러면 안 된다
 * (`lib/image.ts`).
 *
 * 그런데 방문자가 **획득·합성한 결과물**은 정반대다: 저장되는 게 목적이다. 포토존 인증샷을
 * 못 가져가면 그건 서비스가 아니다. 그래서 여기만 예외다.
 *
 * 예외가 새지 않는 이유는 규율이 아니라 타입이다 — 받는 값이 `ResultImage` 인데 그건
 * `lib/compose.ts` 의 `mint`/`fromUrl` 만 만들 수 있다. 슬롯 자산 URL(`string`)을 넘기면
 * **컴파일 에러**다. 덱 뒷면·프레임 PNG·로고를 여기 태울 방법이 없다.
 *
 * `src` 가 `blob:` URL 인 것도 의도다. "이미지 주소 복사" 로 Storage 원본에 못 간다.
 */
export function SavableImage({
  image,
  alt,
  className,
}: {
  image: ResultImage
  alt: string
  className?: string
}) {
  return (
    <img
      src={image.url}
      alt={alt}
      className={className}
      width={image.width}
      height={image.height}
      data-savable
      style={{ maxWidth: '100%', height: 'auto', display: 'block' }}
    />
  )
}
