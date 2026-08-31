import type { AppState } from '@/store/types'
import { findWorktreeById } from '@/store/slices/worktree-helpers'
import {
  getWorktreeExecutionHostId,
  LOCAL_EXECUTION_HOST_ID,
  normalizeExecutionHostId,
  toSshExecutionHostId,
  type ExecutionHostId
} from '../../../../shared/execution-host'
import { folderWorkspaceKey, parseWorkspaceKey } from '../../../../shared/workspace-scope'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'
import type { AiVaultSessionResumeTargetState } from '../right-sidebar/ai-vault-session-resume'
import type { DashboardAgentRow as DashboardAgentRowData } from '@/components/dashboard/useDashboardData'
import {
  resolveFolderWorkspaceYunxiaoRequirementId,
  resolveWorktreeYunxiaoRequirementId
} from '@/lib/workspace-yunxiao-requirement'

// Why: rows only get the session menu when a resume identity exists — without
// a provider session id no vault transcript can be matched, so the row keeps
// the ordinary worktree menu instead of a degraded session menu.
export function shouldShowAgentSessionContextMenu(
  agent: Pick<DashboardAgentRowData, 'rowSource' | 'entry'>
): boolean {
  return agent.rowSource !== 'subagent' && Boolean(agent.entry.providerSession?.id?.trim())
}

export function findVaultSessionForAgentRow(
  sessions: readonly AiVaultSession[],
  args: { agentType: string; providerSessionId: string }
): AiVaultSession | null {
  const matches = sessions.filter(
    (session) =>
      (session.agent as string) === args.agentType && session.sessionId === args.providerSessionId
  )
  // Why: a spawned subagent transcript can share the parent's id; the sidebar
  // row represents the top-level session.
  return matches.find((session) => !session.subagent) ?? matches[0] ?? null
}

export type AgentRowWorkspaceTarget = {
  /** Worktree id or `folder:` workspace key — a valid resume launch target. */
  workspaceId: string
  path: string
  executionHostId: ExecutionHostId
  yunxiaoRequirementId?: string
}

export function resolveAgentRowWorkspaceTarget(
  state: Pick<AppState, 'worktreesByRepo' | 'repos' | 'folderWorkspaces'>,
  workspaceId: string
): AgentRowWorkspaceTarget | null {
  const folderScope = parseWorkspaceKey(workspaceId)
  if (folderScope?.type === 'folder') {
    const folder = state.folderWorkspaces.find(
      (entry) => entry.id === folderScope.folderWorkspaceId
    )
    if (!folder) {
      return null
    }
    const yunxiaoRequirementId = resolveFolderWorkspaceYunxiaoRequirementId(folder)
    return {
      workspaceId: folderWorkspaceKey(folder.id),
      path: folder.folderPath,
      executionHostId:
        normalizeExecutionHostId(folder.executionHostId) ??
        (folder.connectionId ? toSshExecutionHostId(folder.connectionId) : LOCAL_EXECUTION_HOST_ID),
      ...(yunxiaoRequirementId ? { yunxiaoRequirementId } : {})
    }
  }
  const worktree = findWorktreeById(state.worktreesByRepo, workspaceId)
  if (!worktree) {
    return null
  }
  const repo = state.repos.find((entry) => entry.id === worktree.repoId) ?? undefined
  const yunxiaoRequirementId = resolveWorktreeYunxiaoRequirementId(worktree)
  return {
    workspaceId: worktree.id,
    path: worktree.path,
    executionHostId: getWorktreeExecutionHostId(worktree, repo),
    ...(yunxiaoRequirementId ? { yunxiaoRequirementId } : {})
  }
}

export const EMPTY_AGENT_ROW_RESUME_TARGET_STATE: AiVaultSessionResumeTargetState = {
  folderWorkspaces: [],
  projectGroups: [],
  repos: [],
  worktreesByRepo: {}
}

export function snapshotAgentRowResumeTargetState(
  state: AppState
): AiVaultSessionResumeTargetState {
  return {
    folderWorkspaces: state.folderWorkspaces,
    projectGroups: state.projectGroups,
    repos: state.repos,
    worktreesByRepo: state.worktreesByRepo
  }
}

const VAULT_SESSION_LIMIT = 500

export async function scanVaultForAgentRow(args: {
  workspace: AgentRowWorkspaceTarget
  agentType: string
  providerSessionId: string
}): Promise<AiVaultSession | null> {
  const scopePaths = args.workspace.path.trim() ? [args.workspace.path] : []
  const scan = (force?: boolean) =>
    window.api.aiVault.listSessions({
      limit: VAULT_SESSION_LIMIT,
      scopePaths,
      executionHostScope: args.workspace.executionHostId,
      force
    })
  const cached = findVaultSessionForAgentRow((await scan(false)).sessions, args)
  // Why: a just-started session can be newer than the scanner's 15s cache; one
  // forced retry keeps the menu useful right after launch without rescanning
  // on every open.
  return cached ?? findVaultSessionForAgentRow((await scan(true)).sessions, args)
}
