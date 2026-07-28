import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  BarChart3,
  Check,
  GraduationCap,
  Frame,
  Gift,
  Lamp,
  Layers,
  MessageSquare,
  Plus,
  Stamp,
  StickyNote,
  WalletCards,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import {
  DEVICES,
  FAQS,
  GROUPS,
  HERO_FACTS,
  OURS,
  SERVICES,
  STEPS,
  THEIRS,
  type DemoScreen,
} from './landingData'
import { InquiryModal } from './InquiryModal'
import styles from './Landing.module.css'

/**
 * 배포 루트(`/`) 랜딩 — **제품을 소개하고 체험 슬롯으로 보낸다.**
 *
 * 예전엔 여기가 404 였다. 슬러그로만 들어오는 구조라 루트에 아무것도 없었는데, 파는 물건이
 * 생겼으니 파는 자리가 있어야 한다.
 *
 * **슬롯 목록은 여기에 없다** (CLAUDE.md). 뜨는 주소는 전부 체험 슬롯(`/demo-*`)이고,
 * 고객 이벤트 주소는 랜딩 어디에도 나오지 않는다.
 *
 * 체험 섹션은 **스크린샷이 아니라 진짜 페이지**를 iframe 으로 띄운다. 기기가 여럿인 서비스
 * (영상회·롤페·소원나무)는 화면을 **나란히** 보여주고, 좁은 화면에서는 골라서 본다.
 * **무대 높이는 고정**이다 — 기기마다 비율이 달라 높이를 내용에 맡기면 탭을 옮길 때마다
 * 페이지가 통째로 튄다.
 */

const ICONS: Record<string, LucideIcon> = {
  tarot: WalletCards,
  luckydraw: Gift,
  photocard: Layers,
  rolling: StickyNote,
  wish: Lamp,
  photozone: Frame,
  cheer: MessageSquare,
  poll: BarChart3,
  stamp: Stamp,
  quiz: GraduationCap,
}

/** 무대 안쪽 높이 — CSS 의 `.stage` 높이에서 패딩·라벨을 뺀 값 */
const STAGE_H = 520
const STAGE_H_NARROW = 448

