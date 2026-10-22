import type { TaskPageWorkspaceActionsModel } from './use-task-page-workspace-actions'
import { useCallback } from 'react'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import type { GitLabCommentResult } from '../../../shared/gitlab-types'

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

export function useTaskPageGitLabIssueCreation(
  model: TaskPageWorkspaceActionsModel
): (title: string) => Promise<void> {
  const {
    setTaskRefreshNonce,
    openGitLabDetailPage,
    setNewIssueOpen,
    setNewIssueTitle,
    setNewIssueBody,
    setNewIssueLabels,
    setNewIssueAssignees,
    clearNewIssueDraft,
    newIssueGitLabBody,
    newIssueLinkYunxiao,
    newIssueArchiveYunxiao,
    newIssueTargetRepo,
    newIssueSourceContext,
    newIssueRuntimeTarget
  } = model
  return useCallback(
    async (title: string): Promise<void> => {
      if (!newIssueTargetRepo) {
        return
      }
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
    },
    [
      newIssueArchiveYunxiao,
      newIssueGitLabBody,
      newIssueLinkYunxiao,
      newIssueRuntimeTarget,
      newIssueSourceContext,
      newIssueTargetRepo,
      openGitLabDetailPage,
      clearNewIssueDraft,
      setNewIssueAssignees,
      setNewIssueBody,
      setNewIssueLabels,
      setNewIssueOpen,
      setNewIssueTitle,
      setTaskRefreshNonce
    ]
  )
}
