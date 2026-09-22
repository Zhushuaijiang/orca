import type { TaskPageGitHubCacheReconciliationModel } from './use-task-page-github-cache-reconciliation'
import { useState, useMemo, useEffect } from 'react'
import type { GitHubAssignableUser } from '../../../shared/github/pull-request-types'
import type { Repo } from '../../../shared/repo-types'
import { useAppStore } from '@/store'
import { getSettingsForRepoRuntimeOwner } from '@/lib/repo-runtime-owner'
import { getTaskSourceRuntimeSettings } from '../../../shared/task-source-context'
import { getActiveRuntimeTarget } from '@/runtime/runtime-rpc-client'
import { useRepoLabels, useRepoAssignees } from '@/hooks/useIssueMetadata'
import {
  resolveVanishedNewIssueRepoReset,
  isNewIssueDraftContentful
} from '@/components/task-page-new-issue-draft'
import { getTaskPageRepoSourceContext } from './task-page-source-context'
import { getTaskWorkspaceRepoForSourceRepo } from '@/components/task-page-default-repo-selection'

export type NewIssueProvider = 'github' | 'gitlab' | 'yunxiao'

export function getNewIssueProviderLabel(provider: NewIssueProvider): string {
  if (provider === 'gitlab') {
    return 'GitLab'
  }
  if (provider === 'yunxiao') {
    return '云效'
  }
  return 'GitHub'
}

