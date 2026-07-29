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
/**
 * 목업 테두리(베젤) 두께.
 *
 * **CSS 가 아니라 여기가 원본이다.** `box-sizing: border-box` 라 틀에 준 크기 안에 테두리가
 * 포함되는데, 화면을 그 바깥 크기로 확대하면 **테두리 밑으로 오른쪽·아래가 정확히 이만큼씩
 * 잘린다** — 실제로 12px 씩 잘려 있었다. 두 군데 적으면 또 어긋나므로 CSS 는 두께를 안 갖고
 * 여기서 인라인으로 받는다.
 */
const BEZEL = 6

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
    // 빼는 값에 베젤이 들어간다 — 기기가 둘이면 테두리가 네 겹이다
    const sideH = Math.min(narrow ? 280 : 320, Math.floor((inner - gap - 4 * BEZEL) / worstSum))
    return { stacked: sideH < SIDE_MIN_H, height: sideH, gap, inner }
  }, [w])

  /**
   * 기기 하나의 크기 — **돌려주는 `w`·`h` 는 테두리 안쪽(화면) 크기다.**
   * 틀은 여기에 베젤을 더해 그린다. 쌓았을 땐 폭을 다 쓰되 종류별 상한을 넘지 않는다.
   */
  const sizeOf = useCallback(
    (kind: keyof typeof DEVICE_SIZE) => {
      const [bw, bh] = DEVICE_SIZE[kind]
      const h = layout.stacked
        ? Math.min(
            STACK_MAX_H[kind] - 2 * BEZEL,
            Math.floor((layout.inner - 2 * BEZEL) / (bw / bh))
          )
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
          <span className={styles.brand}>생일카페 웹페이지 제작 커미션</span>
          <span className={styles.footerNote}>OLUCKY!</span>
        </div>

        <div className={styles.rv} data-rv>
          <h1 className={styles.h1}>
            생일카페를 더 특별하게 만들어 줄
            <br />
            단 하나의 웹페이지를 제작합니다
          </h1>
          <p className={styles.p}>
            카페에 방문한 팬들이 QR 코드만 찍으면 스마트폰에서 바로 열리는 전용 웹페이지입니다.
            번거로운 앱 설치 없이,{' '}
            <span className={styles.mk}>웹 페이지 하나가 곧 하나의 특별한 이벤트가 됩니다.</span> 대기
            줄에서도 30초면 참여할 수 있도록 직관적으로 설계되며, 행사 기간이 끝나면 페이지는
            안전하게 닫힙니다.
          </p>
          <p className={styles.p}>
            행사의 컨셉과 분위기에 맞춰 맞춤형으로 페이지를 디자인한 후, 전용 웹 페이지와 관리자
            계정을 함께 전달해 드립니다. 생일카페 주최가 처음이신 분들도 쉽게 운영하실 수 있도록
            꼼꼼하게 안내해 드립니다.
          </p>
          <p className={`${styles.p} ${styles.pLast}`}>
            1인 체제로 운영되어 한 번에 많은 의뢰를 받지는 못합니다. 하지만 행사 기간 동안 문제가
            생기거나 확인이 필요할 때 최대한 빠르게 대응해 드립니다. 궁금한 점이 있으시다면 언제든{' '}
            <button type="button" className={styles.link} onClick={openInquiry}>
              문의
            </button>
            를 통해 편하게 말씀해 주세요.
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
          현재 10가지의 이벤트 페이지가 준비되어 있습니다. 항목을 누르시면 아래 목업 화면에서
          페이지가 바로 실행됩니다. 체험용이므로 마음껏 눌러보셔도 서버에 기록이 남지 않으니
          안심하셔도 됩니다.
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
          목록에 없는 새로운 이벤트를 구상하고 계신가요? 원하시는 진행 방식을{' '}
          <button type="button" className={styles.link} onClick={openCustom}>
            적어 보내 주시면
          </button>{' '}
          제작 가능 여부를 친절히 안내해 드립니다.
        </p>

        {/* ── 눌러 보기 ── */}
        <h2 className={styles.h2} data-rv>
          여기서 바로 눌러 보기
        </h2>
        <p className={styles.lead} data-rv>
          단순한 스크린샷이 아닌, 실제로 구동되는 페이지입니다. 현재 선택하신{' '}
          <span className={styles.mk}>{service.name}</span>을 직접 체험해 보세요.
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
                  {/* 틀 크기 = 화면 + 베젤. 화면 크기를 그대로 주면 테두리가 화면을 덮는다 */}
                  <div
                    className={styles.frame}
                    style={{
                      width: fw + 2 * BEZEL,
                      height: h + 2 * BEZEL,
                      borderWidth: BEZEL,
                      borderRadius: h < 240 ? 12 : 18,
                    }}
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
            체험용이므로 입력하신 내용은 저장되지 않습니다. 화면이 작아 불편하시다면{' '}
            <a className={styles.link} href={service.slug} target="_blank" rel="noreferrer">
              직접 열어 보시는 편
            </a>
            을 추천합니다.
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
          {/* 앞머리를 굵게 떼어 두 문단이 '나 / 주최자' 로 갈린다는 걸 눈으로 알게 한다 */}
          <p className={styles.p}>
            <b>{ROLE_MINE.label}:</b> {ROLE_MINE.body}
          </p>
          <p className={`${styles.p} ${styles.pLast}`}>
            <b>{ROLE_YOURS.label}:</b> {ROLE_YOURS.body}
          </p>
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
            카카오톡 오픈채팅으로 문의를 받고 있습니다. 아래 버튼을 누르시면 원하시는 서비스를
            선택할 수 있는 창이 열리며, 선택에 맞춰 문의 양식이 자동 생성됩니다. 생성된 양식을
            복사하여 채팅방에 남겨주시면 금액과 일정을 안내해 드립니다.
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
