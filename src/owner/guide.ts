import type { DateRange, Slot } from '@/types/slot'

/**
 * 주최자에게 보낼 안내문을 **그 슬롯 값으로 채워** 만든다.
 *
 * 계정을 만들거나 비밀번호를 재발급한 **그 자리**에서 쓴다 — 비밀번호는 그때만 아는 값이라
 * (해시로만 저장된다) 나중에 다시 못 만든다. 그래서 최고관리자는 이걸 복사해 전달만 하면 된다.
 *
 * 문안은 `docs/고객-안내-템플릿.md` 와 맞춘다 — 한쪽만 고치면 화면과 문서가 어긋난다.
 */

/** '2026-07-04' → '2026년 7월 4일' — 안내문에선 숫자만 있으면 오해가 는다 */
function longDate(d: string): string {
  const [y, m, day] = d.split('-')
  return `${y}년 ${Number(m)}월 ${Number(day)}일`
}

/** 기간 한 줄 — 열린 끝은 말로 (안내문이라 화살표는 안 쓴다) */
function periodText(r: DateRange | undefined): string | null {
  if (!r?.start && !r?.end) return null
  if (r.start && r.end) return `${longDate(r.start)} ~ ${longDate(r.end)}`
  return r.start ? `${longDate(r.start)}부터` : `${longDate(r.end!)}까지`
}

export function buildGuide(
  slot: Slot,
  origin: string,
  email: string,
  password: string
): string {
  const base = origin.replace(/\/$/, '')
  const siteUrl = `${base}/${slot.slug}`
  const adminUrl = `${siteUrl}/admin`
  const test = periodText(slot.period?.test)
  const rent = periodText(slot.period?.rent)

  const lines = [
    `${slot.name} 타로 이벤트 안내`,
    ``,
    `방문자용 주소 (링크로 공유하거나 QR 로 만들어 카페에 두세요)`,
    siteUrl,
    ``,
    `관리자 로그인`,
    adminUrl,
    ``,
    `관리자 아이디 / 비밀번호`,
    `${email} / ${password}`,
    ``,
    `─────────────`,
    ``,
    `1) 방문자는 이렇게 씁니다`,
    `손님이 위 링크를 열면(또는 카페에 두신 QR 을 찍으면) 바로 타로 화면이 열립니다.`,
    `회원가입도 로그인도 없습니다 — 열고 바로 카드를 뽑습니다.`,
    ``,
    `2) 관리자가 하는 일 — 질문과 답변 관리`,
    `관리자 주소로 들어가 로그인하시면 '질문 타로' 화면이 나옵니다.`,
    `여기서 하시는 건 두 가지뿐이에요 (색·이미지 설정은 저희가 이미 맞춰뒀습니다):`,
    `· 질문 추가 — 손님이 고를 질문을 적습니다.`,
    `· 답변 입력 — 질문을 누르면 카드마다 보여줄 답변을 적어요.`,
    `  직접 적으셔도 되고, 'AI로 전체 생성' 을 누르면 한 번에 만들어 드립니다`,
    `  (만들어진 답변은 검수하고 저장을 눌러야 손님에게 나갑니다).`,
    `각 질문 왼쪽의 '공개' 체크박스를 켜야 손님 화면에 나옵니다.`,
    `질문·답변은 저장을 따로 누르지 않아도 바로 반영됩니다.`,
    ``,
    `3) 비밀번호는 꼭 바꿔주세요`,
    `처음 받으신 비밀번호는 저희도 아는 값입니다.`,
    `관리자 화면 왼쪽 메뉴의 '내 계정' 에서 본인만 아는 비밀번호로 바꿔주세요.`,
  ]

  if (test || rent) {
    lines.push(``, `4) 기간 안내`)
    if (test) lines.push(`· 테스트 기간: ${test} — 미리 열어보고 질문·답변을 채우실 수 있어요.`)
    if (rent) {
      lines.push(`· 실제 운영 기간: ${rent} — 손님이 들어올 수 있는 기간입니다.`)
      lines.push(`대여 기간이 지나면 주소가 닫힙니다 (관리자도 못 들어가니 연장은 미리 말씀해 주세요).`)
    }
  }

  lines.push(
    ``,
    `─────────────`,
    ``,
    `· 손님에게는 위 방문자용 주소를 링크로 보내거나 QR 로 만들어 두시면 됩니다.`,
    `· 행사 전날, 실제로 쓰실 기기로 주소를 한 번 열어 확인해 주세요.`,
    `· 질문·답변 입력은 테스트 기간에 미리 끝내두시길 권합니다.`,
    `궁금한 점은 언제든 편하게 연락 주세요.`
  )

  return lines.join('\n')
}
