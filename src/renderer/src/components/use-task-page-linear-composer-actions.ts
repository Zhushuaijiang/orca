import { useCallback } from 'react'
import type { LinearIssue } from '../../../shared/linear/issue-types'
import type { LinearWorkspaceSelection } from '../../../shared/linear/workspace-types'
import { buildLinearIssueLinkedWorkItem } from '@/lib/linear-linked-work-item'
import { getLinearIssueWorkspaceName } from '../../../shared/workspace-name'
import { useAppStore } from '@/store'
import { openLinearIssueWorkspaceOrStart } from '@/lib/linear-issue-workspace-open'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import type { TaskPageJiraListEffectsModel } from './use-task-page-jira-list-effects'

type LinearComposerModel = Pick<
  TaskPageJiraListEffectsModel,
  | 'openModal'
  | 'linearTaskSourceContext'
  | 'clearSelectedLinearIssue'
  | 'selectLinearWorkspace'
  | 'listLinearTeams'
  | 'checkLinearConnection'
  | 'selectedLinearWorkspaceId'
  | 'linearMode'
  | 'setLinearIssues'
  | 'setLinearError'
  | 'setLinearLoading'
  | 'setLinearTeamRefreshNonce'
  | 'setLinearRefreshNonce'
  | 'setLinearProjectsResult'
  | 'setLinearProjectIssuesResult'
  | 'setLinearProjectsError'
  | 'setSelectedLinearProject'
  | 'setSelectedLinearProjectDetail'
  | 'setLinearProjectDetailError'
  | 'setLinearProjectTab'
  | 'setLinearCustomViewsResult'
  | 'setLinearCustomViewsError'
  | 'setSelectedLinearCustomView'
  | 'setLinearCustomViewIssuesResult'
  | 'setLinearCustomViewProjectsResult'
  | 'setLinearCustomViewContentsError'
  | 'setLinearProjectParentView'
  | 'setAvailableTeams'
  | 'setLinearTeamSelection'
  | 'setTaskResumeState'
  | 'linearContextResumeAttemptedRef'
  | 'updateSettings'
>

/** Linear-side task page composer callbacks: item entry points plus workspace/team wiring. */
export function useTaskPageLinearComposerActions(model: LinearComposerModel) {
  // Why: Linear ids are strings (e.g. "ENG-123") but the provider-generic shape needs a numeric number, so the adapter uses 0 as placeholder.
  const openComposerForLinearItem = useCallback(
    (issue: LinearIssue): void => {
      const linkedWorkItem = buildLinearIssueLinkedWorkItem(issue)
      model.openModal('new-workspace-composer', {
        linkedWorkItem,
        taskSourceContext: model.linearTaskSourceContext,
        prefilledName: getLinearIssueWorkspaceName(issue),
        telemetrySource: 'sidebar'
      })
    },
    [model]
  )
  const handleUseLinearItem = useCallback(
    (issue: LinearIssue): void => {
      // Why: like handleUseWorkItem — open the pre-filled dialog instead of creating the worktree directly, so the user confirms name/agent/setup.
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
      model.clearSelectedLinearIssue()
      model.setSelectedLinearProject(null)
      model.setSelectedLinearProjectDetail(null)
      model.setSelectedLinearCustomView(null)
      model.setLinearProjectParentView(null)
      model.setLinearProjectTab('overview')
      model.setLinearProjectsResult({ items: [] })
      model.setLinearCustomViewsResult({ items: [] })
      model.setLinearProjectIssuesResult({ items: [] })
      model.setLinearCustomViewIssuesResult({ items: [] })
      model.setLinearCustomViewProjectsResult({ items: [] })
      model.setLinearProjectDetailError(null)
      model.setLinearProjectsError(null)
      model.setLinearCustomViewsError(null)
      model.setLinearCustomViewContentsError(null)
      model.setTaskResumeState({
        linearMode: model.linearMode,
        linearContext: undefined
      })
      model.linearContextResumeAttemptedRef.current = false
      model.setLinearIssues([])
      model.setLinearError(null)
      model.setLinearLoading(true)
      void model
        .selectLinearWorkspace(workspaceId)
        .then(() => {
          model.setLinearTeamRefreshNonce((n: number) => n + 1)
        })
        .catch(() => {
          model.setLinearLoading(false)
          toast.error(
            translate('auto.components.TaskPage.d0d570b306', 'Failed to switch Linear workspace.')
          )
        })
    },
    [model]
  )
  const handleLinearTeamSelectionChange = useCallback(
    (next: ReadonlySet<string>, persisted: string[] | null): void => {
      model.setLinearTeamSelection(new Set(next))
      void model
        .updateSettings({
          defaultLinearTeamSelection: persisted
        })
        .catch(() => {
          toast.error(
            translate('auto.components.TaskPage.3f594861a5', 'Failed to save team selection.')
          )
        })
    },
    [model]
  )
  const handleLinearScopeOpen = useCallback((): void => {
    void model.checkLinearConnection(true)
    void model
      .listLinearTeams(model.selectedLinearWorkspaceId, { force: true })
      .then((teams) => {
        model.setAvailableTeams(teams)
      })
      .catch(() => {
        console.warn('[TaskPage] Failed to refresh Linear teams')
      })
  }, [model])
  const handleLinearAccessConnected = useCallback((): void => {
    model.setLinearTeamRefreshNonce((n: number) => n + 1)
    model.setLinearRefreshNonce((n: number) => n + 1)
  }, [model])
  return {
    openComposerForLinearItem,
    handleUseLinearItem,
    handleOpenOrUseLinearItem,
    handleLinearWorkspaceChange,
    handleLinearTeamSelectionChange,
    handleLinearScopeOpen,
    handleLinearAccessConnected
  }
}
