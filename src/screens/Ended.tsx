/**
 * 행사가 끝난 슬롯의 **방문자 화면**.
 *
 * 종료 뒤에도 슬롯은 14일 더 읽힌다 (`slot_grace_days` — 주최자가 자료를 꺼내고 남은 선물을
 * 건네는 시간이다). 그런데 **읽기만으로 완전히 도는 서비스가 있다**: 타로 뽑기와 포토존 합성은
 * 서버에 아무것도 안 써서, 유예가 그대로 대여 연장이 돼 버린다.
 *
 * 그래서 종료 판정을 **화면이 한 번 더** 한다. DB 는 유예를 위해 열어 두고, 방문자에게는
 * 여기서 닫는다 — 관리 화면(`/admin`)과 스태프 화면(`/staff`)은 `SlotLayout` 밖이라 그대로 열린다.
 *
 * 예전엔 종료된 주소가 "페이지를 찾을 수 없어요" 로 떴다. 그건 틀린 말이다 — 페이지는 있었고
 * 행사가 끝난 것이다. QR 이 카페 벽에 며칠 더 붙어 있는 동안 찍는 사람에게 그 차이가 크다.
 */
import { josa } from '@/lib/josa'
import { useT } from '@/i18n'

export function Ended({ name }: { name: string }) {
  const t = useT()
  return (
    <div className="app">
      <main className="app__scroll">
        <div className="screen">
          <h1 className="t-title-l screen__title">{t('행사가 끝났어요')}</h1>
          {/* 이벤트명이 데이터에서 오므로 조사를 박아 두지 않는다 (`lib/josa.ts`).
            * 번역 키에는 조사가 없다 — 조사는 한국어 문법이라 `josa()` 가 붙이고,
            * 다른 언어 사전은 {name} 자리만 옮긴다. */}
          <p className="t-body t-muted screen__lead">
            {t('{name}{josa} 종료됐어요. 찾아와 주셔서 고마워요!', {
              name,
              josa: josa(name, '은', '는'),
            })}
          </p>
        </div>
      </main>
    </div>
  )
}
