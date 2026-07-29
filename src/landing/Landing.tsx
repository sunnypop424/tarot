import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  DEVICE_SIZE,
  FAQS,
  ROLE_MINE,
  ROLE_NOTE,
  ROLE_YOURS,
  PAGE_MAX,
  SERVICES,
  SIDE_MIN_H,
  STACK_MAX_H,
  STEPS,
} from './landingData'
import { InquiryModal } from './InquiryModal'
import styles from './Landing.module.css'

/**
 * 배포 루트(`/`) 랜딩 — **개인 커미션 안내 글.**
 *
 * 랜딩페이지가 아니라 **글 한 편**으로 짠다: 큰 히어로가 없고, 섹션 번호도 없고, 카드 그리드로
 * 각을 잡지 않는다. 혼자 받는 커미션이라 규모가 커 보이면 오히려 어긋난다
 * (`docs/랜딩-디자인-프롬프트-개인풍.md`).
 *
 * **슬롯 목록은 여기 없다.** 뜨는 주소는 전부 체험 슬롯(`/demo-*`)이고 고객 슬롯은 랜딩
 * 어디에도 안 나온다 (`CLAUDE.md`).
 *
 * 어투는 **합니다체**다 — 앱(해요체)과 일부러 다르다. 이유는 `landingData.ts` 머리말에.
 */
