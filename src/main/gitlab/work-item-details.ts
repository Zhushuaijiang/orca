/* eslint-disable max-lines -- Why: aggregated detail-fetch for GitLabItemDialog spans issues, MRs, comments, pipelines, reviewers, approvals, and changed files; splitting would obscure the shared fetch context. */
// Why: aggregated detail-fetch for GitLabItemDialog. Parallel of
// src/main/github/work-item-details.ts but scoped to v1 surface —
// description body, flattened discussion notes, MR pipeline jobs/reviewers.
// Files / inline review-comment positioning are deferred.
import type {
  GitLabAssignableUser,
  GitLabMRFile,
  GitLabWorkItem,
  GitLabWorkItemDetails
} from '../../shared/gitlab-types'
import type { IssueSourcePreference } from '../../shared/repo-types'
import { mapIssueToWorkItem, mapMRToWorkItem } from './mappers'
import { mapGitLabUser, type GitLabRawUser } from './gitlab-assignable-user-mapping'
import { encodedProject } from './project-path-encoding'
import { fetchDiscussions, flattenDiscussions } from './mr-discussion-notes'
import { countDiffLines } from './mr-file-diffs'
import { fetchMRApprovalState, fetchMRReviewers } from './mr-reviewers-and-approvals'
import { fetchPipelineJobs } from './pipeline-job-graph'
import {
  acquire,
  getGlabKnownHosts,
  glabHostnameArgs,
  glabRepoExecOptions,
  glabExecFileAsync,
  release,
  resolveIssueSource,
  type LocalGitExecOptions,
  type ProjectRef
} from './gl-utils'

// ── MR changed files ───────────────────────────────────────────────
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

