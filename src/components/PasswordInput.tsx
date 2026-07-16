import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

import styles from './PasswordInput.module.css'

/**
 * 비밀번호 입력 — 눈으로 껐다 켠다.
 *
 * **두 화면이 같이 쓴다** (최고관리자의 주최자 계정 만들기, 주최자의 비밀번호 바꾸기).
 * `owner/` 는 lazy 청크라 `admin/` 이 거기서 가져오면 번들이 섞인다 — 그래서 여기 있다.
 *
 * 가리는 게 기본이지만 껐다 켤 수 있어야 하는 이유: 이 앱에서 비밀번호를 치는 사람은
 * **자기가 정한 값을 남에게 전달하려는 최고관리자**이거나, **받아 적은 임시 비번을 옮기는
 * 주최자**다. 둘 다 오타를 눈으로 확인해야 하는 상황이라 가려두기만 하면 곤란하다.
 */

/** 함수도 같은 값을 요구한다 (`supabase/functions/admin/index.ts`) */
export const MIN_PASSWORD = 8

export function PasswordInput({
  value,
  onChange,
  placeholder,
  disabled,
  ...rest
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  disabled?: boolean
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>) {
  const [shown, setShown] = useState(false)
  return (
    <div className={styles.field}>
      <input
        {...rest}
        type={shown ? 'text' : 'password'}
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
      />
      <button
        type="button"
        className={styles.toggle}
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? '비밀번호 숨기기' : '비밀번호 보기'}
        aria-pressed={shown}
      >
        {shown ? (
          <EyeOff size={18} strokeWidth={2} aria-hidden="true" />
        ) : (
          <Eye size={18} strokeWidth={2} aria-hidden="true" />
        )}
      </button>
    </div>
  )
}
