import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { buildAiVaultResumeStartupForWorktree } from '@/lib/ai-vault-resume-command'
import { prepareAiVaultSessionForResume } from '@/lib/ai-vault-session-resume-preparation'
import { launchAiVaultSessionInNewTab } from '@/lib/launch-ai-vault-session'
import {
  activateAndRevealFolderWorkspace,
  activateAndRevealWorktree
} from '@/lib/worktree-activation'
import type { AppState } from '@/store/types'
import {
  aiVaultAgentLabel,
  isAiVaultSessionResumableContent,
  type AiVaultSession
} from '../../../../shared/ai-vault-types'
import {
  LOCAL_EXECUTION_HOST_ID,
  normalizeExecutionHostId
} from '../../../../shared/execution-host'
import {
  createNormalizedPathInsideOrEqualMatcher,
  normalizeRuntimePathForComparison
} from '../../../../shared/cross-platform-path'
import { parseWslUncPath } from '../../../../shared/wsl-paths'
import { parseWorkspaceKey } from '../../../../shared/workspace-scope'
import {
  resolveAgentRowWorkspaceTarget,
  type AgentRowWorkspaceTarget
} from './worktree-agent-session-resolution'

const VAULT_SESSION_LIMIT = 500

type OpenAgentSessionIdentity = {
  agent?: string
  sessionId: string
}

type VaultRestoreState = Pick<
  AppState,
  | 'agentStatusByPaneKey'
  | 'folderWorkspaces'
  | 'pendingStartupByTabId'
  | 'repos'
  | 'retainedAgentsByPaneKey'
  | 'settings'
  | 'sleepingAgentSessionsByPaneKey'
  | 'tabsByWorktree'
  | 'worktreesByRepo'
>

function activateRestoredWorkspace(workspaceId: string): void {
  const scope = parseWorkspaceKey(workspaceId)
  if (scope?.type === 'folder') {
    activateAndRevealFolderWorkspace(scope.folderWorkspaceId)
    return
  }
  activateAndRevealWorktree(workspaceId)
}

function collectOpenAgentSessions(
  state: VaultRestoreState,
  workspaceId: string
): OpenAgentSessionIdentity[] {
  const tabIds = new Set((state.tabsByWorktree[workspaceId] ?? []).map((tab) => tab.id))
  const belongsToWorkspace = (worktreeId: string | undefined, paneKey: string): boolean =>
    worktreeId === workspaceId || tabIds.has(paneKey.slice(0, paneKey.indexOf(':')))
  const identities: OpenAgentSessionIdentity[] = []

  for (const entry of Object.values(state.agentStatusByPaneKey)) {
    if (entry.providerSession && belongsToWorkspace(entry.worktreeId, entry.paneKey)) {
      identities.push({ agent: entry.agentType, sessionId: entry.providerSession.id })
    }
  }
  for (const retained of Object.values(state.retainedAgentsByPaneKey)) {
    if (retained.worktreeId === workspaceId && retained.entry.providerSession) {
      identities.push({
        agent: retained.agentType,
        sessionId: retained.entry.providerSession.id
      })
    }
  }
  for (const sleeping of Object.values(state.sleepingAgentSessionsByPaneKey)) {
    if (sleeping.worktreeId === workspaceId) {
      identities.push({ agent: sleeping.agent, sessionId: sleeping.providerSession.id })
    }
  }
  for (const [tabId, startup] of Object.entries(state.pendingStartupByTabId)) {
    if (tabIds.has(tabId) && startup.resumeProviderSession) {
      identities.push({
        agent: startup.launchAgent,
        sessionId: startup.resumeProviderSession.id
      })
    }
  }
  return identities
}

function sessionBelongsToWorkspace(
  session: AiVaultSession,
  workspace: AgentRowWorkspaceTarget
): boolean {
  if (!session.cwd) {
    return false
  }
  const sessionHostId = normalizeExecutionHostId(session.executionHostId) ?? LOCAL_EXECUTION_HOST_ID
  if (sessionHostId !== workspace.executionHostId) {
    return false
  }
  const normalizedCwd = normalizeRuntimePathForComparison(session.cwd)
  if (createNormalizedPathInsideOrEqualMatcher(workspace.path)(normalizedCwd)) {
    return true
  }
  const wslPath = parseWslUncPath(workspace.path)
  return Boolean(
    wslPath && createNormalizedPathInsideOrEqualMatcher(wslPath.linuxPath)(normalizedCwd)
  )
}

