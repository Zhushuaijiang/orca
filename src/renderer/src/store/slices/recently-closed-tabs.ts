import type { StateCreator } from 'zustand'
import type { AppState } from '../types'
import {
  getAgentResumeArgv,
  type SleepingAgentSessionRecord
} from '../../../../shared/agent-session-resume'
import { runtimeEnvironmentIdForWorkspaceOwner } from '@/lib/resolve-owner'
import {
  isWindowsAbsolutePathLike,
  relativePathInsideRoot
} from '../../../../shared/cross-platform-path'
import {
  restoreRecentlyClosedTabPosition,
  type RecentlyClosedTabPosition
} from './recently-closed-tab-position'

export {
  createRecentlyClosedTabPositionIndex,
  getRecentlyClosedTabPosition,
  insertTabAtRecentlyClosedPosition,
  restoreRecentlyClosedTabPosition
} from './recently-closed-tab-position'
export type {
  RecentlyClosedTabPosition,
  RecentlyClosedTabPositionIndex
} from './recently-closed-tab-position'

/** Snapshot of a terminal tab captured at user-initiated close time. Standard
 *  reopen creates a fresh shell; explicit session restore resumes captured agents. */
export type ClosedTerminalTabSnapshot = {
  startupCwd?: string
  shellOverride?: string
  customTitle?: string
  color?: string
  position?: RecentlyClosedTabPosition
  agentSessions?: SleepingAgentSessionRecord[]
}

export type RecentlyClosedTabKind = 'terminal' | 'browser' | 'editor'

const MAX_RECENT_CLOSED_TERMINAL_TABS = 10
// Cross-type history exceeds per-type cap 10; drained snapshot kinds are skipped on pop.
const MAX_RECENT_CLOSED_TAB_KINDS = 30

// Partial single-slice test stores can omit these maps.
export function pushClosedTerminalTabSnapshot(
  map: Record<string, ClosedTerminalTabSnapshot[]> | undefined,
  worktreeId: string,
  snapshot: ClosedTerminalTabSnapshot
): Record<string, ClosedTerminalTabSnapshot[]> {
  return {
    ...map,
    [worktreeId]: [snapshot, ...(map?.[worktreeId] ?? [])].slice(0, MAX_RECENT_CLOSED_TERMINAL_TABS)
  }
}

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

export function remapClosedTerminalTabSnapshotCwds(
  snapshots: ClosedTerminalTabSnapshot[],
  oldWorktreePath: string,
  newWorktreePath: string
): ClosedTerminalTabSnapshot[] {
  return snapshots.map((snapshot) => {
    if (!snapshot.startupCwd) {
      return snapshot
    }
    const relative = relativePathInsideRoot(oldWorktreePath, snapshot.startupCwd)
    if (relative === null) {
      return snapshot
    }
    if (!relative) {
      return { ...snapshot, startupCwd: newWorktreePath }
    }
    const useBackslash =
      isWindowsAbsolutePathLike(newWorktreePath) && newWorktreePath.includes('\\')
    const separator = useBackslash ? '\\' : '/'
    const base = newWorktreePath.replace(/[\\/]+$/g, '')
    const suffix = useBackslash ? relative.replace(/\//g, '\\') : relative
    return { ...snapshot, startupCwd: `${base}${separator}${suffix}` }
  })
}

export type RecentlyClosedTabsSlice = {
  /** Newest-first snapshots of user-closed terminal tabs, per worktree. */
  recentlyClosedTerminalTabsByWorktree: Record<string, ClosedTerminalTabSnapshot[]>
  /** Newest-first close order across the terminal/browser/editor reopen stacks
   *  so Cmd+Shift+T pops true cross-type MRU (Chrome/Ghostty semantics). */
  recentlyClosedTabKindsByWorktree: Record<string, RecentlyClosedTabKind[]>
  reopenClosedTerminalTab: (worktreeId: string) => boolean
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
  recentlyClosedTerminalTabsByWorktree: {},
  recentlyClosedTabKindsByWorktree: {},

  reopenClosedTerminalTab: (worktreeId) => {
    // Skip local reopen for runtime-owned terminals: phantom shells race host snapshots; dispatcher falls through to browser/editor. Direct import avoids store cycle. Local/SSH are supported; remote terminal reopen remains deferred.
    const owner = runtimeEnvironmentIdForWorkspaceOwner(get(), { workspaceId: worktreeId })
    // Why: a twin's reopen would spawn a local shell for a tab that may have lived on the other host.
    if (owner.kind === 'ambiguous' || owner.environmentId?.trim()) {
      return false
    }
    // Atomically pop inside set or rapid reopen gestures restore the same snapshot twice.
    let snapshot: ClosedTerminalTabSnapshot | undefined
    set((s) => {
      const stack = s.recentlyClosedTerminalTabsByWorktree[worktreeId] ?? []
      snapshot = stack[0]
      if (!snapshot) {
        return s
      }
      return {
        recentlyClosedTerminalTabsByWorktree: {
          ...s.recentlyClosedTerminalTabsByWorktree,
          [worktreeId]: stack.slice(1)
        }
      }
    })
    if (!snapshot) {
      return false
    }

    const tab = get().createTab(worktreeId, snapshot.position?.groupId, snapshot.shellOverride, {
      ...(snapshot.startupCwd ? { startupCwd: snapshot.startupCwd } : {}),
      activate: true
    })
    if (snapshot.customTitle) {
      get().setTabCustomTitle(tab.id, snapshot.customTitle)
    }
    if (snapshot.color) {
      get().setTabColor(tab.id, snapshot.color)
    }
    get().setActiveTabType('terminal', worktreeId)
    restoreRecentlyClosedTabPosition(get, worktreeId, tab.id, snapshot.position)
    return true
  },

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
