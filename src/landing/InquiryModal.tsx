import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy, ExternalLink, X } from 'lucide-react'

import type { ServiceId } from '@/data/services'
import { CUSTOM_FORM, FORM_ORDER, KAKAO_URL, NICKNAME_EXAMPLE, NICKNAME_RULE, SERVICE_FORM, buildInquiry } from './inquiry'
import styles from './InquiryModal.module.css'

/**
 * 문의 창 — **오픈채팅으로 보낼 글을 여기서 만들어 준다.**
 *
 * 폼을 서버로 받지 않는다. 우리가 저장하는 게 없으니 개인정보가 안 쌓이고, 손님은 이미 카톡을
 * 쓰고 있다. 이 창이 하는 일은 셋뿐이다 — **닉네임 규칙을 먼저 알리고**, 고른 서비스에 맞는
 * 양식을 만들고, 복사해서 채팅방을 열어 준다.
 *
 * 순서가 곧 설계다: 닉네임을 바꾸지 않으면 방에서 누가 누군지 몰라 문의가 섞인다.
 */
export function InquiryModal({
  open,
  preset,
  onClose,
}: {
  open: boolean
  /** '주문 제작 문의' 로 들어오면 그 칸이 먼저 켜져 있다 — 누른 버튼과 창이 어긋나면 안 된다 */
  preset?: 'custom'
  onClose: () => void
}) {
  const [picked, setPicked] = useState<ServiceId[]>([])
  const [custom, setCustom] = useState(false)
  const [copied, setCopied] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  const text = useMemo(() => buildInquiry(picked, custom), [picked, custom])

  /** 열릴 때마다 눌러 들어온 버튼에 맞춘다 (닫았다 다시 열면 그때의 뜻을 따른다) */
  useEffect(() => {
    if (open) setCustom(preset === 'custom')
  }, [open, preset])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    // 창이 떠 있는 동안 뒤 페이지가 스크롤되면 어디를 보고 있었는지 잃는다
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    boxRef.current?.focus()
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  useEffect(() => {
    setCopied(false)
  }, [picked, custom, open])

  if (!open) return null

  const toggle = (id: ServiceId) =>
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  /** 클립보드가 막힌 브라우저(구형 사파리·비-secure)에서도 복사가 되게 폴백을 둔다 */
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try {
        document.execCommand('copy')
      } catch {
        /* 그래도 안 되면 아래 미리보기에서 직접 긁어 가시면 된다 */
      }
      ta.remove()
    }
    setCopied(true)
  }

  return (
    <div className={styles.backdrop} onClick={onClose} data-inquiry>
      <div
        className={styles.box}
        role="dialog"
        aria-modal="true"
        aria-label="문의하기"
        tabIndex={-1}
        ref={boxRef}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className={styles.close} onClick={onClose} aria-label="닫기">
          <X size={18} strokeWidth={1.8} />
        </button>

        <p className={styles.kicker}>문의하기</p>
        <h2 className={styles.title}>카카오톡 오픈채팅으로 문의를 받고 있습니다</h2>

        <ol className={styles.steps}>
          <li>
            <b>오픈채팅방 닉네임</b>을 <b>[{NICKNAME_RULE}]</b> 형식으로 설정해 주세요. (예:{' '}
            {NICKNAME_EXAMPLE})
          </li>
          <li>원하시는 서비스(또는 주문 제작)를 선택하신 후, 하단의 양식을 복사해 주세요.</li>
          <li>
            복사한 양식을 채팅방에 붙여넣고 내용을 채워 보내주시면, 일정과 견적을 안내해 드립니다.
          </li>
        </ol>
        {/* 긴급 여부는 고르는 값이 아니라 두 날짜에서 나오는 값이다 — 양식에도 같은 문장이 들어간다 */}
        <p className={styles.hint}>
          <b>긴급 작업 여부</b>는 <b>[자료 전달 예정일]</b>과 <b>[시연/검수 희망일]</b> 사이의
          기간을 기준으로 산정됩니다.
        </p>

        <p className={styles.label}>
          문의할 서비스 <span>중복 선택이 가능합니다</span>
        </p>
        <div className={styles.chips}>
          {FORM_ORDER.map((id) => (
            <button
              type="button"
              key={id}
              className={styles.chip}
              data-on={picked.includes(id) || undefined}
              data-svc={id}
              onClick={() => toggle(id)}
              aria-pressed={picked.includes(id)}
            >
              {picked.includes(id) && <Check size={14} strokeWidth={2.4} aria-hidden="true" />}
              {SERVICE_FORM[id].name}
            </button>
          ))}
          {/* 목록에 없는 것 — 서비스가 아니라 '만들어 주세요' 라 칸을 따로 둔다 */}
          <button
            type="button"
            className={styles.chip}
            data-on={custom || undefined}
            data-svc="custom"
            onClick={() => setCustom((v) => !v)}
            aria-pressed={custom}
          >
            {custom && <Check size={14} strokeWidth={2.4} aria-hidden="true" />}
            {CUSTOM_FORM.name}
          </button>
        </div>

        <p className={styles.label}>
          보낼 양식{' '}
          <span>
            {picked.length + (custom ? 1 : 0) > 0
              ? `${picked.length + (custom ? 1 : 0)}개 항목`
              : '아직 구체적으로 정하지 못하셨어도 괜찮습니다.'}
          </span>
        </p>
        <pre className={styles.preview} data-preview>
          {text}
        </pre>

        {/* 복사·열기는 창 바닥에 붙여 둔다 — 폰에서 양식이 길어 스크롤하면 버튼이 사라진다 */}
        <div className={styles.stick}>
          <div className={styles.actions}>
            <button type="button" className={styles.copyBtn} onClick={copy} data-copy>
              {copied ? <Check size={16} strokeWidth={2.2} /> : <Copy size={16} strokeWidth={1.8} />}
              {copied ? '복사되었습니다' : '양식 복사하기'}
            </button>
            <a className={styles.kakaoBtn} href={KAKAO_URL} target="_blank" rel="noreferrer noopener" data-kakao>
              오픈채팅 열기 <ExternalLink size={15} strokeWidth={1.8} aria-hidden="true" />
            </a>
          </div>
          <p className={styles.foot}>복사하신 양식을 채팅방에 그대로 붙여넣어 주시면 됩니다.</p>
        </div>
      </div>
    </div>
  )
}