export function buildGitLabIssueBodyWithWorkspaceContext(
  body: string,
  context: {
    issueRepo: Repo
    workspaceRepo: Repo | null
    sourceRepos: readonly Repo[]
  }
): string {
  const workspaceRepo = context.workspaceRepo
  if (!workspaceRepo || workspaceRepo.id === context.issueRepo.id) {
    return body
  }
  const sourceNames = context.sourceRepos
    .filter((repo) => repo.id !== workspaceRepo.id)
    .map((repo) => repo.displayName)
  const details = [
    '## Orca workspace context',
    `Code workspace: ${workspaceRepo.displayName}`,
    `GitLab issue owner: ${context.issueRepo.displayName}`,
    sourceNames.length > 0 ? `Possible affected repositories: ${sourceNames.join(', ')}` : null
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n')
  const trimmedBody = body.trim()
  return trimmedBody ? `${trimmedBody}\n\n---\n\n${details}` : details
}
export function useTaskPageGitHubIssueDraft(model: TaskPageGitHubCacheReconciliationModel) {
  const { settings, repos, selectedRepos, selectedWorkspaceRepos, eligibleRepos, repoSelection } =
    model
  const [newIssueOpen, setNewIssueOpen] = useState(false)
  const [newIssueTitle, setNewIssueTitle] = useState('')
  const [newIssueBody, setNewIssueBody] = useState('')
  const [newIssueLabels, setNewIssueLabels] = useState<string[]>([])
  const [newIssueAssignees, setNewIssueAssignees] = useState<GitHubAssignableUser[]>([])
  const [newIssueSubmitting, setNewIssueSubmitting] = useState(false)
  const [newIssueRepoId, setNewIssueRepoId] = useState<string | null>(null)
  const [newIssueProvider, setNewIssueProvider] = useState<NewIssueProvider>('github')
  const [newIssueLinkYunxiao, setNewIssueLinkYunxiao] = useState(false)
  const [newIssueArchiveYunxiao, setNewIssueArchiveYunxiao] = useState(true)
  // Why: session-only draft recovers an in-progress issue across dismissal/remount; read imperatively (not subscribed) so per-keystroke writes don't re-render all of TaskPage.
  const setNewIssueDraft = useAppStore((s) => s.setNewIssueDraft)
  const clearNewIssueDraft = useAppStore((s) => s.clearNewIssueDraft)

  // Why: fall back to the first selected repo if the chosen id drops from the selection mid-dialog, so submit always has a valid target.
  const newIssueTargetRepo = useMemo(
    () => selectedRepos.find((r) => r.id === newIssueRepoId) ?? selectedRepos[0] ?? null,
    [selectedRepos, newIssueRepoId]
  )
  const newIssueSourceContext = useMemo(
    () =>
      getTaskPageRepoSourceContext(
        newIssueTargetRepo,
        newIssueProvider === 'gitlab' ? 'gitlab' : 'github'
      ),
    [newIssueProvider, newIssueTargetRepo]
  )
  const newIssueWorkspaceRepo = useMemo(() => {
    if (!newIssueTargetRepo) {
      return selectedWorkspaceRepos[0] ?? null
    }
    return (
      getTaskWorkspaceRepoForSourceRepo(newIssueTargetRepo.id, eligibleRepos, repoSelection) ??
      selectedWorkspaceRepos[0] ??
      newIssueTargetRepo
    )
  }, [eligibleRepos, newIssueTargetRepo, repoSelection, selectedWorkspaceRepos])
  const newIssueGitLabBody = useMemo(() => {
    if (newIssueProvider !== 'gitlab' || !newIssueTargetRepo) {
      return newIssueBody
    }
    return buildGitLabIssueBodyWithWorkspaceContext(newIssueBody, {
      issueRepo: newIssueTargetRepo,
      workspaceRepo: newIssueWorkspaceRepo,
      sourceRepos: selectedRepos
    })
  }, [newIssueBody, newIssueProvider, newIssueTargetRepo, newIssueWorkspaceRepo, selectedRepos])
  const newIssueRuntimeTarget = useMemo(() => {
    if (!newIssueTargetRepo?.id) {
      return null
    }
    const repoOwnerSettings = getSettingsForRepoRuntimeOwner(
      {
        repos: [newIssueTargetRepo],
        settings
      },
      newIssueTargetRepo.id
    )
    const targetSettings =
      newIssueSourceContext?.provider === 'github'
        ? {
            ...repoOwnerSettings,
            ...getTaskSourceRuntimeSettings(newIssueSourceContext)
          }
        : repoOwnerSettings
    const target = getActiveRuntimeTarget(targetSettings)
    if (target.kind !== 'environment') {
      return null
    }
    return repos.some((repo) => repo.id === newIssueTargetRepo.id) ? target : null
  }, [newIssueSourceContext, newIssueTargetRepo, repos, settings])
  const newIssueRepoLabels = useRepoLabels(
    newIssueOpen && newIssueProvider === 'github' ? (newIssueTargetRepo?.path ?? null) : null,
    newIssueOpen && newIssueProvider === 'github' ? (newIssueTargetRepo?.id ?? null) : null,
    {
      runtimeEnvironmentId: newIssueOpen ? (newIssueRuntimeTarget?.environmentId ?? null) : null
    }
  )
  const newIssueRepoAssignees = useRepoAssignees(
    newIssueOpen && newIssueProvider === 'github' ? (newIssueTargetRepo?.path ?? null) : null,
    newIssueOpen && newIssueProvider === 'github' ? (newIssueTargetRepo?.id ?? null) : null,
    {
      runtimeEnvironmentId: newIssueOpen ? (newIssueRuntimeTarget?.environmentId ?? null) : null
    }
  )

  // Why: only handles the "chosen repo vanished" case; a reactive clear keyed on target id can't tell a restore from a user switch and would wipe the recovery draft.
  useEffect(() => {
    const reset = resolveVanishedNewIssueRepoReset(
      newIssueRepoId,
      selectedRepos.map((r) => r.id)
    )
    if (!reset) {
      return
    }
    setNewIssueLabels([])
    setNewIssueAssignees([])
    setNewIssueRepoId(reset.repoId)
  }, [newIssueRepoId, selectedRepos])

  // Why: content-gated mirror of live fields into the session draft while the modal is open, so dismissal doesn't lose input.
  useEffect(() => {
    if (!newIssueOpen) {
      return
    }
    if (
      isNewIssueDraftContentful({
        title: newIssueTitle,
        body: newIssueBody,
        labels: newIssueLabels,
        assignees: newIssueAssignees
      })
    ) {
      setNewIssueDraft({
        title: newIssueTitle,
        body: newIssueBody,
        labels: newIssueLabels,
        assignees: newIssueAssignees,
        repoId: newIssueRepoId
      })
    } else {
      clearNewIssueDraft()
    }
  }, [
    newIssueOpen,
    newIssueTitle,
    newIssueBody,
    newIssueLabels,
    newIssueAssignees,
    newIssueRepoId,
    setNewIssueDraft,
    clearNewIssueDraft
  ])
  const nextModel = model as typeof model & {
    newIssueOpen: typeof newIssueOpen
    setNewIssueOpen: typeof setNewIssueOpen
    newIssueTitle: typeof newIssueTitle
    setNewIssueTitle: typeof setNewIssueTitle
    newIssueBody: typeof newIssueBody
    setNewIssueBody: typeof setNewIssueBody
    newIssueLabels: typeof newIssueLabels
    setNewIssueLabels: typeof setNewIssueLabels
    newIssueAssignees: typeof newIssueAssignees
    setNewIssueAssignees: typeof setNewIssueAssignees
    newIssueSubmitting: typeof newIssueSubmitting
    setNewIssueSubmitting: typeof setNewIssueSubmitting
    newIssueRepoId: typeof newIssueRepoId
    setNewIssueRepoId: typeof setNewIssueRepoId
    newIssueProvider: typeof newIssueProvider
    setNewIssueProvider: typeof setNewIssueProvider
    newIssueLinkYunxiao: typeof newIssueLinkYunxiao
    setNewIssueLinkYunxiao: typeof setNewIssueLinkYunxiao
    newIssueArchiveYunxiao: typeof newIssueArchiveYunxiao
    setNewIssueArchiveYunxiao: typeof setNewIssueArchiveYunxiao
    setNewIssueDraft: typeof setNewIssueDraft
    clearNewIssueDraft: typeof clearNewIssueDraft
    newIssueTargetRepo: typeof newIssueTargetRepo
    newIssueSourceContext: typeof newIssueSourceContext
    newIssueWorkspaceRepo: typeof newIssueWorkspaceRepo
    newIssueGitLabBody: typeof newIssueGitLabBody
    newIssueRuntimeTarget: typeof newIssueRuntimeTarget
    newIssueRepoLabels: typeof newIssueRepoLabels
    newIssueRepoAssignees: typeof newIssueRepoAssignees
  }
  nextModel.newIssueOpen = newIssueOpen
  nextModel.setNewIssueOpen = setNewIssueOpen
  nextModel.newIssueTitle = newIssueTitle
  nextModel.setNewIssueTitle = setNewIssueTitle
  nextModel.newIssueBody = newIssueBody
  nextModel.setNewIssueBody = setNewIssueBody
  nextModel.newIssueLabels = newIssueLabels
  nextModel.setNewIssueLabels = setNewIssueLabels
  nextModel.newIssueAssignees = newIssueAssignees
  nextModel.setNewIssueAssignees = setNewIssueAssignees
  nextModel.newIssueSubmitting = newIssueSubmitting
  nextModel.setNewIssueSubmitting = setNewIssueSubmitting
  nextModel.newIssueRepoId = newIssueRepoId
  nextModel.setNewIssueRepoId = setNewIssueRepoId
  nextModel.newIssueProvider = newIssueProvider
  nextModel.setNewIssueProvider = setNewIssueProvider
  nextModel.newIssueLinkYunxiao = newIssueLinkYunxiao
  nextModel.setNewIssueLinkYunxiao = setNewIssueLinkYunxiao
  nextModel.newIssueArchiveYunxiao = newIssueArchiveYunxiao
  nextModel.setNewIssueArchiveYunxiao = setNewIssueArchiveYunxiao
  nextModel.setNewIssueDraft = setNewIssueDraft
  nextModel.clearNewIssueDraft = clearNewIssueDraft
  nextModel.newIssueTargetRepo = newIssueTargetRepo
  nextModel.newIssueSourceContext = newIssueSourceContext
  nextModel.newIssueWorkspaceRepo = newIssueWorkspaceRepo
  nextModel.newIssueGitLabBody = newIssueGitLabBody
  nextModel.newIssueRuntimeTarget = newIssueRuntimeTarget
  nextModel.newIssueRepoLabels = newIssueRepoLabels
  nextModel.newIssueRepoAssignees = newIssueRepoAssignees
  return nextModel
}
export type TaskPageGitHubIssueDraftModel = ReturnType<typeof useTaskPageGitHubIssueDraft>