type GitLabMRFilesResult = {
  files: GitLabMRFile[]
  filesUnavailable?: boolean
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

async function fetchMRFiles(
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

// ── Top-level aggregator ───────────────────────────────────────────

type GitLabRawIssue = Parameters<typeof mapIssueToWorkItem>[0] & {
  description?: string | null
  assignees?: { username?: string | null }[] | null
}

type GitLabRawMR = Parameters<typeof mapMRToWorkItem>[0] & {
  description?: string | null
  sha?: string
  changes_count?: string | null
  diff_refs?: { base_sha?: string; head_sha?: string; start_sha?: string } | null
  head_pipeline?: { id?: number } | null
  reviewers?: GitLabRawUser[] | null
}

/**
 * Fetch full details for a GitLab MR or issue: the work item itself,
 * description body, discussion notes flattened to MRComment[], and (for
 * MRs only) per-job pipeline status.
 *
 * Returns null when the project ref can't be resolved or the item
 * can't be loaded — callers render a "not found" / error state.
 */
export async function getWorkItemDetails(
  repoPath: string,
  iid: number,
  type: 'issue' | 'mr',
  preference?: IssueSourcePreference,
  connectionId?: string | null,
  projectRefOverride?: ProjectRef | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<GitLabWorkItemDetails | null> {
  // Why: detail fetches must use the same project source as the list row
  // that opened them, otherwise forked repos can show a row from one remote
  // and a detail sheet from another.
  const projectRef =
    projectRefOverride ??
    (
      await resolveIssueSource(
        repoPath,
        preference,
        await getGlabKnownHosts(connectionId, localGitOptions),
        connectionId,
        localGitOptions
      )
    ).source
  if (!projectRef) {
    return null
  }
  await acquire()
  try {
    if (type === 'issue') {
      return await fetchIssueDetails(repoPath, projectRef, iid, connectionId, localGitOptions)
    }
    return await fetchMRDetails(repoPath, projectRef, iid, connectionId, localGitOptions)
  } catch {
    return null
  } finally {
    release()
  }
}

async function fetchIssueDetails(
  repoPath: string,
  projectRef: ProjectRef,
  iid: number,
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<GitLabWorkItemDetails | null> {
  // Why: fan out the two reads. Issues don't have a pipeline so this
  // pair covers everything the dialog renders.
  const [issueRes, discussions] = await Promise.all([
    glabExecFileAsync(
      [
        'api',
        ...glabHostnameArgs(projectRef, connectionId),
        `projects/${encodedProject(projectRef.path)}/issues/${iid}`
      ],
      glabRepoExecOptions(repoPath, connectionId, localGitOptions)
    ),
    fetchDiscussions(repoPath, projectRef, 'issue', iid, connectionId, localGitOptions)
  ])
  const issueRaw = JSON.parse(issueRes.stdout) as GitLabRawIssue
  const item: Omit<GitLabWorkItem, 'repoId'> = (() => {
    const full = mapIssueToWorkItem(issueRaw, projectRef.path, projectRef)
    // Why: omit repoId from the returned shape — the renderer stamps
    // it from the dialog's caller (TaskPage / picker) so the main
    // process doesn't need to know Orca's Repo.id.
    const { repoId: _repoId, ...rest } = full
    return rest
  })()
  return {
    item,
    body: issueRaw.description ?? '',
    comments: flattenDiscussions(discussions),
    assignees: (issueRaw.assignees ?? [])
      .map((a) => a?.username)
      .filter((u): u is string => typeof u === 'string')
  }
}

async function fetchMRDetails(
  repoPath: string,
  projectRef: ProjectRef,
  iid: number,
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<GitLabWorkItemDetails | null> {
  // Why: MR detail + discussions in parallel. The pipeline jobs fetch
  // depends on `head_pipeline.id` from the MR payload, so it has to
  // wait — but it's a single follow-up call rather than a serial chain.
  const [mrRes, discussions] = await Promise.all([
    glabExecFileAsync(
      [
        'api',
        ...glabHostnameArgs(projectRef, connectionId),
        `projects/${encodedProject(projectRef.path)}/merge_requests/${iid}`
      ],
      glabRepoExecOptions(repoPath, connectionId, localGitOptions)
    ),
    fetchDiscussions(repoPath, projectRef, 'mr', iid, connectionId, localGitOptions)
  ])
  const mrRaw = JSON.parse(mrRes.stdout) as GitLabRawMR
  const item: Omit<GitLabWorkItem, 'repoId'> = (() => {
    const full = mapMRToWorkItem(mrRaw, projectRef.path, projectRef)
    const { repoId: _repoId, ...rest } = full
    return rest
  })()
  const pipelineId = mrRaw.head_pipeline?.id
  const pipelineJobs =
    typeof pipelineId === 'number'
      ? await fetchPipelineJobs(
          repoPath,
          projectRef,
          pipelineId,
          connectionId,
          localGitOptions
        ).catch(() => [])
      : undefined
  const [reviewers, approvalState, filesResult] = await Promise.all([
    fetchMRReviewers(repoPath, projectRef, iid, connectionId, localGitOptions).catch(() =>
      (mrRaw.reviewers ?? []).map(mapGitLabUser).filter((u): u is GitLabAssignableUser => !!u)
    ),
    fetchMRApprovalState(repoPath, projectRef, iid, connectionId, localGitOptions).catch(
      () => undefined
    ),
    fetchMRFiles(
      repoPath,
      projectRef,
      iid,
      mrRaw.changes_count,
      connectionId,
      localGitOptions
    ).catch(() => ({ files: [], filesUnavailable: true }))
  ])
  return {
    item,
    body: mrRaw.description ?? '',
    comments: flattenDiscussions(discussions),
    headSha: mrRaw.sha,
    baseSha: mrRaw.diff_refs?.base_sha,
    startSha: mrRaw.diff_refs?.start_sha,
    files: filesResult.files,
    ...(filesResult.filesUnavailable ? { filesUnavailable: true } : {}),
    ...(pipelineJobs !== undefined ? { pipelineJobs } : {}),
    reviewers,
    ...(approvalState ? { approvalState } : {})
  }
}
