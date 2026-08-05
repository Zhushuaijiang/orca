import { useEffect, useRef, useState } from 'react'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'

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
