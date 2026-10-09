import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { AUTOMATIONS_CHANGED_EVENT } from '@/lib/automations-changed-window-event'
import type { YunxiaoTodoPoolItem } from '../../../shared/yunxiao-types'
import type { YunxiaoListView } from './task-page-yunxiao-work-item-model'

export function useYunxiaoTodoPool(refreshNonce: number, view: YunxiaoListView) {
  const [todoPool, setTodoPool] = useState<YunxiaoTodoPoolItem[]>([])
  const [todoPoolLoading, setTodoPoolLoading] = useState(false)
  const [eventNonce, setEventNonce] = useState(0)
  useEffect(() => {
    const refresh = (): void => setEventNonce((value) => value + 1)
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') {
        refresh()
      }
    }
    window.addEventListener(AUTOMATIONS_CHANGED_EVENT, refresh)
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener(AUTOMATIONS_CHANGED_EVENT, refresh)
      window.removeEventListener('focus', onVisible)
      document.removeEventListener('visibilitychange', onVisible)
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
  }, [refreshNonce, view, eventNonce])
  return { todoPool, setTodoPool, todoPoolLoading }
}
