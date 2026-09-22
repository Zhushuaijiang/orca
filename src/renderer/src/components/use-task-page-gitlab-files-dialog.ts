import { useMemo, useState } from 'react'
import { getTaskPageRepoSourceContext } from './task-page-source-context'
import type { GitLabWorkItem } from '../../../shared/gitlab-types'
import type { Repo } from '../../../shared/repo-types'

/**
 * State chain for the GitLab MR/issue files dialog: the list raises items via
 * `onOpenFiles`, the dialog renders from the resolved repo + source context.
 */
export function useTaskPageGitLabFilesDialog({
  selectedRepos,
  primaryRepo
}: {
  selectedRepos: readonly Repo[]
  primaryRepo: Repo | null
}) {
  const [gitlabFilesDialogItem, setGitlabFilesDialogItem] = useState<GitLabWorkItem | null>(null)
  const gitlabFilesDialogRepo = useMemo(
    () =>
      gitlabFilesDialogItem
        ? (selectedRepos.find((r) => r.id === gitlabFilesDialogItem.repoId) ?? primaryRepo)
        : null,
    [gitlabFilesDialogItem, primaryRepo, selectedRepos]
  )
  const gitlabFilesDialogSourceContext = useMemo(() => {
    if (!gitlabFilesDialogItem) {
      return null
    }
    return getTaskPageRepoSourceContext(
      gitlabFilesDialogRepo,
      'gitlab',
      gitlabFilesDialogItem.projectRef
    )
  }, [gitlabFilesDialogItem, gitlabFilesDialogRepo])

  return {
    gitlabFilesDialogItem,
    setGitlabFilesDialogItem,
    gitlabFilesDialogRepo,
    gitlabFilesDialogSourceContext
  }
}
