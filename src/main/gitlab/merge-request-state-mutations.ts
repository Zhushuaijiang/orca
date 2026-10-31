import type { IssueSourcePreference } from '../../shared/repo-types'
import {
  acquire,
  glabHostEnvOptions,
  glabHostnameArgs,
  glabRepoExecOptions,
  glabExecFileAsync,
  release,
  type LocalGitExecOptions,
  type ProjectRef
} from './gl-utils'
import { withProjectRef } from './merge-request-project-resolution'
import { encodedProject } from './project-path-encoding'
import { codeHostFailure } from '../../shared/code-host-failure-copy'
import { invalidateReviewLookupsAfterPRMutation } from '../github/pr-mutation-review-invalidation'

// Why: glab's MRCheckErrors refuses a no-op close/reopen with these fixed texts; every other
// failure, including "has already been merged", must surface.
const GLAB_MR_ALREADY_CLOSED = 'this merge request has been closed'
const GLAB_MR_ALREADY_OPEN = 'this merge request is already open'

export async function closeMR(
  repoPath: string,
  iid: number,
  preference?: IssueSourcePreference,
  connectionId?: string | null,
  projectRef?: ProjectRef | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<{ ok: true } | { ok: false; error: string }> {
  return withProjectRef<{ ok: true } | { ok: false; error: string }>(
    repoPath,
    preference,
    connectionId,
    projectRef,
    async (projectRef, repoFlag) => {
      await acquire()
      try {
        await glabExecFileAsync(['mr', 'close', String(iid), '-R', repoFlag], {
          ...glabRepoExecOptions(repoPath, connectionId, localGitOptions),
          ...glabHostEnvOptions(projectRef, connectionId)
        })
        return { ok: true }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.toLowerCase().includes(GLAB_MR_ALREADY_CLOSED)) {
          return { ok: true }
        }
        return { ok: false, error: msg }
      } finally {
        release()
        // Even a failed write may have landed; later reads must not reuse an answer from before it.
        invalidateReviewLookupsAfterPRMutation(repoPath, connectionId)
      }
    },
    codeHostFailure('gitlab.projectUnresolved'),
    localGitOptions
  )
}

export async function reopenMR(
  repoPath: string,
  iid: number,
  preference?: IssueSourcePreference,
  connectionId?: string | null,
  projectRef?: ProjectRef | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<{ ok: true } | { ok: false; error: string }> {
  return withProjectRef<{ ok: true } | { ok: false; error: string }>(
    repoPath,
    preference,
    connectionId,
    projectRef,
    async (projectRef, repoFlag) => {
      await acquire()
      try {
        await glabExecFileAsync(['mr', 'reopen', String(iid), '-R', repoFlag], {
          ...glabRepoExecOptions(repoPath, connectionId, localGitOptions),
          ...glabHostEnvOptions(projectRef, connectionId)
        })
        return { ok: true }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.toLowerCase().includes(GLAB_MR_ALREADY_OPEN)) {
          return { ok: true }
        }
        return { ok: false, error: msg }
      } finally {
        release()
        // Even a failed write may have landed; later reads must not reuse an answer from before it.
        invalidateReviewLookupsAfterPRMutation(repoPath, connectionId)
      }
    },
    codeHostFailure('gitlab.projectUnresolved'),
    localGitOptions
  )
}

export async function mergeMR(
  repoPath: string,
  iid: number,
  method: 'merge' | 'squash' | 'rebase' = 'merge',
  preference?: IssueSourcePreference,
  connectionId?: string | null,
  projectRef?: ProjectRef | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<{ ok: true } | { ok: false; error: string }> {
  return withProjectRef<{ ok: true } | { ok: false; error: string }>(
    repoPath,
    preference,
    connectionId,
    projectRef,
    async (projectRef, repoFlag) => {
      await acquire()
      try {
        // Why: REST merge instead of `glab mr merge` — the DFHIS GitLab server
        // rejects the CLI flags; squash rides on the API parameter.
        await glabExecFileAsync(
          [
            'api',
            // Why (main): only `api` defines --hostname; `mr` subcommands reject it (#12193).
            ...glabHostnameArgs(projectRef, connectionId),
            '-X',
            'PUT',
            `projects/${encodedProject(repoFlag)}/merge_requests/${iid}/merge`,
            '-f',
            `squash=${method === 'squash' ? 'true' : 'false'}`,
            '-f',
            'should_remove_source_branch=false'
          ],
          {
            ...glabRepoExecOptions(repoPath, connectionId, localGitOptions),
            ...glabHostEnvOptions(projectRef, connectionId)
          }
        )
        return { ok: true }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      } finally {
        release()
        // Even a failed write may have landed; later reads must not reuse an answer from before it.
        invalidateReviewLookupsAfterPRMutation(repoPath, connectionId)
      }
    },
    codeHostFailure('gitlab.projectUnresolved'),
    localGitOptions
  )
}
