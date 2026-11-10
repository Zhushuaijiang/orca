import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { AUTOMATIONS_CHANGED_EVENT } from '@/lib/automations-changed-window-event'
import type { YunxiaoTodoPoolItem } from '../../../shared/yunxiao-types'

export function useYunxiaoTodoPool(refreshNonce: number) {
  const [todoPool, setTodoPool] = useState<YunxiaoTodoPoolItem[]>([])
  const [todoPoolLoading, setTodoPoolLoading] = useState(false)
  const [eventNonce, setEventNonce] = useState(0)
  useEffect(() => {
    const refresh = (): void => setEventNonce((value) => value + 1)
    window.addEventListener(AUTOMATIONS_CHANGED_EVENT, refresh)
    return () => {
      window.removeEventListener(AUTOMATIONS_CHANGED_EVENT, refresh)
    }
  }, [])
  useEffect(() => {
    let cancelled = false
    setTodoPoolLoading(true)
    void window.api.yunxiao
      .listTodoPool()
      .then((items) => {
        if (!cancelled) {
          setTodoPool(items)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : String(error))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setTodoPoolLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [refreshNonce, eventNonce])
  return { todoPool, setTodoPool, todoPoolLoading }
}