export default function Landing() {
  const [active, setActive] = useState(SERVICES[0].key)
  const [openFaq, setOpenFaq] = useState<number | null>(0)
  /** 문의는 오픈채팅으로 받는다 — 창이 양식을 만들어 주고 보내는 건 손님의 카톡이 한다 */
  const [inquiry, setInquiry] = useState(false)
  const openInquiry = useCallback(() => setInquiry(true), [])
  /** 좁은 화면에서 화면이 여럿일 때 뭘 볼지 (넓으면 둘 다 나란히 뜬다) */
  const [screenIdx, setScreenIdx] = useState(0)
  /**
   * 화면 **안에서** 고른 갈래 (영상회 상영 화면 = 오버레이 / 엔딩크레딧).
   * 기기별로 따로 기억한다 — 화면 하나를 바꿨다고 옆 기기까지 바뀌면 안 된다.
   */
  const [variant, setVariant] = useState<Record<string, number>>({})
  const [vw, setVw] = useState(() => (typeof window === 'undefined' ? 1280 : window.innerWidth))
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onResize = () => setVw(document.documentElement.clientWidth || window.innerWidth)
    onResize()
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
      { threshold: 0.14, rootMargin: '0px 0px -6% 0px' }
    )
    els.forEach((el) => io.observe(el))
    // 관찰이 어떤 이유로든 안 걸리면(스크롤 없는 짧은 화면) 1초 뒤 그냥 보여준다
    const t = window.setTimeout(() => els.forEach((el) => el.setAttribute('data-in', '')), 1000)
    return () => {
      io.disconnect()
      clearTimeout(t)
    }
  }, [])

  const service = useMemo(() => SERVICES.find((s) => s.key === active) ?? SERVICES[0], [active])

  /** 서비스를 바꾸면 화면 고르기도 처음으로 (남아 있으면 없는 화면을 가리킨다) */
  const pick = useCallback((key: string) => {
    setActive(key)
    setScreenIdx(0)
    setVariant({})
  }, [])

  /** 화면의 지금 갈래 (기본은 첫 번째) */
  const variantOf = (sc: DemoScreen) => sc.variants[Math.min(variant[sc.label] ?? 0, sc.variants.length - 1)]

  const wide = vw >= 900
  /** 넓으면 화면 둘을 나란히, 좁으면 고른 하나만 */
  const sideBySide = service.screens.length > 1 && vw >= 1000
  const shown: DemoScreen[] = sideBySide ? service.screens : [service.screens[Math.min(screenIdx, service.screens.length - 1)]]

  /**
   * **갈래 버튼은 한 기기에만 붙는데 기기는 나란히 선다** — 그대로 두면 버튼이 붙은 쪽 기둥만
   * 길어져 가운데 정렬이 어긋난다(영상회: 폰이 상영 화면보다 내려앉는다). 그래서 버튼이
   * 하나라도 있으면 **모든 기둥의 발치 높이를 같이 잡고**, 무대 높이에서 그만큼 뺀다.
   */
  const hasPicker = shown.some((sc) => sc.variants.length > 1)
  const footH = hasPicker ? 42 : 0
  const stageH = (vw >= 600 ? STAGE_H : STAGE_H_NARROW) - footH

  /**
   * **기기 높이를 같게 맞춘다.**
   *
   * 먼저 전부 무대 높이에 맞춰 키우고(같은 높이), 그 폭의 합이 무대를 넘치면 넘친 만큼
   * 다 같이 줄인다 — 폭을 반씩 나눠 주면 16:9 화면만 작아져 "작은 모니터" 처럼 보인다.
   */
  const stageW = Math.min(vw - 44, 1136) - (wide ? 240 + 44 : 0) - 80
  const gap = 20
  const widthAtFullHeight = shown.reduce((a, sc) => a + DEVICES[sc.device].w * (stageH / DEVICES[sc.device].h), 0)
  const total = widthAtFullHeight + gap * (shown.length - 1)
  const shrink = total > stageW ? stageW / total : 1

  return (
    <div className={styles.root} ref={rootRef}>
      {/* ── 상단 바 ── */}
      <div className={styles.nav}>
        <div className={styles.navInner}>
          <span className={styles.brand}>OLUCKY!</span>
          <div className={styles.navLinks}>
            <a className={styles.navLink} href="#services">
              서비스
            </a>
            <a className={styles.navLink} href="#demo">
              체험
            </a>
            <button type="button" className={`${styles.navCta} ${styles.asBtn}`} onClick={openInquiry} data-inquiry-open>
              문의하기
            </button>
          </div>
        </div>
      </div>

      {/* ── 히어로 ── */}
      <div className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.heroGrid} aria-hidden="true" />
        <div className={styles.heroInner}>
          <div className={styles.rv} data-rv>
            <span className={styles.badge}>생일카페 · 팬 이벤트 페이지</span>
          </div>
          <h1 className={`${styles.h1} ${styles.rv}`} data-rv>
            최애의 하루를,
            <br />
            <em>한 페이지에 담아요.</em>
          </h1>
          <p className={`${styles.lead} ${styles.rv}`} data-rv>
            QR 하나면 카페에 온 팬들이 카드를 뽑고, 한마디를 남기고, 인증샷을 챙겨 가요.
            페이지는 그날의 컨셉에 맞춰 새로 그려집니다.
          </p>
          <div className={`${styles.ctaRow} ${styles.rv}`} data-rv>
            <a className={styles.ctaDark} href="#services">
              서비스 둘러보기
            </a>
            <button type="button" className={`${styles.ctaGhost} ${styles.asBtn}`} onClick={openInquiry} data-inquiry-open>
              문의하기
            </button>
          </div>

          <div className={`${styles.facts} ${styles.rv}`} data-rv>
            {HERO_FACTS.map((f) => (
              <div className={styles.fact} key={f.k}>
                <span className={styles.factK}>{f.k}</span>
                <span className={styles.factV}>{f.v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 서비스 ── */}
      <div className={`${styles.section} ${styles.sectionSoft}`} id="services">
        <div className={styles.sectionInner}>
          <div className={`${styles.head} ${styles.rv}`} data-rv>
            <div className={styles.eyebrow}>01 — SERVICES</div>
            <h2 className={styles.h2}>이런 걸로 그날을 채워요</h2>
            <p className={styles.sub}>필요한 것만 골라 한 슬롯에 담아요. 전부 지금 눌러 볼 수 있어요.</p>
          </div>

          <div className={styles.groups}>
            {GROUPS.map((g, gi) => (
              <div className={styles.rv} data-rv key={g.name}>
                <div className={styles.groupHead}>
                  <span className={styles.groupName}>{g.name}</span>
                  <span className={styles.groupHint}>{g.hint}</span>
                </div>
                <div className={styles.cards}>
                  {SERVICES.filter((s) => s.group === gi).map((s) => {
                    const Icon = ICONS[s.key] ?? Layers
                    const no = `0${SERVICES.indexOf(s) + 1}`.slice(-2)
                    return (
                      <button
                        type="button"
                        className={styles.card}
                        key={s.key}
                        onClick={() => {
                          pick(s.key)
                          document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                        }}
                        data-service={s.key}
                      >
                        <div className={styles.cardTop}>
                          <span className={styles.cardIcon}>
                            <Icon size={20} strokeWidth={1.7} aria-hidden="true" />
                          </span>
                          <span className={styles.cardNo}>{no}</span>
                        </div>
                        <div style={{ flex: 1 }}>
                          <div className={styles.cardName}>{s.name}</div>
                          <p className={styles.cardDesc}>{s.desc}</p>
                        </div>
                        <div className={styles.cardFoot}>
                          <span className={styles.dot} aria-hidden="true" />
                          <span className={styles.cardDevice}>{s.deviceNote}</span>
                        </div>
                        <span className={styles.cardLink}>
                          체험해보기 <ArrowRight size={15} strokeWidth={1.8} aria-hidden="true" />
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className={`${styles.custom} ${styles.rv}`} data-rv>
            <div style={{ minWidth: 'min(100%, 20em)' }}>
              <div className={styles.customTitle}>여기 없는 것도 만들어요</div>
              <p className={styles.customBody}>
                생각해 둔 기획이 있다면 그 행사에만 쓰는 페이지로 새로 만들어요.
              </p>
            </div>
            <button
              type="button"
              className={`${styles.customCta} ${styles.asBtn}`}
              onClick={openInquiry}
              data-inquiry-open
            >
              주문 제작 문의하기 <ArrowRight size={15} strokeWidth={1.8} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* ── 체험 ── */}
      <div className={styles.section} id="demo">
        <div className={styles.sectionInner}>
          <div className={`${styles.head} ${styles.rv}`} data-rv>
            <div className={styles.eyebrow}>02 — DEMO</div>
            <h2 className={styles.h2}>지금 이 자리에서 열어 보세요</h2>
            <p className={styles.sub}>그림이 아니라 진짜로 도는 페이지예요.</p>
          </div>

          <div className={styles.demoGrid}>
            <div className={styles.tabs}>
              {SERVICES.map((s) => (
                <button
                  type="button"
                  key={s.key}
                  className={styles.tab}
                  data-on={s.key === active || undefined}
                  onClick={() => pick(s.key)}
                  data-demo-tab={s.key}
                >
                  <span className={styles.tabDot} aria-hidden="true" />
                  {s.name}
                  <span className={styles.tabDevice}>{s.screens.length > 1 ? `화면 ${s.screens.length}개` : DEVICES[s.screens[0].device].label}</span>
                </button>
              ))}
            </div>

            <div className={styles.demoMain}>
              <div className={styles.demoTitle}>
                <span className={styles.demoName}>{service.name}</span>
                <span className={styles.demoChip}>{service.deviceNote}</span>
                <span className={styles.demoNote}>{service.desc}</span>
              </div>

              {/* 화면이 여럿인데 나란히 못 놓는 폭이면 골라서 본다 */}
              {service.screens.length > 1 && !sideBySide && (
                <div className={styles.screenPicker}>
                  {service.screens.map((sc, i) => (
                    <button
                      type="button"
                      key={sc.label}
                      className={styles.screenBtn}
                      data-on={i === screenIdx || undefined}
                      onClick={() => setScreenIdx(i)}
                    >
                      {sc.label}
                    </button>
                  ))}
                </div>
              )}

              <div className={styles.stage} data-stage>
                {shown.map((sc) => {
                  const dev = DEVICES[sc.device]
                  const v = variantOf(sc)
                  /**
                   * **높이를 먼저 맞춘다.** 무대 높이가 고정이라 기기를 높이에 맞춰 줄이고,
                   * 그래도 폭이 넘치면 폭으로 한 번 더 줄인다 — 그래야 무대 밖으로 안 나간다.
                   */
                  const scale = (stageH / dev.h) * shrink
                  return (
                    <div className={styles.device} key={sc.label}>
                      <div
                        className={styles.mockOuter}
                        style={{ width: Math.round(dev.w * scale), height: Math.round(dev.h * scale) }}
                      >
                        <div
                          className={styles.mockScale}
                          style={{ width: dev.w, height: dev.h, transform: `scale(${scale.toFixed(3)})` }}
                        >
                          <div
                            className={styles.mockShell}
                            style={{ width: dev.w, height: dev.h, borderRadius: dev.radius }}
                            data-transparent={sc.transparent || undefined}
                          >
                            <div className={styles.placeholder}>
                              <span style={{ fontSize: Math.round(15 / scale), fontWeight: 700 }}>{service.name}</span>
                              <span style={{ fontSize: Math.round(12 / scale), lineHeight: 1.6 }}>
                                {sc.transparent ? '영상 자리 — 실제 상영 영상은 넣지 않았어요' : '체험 페이지를 여는 중이에요'}
                              </span>
                            </div>
                            <iframe
                              className={styles.frame}
                              /* 갈래를 바꾸면 iframe 을 새로 띄운다 (src 만 갈면 뒤로가기 이력이 쌓인다) */
                              key={v.path}
                              src={v.path}
                              title={`${service.name} ${v.label} 체험`}
                              loading="lazy"
                              style={{ width: dev.w, height: dev.h }}
                            />
                          </div>
                        </div>
                      </div>
                      {/* 발치 — 버튼이 없는 기기도 같은 높이를 차지해야 기기들이 나란히 선다 */}
                      <div className={styles.deviceFoot} data-reserve={hasPicker || undefined}>
                        {/* 라벨과 기기 이름이 같으면 한 번만 적는다 ('상영 화면 · 상영 화면' 이 됐다) */}
                        <span className={styles.deviceLabel}>
                          {sc.label === dev.label ? sc.label : `${sc.label} · ${dev.label}`}
                        </span>
                        {/* 한 기기가 여러 화면을 쓰면 그 기기 아래에서 고른다 (영상회 상영 화면) */}
                        {sc.variants.length > 1 && (
                          <div className={styles.screenPicker}>
                            {sc.variants.map((opt, i) => (
                              <button
                                type="button"
                                key={opt.path}
                                className={styles.screenBtn}
                                data-on={(variant[sc.label] ?? 0) === i || undefined}
                                onClick={() => setVariant((prev) => ({ ...prev, [sc.label]: i }))}
                                data-variant={opt.path}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className={styles.demoFoot}>
                <div className={styles.demoFootText}>
                  체험용이라 마음껏 눌러도 실제로 저장되지 않아요. 샘플 데이터가 들어 있는 전용 슬롯이에요.
                </div>
                <a
                  className={styles.demoFootLink}
                  href={variantOf(shown[0]).path}
                  target="_blank"
                  rel="noreferrer"
                  data-demo-open
                >
                  새 탭에서 크게 열기 <ArrowRight size={15} strokeWidth={1.8} aria-hidden="true" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── 진행 ── */}
      <div className={`${styles.section} ${styles.sectionSoft}`}>
        <div className={styles.sectionInner}>
          <div className={`${styles.eyebrow} ${styles.rv}`} data-rv>
            03 — PROCESS
          </div>
          <h2 className={`${styles.h2} ${styles.rv}`} data-rv>
            그날까지 이렇게 준비해요
          </h2>
          <div className={styles.steps}>
            <div className={styles.stepRail} aria-hidden="true" />
            {STEPS.map((p) => (
              <div className={`${styles.step} ${styles.rv}`} data-rv key={p.no}>
                <div>
                  <span className={styles.stepNode}>{p.no}</span>
                </div>
                <div>
                  <div className={styles.stepName}>{p.name}</div>
                  <p className={styles.stepDesc}>{p.desc}</p>
                  <div className={styles.stepMeta}>{p.meta}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 역할 ── */}
      <div className={styles.section}>
        <div className={styles.sectionInner}>
          <div className={`${styles.eyebrow} ${styles.rv}`} data-rv>
            04 — ROLES
          </div>
          <h2 className={`${styles.h2} ${styles.rv}`} data-rv>
            이건 우리 몫, 저건 주최자 몫
          </h2>
          <div className={styles.roles}>
            <div className={`${styles.roleCard} ${styles.roleOurs} ${styles.rv}`} data-rv>
              <div className={styles.roleTop}>
                <span>SLOT</span>
                <span>04 / A</span>
              </div>
              <div className={styles.roleTitle}>우리 몫</div>
              <div className={styles.roleList}>
                {OURS.map((t, i) => (
                  <div className={styles.roleRow} key={t}>
                    <span className={styles.roleNo}>{`0${i + 1}`.slice(-2)}</span>
                    <span className={styles.roleText}>{t}</span>
                    <Check size={16} strokeWidth={2} aria-hidden="true" style={{ opacity: 0.7 }} />
                  </div>
                ))}
              </div>
            </div>

            <div className={`${styles.roleDivider} ${styles.rv}`} data-rv>
              <span className={styles.roleDividerChip}>그리고</span>
            </div>

            <div className={`${styles.roleCard} ${styles.roleTheirs} ${styles.rv}`} data-rv>
              <div className={styles.roleTop}>
                <span>HOST</span>
                <span>04 / B</span>
              </div>
              <div className={styles.roleTitle}>주최자 몫</div>
              <div className={styles.roleList}>
                {THEIRS.map((t, i) => (
                  <div className={styles.roleRow} key={t}>
                    <span className={styles.roleNo}>{`0${i + 1}`.slice(-2)}</span>
                    <span className={styles.roleText}>{t}</span>
                    <Check size={16} strokeWidth={2} aria-hidden="true" style={{ opacity: 0.45 }} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── FAQ ── */}
      <div className={`${styles.section} ${styles.sectionSoft}`}>
        <div className={styles.faqGrid}>
          <div className={styles.rv} data-rv>
            <div className={styles.eyebrow}>05 — FAQ</div>
            <h2 className={styles.h2}>자주 묻는 것</h2>
            <p className={styles.sub}>여기 없는 게 궁금하면 바로 물어보세요.</p>
            <button
              type="button"
              className={styles.asBtn}
              onClick={openInquiry}
              data-inquiry-open
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                marginTop: 16,
                padding: 0,
                fontSize: 14,
                fontWeight: 700,
                color: 'var(--accent)',
              }}
            >
              문의하기 <ArrowRight size={15} strokeWidth={1.8} aria-hidden="true" />
            </button>
          </div>

          <div className={`${styles.faqList} ${styles.rv}`} data-rv>
            {FAQS.map((f, i) => (
              <div className={styles.faqRow} key={f.q} data-open={openFaq === i || undefined}>
                <button
                  type="button"
                  className={styles.faqBtn}
                  onClick={() => setOpenFaq((n) => (n === i ? null : i))}
                  aria-expanded={openFaq === i}
                >
                  <span className={styles.faqNo}>{`0${i + 1}`.slice(-2)}</span>
                  <span className={styles.faqQ}>{f.q}</span>
                  <span className={styles.faqIcon}>
                    <Plus size={18} strokeWidth={1.8} aria-hidden="true" />
                  </span>
                </button>
                {openFaq === i && <p className={styles.faqA}>{f.a}</p>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 문의 ── */}
      <div className={styles.section} id="contact">
        <div className={styles.contact}>
          <h2 className={`${styles.contactTitle} ${styles.rv}`} data-rv>
            여는 날짜가 정해졌다면,
            <br />
            그때 이야기해요.
          </h2>
          <p className={`${styles.contactBody} ${styles.rv}`} data-rv>
            문의는 <b>카카오 오픈채팅</b>으로 받아요. 어떤 서비스를 쓸지 아직 몰라도 괜찮아요 —
            언제, 누구의 하루인지만 알려 주세요.
          </p>
          <div className={`${styles.contactRow} ${styles.rv}`} data-rv>
            <button type="button" className={`${styles.ctaDark} ${styles.asBtn}`} onClick={openInquiry} data-inquiry-open>
              오픈채팅으로 문의하기
            </button>
            <a className={styles.ctaGhost} href="#demo">
              체험 페이지 둘러보기
            </a>
          </div>
        </div>
      </div>

      <div className={styles.footer}>
        <div className={styles.footerInner}>
          <span className={styles.brand}>OLUCKY!</span>
          <span className={styles.footerNote}>하루짜리 행사에도 페이지 하나. 준비는 우리가, 그날은 주최자가.</span>
        </div>
      </div>

      {/* 문의 창은 `.root` 안에 둔다 — 색 토큰이 여기서 상속된다 */}
      <InquiryModal open={inquiry} onClose={() => setInquiry(false)} />
    </div>
  )
}
