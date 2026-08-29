import { useEffect, useMemo, useState } from 'react'

import { useAppStore } from '@/store'
import { getActiveRuntimeTarget } from '@/runtime/runtime-rpc-client'
import { getSettingsForRepoRuntimeOwner } from '@/lib/repo-runtime-owner'
import { useRepoAssignees, useRepoLabels } from '@/hooks/useIssueMetadata'
import { isNewIssueDraftContentful } from '@/components/task-page-new-issue-draft'
import { getTaskPageRepoSourceContext } from '@/components/task-page/source/repo-source-context'
import { getTaskWorkspaceRepoForSourceRepo } from '@/components/task-page-default-repo-selection'
import { getTaskSourceRuntimeSettings } from '../../../../../shared/task-source-context'
import type { GitHubAssignableUser } from '../../../../../shared/github/pull-request-types'
import type { GlobalSettings } from '../../../../../shared/global-settings-types'
import type { Repo } from '../../../../../shared/repo-types'

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

export function useTaskPageGitHubNewIssueState({
  selectedRepos,
  selectedWorkspaceRepos,
  eligibleRepos,
  repoSelection,
  settings,
  repos
}: {
  selectedRepos: readonly Repo[]
  selectedWorkspaceRepos: readonly Repo[]
  eligibleRepos: readonly Repo[]
  repoSelection: ReadonlySet<string>
  settings: GlobalSettings | null
  repos: readonly Repo[]
}) {
  const [newIssueOpen, setNewIssueOpen] = useState(false)
  const [newIssueTitle, setNewIssueTitle] = useState('')
  const [newIssueBody, setNewIssueBody] = useState('')
  const [newIssueLabels, setNewIssueLabels] = useState<string[]>([])
  const [newIssueAssignees, setNewIssueAssignees] = useState<GitHubAssignableUser[]>([])
  const [newIssueSubmitting, setNewIssueSubmitting] = useState(false)
  const [newIssueRepoId, setNewIssueRepoIdState] = useState<string | null>(null)
  const [newIssueProvider, setNewIssueProvider] = useState<NewIssueProvider>('github')
  const [newIssueLinkYunxiao, setNewIssueLinkYunxiao] = useState(false)
  const [newIssueArchiveYunxiao, setNewIssueArchiveYunxiao] = useState(true)
  // Why: session-only draft recovers an in-progress issue across dismissal/remount; read imperatively (not subscribed) so per-keystroke writes don't re-render all of TaskPage.
  const setNewIssueDraft = useAppStore((s) => s.setNewIssueDraft)
  const clearNewIssueDraft = useAppStore((s) => s.clearNewIssueDraft)
  const newIssueRepoSelected =
    newIssueRepoId === null || selectedRepos.some((repo) => repo.id === newIssueRepoId)
  // A fresh mount has no repo id yet; keep the toolbar actionable by targeting
  // the first selected repo until the user chooses another one.
  const effectiveNewIssueRepoId =
    newIssueRepoSelected && newIssueRepoId !== null
      ? newIssueRepoId
      : (selectedRepos[0]?.id ?? null)
  const effectiveNewIssueLabels = useMemo(
    () => (newIssueRepoSelected ? newIssueLabels : []),
    [newIssueRepoSelected, newIssueLabels]
  )
  const effectiveNewIssueAssignees = useMemo(
    () => (newIssueRepoSelected ? newIssueAssignees : []),
    [newIssueRepoSelected, newIssueAssignees]
  )

  // Why: fall back to the first selected repo if the chosen id drops from the selection mid-dialog, so submit always has a valid target.
  const newIssueTargetRepo = useMemo(
    () => selectedRepos.find((r) => r.id === effectiveNewIssueRepoId) ?? null,
    [selectedRepos, effectiveNewIssueRepoId]
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
      { repos: [newIssueTargetRepo], settings },
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
    { runtimeEnvironmentId: newIssueOpen ? (newIssueRuntimeTarget?.environmentId ?? null) : null }
  )
  const newIssueRepoAssignees = useRepoAssignees(
    newIssueOpen && newIssueProvider === 'github' ? (newIssueTargetRepo?.path ?? null) : null,
    newIssueOpen && newIssueProvider === 'github' ? (newIssueTargetRepo?.id ?? null) : null,
    { runtimeEnvironmentId: newIssueOpen ? (newIssueRuntimeTarget?.environmentId ?? null) : null }
  )

  const setNewIssueRepoId = (repoId: string | null): void => {
    setNewIssueRepoIdState(repoId)
    if (repoId === newIssueRepoId || selectedRepos.some((repo) => repo.id === repoId)) {
      return
    }
    setNewIssueLabels([])
    setNewIssueAssignees([])
  }

  // Why: content-gated mirror of live fields into the session draft while the modal is open, so dismissal doesn't lose input.
  useEffect(() => {
    if (!newIssueOpen) {
      return
    }
    if (
      isNewIssueDraftContentful({
        title: newIssueTitle,
        body: newIssueBody,
        labels: effectiveNewIssueLabels,
        assignees: effectiveNewIssueAssignees
      })
    ) {
      setNewIssueDraft({
        title: newIssueTitle,
        body: newIssueBody,
        labels: effectiveNewIssueLabels,
        assignees: effectiveNewIssueAssignees,
        repoId: effectiveNewIssueRepoId
      })
    } else {
      clearNewIssueDraft()
    }
  }, [
    newIssueOpen,
    newIssueTitle,
    newIssueBody,
    effectiveNewIssueLabels,
    effectiveNewIssueAssignees,
    effectiveNewIssueRepoId,
    setNewIssueDraft,
    clearNewIssueDraft
  ])

  return {
    newIssueOpen,
    setNewIssueOpen,
    newIssueTitle,
    setNewIssueTitle,
    newIssueBody,
    setNewIssueBody,
    newIssueLabels: effectiveNewIssueLabels,
    setNewIssueLabels,
    newIssueAssignees: effectiveNewIssueAssignees,
    setNewIssueAssignees,
    newIssueSubmitting,
    setNewIssueSubmitting,
    newIssueRepoId: effectiveNewIssueRepoId,
    setNewIssueRepoId,
    newIssueProvider,
    setNewIssueProvider,
    newIssueLinkYunxiao,
    setNewIssueLinkYunxiao,
    newIssueArchiveYunxiao,
    setNewIssueArchiveYunxiao,
    setNewIssueDraft,
    clearNewIssueDraft,
    newIssueTargetRepo,
    newIssueSourceContext,
    newIssueWorkspaceRepo,
    newIssueGitLabBody,
    newIssueRuntimeTarget,
    newIssueRepoLabels,
    newIssueRepoAssignees
  }
}
