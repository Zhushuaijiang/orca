import { useAppStore } from '@/store'
import { launchSleepingAgentSession } from '@/lib/sleeping-agent-session-launch'
import {
  activateAndRevealFolderWorkspace,
  activateAndRevealWorktree
} from '@/lib/worktree-activation'
import { parseWorkspaceKey } from '../../../../shared/workspace-scope'

function activateRestoredWorkspace(worktreeId: string): void {
  const workspaceScope = parseWorkspaceKey(worktreeId)
  if (workspaceScope?.type === 'folder') {
    activateAndRevealFolderWorkspace(workspaceScope.folderWorkspaceId)
    return
  }
  activateAndRevealWorktree(worktreeId)
}

export function restoreRecentlyClosedAgentSession(worktreeId: string): number {
  const sessions = useAppStore.getState().takeRecentlyClosedAgentSessions(worktreeId)
  if (!sessions) {
    return 0
  }
  let restored = 0
  for (const session of sessions) {
    if (launchSleepingAgentSession(session)) {
      restored += 1
    }
  }
  if (restored > 0) {
    activateRestoredWorkspace(worktreeId)
  }
  return restored
}
