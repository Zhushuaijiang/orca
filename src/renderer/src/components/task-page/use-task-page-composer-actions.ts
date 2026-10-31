import type { TaskPageJiraListEffectsModel } from '../use-task-page-jira-list-effects'
import { useCallback } from 'react'
import type { LinearIssue } from '../../../../shared/linear/issue-types'
import type { LinearWorkspaceSelection } from '../../../../shared/linear/workspace-types'
import { buildLinearIssueLinkedWorkItem } from '@/lib/linear-linked-work-item'
import { getLinearIssueWorkspaceName } from '../../../../shared/workspace-name'
import { useAppStore } from '@/store'
import { openLinearIssueWorkspaceOrStart } from '@/lib/linear-issue-workspace-open'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { shouldHideTaskPageListChrome } from './task-page-list-chrome-visibility'
import { useTaskPageGitLabFilesDialog } from '../use-task-page-gitlab-files-dialog'
import { useTaskPageJiraComposerActions } from './use-task-page-jira-composer-actions'
import { useTaskPageYunxiaoActions } from '../use-task-page-yunxiao-actions'
import { resolveNewIssueOpenSeed } from './task-page-new-issue-draft'
export function useTaskPageComposerActions(model: TaskPageJiraListEffectsModel) {
  const {
    setTaskResumeState,
    openModal,
    updateSettings,
    selectLinearWorkspace,
    listLinearTeams,
    checkLinearConnection,
    selectedLinearWorkspaceId,
    taskSource,
    linearTaskSourceContext,
    gitlabDialogItem,
    dialogWorkItem,
    selectedLinearIssue,
    clearSelectedLinearIssue,
    selectedJiraIssue,
    linearMode,
    setLinearIssues,
    setLinearLoading,
    setLinearError,
    setLinearRefreshNonce,
    setLinearProjectsResult,
    setLinearProjectsError,
    selectedLinearProject,
    setSelectedLinearProject,
    setSelectedLinearProjectDetail,
    setLinearProjectDetailError,
    setLinearProjectTab,
    setLinearProjectIssuesResult,
    setLinearCustomViewsResult,
    setLinearCustomViewsError,
    selectedLinearCustomView,
    setSelectedLinearCustomView,
    setLinearProjectParentView,
    setLinearCustomViewIssuesResult,
    setLinearCustomViewProjectsResult,
    setLinearCustomViewContentsError,
    linearContextResumeAttemptedRef,
    setAvailableTeams,
    setLinearTeamRefreshNonce,
    setLinearTeamSelection,
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
  // Linear string IDs need the provider-generic numeric placeholder 0.
  const openComposerForLinearItem = useCallback(
    (issue: LinearIssue): void => {
      const linkedWorkItem = buildLinearIssueLinkedWorkItem(issue)
      openModal('new-workspace-composer', {
        linkedWorkItem,
        taskSourceContext: linearTaskSourceContext,
        prefilledName: getLinearIssueWorkspaceName(issue),
        telemetrySource: 'sidebar'
      })
    },
    [linearTaskSourceContext, openModal]
  )
  const handleUseLinearItem = useCallback(
    (issue: LinearIssue): void => {
      // Open the prefilled dialog so name, agent and setup still receive user confirmation.
      useAppStore.getState().recordFeatureInteraction('linear-tasks')
      openComposerForLinearItem(issue)
    },
    [openComposerForLinearItem]
  )
  const handleOpenOrUseLinearItem = useCallback(
    (issue: LinearIssue): void => {
      if (openLinearIssueWorkspaceOrStart(issue, () => handleUseLinearItem(issue)) === 'opened') {
        useAppStore.getState().recordFeatureInteraction('linear-tasks')
      }
    },
    [handleUseLinearItem]
  )
  const handleLinearWorkspaceChange = useCallback(
    (workspaceId: LinearWorkspaceSelection): void => {
      clearSelectedLinearIssue()
      setSelectedLinearProject(null)
      setSelectedLinearProjectDetail(null)
      setSelectedLinearCustomView(null)
      setLinearProjectParentView(null)
      setLinearProjectTab('overview')
      setLinearProjectsResult({
        items: []
      })
      setLinearCustomViewsResult({
        items: []
      })
      setLinearProjectIssuesResult({
        items: []
      })
      setLinearCustomViewIssuesResult({
        items: []
      })
      setLinearCustomViewProjectsResult({
        items: []
      })
      setLinearProjectDetailError(null)
      setLinearProjectsError(null)
      setLinearCustomViewsError(null)
      setLinearCustomViewContentsError(null)
      setTaskResumeState({
        linearMode,
        linearContext: undefined
      })
      linearContextResumeAttemptedRef.current = false
      setLinearIssues([])
      setLinearError(null)
      setLinearLoading(true)
      void selectLinearWorkspace(workspaceId)
        .then(() => {
          setLinearTeamRefreshNonce((n) => n + 1)
        })
        .catch(() => {
          setLinearLoading(false)
          toast.error(
            translate('auto.components.TaskPage.d0d570b306', 'Failed to switch Linear workspace.')
          )
        })
    },
    [
      clearSelectedLinearIssue,
      linearMode,
      selectLinearWorkspace,
      setTaskResumeState,
      linearContextResumeAttemptedRef,
      setSelectedLinearProjectDetail,
      setLinearProjectTab,
      setLinearProjectsError,
      setLinearProjectsResult,
      setLinearCustomViewIssuesResult,
      setLinearCustomViewsError,
      setSelectedLinearProject,
      setSelectedLinearCustomView,
      setLinearTeamRefreshNonce,
      setLinearProjectParentView,
      setLinearProjectIssuesResult,
      setLinearCustomViewsResult,
      setLinearCustomViewProjectsResult,
      setLinearError,
      setLinearLoading,
      setLinearProjectDetailError,
      setLinearCustomViewContentsError,
      setLinearIssues
    ]
  )
  const handleLinearTeamSelectionChange = useCallback(
    (next: ReadonlySet<string>, persisted: string[] | null): void => {
      setLinearTeamSelection(new Set(next))
      void updateSettings({
        defaultLinearTeamSelection: persisted
      }).catch(() => {
        toast.error(
          translate('auto.components.TaskPage.3f594861a5', 'Failed to save team selection.')
        )
      })
    },
    [updateSettings, setLinearTeamSelection]
  )
  const handleLinearScopeOpen = useCallback((): void => {
    void checkLinearConnection(true)
    void listLinearTeams(selectedLinearWorkspaceId, {
      force: true
    })
      .then((teams) => {
        setAvailableTeams(teams)
      })
      .catch(() => {
        console.warn('[TaskPage] Failed to refresh Linear teams')
      })
  }, [checkLinearConnection, listLinearTeams, selectedLinearWorkspaceId, setAvailableTeams])
  const handleLinearAccessConnected = useCallback((): void => {
    setLinearTeamRefreshNonce((n) => n + 1)
    setLinearRefreshNonce((n) => n + 1)
  }, [setLinearTeamRefreshNonce, setLinearRefreshNonce])
  const { openComposerForJiraItem, handleUseJiraItem } = useTaskPageJiraComposerActions(model)
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
