import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy, ExternalLink, X } from 'lucide-react'

import type { ServiceId } from '@/data/services'
import { FORM_ORDER, KAKAO_URL, NICKNAME_EXAMPLE, NICKNAME_RULE, SERVICE_FORM, buildInquiry } from './inquiry'
import styles from './InquiryModal.module.css'

/**
 * 문의 창 — **오픈채팅으로 보낼 글을 여기서 만들어 준다.**
 *
 * 폼을 서버로 받지 않는다. 우리가 저장하는 게 없으니 개인정보가 안 쌓이고, 손님은 이미 카톡을
 * 쓰고 있다. 이 창이 하는 일은 셋뿐이다 — **별명 규칙을 먼저 알리고**, 고른 서비스에 맞는
 * 양식을 만들고, 복사해서 채팅방을 열어 준다.
 *
 * 순서가 곧 설계다: 별명을 바꾸지 않으면 방에서 누가 누군지 몰라 문의가 섞인다.
 */
export function InquiryModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [picked, setPicked] = useState<ServiceId[]>([])
  const [copied, setCopied] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  const text = useMemo(() => buildInquiry(picked), [picked])

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
  }, [picked, open])

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
        <h2 className={styles.title}>오픈채팅으로 받고 있어요</h2>

        <ol className={styles.steps}>
          <li>
            <b>오픈채팅방 별명</b>을 <b>{NICKNAME_RULE}</b> 으로 바꿔 주세요 (예: {NICKNAME_EXAMPLE})
          </li>
          <li>쓰고 싶은 서비스를 고르고 양식을 복사해 주세요</li>
          <li>채팅방에 붙여넣어 채워 보내 주시면 금액과 일정을 확정해 드려요</li>
        </ol>
        {/* 긴급 여부는 고르는 값이 아니라 두 날짜에서 나오는 값이다 — 양식에도 같은 문장이 들어간다 */}
        <p className={styles.hint}>
          <b>긴급 여부</b>는 <b>자료 전달 예정일</b>과 <b>시연/검수 희망일</b> 사이 기간으로 계산돼요.
        </p>

        <p className={styles.label}>
          문의할 서비스 <span>여러 개 고를 수 있어요</span>
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
        </div>

        <p className={styles.label}>
          보낼 양식 <span>{picked.length ? `${picked.length}개 서비스` : '아직 못 정하셨어도 괜찮아요'}</span>
        </p>
        <pre className={styles.preview} data-preview>
          {text}
        </pre>

        {/* 복사·열기는 창 바닥에 붙여 둔다 — 폰에서 양식이 길어 스크롤하면 버튼이 사라진다 */}
        <div className={styles.stick}>
          <div className={styles.actions}>
            <button type="button" className={styles.copyBtn} onClick={copy} data-copy>
              {copied ? <Check size={16} strokeWidth={2.2} /> : <Copy size={16} strokeWidth={1.8} />}
              {copied ? '복사됐어요' : '양식 복사하기'}
            </button>
            <a className={styles.kakaoBtn} href={KAKAO_URL} target="_blank" rel="noreferrer noopener" data-kakao>
              오픈채팅 열기 <ExternalLink size={15} strokeWidth={1.8} aria-hidden="true" />
            </a>
          </div>
          <p className={styles.foot}>복사한 뒤 채팅방에 그대로 붙여넣으면 됩니다.</p>
        </div>
      </div>
    </div>
  )
}
