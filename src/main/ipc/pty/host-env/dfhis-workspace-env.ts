import { statSync } from 'node:fs'
import type { Store } from '../../../persistence'
import type { FolderWorkspace, FolderWorkspaceLinkedTask } from '../../../../shared/types'
import { parseWorkspaceKey } from '../../../../shared/workspace-scope'
import { splitWorktreeIdForFilesystem } from '../../../../shared/worktree/id'
import { isFolderRepo } from '../../../../shared/repo-kind'
import {
  buildYunxiaoTerminalEnv,
  getYunxiaoRequirementDirectory
} from '../../../dfhis-environment/terminal-env'

export function getFolderWorkspaceForPtyWorktreeId(
  store: Store | undefined,
  worktreeId: string | undefined
): FolderWorkspace | null {
  const workspaceScope = typeof worktreeId === 'string' ? parseWorkspaceKey(worktreeId) : null
  if (!store || workspaceScope?.type !== 'folder') {
    return null
  }
  return store.getFolderWorkspace(workspaceScope.folderWorkspaceId) ?? null
}

// Why: plain folder repos named after a DFHIS requirement behave like a linked
// Yunxiao workspace even though they were never linked in the UI.
export function getYunxiaoFolderRepoWorkspaceForPtyWorktreeId(
  store: Store | undefined,
  worktreeId: string | undefined
): {
  projectGroupId: string
  folderPath: string
  linkedTask: FolderWorkspaceLinkedTask
} | null {
  if (
    typeof worktreeId !== 'string' ||
    !store ||
    typeof store.getRepo !== 'function' ||
    typeof store.getWorktreeMeta !== 'function'
  ) {
    return null
  }
  const parsed = splitWorktreeIdForFilesystem(worktreeId)
  if (!parsed) {
    return null
  }
  const repo = store.getRepo(parsed.repoId)
  if (!repo || !isFolderRepo(repo) || parsed.worktreePath !== repo.path) {
    return null
  }
  const meta = store.getWorktreeMeta(worktreeId)
  const identifier = meta?.displayName.match(/\bDFHIS-\d+\b/i)?.[0]?.toUpperCase()
  if (!meta || !identifier) {
    return null
  }
  return {
    projectGroupId: repo.id,
    folderPath: repo.path,
    linkedTask: {
      provider: 'yunxiao' as const,
      type: 'issue' as const,
      number: 0,
      title: meta.displayName,
      url: `https://devops.aliyun.com/projex/req/${identifier}`,
      yunxiaoIdentifier: identifier
    }
  }
}

export function resolveFolderWorkspacePtyRoot(workspace: {
  folderPath: string
  linkedTask: FolderWorkspaceLinkedTask | null
}): string {
  const requirementDirectory = getYunxiaoRequirementDirectory(
    workspace.folderPath,
    workspace.linkedTask?.provider === 'yunxiao' ? workspace.linkedTask.yunxiaoIdentifier : null
  )
  if (!requirementDirectory || requirementDirectory === workspace.folderPath) {
    return workspace.folderPath
  }
  try {
    return statSync(requirementDirectory).isDirectory() ? requirementDirectory : workspace.folderPath
  } catch {
    return workspace.folderPath
  }
}

// Why: Yunxiao requirement subdirectory becomes the terminal root so spawns and
// cwd fallbacks land inside the requirement's isolated workspace.
export function resolveDfHisFolderWorkspacePath(
  store: Store | undefined,
  folderWorkspaceId: string
): string | null | undefined {
  const workspace = store?.getFolderWorkspace(folderWorkspaceId)
  return workspace ? resolveFolderWorkspacePtyRoot(workspace) : undefined
}

export function buildFolderWorkspacePtyEnv(
  store: Store | undefined,
  worktreeId: string | undefined,
  workspaceRoot: string | undefined,
  baseEnv: Record<string, string> | undefined
): Record<string, string> | undefined {
  const workspace = getFolderWorkspaceForPtyWorktreeId(store, worktreeId)
  if (!workspace) {
    const folderRepoWorkspace = getYunxiaoFolderRepoWorkspaceForPtyWorktreeId(store, worktreeId)
    if (!folderRepoWorkspace) {
      return baseEnv
    }
    const effectiveWorkspaceRoot = workspaceRoot ?? folderRepoWorkspace.folderPath
    return buildYunxiaoTerminalEnv(
      folderRepoWorkspace,
      {
        ...baseEnv,
        ORCA_WORKSPACE_ID: worktreeId ?? '',
        ORCA_PROJECT_GROUP_ID: folderRepoWorkspace.projectGroupId,
        ORCA_WORKSPACE_ROOT: effectiveWorkspaceRoot
      },
      { workspaceRoot: effectiveWorkspaceRoot }
    )
  }
  const linkedRepo = workspace.linkedTask?.repoId
    ? store?.getRepos().find((repo) => repo.id === workspace.linkedTask?.repoId)
    : null
  return buildYunxiaoTerminalEnv(
    workspace,
    {
      ...baseEnv,
      ORCA_WORKSPACE_ID: worktreeId ?? '',
      ORCA_PROJECT_GROUP_ID: workspace.projectGroupId,
      ORCA_WORKSPACE_ROOT: workspaceRoot ?? resolveFolderWorkspacePtyRoot(workspace)
    },
    {
      codeWorkspaceRoot: linkedRepo?.path,
      workspaceRoot: workspaceRoot ?? resolveFolderWorkspacePtyRoot(workspace)
    }
  )
}
