import { useCallback, type Dispatch, type SetStateAction } from 'react'
import { toast } from 'sonner'

import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { translate } from '@/i18n/i18n'
import type { GitHubAssignableUser } from '../../../../../shared/github/pull-request-types'
import type { GitHubWorkItem } from '../../../../../shared/github/work-item-types'
import type { GitLabCommentResult, GitLabWorkItem } from '../../../../../shared/gitlab-types'
import type { Repo } from '../../../../../shared/repo-types'
import type { TaskSourceContext } from '../../../../../shared/task-source-context'
import type { NewIssueDraftSlice } from '@/store/slices/new-issue-draft'
import type { NewIssueProvider } from './use-task-page-github-new-issue-state'

function buildGitLabLinkedYunxiaoDescription(
  body: string,
  issue: { number: number; url?: string | null },
  repoName: string
): string {
  const details = [
    '## GitLab association',
    `GitLab issue: ${issue.url || `#${issue.number}`}`,
    `GitLab project: ${repoName}`
  ].join('\n')
  const trimmedBody = body.trim()
  return trimmedBody ? `${trimmedBody}\n\n---\n\n${details}` : details
}

function buildYunxiaoLinkedGitLabComment(result: {
  workItemId: string | null
  url: string | null
  archiveMessage?: string
}): string {
  const identifier = result.workItemId ?? 'Yunxiao requirement'
  const target = result.url ? `[${identifier}](${result.url})` : identifier
  return [
    `Linked Yunxiao requirement: ${target}`,
    result.archiveMessage ? 'Archived and dispatched to the Yunxiao requirement skill.' : null
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n\n')
}

function isGitLabCommentResult(value: unknown): value is GitLabCommentResult {
  return Boolean(value && typeof value === 'object' && 'ok' in value)
}

export function useTaskPageCreateGithubSubmit({
  newIssueTargetRepo,
  newIssueTitle,
  newIssueSubmitting,
  newIssueRuntimeTarget,
  newIssueSourceContext,
  newIssueBody,
  newIssueGitLabBody,
  newIssueLabels,
  newIssueAssignees,
  newIssueProvider,
  newIssueLinkYunxiao,
  newIssueArchiveYunxiao,
  setNewIssueSubmitting,
  setNewIssueOpen,
  setNewIssueTitle,
  setNewIssueDraft,
  setNewIssueBody,
  setNewIssueLabels,
  setNewIssueAssignees,
  clearNewIssueDraft,
  setTaskRefreshNonce,
  openGitHubDetailPage,
  openGitLabDetailPage,
  setDialogWorkItem
}: {
  newIssueTargetRepo: Repo | null
  newIssueTitle: string
  newIssueSubmitting: boolean
  newIssueRuntimeTarget: { kind: 'environment'; environmentId: string } | null
  newIssueSourceContext: TaskSourceContext | null
  newIssueBody: string
  newIssueGitLabBody: string
  newIssueLabels: string[]
  newIssueAssignees: GitHubAssignableUser[]
  newIssueProvider: NewIssueProvider
  newIssueLinkYunxiao: boolean
  newIssueArchiveYunxiao: boolean
  setNewIssueSubmitting: Dispatch<SetStateAction<boolean>>
  setNewIssueOpen: Dispatch<SetStateAction<boolean>>
  setNewIssueTitle: Dispatch<SetStateAction<string>>
  setNewIssueDraft: NewIssueDraftSlice['setNewIssueDraft']
  setNewIssueBody: Dispatch<SetStateAction<string>>
  setNewIssueLabels: Dispatch<SetStateAction<string[]>>
  setNewIssueAssignees: Dispatch<SetStateAction<GitHubAssignableUser[]>>
  clearNewIssueDraft: NewIssueDraftSlice['clearNewIssueDraft']
  setTaskRefreshNonce: Dispatch<SetStateAction<number>>
  openGitHubDetailPage: (item: GitHubWorkItem) => void
  openGitLabDetailPage: (item: GitLabWorkItem) => void
  setDialogWorkItem: (item: GitHubWorkItem) => void
}) {
  const handleCreateNewIssue = useCallback(async (): Promise<void> => {
    if (!newIssueTargetRepo) {
      return
    }
    const title = newIssueTitle.trim()
    if (!title || newIssueSubmitting) {
      return
    }
    setNewIssueSubmitting(true)
    try {
      if (newIssueProvider === 'gitlab') {
        const gitlabRepoSelector =
          newIssueSourceContext?.provider === 'gitlab'
            ? (newIssueSourceContext.repoId ?? newIssueTargetRepo.id)
            : newIssueTargetRepo.id
        const result = newIssueRuntimeTarget
          ? await callRuntimeRpc<Awaited<ReturnType<typeof window.api.gl.createIssue>>>(
              newIssueRuntimeTarget,
              'gitlab.createIssue',
              {
                repo: gitlabRepoSelector,
                title,
                body: newIssueGitLabBody
              },
              { timeoutMs: 65_000 }
            )
          : await window.api.gl.createIssue({
              repoPath: newIssueTargetRepo.path,
              repoId: newIssueTargetRepo.id,
              sourceContext: newIssueSourceContext,
              title,
              body: newIssueGitLabBody
            })
        if (!result.ok) {
          toast.error(
            result.error ||
              translate('auto.components.TaskPage.7437e340b4', 'Failed to create issue.')
          )
          return
        }
        let linkWarning: string | null = null
        let linkedYunxiao: {
          workItemId: string | null
          url: string | null
          archiveMessage?: string
        } | null = null
        if (newIssueLinkYunxiao) {
          const yunxiaoResult = await window.api.yunxiao.createRequirement({
            title,
            description: buildGitLabLinkedYunxiaoDescription(
              newIssueGitLabBody,
              result,
              newIssueTargetRepo.displayName
            ),
            archiveAfterCreate: newIssueArchiveYunxiao
          })
          if (yunxiaoResult.ok) {
            linkedYunxiao = {
              workItemId: yunxiaoResult.workItemId,
              url: yunxiaoResult.url,
              ...(yunxiaoResult.archiveMessage
                ? { archiveMessage: yunxiaoResult.archiveMessage }
                : {})
            }
            const commentBody = buildYunxiaoLinkedGitLabComment(yunxiaoResult)
            const commentResult = newIssueRuntimeTarget
              ? await callRuntimeRpc<GitLabCommentResult>(
                  newIssueRuntimeTarget,
                  'gitlab.addIssueComment',
                  {
                    repo: gitlabRepoSelector,
                    number: result.number,
                    body: commentBody
                  },
                  { timeoutMs: 30_000 }
                )
              : await window.api.gl.addIssueComment({
                  repoPath: newIssueTargetRepo.path,
                  repoId: newIssueTargetRepo.id,
                  sourceContext: newIssueSourceContext,
                  number: result.number,
                  body: commentBody
                })
            if (isGitLabCommentResult(commentResult) && !commentResult.ok) {
              linkWarning =
                commentResult.error ||
                translate(
                  'auto.components.TaskPage.b87e7c39ef',
                  'Created the Yunxiao requirement, but failed to link it back to GitLab.'
                )
            }
          } else {
            linkWarning =
              yunxiaoResult.error ||
              translate(
                'auto.components.TaskPage.357ed17b2b',
                'Created the GitLab issue, but failed to create the linked Yunxiao requirement.'
              )
          }
        }
        const toastMessage = translate(
          'auto.components.TaskPage.f14f60f39e',
          'Opened GitLab issue #{{value0}}',
          {
            value0: result.number
          }
        )
        const toastOptions = {
          description: linkWarning
            ? linkWarning
            : linkedYunxiao
              ? translate(
                  'auto.components.TaskPage.d2f9f4a4de',
                  'Linked Yunxiao requirement {{value0}}.',
                  {
                    value0: linkedYunxiao.workItemId ?? 'created'
                  }
                )
              : undefined,
          action: result.url
            ? {
                label: translate('auto.components.TaskPage.9c57663908', 'View'),
                onClick: () => window.open(result.url, '_blank')
              }
            : undefined
        }
        if (linkWarning) {
          toast.warning(toastMessage, toastOptions)
        } else {
          toast.success(toastMessage, toastOptions)
        }
        setNewIssueOpen(false)
        setNewIssueTitle('')
        setNewIssueBody('')
        setNewIssueLabels([])
        setNewIssueAssignees([])
        clearNewIssueDraft()
        setTaskRefreshNonce((current) => current + 1)
        openGitLabDetailPage({
          id: `gitlab-issue:${String(result.number)}`,
          repoId: newIssueTargetRepo.id,
          type: 'issue',
          number: result.number,
          title,
          state: 'opened',
          url: result.url,
          labels: [],
          updatedAt: new Date().toISOString(),
          author: null
        })
        return
      }

      if (newIssueProvider === 'yunxiao') {
        const result = await window.api.yunxiao.createRequirement({
          title,
          description: newIssueBody,
          archiveAfterCreate: newIssueArchiveYunxiao
        })
        if (!result.ok) {
          toast.error(
            result.error ||
              translate(
                'auto.components.TaskPage.ae3894e891',
                'Failed to create Yunxiao requirement.'
              )
          )
          return
        }
        const identifier =
          result.workItemId ??
          translate('auto.components.TaskPage.14cb2e282f', 'Yunxiao requirement')
        toast.success(
          translate('auto.components.TaskPage.633c9bd347', 'Created {{value0}}', {
            value0: identifier
          }),
          {
            description: result.archiveMessage
              ? translate(
                  'auto.components.TaskPage.f1a03a62c3',
                  'Archived and dispatched to the Yunxiao requirement skill.'
                )
              : undefined,
            action: result.url
              ? {
                  label: translate('auto.components.TaskPage.9c57663908', 'View'),
                  onClick: () => window.open(result.url ?? '', '_blank')
                }
              : undefined
          }
        )
        setNewIssueOpen(false)
        setNewIssueTitle('')
        setNewIssueBody('')
        setNewIssueLabels([])
        setNewIssueAssignees([])
        clearNewIssueDraft()
        return
      }

      const result = newIssueRuntimeTarget
        ? await callRuntimeRpc<Awaited<ReturnType<typeof window.api.gh.createIssue>>>(
            newIssueRuntimeTarget,
            'github.createIssue',
            {
              repo:
                newIssueSourceContext?.provider === 'github'
                  ? (newIssueSourceContext.repoId ?? newIssueTargetRepo.id)
                  : newIssueTargetRepo.id,
              title,
              body: newIssueBody,
              labels: newIssueLabels,
              assignees: newIssueAssignees.map((assignee) => assignee.login)
            },
            // Why: oversized-body recovery can need two 30s writes after GitHub rejects the initial create.
            { timeoutMs: 65_000 }
          )
        : await window.api.gh.createIssue({
            repoPath: newIssueTargetRepo.path,
            repoId: newIssueTargetRepo.id,
            sourceContext: newIssueSourceContext,
            title,
            body: newIssueBody,
            labels: newIssueLabels,
            assignees: newIssueAssignees.map((assignee) => assignee.login)
          })
      if (!result.ok) {
        toast.error(
          result.error ||
            translate('auto.components.TaskPage.7437e340b4', 'Failed to create issue.')
        )
        return
      }
      const createdIssueToast = translate(
        'auto.components.TaskPage.3f9604efc7',
        'Opened issue #{{value0}}',
        { value0: result.number }
      )
      const createdIssueToastOptions = {
        action: result.url
          ? {
              label: translate('auto.components.TaskPage.9c57663908', 'View'),
              onClick: () => window.open(result.url, '_blank')
            }
          : undefined
      }
      if (result.bodySaveWarning) {
        toast.warning(createdIssueToast, {
          ...createdIssueToastOptions,
          description: result.bodySaveWarning
        })
      } else {
        toast.success(createdIssueToast, createdIssueToastOptions)
      }
      setNewIssueOpen(false)
      if (result.bodySaveWarning) {
        // Why: keep the unsaved body for recovery but clear the title so reopening can't one-click repeat the create.
        setNewIssueTitle('')
        setNewIssueDraft({ title: '' })
      } else {
        setNewIssueTitle('')
        setNewIssueBody('')
        setNewIssueLabels([])
        setNewIssueAssignees([])
        // Why: only a complete success discards the recovery draft; a partial body save keeps the text for recovery.
        clearNewIssueDraft()
      }
      // Why: bump the nonce so the list refetches and shows the new issue.
      setTaskRefreshNonce((current) => current + 1)

      if (!result.url) {
        // Why: create only validates the number, so the URL can come back empty. A stub that
        // can't link out shouldn't open a detail page — the refetched list surfaces the issue.
        return
      }

      // Why: auto-open the new issue with an optimistic stub for immediate content, then refine with the full workItem fetch.
      const stub: GitHubWorkItem = {
        id: `issue:${String(result.number)}`,
        repoId: newIssueTargetRepo.id,
        type: 'issue',
        number: result.number,
        title,
        state: 'open',
        url: result.url,
        labels: newIssueLabels,
        assignees: newIssueAssignees,
        updatedAt: new Date().toISOString(),
        author: null
      }
      openGitHubDetailPage(stub)
      const stubRepoId = newIssueTargetRepo.id
      const fullIssuePromise = newIssueRuntimeTarget
        ? callRuntimeRpc<Awaited<ReturnType<typeof window.api.gh.workItem>>>(
            newIssueRuntimeTarget,
            'github.workItem',
            {
              repo:
                newIssueSourceContext?.provider === 'github'
                  ? (newIssueSourceContext.repoId ?? newIssueTargetRepo.id)
                  : newIssueTargetRepo.id,
              number: result.number,
              type: 'issue'
            },
            { timeoutMs: 30_000 }
          )
        : window.api.gh.workItem({
            repoPath: newIssueTargetRepo.path,
            repoId: newIssueTargetRepo.id,
            sourceContext: newIssueSourceContext,
            number: result.number,
            type: 'issue'
          })
      void fullIssuePromise
        .then((full) => {
          if (full) {
            // Why: cast through unknown — spreading the discriminated union loses the discriminant, so { ...full, repoId } won't typecheck.
            const withRepoId = { ...full, repoId: stubRepoId } as unknown as GitHubWorkItem
            setDialogWorkItem(withRepoId)
          }
        })
        .catch(() => {})
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : translate('auto.components.TaskPage.7437e340b4', 'Failed to create issue.')
      )
    } finally {
      setNewIssueSubmitting(false)
    }
  }, [
    newIssueBody,
    newIssueAssignees,
    newIssueGitLabBody,
    newIssueLabels,
    newIssueArchiveYunxiao,
    newIssueLinkYunxiao,
    newIssueProvider,
    newIssueRuntimeTarget,
    newIssueSourceContext,
    newIssueSubmitting,
    newIssueTargetRepo,
    newIssueTitle,
    openGitHubDetailPage,
    openGitLabDetailPage,
    setDialogWorkItem,
    clearNewIssueDraft,
    setNewIssueDraft,

    setNewIssueSubmitting,
    setNewIssueBody,
    setTaskRefreshNonce,
    setNewIssueOpen,
    setNewIssueAssignees,
    setNewIssueTitle,
    setNewIssueLabels
  ])

  return { handleCreateNewIssue }
}
