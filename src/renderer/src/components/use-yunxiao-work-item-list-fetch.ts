import { useEffect, useRef, useState } from 'react'

import type { YunxiaoListWorkItemsResult } from '../../../shared/types'
import {
  recordYunxiaoWorkItemListSession,
  restoreYunxiaoWorkItemListSession,
  sameYunxiaoWorkItemFetchInputs,
  YUNXIAO_PAGE_SIZE,
  type YunxiaoWorkItemFetchInputs
} from './task-page-yunxiao-work-item-model'

type YunxiaoWorkItemListFetchArgs = YunxiaoWorkItemFetchInputs & {
  defaultStatusesPending: boolean
}

export function useYunxiaoWorkItemListFetch({
  appliedQuery,
  category,
  defaultStatusesPending,
  page,
  refreshNonce,
  relation,
  sprintId,
  statusIds
}: YunxiaoWorkItemListFetchArgs): {
  result: YunxiaoListWorkItemsResult | null
  loading: boolean
} {
  const [restoredSession] = useState(restoreYunxiaoWorkItemListSession)
  const [result, setResult] = useState<YunxiaoListWorkItemsResult | null>(
    restoredSession?.result ?? null
  )
  const [loading, setLoading] = useState(false)
  const lastFetchInputsRef = useRef<YunxiaoWorkItemFetchInputs | null>(
    restoredSession ? { ...restoredSession, refreshNonce: 0 } : null
  )

  useEffect(() => {
    const fetchInputs: YunxiaoWorkItemFetchInputs = {
      appliedQuery,
      category,
      page,
      refreshNonce,
      relation,
      sprintId,
      statusIds
    }
    // Why: re-entering the page shows the restored list; only a refresh click or changed filters refetch.
    if (sameYunxiaoWorkItemFetchInputs(lastFetchInputsRef.current, fetchInputs)) {
      return
    }
    lastFetchInputsRef.current = fetchInputs
    let cancelled = false
    setLoading(true)
    void window.api.yunxiao
      .listWorkItems({
        filters: {
          category,
          sprintId: sprintId === 'all' ? null : sprintId,
          statusIds: statusIds.length > 0 ? statusIds : undefined,
          assigneeId: relation === 'assigned-self' ? 'self' : null,
          participantId: relation === 'participant-self' ? 'self' : null,
          query: appliedQuery,
          page,
          perPage: YUNXIAO_PAGE_SIZE
        }
      })
      .then((nextResult) => {
        if (!cancelled) {
          setResult(nextResult)
          if (nextResult.ok) {
            recordYunxiaoWorkItemListSession({
              ...fetchInputs,
              defaultStatusesPending,
              result: nextResult
            })
          }
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setResult({ ok: false, error: error instanceof Error ? error.message : String(error) })
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [
    appliedQuery,
    category,
    defaultStatusesPending,
    page,
    refreshNonce,
    relation,
    sprintId,
    statusIds
  ])

  return { result, loading }
}
