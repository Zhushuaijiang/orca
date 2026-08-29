import { useCallback, useEffect, useState } from 'react'
import { useAppStore } from '@/store'
import { hasRestorableAgentSession } from '@/store/slices/recently-closed-tabs'
import { restoreRecentlyClosedAgentSession } from './worktree-closed-agent-session'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'
import {
  notifyVaultSessionRestoreFailure,
  restoreAiVaultSession,
  scanLatestRestorableVaultSession,
  scanRestorableVaultSessions
} from './worktree-ai-vault-session-restore'
import {
  EMPTY_RECENTLY_CLOSED_TERMINAL_TABS,
  selectMenuScopedMap
} from './worktree-context-menu-policy'

export type WorktreeVaultSessionRestore = {
  canRestoreSession: boolean
  handleRestoreSession: () => void
  handleRestoreSpecificSession: (session: AiVaultSession) => void
  vaultRestoreSessions: AiVaultSession[]
}

export function useWorktreeVaultSessionRestore({
  worktreeId,
  menuOpen,
  isMultiContext
}: {
  worktreeId: string
  menuOpen: boolean
  isMultiContext: boolean
}): WorktreeVaultSessionRestore {
  const [vaultRestoreSession, setVaultRestoreSession] = useState<AiVaultSession | null>(null)
  const [vaultRestoreSessions, setVaultRestoreSessions] = useState<AiVaultSession[]>([])
  const recentlyClosedTerminalTabsByWorktree = useAppStore((s) =>
    selectMenuScopedMap(
      menuOpen,
      s.recentlyClosedTerminalTabsByWorktree,
      EMPTY_RECENTLY_CLOSED_TERMINAL_TABS
    )
  )
  const hasRecentlyClosedAgentSession = (
    recentlyClosedTerminalTabsByWorktree[worktreeId] ?? []
  ).some(hasRestorableAgentSession)
  const canRestoreSession = hasRecentlyClosedAgentSession || vaultRestoreSessions.length > 0

  useEffect(() => {
    if (!menuOpen || isMultiContext || hasRecentlyClosedAgentSession) {
      setVaultRestoreSession(null)
      return
    }
    let cancelled = false
    void scanLatestRestorableVaultSession(worktreeId)
      .then((session) => {
        if (!cancelled) {
          setVaultRestoreSession(session)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setVaultRestoreSession(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [hasRecentlyClosedAgentSession, isMultiContext, menuOpen, worktreeId])

  useEffect(() => {
    if (!menuOpen || isMultiContext || hasRecentlyClosedAgentSession) {
      setVaultRestoreSessions([])
      return
    }
    let cancelled = false
    void scanRestorableVaultSessions(worktreeId)
      .then((sessions) => {
        if (!cancelled) {
          setVaultRestoreSessions(sessions)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setVaultRestoreSessions([])
        }
      })
    return () => {
      cancelled = true
    }
  }, [hasRecentlyClosedAgentSession, isMultiContext, menuOpen, worktreeId])

  const handleRestoreSession = useCallback(() => {
    if (restoreRecentlyClosedAgentSession(worktreeId) > 0) {
      return
    }
    const session = vaultRestoreSession ?? vaultRestoreSessions[0]
    if (!session) {
      return
    }
    void restoreAiVaultSession(worktreeId, session).catch(notifyVaultSessionRestoreFailure)
  }, [vaultRestoreSession, vaultRestoreSessions, worktreeId])

  const handleRestoreSpecificSession = useCallback(
    (session: AiVaultSession) => {
      void restoreAiVaultSession(worktreeId, session).catch(notifyVaultSessionRestoreFailure)
    },
    [worktreeId]
  )

  return {
    canRestoreSession,
    handleRestoreSession,
    handleRestoreSpecificSession,
    vaultRestoreSessions
  }
}
