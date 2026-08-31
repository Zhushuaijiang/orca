import { useAppStore } from '@/store'
import { activateTabAndFocusPane } from '@/lib/activate-tab-and-focus-pane'
import { launchSleepingAgentSession } from '@/lib/sleeping-agent-session-launch'
import {
  activateAndRevealFolderWorkspace,
  activateAndRevealWorktree
} from '@/lib/worktree-activation'
import type { AiVaultSession } from '../../../shared/ai-vault-types'
import type { SleepingAgentSessionRecord } from '../../../shared/agent-session-resume'
import { parsePaneKey } from '../../../shared/stable-pane-id'
import { parseWorkspaceKey } from '../../../shared/workspace-scope'

function activateWorkspace(workspaceId: string): void {
  const scope = parseWorkspaceKey(workspaceId)
  if (scope?.type === 'folder') {
    activateAndRevealFolderWorkspace(scope.folderWorkspaceId)
    return
  }
  activateAndRevealWorktree(workspaceId)
}

function matchesSession(record: SleepingAgentSessionRecord, session: AiVaultSession): boolean {
  return record.agent === session.agent && record.providerSession.id === session.sessionId
}

export function resumeSleepingWorkspaceSession(
  workspaceId: string,
  session: AiVaultSession
): boolean {
  const state = useAppStore.getState()
  const sleeping = Object.values(state.sleepingAgentSessionsByPaneKey).find(
    (record) => record.worktreeId === workspaceId && matchesSession(record, session)
  )
  if (!sleeping) {
    return false
  }

  const pane = parsePaneKey(sleeping.paneKey)
  const tabId = sleeping.tabId ?? pane?.tabId
  if (tabId && (state.tabsByWorktree[workspaceId] ?? []).some((tab) => tab.id === tabId)) {
    activateWorkspace(workspaceId)
    activateTabAndFocusPane(tabId, pane?.leafId ?? null, {
      ackPaneKeyOnSuccess: sleeping.paneKey,
      flashFocusedPane: true,
      scrollToBottomIfOutputSinceLastView: true
    })
    return true
  }

  if (!launchSleepingAgentSession(sleeping)) {
    return false
  }
  activateWorkspace(workspaceId)
  return true
}
