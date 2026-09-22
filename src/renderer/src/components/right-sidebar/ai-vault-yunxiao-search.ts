import { useEffect, useMemo, useRef, useState } from 'react'
import type { AiVaultScope, AiVaultSession } from '../../../../shared/ai-vault-types'

// Why: index hits live outside the recency-capped scan list; the main process
// owns the incremental transcript index, so the tab queries it per keystroke.
export function useYunxiaoSessionSearch(active: boolean, query: string): AiVaultSession[] {
  const [hits, setHits] = useState<AiVaultSession[]>([])
  const requestIdRef = useRef(0)

  useEffect(() => {
    if (!active) {
      setHits([])
      return
    }
    const timer = setTimeout(() => {
      const requestId = requestIdRef.current + 1
      requestIdRef.current = requestId
      window.api.aiVault
        .searchYunxiaoSessions({ yunxiaoId: query })
        .then((result) => {
          if (requestIdRef.current === requestId) {
            setHits(result.sessions)
          }
        })
        .catch(() => undefined)
    }, 250)
    return () => clearTimeout(timer)
  }, [active, query])

  return hits
}

// Index hits live outside both the recency-capped scan list and the transcript
// search index; merge them by id and let the shared yunxiao matcher re-filter
// the combined list in the panel.
export function useYunxiaoAugmentedSessions(
  base: readonly AiVaultSession[],
  scope: AiVaultScope,
  query: string
): readonly AiVaultSession[] {
  const active = scope === 'yunxiao' && query.trim().length > 0
  const yunxiaoHits = useYunxiaoSessionSearch(active, query)
  return useMemo(() => {
    if (!active || yunxiaoHits.length === 0) {
      return base
    }
    const known = new Set(base.map((session) => session.id))
    return [...base, ...yunxiaoHits.filter((hit) => !known.has(hit.id))]
  }, [base, yunxiaoHits, active])
}
