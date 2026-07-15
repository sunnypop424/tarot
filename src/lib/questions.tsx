import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import seedQuestions from '@/data/questions.json'
import { repo } from '@/lib/repo'
import { useSlot } from '@/slot/SlotProvider'
import type { Question } from '@/types/question'

type Status = 'loading' | 'ready' | 'fallback'

interface QuestionsValue {
  questions: Question[]
  status: Status
  /** 관리자에서 질문을 고친 뒤 사용자 화면을 갱신할 때 */
  reload: () => Promise<void>
}

const QuestionsContext = createContext<QuestionsValue>({
  questions: [],
  status: 'loading',
  reload: async () => {},
})

/** 번들된 씨앗 — 카페 네트워크가 불안정할 때의 마지막 방어선 */
const SEED = (seedQuestions as Question[]).filter((q) => q.published)

export function QuestionsProvider({ children }: { children: ReactNode }) {
  const { slug } = useSlot()
  const [questions, setQuestions] = useState<Question[]>([])
  const [status, setStatus] = useState<Status>('loading')

  const load = useCallback(async () => {
    try {
      setQuestions(await repo.questions.list(slug))
      setStatus('ready')
    } catch {
      // 질문을 못 불러와도 앱이 멈추면 안 된다 — 번들된 질문으로 뜬다
      setQuestions(SEED)
      setStatus('fallback')
    }
  }, [slug])

  useEffect(() => {
    void load()
  }, [load])

  const value = useMemo(
    () => ({ questions, status, reload: load }),
    [questions, status, load]
  )

  return <QuestionsContext.Provider value={value}>{children}</QuestionsContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useQuestions(): QuestionsValue {
  return useContext(QuestionsContext)
}

// eslint-disable-next-line react-refresh/only-export-components
export function useQuestion(id: string | undefined): Question | undefined {
  const { questions } = useQuestions()
  return id ? questions.find((q) => q.id === id) : undefined
}
