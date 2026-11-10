import { useAppStore } from '@/store'
import { activateAndRevealWorktree } from '../../lib/workspace/activation/worktree-activation'
import { launchSleepingAgentSession } from '../../lib/agent-session/resume/sleeping-agent-session-launch'
import { isResumableTuiAgent } from '../../../../shared/agent-session/lifecycle/agent-session-resume'
import { dismissStaleAgentRowByKey } from '../terminal-pane/agent-status/stale-agent-row'

export function activateRetainedAgentRow(args: {
  worktreeId: string
  tabId: string
  paneKey: string
  activateLiveTab: (tabId: string, paneKey: string) => void
}): void {
  const { worktreeId, tabId, paneKey, activateLiveTab } = args
  const state = useAppStore.getState()
  if ((state.tabsByWorktree[worktreeId] ?? []).some((t) => t.id === tabId)) {
    activateLiveTab(tabId, paneKey)
    return
  }
  const retained = state.retainedAgentsByPaneKey[paneKey]
  const providerSession = retained?.entry.providerSession
  if (
    !retained ||
    retained.worktreeId !== worktreeId ||
    !providerSession ||
    !isResumableTuiAgent(retained.agentType)
  ) {
    dismissStaleAgentRowByKey(paneKey)
    return
  }
  activateAndRevealWorktree(worktreeId)
  launchSleepingAgentSession({
    paneKey,
    tabId,
    worktreeId,
    agent: retained.agentType,
    providerSession,
    prompt: retained.entry.prompt,
    state: retained.entry.state,
    capturedAt: Date.now(),
    updatedAt: retained.entry.updatedAt,
    terminalTitle: retained.entry.terminalTitle,
    lastAssistantMessage: retained.entry.lastAssistantMessage,
    interrupted: retained.entry.interrupted,
    connectionId: retained.entry.connectionId
  })
}
