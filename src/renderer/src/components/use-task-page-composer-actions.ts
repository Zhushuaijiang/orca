import type { TaskPageJiraListEffectsModel } from './use-task-page-jira-list-effects'
import { useCallback } from 'react'
import type { JiraIssue } from '../../../shared/jira-types'
import { useAppStore } from '@/store'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { bindTaskPageJiraItemSourceContext } from './task-page-jira-item-source-context'
import type { LinkedWorkItemSummary } from '@/lib/new-workspace'
import { shouldHideTaskPageListChrome } from '@/components/task-page-list-chrome-visibility'
import { getJiraIssueWorkspaceSeed } from './task-page-source-context'
import { useTaskPageGitLabFilesDialog } from './use-task-page-gitlab-files-dialog'
import { useTaskPageLinearComposerActions } from './use-task-page-linear-composer-actions'
import { useTaskPageYunxiaoActions } from './use-task-page-yunxiao-actions'
import { resolveNewIssueOpenSeed } from './task-page-new-issue-draft'
export function useTaskPageComposerActions(model: TaskPageJiraListEffectsModel) {
  const {
    openModal,
    jiraSites,
    taskSource,
    jiraTaskSourceContext,
    gitlabDialogItem,
    dialogWorkItem,
    selectedLinearIssue,
    selectedJiraIssue,
    selectedLinearProject,
    selectedLinearCustomView,
    eligibleRepos,
    selectedRepos,
    primaryRepo,
    yunxiaoTaskSourceContext,
    setNewIssueOpen,
    setNewIssueTitle,
    setNewIssueBody,
    setNewIssueLabels,
    setNewIssueAssignees,
    setNewIssueRepoId,
    setNewIssueProvider,
    setNewIssueLinkYunxiao,
    setNewIssueArchiveYunxiao
  } = model
  const {
    openComposerForLinearItem,
    handleUseLinearItem,
    handleOpenOrUseLinearItem,
    handleLinearWorkspaceChange,
    handleLinearTeamSelectionChange,
    handleLinearScopeOpen,
    handleLinearAccessConnected
  } = useTaskPageLinearComposerActions(model)
  const openComposerForJiraItem = useCallback(
    (issue: JiraIssue): void => {
      const taskSourceContext = bindTaskPageJiraItemSourceContext({
        issue,
        sites: jiraSites,
        sourceContext: jiraTaskSourceContext
      })
      if (!taskSourceContext) {
        // Why: composer drops Jira items without matching source context — refuse rather than create unlinked.
        toast.error(
          translate(
            'auto.components.TaskPage.jiraLinkSourceUnavailable',
            'Couldn’t link this Jira issue. Reconnect Jira or pick the matching site, then try again.'
          )
        )
        return
      }
      const linkedWorkItem: LinkedWorkItemSummary = {
        type: 'issue',
        provider: 'jira',
        number: 0,
        title: `${issue.key} ${issue.title}`,
        url: issue.url,
        jiraIdentifier: issue.key
      }
      openModal('new-workspace-composer', {
        linkedWorkItem,
        taskSourceContext,
        prefilledName: getJiraIssueWorkspaceSeed(issue),
        telemetrySource: 'sidebar'
      })
    },
    [jiraSites, jiraTaskSourceContext, openModal]
  )
  const handleUseJiraItem = useCallback(
    (issue: JiraIssue): void => {
      useAppStore.getState().recordFeatureInteraction('jira-tasks')
      openComposerForJiraItem(issue)
    },
    [openComposerForJiraItem]
  )
  const taskPageListChromeHidden = shouldHideTaskPageListChrome({
    taskSource,
    hasGitHubDetail: Boolean(dialogWorkItem),
    hasGitLabDetail: Boolean(gitlabDialogItem),
    hasJiraDetail: Boolean(selectedJiraIssue),
    hasLinearIssueDetail: Boolean(selectedLinearIssue),
    hasLinearProjectContext: Boolean(selectedLinearProject),
    hasLinearViewContext: Boolean(selectedLinearCustomView)
  })
  const { handleUseYunxiaoItem, openComposerForCodeMerge } = useTaskPageYunxiaoActions({
    eligibleRepos,
    selectedRepos,
    openModal,
    yunxiaoTaskSourceContext
  })
  const {
    gitlabFilesDialogItem,
    setGitlabFilesDialogItem,
    gitlabFilesDialogRepo,
    gitlabFilesDialogSourceContext
  } = useTaskPageGitLabFilesDialog({ selectedRepos, primaryRepo })
  const resetNewIssueProviderToGithub = useCallback((): void => {
    setNewIssueProvider('github')
    setNewIssueLinkYunxiao(false)
  }, [setNewIssueProvider, setNewIssueLinkYunxiao])
  const onCreateGitLabIssue = useCallback((): void => {
    // Why: same draft-recovery seeding as the GitHub plus button, but the dialog opens pre-switched to the GitLab provider.
    const seed = resolveNewIssueOpenSeed({
      draft: useAppStore.getState().newIssueDraft,
      selectedRepoIds: selectedRepos.map((r) => r.id)
    })
    setNewIssueTitle(seed.title)
    setNewIssueBody(seed.body)
    setNewIssueLabels([])
    setNewIssueAssignees([])
    setNewIssueRepoId(seed.repoId)
    setNewIssueProvider('gitlab')
    setNewIssueLinkYunxiao(true)
    setNewIssueArchiveYunxiao(true)
    setNewIssueOpen(true)
  }, [
    selectedRepos,
    setNewIssueArchiveYunxiao,
    setNewIssueAssignees,
    setNewIssueBody,
    setNewIssueLabels,
    setNewIssueLinkYunxiao,
    setNewIssueOpen,
    setNewIssueProvider,
    setNewIssueRepoId,
    setNewIssueTitle
  ])
  const nextModel = model as typeof model & {
    openComposerForLinearItem: typeof openComposerForLinearItem
    handleUseLinearItem: typeof handleUseLinearItem
    handleOpenOrUseLinearItem: typeof handleOpenOrUseLinearItem
    handleLinearWorkspaceChange: typeof handleLinearWorkspaceChange
    handleLinearTeamSelectionChange: typeof handleLinearTeamSelectionChange
    handleLinearScopeOpen: typeof handleLinearScopeOpen
    handleLinearAccessConnected: typeof handleLinearAccessConnected
    openComposerForJiraItem: typeof openComposerForJiraItem
    handleUseJiraItem: typeof handleUseJiraItem
    taskPageListChromeHidden: typeof taskPageListChromeHidden
    handleUseYunxiaoItem: typeof handleUseYunxiaoItem
    openComposerForCodeMerge: typeof openComposerForCodeMerge
    gitlabFilesDialogItem: typeof gitlabFilesDialogItem
    setGitlabFilesDialogItem: typeof setGitlabFilesDialogItem
    onOpenFiles: typeof setGitlabFilesDialogItem
    gitlabFilesDialogRepo: typeof gitlabFilesDialogRepo
    gitlabFilesDialogSourceContext: typeof gitlabFilesDialogSourceContext
    resetNewIssueProviderToGithub: typeof resetNewIssueProviderToGithub
    onCreateGitLabIssue: typeof onCreateGitLabIssue
  }
  nextModel.openComposerForLinearItem = openComposerForLinearItem
  nextModel.handleUseLinearItem = handleUseLinearItem
  nextModel.handleOpenOrUseLinearItem = handleOpenOrUseLinearItem
  nextModel.handleLinearWorkspaceChange = handleLinearWorkspaceChange
  nextModel.handleLinearTeamSelectionChange = handleLinearTeamSelectionChange
  nextModel.handleLinearScopeOpen = handleLinearScopeOpen
  nextModel.handleLinearAccessConnected = handleLinearAccessConnected
  nextModel.openComposerForJiraItem = openComposerForJiraItem
  nextModel.handleUseJiraItem = handleUseJiraItem
  nextModel.taskPageListChromeHidden = taskPageListChromeHidden
  nextModel.handleUseYunxiaoItem = handleUseYunxiaoItem
  nextModel.openComposerForCodeMerge = openComposerForCodeMerge
  nextModel.gitlabFilesDialogItem = gitlabFilesDialogItem
  nextModel.setGitlabFilesDialogItem = setGitlabFilesDialogItem
  nextModel.onOpenFiles = setGitlabFilesDialogItem
  nextModel.gitlabFilesDialogRepo = gitlabFilesDialogRepo
  nextModel.gitlabFilesDialogSourceContext = gitlabFilesDialogSourceContext
  nextModel.resetNewIssueProviderToGithub = resetNewIssueProviderToGithub
  nextModel.onCreateGitLabIssue = onCreateGitLabIssue
  return nextModel
}
export type TaskPageComposerActionsModel = ReturnType<typeof useTaskPageComposerActions>
