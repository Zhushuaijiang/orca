import type { GitLabMRFile } from '../../shared/gitlab-types'
import { encodedProject } from './project-path-encoding'
import { countDiffLines } from './mr-file-diffs'
import {
  glabHostnameArgs,
  glabRepoExecOptions,
  glabExecFileAsync,
  type LocalGitExecOptions,
  type ProjectRef
} from './gl-utils'

export type GitLabMRFilesResult = {
  files: GitLabMRFile[]
  filesUnavailable?: boolean
}

// Why: unlike mr-file-diffs (modern `/diffs` only), this fork keeps the
// deprecated `/changes` endpoint as a fallback for older self-managed GitLab.

type GitLabRawMRFile = {
  new_path?: string
  old_path?: string
  diff?: string
  new_file?: boolean
  deleted_file?: boolean
  renamed_file?: boolean
  binary?: boolean
  too_large?: boolean
}

function mapMRFile(raw: GitLabRawMRFile): GitLabMRFile {
  const diff = raw.diff ?? ''
  const counts = countDiffLines(diff)
  const status = raw.new_file
    ? 'added'
    : raw.deleted_file
      ? 'removed'
      : raw.renamed_file
        ? 'renamed'
        : 'modified'
  return {
    path: raw.new_path ?? raw.old_path ?? '',
    ...(raw.old_path && raw.old_path !== raw.new_path ? { oldPath: raw.old_path } : {}),
    status,
    additions: counts.additions,
    deletions: counts.deletions,
    isBinary: Boolean(raw.binary || raw.too_large || !diff),
    ...(diff ? { diff } : {})
  }
}

function hasKnownChangedFiles(changesCount?: string | null): boolean {
  const value = changesCount?.trim()
  return Boolean(value && value !== '0')
}

async function fetchMRDiffFiles(
  repoPath: string,
  projectRef: ProjectRef,
  iid: number,
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<GitLabMRFile[]> {
  const { stdout } = await glabExecFileAsync(
    [
      'api',
      ...glabHostnameArgs(projectRef, connectionId),
      // Why: GitLab deprecated the all-in-one `changes` endpoint in favor of
      // the paginated diffs endpoint; cap the file snapshot at one visible page.
      `projects/${encodedProject(projectRef.path)}/merge_requests/${iid}/diffs?per_page=100`
    ],
    glabRepoExecOptions(repoPath, connectionId, localGitOptions)
  )
  const data = JSON.parse(stdout) as GitLabRawMRFile[]
  return data.map(mapMRFile).filter((file) => file.path)
}

async function fetchMRLegacyChangeFiles(
  repoPath: string,
  projectRef: ProjectRef,
  iid: number,
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<GitLabMRFile[]> {
  const { stdout } = await glabExecFileAsync(
    [
      'api',
      ...glabHostnameArgs(projectRef, connectionId),
      // Why: older self-managed GitLab can lack `/diffs`; keep the deprecated
      // endpoint as a compatibility fallback until GitLab API v5 removes it.
      `projects/${encodedProject(projectRef.path)}/merge_requests/${iid}/changes`
    ],
    glabRepoExecOptions(repoPath, connectionId, localGitOptions)
  )
  const data = JSON.parse(stdout) as { changes?: GitLabRawMRFile[] }
  return (data.changes ?? []).map(mapMRFile).filter((file) => file.path)
}

export async function fetchMRFiles(
  repoPath: string,
  projectRef: ProjectRef,
  iid: number,
  changesCount?: string | null,
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<GitLabMRFilesResult> {
  try {
    const files = await fetchMRDiffFiles(repoPath, projectRef, iid, connectionId, localGitOptions)
    if (files.length > 0 || !hasKnownChangedFiles(changesCount)) {
      return { files }
    }
  } catch {
    // Fall through to the legacy endpoint below.
  }
  try {
    const files = await fetchMRLegacyChangeFiles(
      repoPath,
      projectRef,
      iid,
      connectionId,
      localGitOptions
    )
    return { files }
  } catch {
    return { files: [], filesUnavailable: true }
  }
}

