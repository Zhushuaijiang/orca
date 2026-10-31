import { useMemo } from 'react'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'
import type { FolderWorkspace } from '../../../../shared/folder-workspace-types'
import { folderWorkspaceToWorktree } from '../../../../shared/folder-workspace-worktree'
import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'
import {
  buildAiVaultSessionWorktreeMap,
  resolveAiVaultSessionWorktreeDisplay as resolveSharedWorktreeDisplay,
  resolveAiVaultSessionWorktreeInfo as resolveSharedWorktreeInfo,
  type AiVaultSessionWorktreeInfo
} from '../../../../shared/ai-vault-session-worktree'
import {
  resolveAiVaultSessionYunxiaoRequirementId,
  resolveWorktreeYunxiaoRequirementId
} from '@/lib/workspace-yunxiao-requirement'

export {
  aiVaultResumeInSessionWorkspaceLabel,
  aiVaultSessionWorkspaceHeading,
  aiVaultWorktreeJumpTooltip,
  aiVaultWorktreeStatusLabel,
  isAiVaultFolderWorkspaceId,
  isAiVaultSessionInCurrentWorktree,
  shouldShowAiVaultSessionWorktreeLine,
  shouldShowAiVaultWorktreeStatusBadge
} from './ai-vault-session-worktree-affordances'
export {
  aiVaultWorktreeCompactPath,
  canJumpToAiVaultSessionWorktree,
  extractWorktreePathFromSessionTitle,
  withAiVaultCurrentWorktreeStatus,
  type AiVaultSessionWorktreeInfo,
  type AiVaultSessionWorktreeStatus
} from '../../../../shared/ai-vault-session-worktree'

type WorktreeRepos = readonly Pick<Repo, 'id' | 'connectionId' | 'executionHostId'>[]

// Why: Yunxiao runs several workspaces on one path; the requirement id picks the right one.
function requirementMatchedWorktrees(
  session: AiVaultSession,
  worktrees: readonly Worktree[]
): readonly Worktree[] {
  const requirementId = resolveAiVaultSessionYunxiaoRequirementId(session)
  return requirementId
    ? worktrees.filter(
        (worktree) => resolveWorktreeYunxiaoRequirementId(worktree) === requirementId
      )
    : []
}

function resolveRequirementPreferredInfo(args: {
  session: AiVaultSession
  repos?: WorktreeRepos
  worktrees: readonly Worktree[]
  activeWorktreeId: string | null
}): AiVaultSessionWorktreeInfo | null {
  const preferred = requirementMatchedWorktrees(args.session, args.worktrees)
  if (preferred.length === 0) {
    return null
  }
  const info = resolveSharedWorktreeInfo({ ...args, worktrees: preferred })
  return info?.worktreeId ? info : null
}

export function resolveAiVaultSessionWorktreeInfo(args: {
  session: AiVaultSession
  repos?: WorktreeRepos
  worktrees: readonly Worktree[]
  activeWorktreeId: string | null
}): AiVaultSessionWorktreeInfo | null {
  return resolveRequirementPreferredInfo(args) ?? resolveSharedWorktreeInfo(args)
}

export function resolveAiVaultSessionWorktreeDisplay(args: {
  session: AiVaultSession
  repos?: WorktreeRepos
  worktrees: readonly Worktree[]
  activeWorktreeId: string | null
}): AiVaultSessionWorktreeInfo | null {
  return resolveRequirementPreferredInfo(args) ?? resolveSharedWorktreeDisplay(args)
}

export function aiVaultSessionOwnerWorkspaces(
  worktrees: readonly Worktree[],
  folderWorkspaces: readonly FolderWorkspace[]
): readonly Worktree[] {
  return folderWorkspaces.length === 0
    ? worktrees
    : [...worktrees, ...folderWorkspaces.map(folderWorkspaceToWorktree)]
}

export function useAiVaultSessionOwnerWorkspaces(
  worktrees: readonly Worktree[],
  { folderWorkspaces }: { folderWorkspaces: readonly FolderWorkspace[] }
): readonly Worktree[] {
  return useMemo(
    () => aiVaultSessionOwnerWorkspaces(worktrees, folderWorkspaces),
    [folderWorkspaces, worktrees]
  )
}

/** Keep active-worktree state out of this map; callers stamp current per row. */
export function useAiVaultSessionWorktreeMap({
  sessions,
  repos = [],
  worktrees
}: {
  sessions: readonly AiVaultSession[]
  repos?: WorktreeRepos
  worktrees: readonly Worktree[]
}): ReadonlyMap<string, AiVaultSessionWorktreeInfo> {
  return useMemo(() => {
    const map = new Map(buildAiVaultSessionWorktreeMap({ sessions, repos, worktrees }))
    for (const session of sessions) {
      const preferred = resolveRequirementPreferredInfo({
        session,
        repos,
        worktrees,
        activeWorktreeId: null
      })
      if (preferred) {
        map.set(session.id, preferred)
      }
    }
    return map
  }, [repos, sessions, worktrees])
}
