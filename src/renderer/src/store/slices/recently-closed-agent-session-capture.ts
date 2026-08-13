import type { SleepingAgentSessionRecord } from '../../../../shared/agent-session-resume'
import type { AppState } from '../types'
import { collectSleepingAgentSessionRecordsForWorktree } from './agent-status'

export function collectRecentlyClosedAgentSessions(
  state: AppState,
  worktreeId: string,
  tabId: string
): SleepingAgentSessionRecord[] {
  const panePrefix = `${tabId}:`
  const paneKeys = [
    ...new Set(
      [
        ...Object.keys(state.agentStatusByPaneKey),
        ...Object.keys(state.retainedAgentsByPaneKey),
        ...Object.keys(state.sleepingAgentSessionsByPaneKey)
      ].filter((paneKey) => paneKey.startsWith(panePrefix))
    )
  ]
  const captured = collectSleepingAgentSessionRecordsForWorktree(state, worktreeId, {
    paneKeys,
    captureMode: 'manual-worktree-sleep'
  })
  const sessions = new Map<string, SleepingAgentSessionRecord>()
  for (const paneKey of paneKeys) {
    const existing = state.sleepingAgentSessionsByPaneKey[paneKey]
    if (existing?.worktreeId === worktreeId) {
      sessions.set(paneKey, existing)
    }
  }
  for (const [paneKey, record] of Object.entries(captured)) {
    sessions.set(paneKey, record)
  }
  return [...sessions.values()]
}
