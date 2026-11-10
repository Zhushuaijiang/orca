import type { StateCreator } from 'zustand'
import type { AppState } from '../../types'
import { getAgentResumeArgv } from '../../../../../shared/agent-launch/startup/agent-resume-argv'
import type { SleepingAgentSessionRecord } from '../../../../../shared/agent-session/lifecycle/agent-session-resume'
import type { ClosedTerminalTabSnapshot } from '../../terminals/recently-closed-terminal-tabs'

export type RecentlyClosedTabKind = 'terminal' | 'browser' | 'editor'

// Cross-type history exceeds per-type cap 10; drained snapshot kinds are skipped on pop.
const MAX_RECENT_CLOSED_TAB_KINDS = 30

export function pushRecentlyClosedTabKind(
  map: Record<string, RecentlyClosedTabKind[]> | undefined,
  worktreeId: string,
  kind: RecentlyClosedTabKind,
  count = 1
): Record<string, RecentlyClosedTabKind[]> {
  // No-op pushes preserve identity for unrelated subscribers, like closeTab unread maps.
  if (count <= 0) {
    return map ?? {}
  }
  // Thousands of close-all entries beyond history cap cannot affect reopen order.
  const retainedCount = Math.min(count, MAX_RECENT_CLOSED_TAB_KINDS)
  return {
    ...map,
    [worktreeId]: [
      ...(Array(retainedCount).fill(kind) as RecentlyClosedTabKind[]),
      ...(map?.[worktreeId] ?? [])
    ].slice(0, MAX_RECENT_CLOSED_TAB_KINDS)
  }
}

export type RecentlyClosedTabsSlice = {
  /** Newest-first close order across the terminal/browser/editor reopen stacks
   *  so Cmd+Shift+T pops true cross-type MRU (Chrome/Ghostty semantics). */
  recentlyClosedTabKindsByWorktree: Record<string, RecentlyClosedTabKind[]>
  reopenClosedTab: (worktreeId: string) => boolean
  takeRecentlyClosedAgentSessions: (worktreeId: string) => SleepingAgentSessionRecord[] | null
}

export function hasRestorableAgentSession(
  snapshot: ClosedTerminalTabSnapshot | undefined
): boolean {
  return Boolean(snapshot?.agentSessions?.some(isRestorableAgentSessionRecord))
}

function isRestorableAgentSessionRecord(record: SleepingAgentSessionRecord): boolean {
  return (
    record.automaticResumeBlockedBy === undefined &&
    getAgentResumeArgv(
      record.agent,
      record.providerSession,
      record.launchConfig?.ompResumeFilePath
    ) !== null
  )
}

function removeTerminalKindAtSnapshotIndex(
  kinds: RecentlyClosedTabKind[],
  snapshotIndex: number
): RecentlyClosedTabKind[] {
  let terminalIndex = 0
  const kindIndex = kinds.findIndex((kind) => {
    if (kind !== 'terminal') {
      return false
    }
    if (terminalIndex === snapshotIndex) {
      return true
    }
    terminalIndex += 1
    return false
  })
  return kindIndex === -1 ? kinds : [...kinds.slice(0, kindIndex), ...kinds.slice(kindIndex + 1)]
}

export const createRecentlyClosedTabsSlice: StateCreator<
  AppState,
  [],
  [],
  RecentlyClosedTabsSlice
> = (set, get) => ({
  recentlyClosedTabKindsByWorktree: {},

  reopenClosedTab: (worktreeId) => {
    // Kind entries can outlive tighter/deduped snapshots; skip drained kinds, bounded by one shift per entry.
    for (;;) {
      let kind: RecentlyClosedTabKind | undefined
      set((s) => {
        const kinds = s.recentlyClosedTabKindsByWorktree[worktreeId] ?? []
        kind = kinds[0]
        if (!kind) {
          return s
        }
        return {
          recentlyClosedTabKindsByWorktree: {
            ...s.recentlyClosedTabKindsByWorktree,
            [worktreeId]: kinds.slice(1)
          }
        }
      })
      if (!kind) {
        return false
      }
      const reopened =
        kind === 'terminal'
          ? get().reopenClosedTerminalTab(worktreeId)
          : kind === 'browser'
            ? get().reopenClosedBrowserTab(worktreeId) !== null
            : get().reopenClosedEditorTab(worktreeId)
      if (reopened) {
        return true
      }
    }
  },

  takeRecentlyClosedAgentSessions: (worktreeId) => {
    let sessions: SleepingAgentSessionRecord[] | null = null
    set((s) => {
      const stack = s.recentlyClosedTerminalTabsByWorktree[worktreeId] ?? []
      const snapshotIndex = stack.findIndex(hasRestorableAgentSession)
      if (snapshotIndex === -1) {
        return s
      }
      sessions = (stack[snapshotIndex]?.agentSessions ?? []).filter(isRestorableAgentSessionRecord)
      return {
        recentlyClosedTerminalTabsByWorktree: {
          ...s.recentlyClosedTerminalTabsByWorktree,
          [worktreeId]: [...stack.slice(0, snapshotIndex), ...stack.slice(snapshotIndex + 1)]
        },
        recentlyClosedTabKindsByWorktree: {
          ...s.recentlyClosedTabKindsByWorktree,
          [worktreeId]: removeTerminalKindAtSnapshotIndex(
            s.recentlyClosedTabKindsByWorktree[worktreeId] ?? [],
            snapshotIndex
          )
        }
      }
    })
    return sessions
  }
})
