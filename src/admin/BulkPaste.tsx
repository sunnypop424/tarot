import { useMemo, useState } from 'react'

import { useT } from '@/i18n'

/**
 * 여러 줄 붙여넣기 — **한 개씩 만드는 걸 스무 번 하지 않게.**
 *
 * 문항 20개, 상품 8종, 선택지 10개를 만들려면 지금은 '추가' 를 그만큼 누르고 칸마다 타이핑해야
 * 한다. 그런데 주최자는 그 목록을 **이미 어딘가에 갖고 있다** — 카톡으로 주고받은 메모, 엑셀,
 * 문의 양식. 그걸 그대로 붙여 넣게 하는 게 칸을 예쁘게 만드는 것보다 훨씬 큰 차이다.
 *
 * ── 이 부품이 지키는 것 ────────────────────────────
 *
 *  1. **미리 보여주고 나서 넣는다.** 붙여넣기는 실수가 잦다(열 순서가 다르거나 헤더가 딸려온다).
 *     몇 개가 어떻게 들어갈지 먼저 보여주고, 눌러야 들어간다.
 *  2. **기존 것을 안 지운다.** 늘 **덧붙인다** — 붙여넣기가 목록을 갈아치우면 그날 손으로
 *     고친 게 사라진다. 지우는 건 지우는 버튼이 할 일이다.
 *  3. **못 읽은 줄을 말한다.** 조용히 버리면 20줄을 넣었는데 18개만 생겨도 모른다.
 *
 * 파싱은 부르는 쪽이 한다 (`parse`) — 서비스마다 줄의 뜻이 다르고, 그 지식이 여기 오면
 * 이 파일이 서비스가 늘 때마다 같이 자란다.
 */

export interface BulkResult<T> {
  /** 넣을 것들 */
  items: T[]
  /** 못 읽은 줄 — 있는 그대로 (사람이 무엇이 틀렸는지 보고 고친다) */
  skipped: string[]
}

export function BulkPaste<T>({
  label,
  placeholder,
  hint,
  parse,
  onApply,
  disabled,
  preview,
}: {
  /** '문항' · '상품' · '선택지' — 버튼과 문장에 그대로 들어간다 */
  label: string
  placeholder: string
  /** 형식 설명 한 줄 — 이게 없으면 아무도 못 쓴다 */
  hint: React.ReactNode
  parse: (text: string) => BulkResult<T>
  onApply: (items: T[]) => void | Promise<void>
  disabled?: boolean
  /** 한 개를 한 줄로 — 미리보기 목록에 쓴다 */
  preview: (item: T) => string
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  /** 타이핑할 때마다 다시 읽는다 — 붙여넣고 바로 몇 개인지 보여야 고칠 마음이 생긴다 */
  const result = useMemo(() => (text.trim() ? parse(text) : { items: [], skipped: [] }), [text, parse])

  async function apply() {
    if (result.items.length === 0 || busy) return
    setBusy(true)
    try {
      await onApply(result.items)
      setText('')
      setOpen(false)
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="ad-btn ad-btn--line ad-btn--sm"
        onClick={() => setOpen(true)}
        disabled={disabled}
        data-bulk-open
      >
        여러 개 붙여넣기
      </button>
    )
  }

  return (
    <div className="ad-bulk" data-bulk>
      <div className="ad-bulk__head">
        <span className="ad-bulk__title">{label} 여러 개 붙여넣기</span>
        <button
          type="button"
          className="ad-x"
          onClick={() => {
            setOpen(false)
            setText('')
          }}
          aria-label={t('닫기')}
        >
          ×
        </button>
      </div>

      <p className="ad-fine">{hint}</p>

      <textarea
        className="ad-input ad-bulk__area"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        rows={6}
        data-bulk-input
        /* 붙여넣는 칸이라 맞춤법 교정이 오히려 방해가 된다 */
        spellCheck={false}
      />

      {text.trim() && (
        <div className="ad-bulk__preview">
          <div className="ad-bulk__count">
            {result.items.length}개를 넣어요
            {result.skipped.length > 0 && ` · ${result.skipped.length}줄은 못 읽었어요`}
          </div>

          {result.items.length > 0 && (
            <ul className="ad-bulk__list">
              {/* 다 보여주면 화면이 길어진다 — 앞의 다섯 줄이면 형식이 맞는지 알 수 있다 */}
              {result.items.slice(0, 5).map((item, i) => (
                <li key={i}>{preview(item)}</li>
              ))}
              {result.items.length > 5 && <li className="ad-bulk__more">… 외 {result.items.length - 5}개</li>}
            </ul>
          )}

          {/**
           * **못 읽은 줄을 그대로 보여준다.** "3줄 실패" 만 적으면 어느 줄인지 찾느라
           * 처음부터 다시 본다. 원문을 보여주면 대개 눈으로 바로 안다(헤더가 딸려왔거나 구분자가 다르다).
           */}
          {result.skipped.length > 0 && (
            <ul className="ad-bulk__list ad-bulk__list--bad">
              {result.skipped.slice(0, 3).map((line, i) => (
                <li key={i}>{line}</li>
              ))}
              {result.skipped.length > 3 && (
                <li className="ad-bulk__more">… 외 {result.skipped.length - 3}줄</li>
              )}
            </ul>
          )}
        </div>
      )}

      <div className="ad-btnrow">
        <button
          type="button"
          className="ad-btn ad-btn--soft ad-btn--sm"
          onClick={() => void apply()}
          disabled={busy || result.items.length === 0}
          data-bulk-apply
        >
          {busy ? t('넣는 중…') : `${result.items.length}개 넣기`}
        </button>
        <span className="ad-fine">{t('지금 목록 아래에 덧붙어요 — 있는 걸 지우지 않아요.')}</span>
      </div>
    </div>
  )
}

/**
 * 한 줄을 칸으로 — **탭·쉼표·세로줄을 다 받는다.**
 *
 * 주최자가 어디서 복사해 오는지에 따라 구분자가 다르다: 엑셀은 탭, 메모장은 쉼표,
 * 카톡으로 받은 목록은 `|` 나 `-` 다. 하나만 받으면 "왜 안 되지" 가 되고, 그 순간 이 기능은
 * 없는 것과 같다.
 *
 * **쉼표는 이름 안에도 들어간다**(예: "포토카드, 랜덤 1종"). 그래서 탭이 하나라도 있으면
 * 탭만 구분자로 본다 — 엑셀에서 온 줄을 쉼표로 또 쪼개지 않기 위해서다.
 */
export function splitCells(line: string): string[] {
  const sep = line.includes('\t') ? /\t/ : /[|,]/
  return line.split(sep).map((c) => c.trim())
}

/** 빈 줄을 빼고 줄 단위로 — 붙여넣기는 늘 끝에 빈 줄이 딸려온다 */
export function toLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
}
