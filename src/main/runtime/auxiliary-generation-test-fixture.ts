import type { RuntimeGitTarget } from './runtime-git-command-target'

export function createAuxiliaryRuntimeTarget(path: string): RuntimeGitTarget {
  return {
    executionHostId: 'local',
    worktree: {
      id: 'folder-workspace',
      repoId: 'folder',
      path,
      displayName: 'Folder',
      comment: '',
      linkedIssue: null,
      linkedPR: null,
      linkedLinearIssue: null,
      branch: '',
      head: '',
      isBare: false,
      isMainWorktree: true,
      isArchived: false,
      isUnread: false,
      isPinned: false,
      sortOrder: 0,
      lastActivityAt: 0,
      git: { path, branch: '', head: '', isBare: false, isMainWorktree: true }
    }
  }
}