export default function Landing() {
  const [cur, setCur] = useState(SERVICES[0].key)
  const [openFaq, setOpenFaq] = useState<number | null>(0)
  const [inquiry, setInquiry] = useState<null | 'any' | 'custom'>(null)
  const [w, setW] = useState(() => (typeof window === 'undefined' ? 1024 : window.innerWidth))
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onResize = () => setW(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  /** 스크롤 등장 — 관찰이 안 되는 브라우저에선 그냥 다 보이게 */
  useEffect(() => {
    const els = rootRef.current?.querySelectorAll<HTMLElement>('[data-rv]')
    if (!els?.length) return
    if (!('IntersectionObserver' in window)) {
      els.forEach((el) => el.setAttribute('data-in', ''))
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.setAttribute('data-in', '')
            io.unobserve(en.target)
          }
        })
      },
      { threshold: 0.06, rootMargin: '0px 0px -6% 0px' }
    )
    els.forEach((el) => io.observe(el))
    // 관찰이 어떤 이유로든 안 걸리면(스크롤 없는 짧은 화면) 1초 뒤 그냥 보여준다
    const t = window.setTimeout(() => els.forEach((el) => el.setAttribute('data-in', '')), 1000)
    return () => {
      io.disconnect()
      clearTimeout(t)
    }
  }, [])

  const service = useMemo(() => SERVICES.find((s) => s.key === cur) ?? SERVICES[0], [cur])

  /**
   * 목업 크기.
   *
   * **① 나란히 놓을 땐 어느 탭이든 높이가 같다.** 탭마다 따로 계산하면 폰만 있는 서비스에서
   * 커졌다가 가로 스크린이 붙는 서비스에서 작아져 판이 출렁인다. 그래서 **가장 넓은
   * 조합(폰 + 가로 스크린)** 하나로 높이를 한 번만 정하고 모든 탭이 그걸 쓴다.
   *
   * **② 자리가 모자라면 세로로 쌓는다.** 시안엔 높이에 `max(180, …)` 바닥이 있었는데,
   * 그러면 **자리가 부족해도 높이를 못 내려 폭이 넘친다** — 폰(390)에서 기기가 둘인 탭이
   * 실제로 417px 을 308px 자리에 밀어 넣어 잘려 있었다. 바닥을 없애면 이번엔 목업이
   * 130px 짜리로 쪼그라들어 화면 안이 안 읽힌다. 그래서 **그 밑으로 내려갈 상황이면
   * 나란히 두기를 포기하고 세로로 쌓고**, 쌓을 땐 기기마다 제 폭을 다 쓴다.
   */
  const layout = useMemo(() => {
    const narrow = w < 620
    const gap = narrow ? 14 : 22
    const pad = narrow ? 18 : 26
    /** 목업 판은 글 단과 같은 폭이다 — 판만 넓히면 글에서 떨어져 나온 것처럼 보인다 */
    const stageW = Math.min(w, PAGE_MAX) - 44
    const inner = stageW - 2 * pad
    const worstSum = 390 / 844 + 1280 / 720
    const sideH = Math.min(narrow ? 280 : 320, Math.floor((inner - gap) / worstSum))
    return { stacked: sideH < SIDE_MIN_H, height: sideH, gap, inner }
  }, [w])

  /** 쌓았을 때 기기별 크기 — 폭을 다 쓰되 종류마다 키가 너무 커지지 않게 막는다 */
  const sizeOf = useCallback(
    (kind: keyof typeof DEVICE_SIZE) => {
      const [bw, bh] = DEVICE_SIZE[kind]
      const h = layout.stacked
        ? Math.min(STACK_MAX_H[kind], Math.floor(layout.inner / (bw / bh)))
        : layout.height
      return { h, w: Math.round(bw * (h / bh)), scale: h / bh }
    },
    [layout]
  )

  const openInquiry = useCallback(() => setInquiry('any'), [])
  const openCustom = useCallback(() => setInquiry('custom'), [])

  return (
    <div className={styles.root} ref={rootRef}>
      {/* 단 폭은 `landingData.PAGE_MAX` 가 원본이다 — 목업 크기가 여기서 나와 CSS 에 또 적으면 어긋난다 */}
      <div className={styles.page} style={{ maxWidth: PAGE_MAX }}>
        <div className={styles.top}>
          <span className={styles.brand}>생일카페 페이지 커미션</span>
          <span className={styles.footerNote}>OLUCKY!</span>
        </div>

        <div className={styles.rv} data-rv>
          <h1 className={styles.h1}>
            생일카페에서 쓸 페이지를
            <br />
            행사 하나에 하나씩 만들어 드립니다
          </h1>
          <p className={styles.p}>
            카페에 오신 손님이 QR을 찍으면 폰에서 바로 열리는 페이지입니다. 앱을 깔지 않고,{' '}
            <span className={styles.mk}>주소 하나가 그 행사 하나</span>입니다. 대기 줄에서 30초 안에
            끝나도록 만들고, 기간이 끝나면 주소가 닫힙니다.
          </p>
          <p className={styles.p}>
            주문을 받으면 그날의 컨셉에 맞춰 페이지를 새로 그려서, 주소와 관리 계정을 함께 넘겨
            드립니다. 처음 여시는 분도 많아서 어떻게 쓰는지까지 같이 알려 드립니다.
          </p>
          <p className={`${styles.p} ${styles.pLast}`}>
            혼자 하는 일이라 한 번에 많이는 받지 못합니다. 그 대신 행사 동안에는 계속 붙어
            있습니다. 궁금한 것이 있으시면{' '}
            <button type="button" className={styles.link} onClick={openInquiry}>
              문의
            </button>{' '}
            쪽으로 말 걸어 주세요.
          </p>
        </div>

        <div className={styles.rule} data-rv>
          <span className={styles.ruleDots}>···</span>
        </div>

        {/* ── 만들 수 있는 것 ── */}
        <h2 className={`${styles.h2} ${styles.h2First}`} data-rv>
          만들 수 있는 것
        </h2>
        <p className={styles.lead} data-rv>
          열 가지가 실제로 돌고 있습니다. 줄을 누르시면 아래 목업에 그 페이지가 바로 뜹니다. 눌러
          보셔도 서버에는 아무것도 남지 않습니다.
        </p>

        <div className={styles.list} data-rv>
          {SERVICES.map((s, i) => (
            <button
              type="button"
              key={s.key}
              className={styles.row}
              data-on={s.key === cur || undefined}
              onClick={() => setCur(s.key)}
            >
              <span className={styles.rowNo}>{String(i + 1).padStart(2, '0')}</span>
              <span className={styles.rowBody}>
                <span className={styles.rowHead}>
                  <span className={styles.rowName}>{s.name}</span>
                  {s.devices.length > 1 && (
                    <span className={styles.rowDevices}>
                      {s.devices.map((d) => d.label.replace(/\s*\(.*\)$/, '')).join(' + ')}
                    </span>
                  )}
                </span>
                <span className={styles.rowDesc}>{s.desc}</span>
                <span className={styles.rowSlug}>{s.slug}</span>
              </span>
              <span className={styles.rowArrow}>→</span>
            </button>
          ))}
        </div>

        <p className={styles.tail} data-rv>
          여기 없는 것을 생각하고 계시다면 그것도 만들 수 있습니다. 어떤 흐름이었으면 좋겠는지{' '}
          <button type="button" className={styles.link} onClick={openCustom}>
            적어 보내 주시면
          </button>{' '}
          가능한지부터 알려 드립니다.
        </p>

        {/* ── 눌러 보기 ── */}
        <h2 className={styles.h2} data-rv>
          여기서 바로 눌러 보기
        </h2>
        <p className={styles.lead} data-rv>
          스크린샷이 아니라 실제로 도는 페이지입니다. 지금 보고 계신 것은{' '}
          <span className={styles.mk}>{service.name}</span>입니다.
        </p>

        <div className={styles.stage} data-rv>
          <span className={styles.tape} aria-hidden="true" />
          <div className={styles.tabs}>
            {SERVICES.map((s) => (
              <button
                type="button"
                key={s.key}
                className={styles.tab}
                data-on={s.key === cur || undefined}
                onClick={() => setCur(s.key)}
              >
                {s.name}
              </button>
            ))}
          </div>

          <div
            className={styles.devices}
            style={{ gap: layout.gap }}
            data-stacked={layout.stacked || undefined}
          >
            {service.devices.map((d) => {
              const [bw, bh] = DEVICE_SIZE[d.kind]
              const { h, w: fw, scale } = sizeOf(d.kind)
              return (
                <div className={styles.device} key={d.path}>
                  <div
                    className={styles.frame}
                    style={{ width: fw, height: h, borderRadius: h < 240 ? 12 : 18 }}
                  >
                    {d.kind === 'overlay' && (
                      <div className={styles.backdrop} aria-hidden="true">
                        영상 자리
                      </div>
                    )}
                    <iframe
                      src={d.path}
                      title={`${service.name} — ${d.label}`}
                      loading="lazy"
                      style={{
                        width: bw,
                        height: bh,
                        transform: `scale(${scale.toFixed(4)})`,
                        background: d.kind === 'overlay' ? 'transparent' : '#fff',
                      }}
                    />
                  </div>
                  <span className={styles.deviceLabel}>{d.label}</span>
                </div>
              )
            })}
          </div>

          <p className={styles.stageNote}>
            체험용이라 눌러도 저장되지 않습니다. 목업이 작으니 폰으로 보실 때는{' '}
            <a className={styles.link} href={service.slug} target="_blank" rel="noreferrer">
              직접 열어 보시는 편
            </a>
            이 낫습니다.
          </p>
        </div>

        {/* ── 진행 ── */}
        <h2 className={styles.h2} data-rv>
          어떻게 진행되나
        </h2>
        <div className={styles.steps}>
          {STEPS.map((p, i) => (
            <div className={styles.step} key={p.no} data-mark={p.mark || undefined} data-rv>
              <div className={styles.stepRail}>
                <span className={styles.stepNo}>{p.no}</span>
                {i < STEPS.length - 1 && <span className={styles.stepLine} />}
              </div>
              <div
                className={`${styles.stepBody} ${i === STEPS.length - 1 ? styles.stepLast : ''}`}
              >
                <div className={styles.stepHead}>
                  <span className={styles.stepName}>{p.name}</span>
                  {p.tag && <span className={styles.stepTag}>{p.tag}</span>}
                </div>
                <p className={styles.stepDesc}>{p.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── 역할 ── */}
        <h2 className={styles.h2} data-rv>
          누가 무엇을 하나
        </h2>
        <div data-rv>
          <p className={styles.p}>{ROLE_MINE}</p>
          <p className={`${styles.p} ${styles.pLast}`}>{ROLE_YOURS}</p>
          <div className={styles.note}>
            <p className={styles.noteText}>{ROLE_NOTE}</p>
          </div>
        </div>

        {/* ── 자주 묻는 것 ── */}
        <h2 className={styles.h2} data-rv>
          자주 묻는 것
        </h2>
        <div className={styles.faq} data-rv>
          {FAQS.map((f, i) => (
            <div className={styles.faqItem} key={f.q} data-open={openFaq === i || undefined}>
              <button
                type="button"
                className={styles.faqHead}
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                aria-expanded={openFaq === i}
              >
                <span className={styles.faqQ}>{f.q}</span>
                <span className={styles.faqSign} aria-hidden="true">
                  {openFaq === i ? '−' : '+'}
                </span>
              </button>
              {openFaq === i && <p className={styles.faqA}>{f.a}</p>}
            </div>
          ))}
        </div>

        {/* ── 문의 ── */}
        <h2 className={styles.h2} id="contact" data-rv>
          문의
        </h2>
        <div data-rv>
          <p className={`${styles.p} ${styles.pLast}`}>
            카카오 오픈채팅으로 받고 있습니다. 아래를 누르시면 어떤 서비스를 쓰실지 고르는 창이
            열리고, 거기서 고르시면 그에 맞는 문의 양식이 만들어집니다. 채팅에 붙여넣고 채워 보내
            주시면 금액과 일정을 알려 드립니다.
          </p>
          <button type="button" className={styles.cta} onClick={openInquiry}>
            문의하기
          </button>
        </div>

        <div className={styles.footer}>
          <span className={styles.footerNote}>© OLUCKY!</span>
        </div>
      </div>

      {/* 문의 창은 `.root` 안에 둔다 — 색 토큰이 여기서 상속된다 */}
      <InquiryModal
        open={inquiry !== null}
        preset={inquiry === 'custom' ? 'custom' : undefined}
        onClose={() => setInquiry(null)}
      />
    </div>
  )
}