function isAlreadyOpen(
  session: AiVaultSession,
  openSessions: readonly OpenAgentSessionIdentity[]
): boolean {
  return openSessions.some(
    (open) => open.sessionId === session.sessionId && (!open.agent || open.agent === session.agent)
  )
}

function sessionTimestamp(session: AiVaultSession): number {
  return Math.max(
    Date.parse(session.modifiedAt) || 0,
    Date.parse(session.updatedAt ?? '') || 0,
    Date.parse(session.createdAt ?? '') || 0
  )
}

export function findLatestRestorableVaultSession(args: {
  sessions: readonly AiVaultSession[]
  workspace: AgentRowWorkspaceTarget
  openSessions?: readonly OpenAgentSessionIdentity[]
}): AiVaultSession | null {
  const openSessions = args.openSessions ?? []
  return (
    args.sessions
      .filter((session) => !session.subagent)
      .filter(isAiVaultSessionResumableContent)
      .filter((session) => sessionBelongsToWorkspace(session, args.workspace))
      .filter((session) => !isAlreadyOpen(session, openSessions))
      .sort((left, right) => sessionTimestamp(right) - sessionTimestamp(left))[0] ?? null
  )
}

function findCandidate(
  sessions: readonly AiVaultSession[],
  state: VaultRestoreState,
  workspace: AgentRowWorkspaceTarget
): AiVaultSession | null {
  return findLatestRestorableVaultSession({
    sessions,
    workspace,
    openSessions: collectOpenAgentSessions(state, workspace.workspaceId)
  })
}

export async function scanLatestRestorableVaultSession(
  workspaceId: string
): Promise<AiVaultSession | null> {
  const initialState = useAppStore.getState()
  const workspace = resolveAgentRowWorkspaceTarget(initialState, workspaceId)
  if (!workspace) {
    return null
  }
  const scan = (force: boolean) =>
    window.api.aiVault.listSessions({
      limit: VAULT_SESSION_LIMIT,
      scopePaths: [workspace.path],
      executionHostScope: workspace.executionHostId,
      force
    })
  const cached = findCandidate((await scan(false)).sessions, useAppStore.getState(), workspace)
  return cached ?? findCandidate((await scan(true)).sessions, useAppStore.getState(), workspace)
}

export async function restoreAiVaultSession(
  workspaceId: string,
  session: AiVaultSession
): Promise<boolean> {
  const state = useAppStore.getState()
  const workspace = resolveAgentRowWorkspaceTarget(state, workspaceId)
  if (!workspace || !sessionBelongsToWorkspace(session, workspace)) {
    return false
  }
  const preparedSession = await prepareAiVaultSessionForResume(session)
  const startup = buildAiVaultResumeStartupForWorktree({
    state,
    worktreeId: workspace.workspaceId,
    session: preparedSession,
    commandOverride: state.settings?.agentCmdOverrides?.[session.agent]
  })
  const launch = launchAiVaultSessionInNewTab({
    agent: session.agent,
    worktreeId: workspace.workspaceId,
    ...startup
  })
  if (launch.tabId === null) {
    const outcome = await launch.runtimeLaunch
    if (outcome.status === 'failed') {
      throw new Error(outcome.message || 'Could not restore the agent session.')
    }
  }
  activateRestoredWorkspace(workspace.workspaceId)
  toast.success(
    translate(
      'auto.components.sidebar.WorktreeContextMenu.agentSessionRestored',
      '{{value0}} session restored',
      { value0: aiVaultAgentLabel(session.agent) }
    )
  )
  return true
}

export function notifyVaultSessionRestoreFailure(error: unknown): void {
  toast.error(
    error instanceof Error
      ? error.message
      : translate(
          'auto.components.sidebar.WorktreeContextMenu.sessionRestoreFailed',
          'Could not restore the agent session.'
        )
  )
}
