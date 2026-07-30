import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import styles from './Pager.module.css'
import { useT } from '@/i18n'

/**
 * 페이지 나누기 — **롤링페이퍼 벽과 소원나무가 같이 쓴다.**
 *
 * 왜 필요한가: 두 화면 다 방문자가 남긴 것이 계속 쌓인다. 300개가 한 화면에 다 깔리면
 * 스크롤이 끝없이 길어지고(카페에서 폰으로 보는 화면이다), 소원나무는 등불마다 흔들림·빛번짐이
 * 있어 그리기 비용도 같이 는다. 한 화면에 **딱 보기 좋은 만큼만** 두고 넘긴다.
 *
 * 마크업은 공유하되 색은 각 앱이 `--pager-*` 로 넣는다 — 롤페 벽은 밝고 소원나무는 밤이라
 * 한 색으로 둘 다 맞출 수 없다.
 */

export interface Paged<T> {
  /** 지금 페이지에 보일 것들 */
  items: T[]
  page: number
  pages: number
  setPage: (p: number) => void
}

/**
 * **실시간으로 늘어나는 목록을 다룬다.**
 *
 * 새 글이 들어와도 보던 페이지를 빼앗지 않는다 (page 를 그대로 둔다). 다만 글이 지워져
 * 페이지 수가 줄면 범위를 벗어나므로 그때만 마지막 페이지로 당긴다.
 * 목록은 최신순이라 **1페이지가 항상 방금 남긴 것**이다 — 남기고 돌아오면 자기 것이 보인다.
 */
export function usePaged<T>(all: T[], perPage: number): Paged<T> {
  const [page, setPage] = useState(0)
  const pages = Math.max(1, Math.ceil(all.length / perPage))

  useEffect(() => {
    if (page > pages - 1) setPage(pages - 1)
  }, [page, pages])

  const items = useMemo(
    () => all.slice(page * perPage, page * perPage + perPage),
    [all, page, perPage]
  )

  return { items, page: Math.min(page, pages - 1), pages, setPage }
}

/** 페이지가 하나뿐이면 아무것도 안 그린다 — 있으나 마나 한 컨트롤은 화면만 어지럽힌다 */
export function Pager({
  page,
  pages,
  onPage,
  label = '페이지',
}: {
  page: number
  pages: number
  onPage: (p: number) => void
  label?: string
}) {
  const t = useT()
  if (pages <= 1) return null

  /**
   * 페이지가 많아도 점을 다 찍지 않는다 — 20페이지짜리 점 스무 개는 누를 수도 셀 수도 없다.
   * 7개까지는 점, 그 이상은 "3 / 12" 로 센다.
   */
  const dots = pages <= 7

  return (
    <nav className={styles.pager} aria-label={label} data-pager>
      <button
        type="button"
        className={styles.arrow}
        onClick={() => onPage(page - 1)}
        disabled={page === 0}
        aria-label={t('이전 페이지')}
      >
        <ChevronLeft size={18} strokeWidth={1.8} aria-hidden="true" />
      </button>

      {dots ? (
        <div className={styles.dots}>
          {Array.from({ length: pages }, (_, i) => (
            <button
              key={i}
              type="button"
              className={styles.dot}
              data-active={i === page || undefined}
              onClick={() => onPage(i)}
              aria-label={`${i + 1}번째 ${label}`}
              aria-current={i === page ? 'true' : undefined}
            />
          ))}
        </div>
      ) : (
        <span className={styles.count} aria-live="polite">
          <b>{page + 1}</b> / {pages}
        </span>
      )}

      <button
        type="button"
        className={styles.arrow}
        onClick={() => onPage(page + 1)}
        disabled={page === pages - 1}
        aria-label={t('다음 페이지')}
      >
        <ChevronRight size={18} strokeWidth={1.8} aria-hidden="true" />
      </button>
    </nav>
  )
}
