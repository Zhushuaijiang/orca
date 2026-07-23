import { getRepoExecutionHostId, LOCAL_EXECUTION_HOST_ID } from '../../../shared/execution-host'
import { getProjectIdentityKey } from '../../../shared/project-host-setup-projection'
import type { Repo } from '../../../shared/types'

export type TaskProjectPickerGroup = {
  projectKey: string
  repo: Repo
  sources: Repo[]
}

function normalizeComparablePath(value: string): string {
  const normalized = value.replace(/\\/g, '/').replace(/\/+$/, '')
  return /^[a-z]:/i.test(normalized) ? normalized.toLowerCase() : normalized
}

function isDescendantPath(parentPath: string, candidatePath: string): boolean {
  const parent = normalizeComparablePath(parentPath)
  const candidate = normalizeComparablePath(candidatePath)
  return candidate.length > parent.length && candidate.startsWith(`${parent}/`)
}

function sameTaskRepoHost(a: Repo, b: Repo): boolean {
  return getRepoExecutionHostId(a) === getRepoExecutionHostId(b)
}

function hasTaskSourceRemote(repo: Repo): boolean {
  return Boolean(repo.gitRemoteIdentity?.canonicalKey || repo.gitRemoteIdentity?.remoteUrl)
}

function compareAncestorSpecificity(a: Repo, b: Repo): number {
  return normalizeComparablePath(b.path).length - normalizeComparablePath(a.path).length
}

export function expandSelectedTaskSourceRepos(
  repos: readonly Repo[],
  selection: ReadonlySet<string>
): Repo[] {
  const selectedIds = new Set(selection)
  const expandedIds = new Set<string>()
  for (const selected of repos) {
    if (!selectedIds.has(selected.id)) {
      continue
    }
    const nestedSources = repos.filter(
      (candidate) =>
        candidate.id !== selected.id &&
        sameTaskRepoHost(candidate, selected) &&
        hasTaskSourceRemote(candidate) &&
        isDescendantPath(selected.path, candidate.path)
    )
    if (nestedSources.length > 0 && !hasTaskSourceRemote(selected)) {
      for (const source of nestedSources) {
        expandedIds.add(source.id)
      }
      continue
    }
    expandedIds.add(selected.id)
  }
  return repos.filter((repo) => expandedIds.has(repo.id))
}

export function getTaskWorkspaceRepoForSourceRepo(
  sourceRepoId: string,
  repos: readonly Repo[],
  selection: ReadonlySet<string>
): Repo | null {
  const source = repos.find((repo) => repo.id === sourceRepoId)
  if (!source) {
    return null
  }
  const selectedIds = new Set(selection)
  const ancestors = repos
    .filter(
      (candidate) =>
        selectedIds.has(candidate.id) &&
        candidate.id !== source.id &&
        sameTaskRepoHost(candidate, source) &&
        isDescendantPath(candidate.path, source.path)
    )
    .sort(compareAncestorSpecificity)
  return ancestors[0] ?? source
}

export function getDefaultTaskRepoSelection(repos: readonly Repo[]): Set<string> {
  const selectedByProject = new Map<string, Repo>()
  for (const repo of repos) {
    const projectKey = getTaskRepoProjectKey(repo)
    const current = selectedByProject.get(projectKey)
    if (!current || compareDefaultTaskRepoCandidate(repo, current) < 0) {
      selectedByProject.set(projectKey, repo)
    }
  }
  return new Set([...selectedByProject.values()].map((repo) => repo.id))
}

export function getTaskProjectPickerRepos(
  repos: readonly Repo[],
  preferredSelection: ReadonlySet<string> = new Set()
): Repo[] {
  return getTaskProjectPickerGroups(repos, preferredSelection).map((group) => group.repo)
}

export function getTaskProjectPickerGroups(
  repos: readonly Repo[],
  preferredSelection: ReadonlySet<string> = new Set()
): TaskProjectPickerGroup[] {
  const groupsByProject = new Map<string, TaskProjectPickerGroup>()
  for (const repo of repos) {
    const projectKey = getTaskRepoProjectKey(repo)
    const current = groupsByProject.get(projectKey)
    if (!current) {
      groupsByProject.set(projectKey, { projectKey, repo, sources: [repo] })
      continue
    }
    current.sources.push(repo)
    if (compareTaskProjectPickerCandidate(repo, current.repo, preferredSelection) < 0) {
      current.repo = repo
    }
  }
  return [...groupsByProject.values()].map((group) => ({
    ...group,
    sources: [...group.sources].sort(compareDefaultTaskRepoCandidate)
  }))
}

export function normalizeTaskRepoSelection(
  repos: readonly Repo[],
  selection: ReadonlySet<string>
): Set<string> {
  const selectedByProject = new Map<string, Repo>()
  const selectedIds = new Set(selection)
  for (const repo of repos) {
    if (!selectedIds.has(repo.id)) {
      continue
    }
    const projectKey = getTaskRepoProjectKey(repo)
    const current = selectedByProject.get(projectKey)
    if (!current || compareDefaultTaskRepoCandidate(repo, current) < 0) {
      selectedByProject.set(projectKey, repo)
    }
  }
  if (selectedByProject.size === 0) {
    return getDefaultTaskRepoSelection(repos)
  }
  return new Set([...selectedByProject.values()].map((repo) => repo.id))
}

export function getTaskRepoProjectKey(repo: Repo): string {
  return getProjectIdentityKey(repo)
}

function compareTaskProjectPickerCandidate(
  a: Repo,
  b: Repo,
  preferredSelection: ReadonlySet<string>
): number {
  const aPreferred = preferredSelection.has(a.id)
  const bPreferred = preferredSelection.has(b.id)
  if (aPreferred !== bPreferred) {
    return aPreferred ? -1 : 1
  }
  return compareDefaultTaskRepoCandidate(a, b)
}

function compareDefaultTaskRepoCandidate(a: Repo, b: Repo): number {
  // Why: when the same logical project exists on multiple hosts, default to
  // the local checkout to avoid surprising remote auth/network work on first load.
  const aLocal = getRepoExecutionHostId(a) === LOCAL_EXECUTION_HOST_ID
  const bLocal = getRepoExecutionHostId(b) === LOCAL_EXECUTION_HOST_ID
  if (aLocal !== bLocal) {
    return aLocal ? -1 : 1
  }
  return (a.addedAt ?? 0) - (b.addedAt ?? 0) || a.id.localeCompare(b.id)
}
