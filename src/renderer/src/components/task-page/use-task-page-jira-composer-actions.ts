import { useCallback } from 'react'
import type { JiraIssue } from '../../../../shared/jira/jira-types'
import { useAppStore } from '@/store'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { bindTaskPageJiraItemSourceContext } from './jira/task-page-jira-item-source-context'
import type { LinkedWorkItemSummary } from '@/lib/new-workspace'
import { getJiraIssueWorkspaceSeed } from './task-page-source-context'
import { findJiraIssueDefaultRepo } from '../../../../shared/jira/jira-project-reference'
import { getRepoWorkspaceCreationTargetHint } from '@/lib/project-host-workspace-target'
import type { TaskPageJiraListEffectsModel } from '../use-task-page-jira-list-effects'

export function useTaskPageJiraComposerActions(model: TaskPageJiraListEffectsModel): {
  openComposerForJiraItem: (issue: JiraIssue) => void
  handleUseJiraItem: (issue: JiraIssue) => void
} {
  const { openModal, jiraSites, jiraTaskSourceContext } = model
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
      const mappedRepo = findJiraIssueDefaultRepo(model.repos, issue, taskSourceContext.hostId)
      openModal('new-workspace-composer', {
        linkedWorkItem,
        taskSourceContext,
        initialRepoId: mappedRepo?.id,
        initialWorkspaceTarget: mappedRepo
          ? getRepoWorkspaceCreationTargetHint(mappedRepo, useAppStore.getState().projectHostSetups)
          : undefined,
        prefilledName: getJiraIssueWorkspaceSeed(issue),
        telemetrySource: 'sidebar'
      })
    },
    [jiraSites, jiraTaskSourceContext, model.repos, openModal]
  )
  const handleUseJiraItem = useCallback(
    (issue: JiraIssue): void => {
      useAppStore.getState().recordFeatureInteraction('jira-tasks')
      openComposerForJiraItem(issue)
    },
    [openComposerForJiraItem]
  )
  return { openComposerForJiraItem, handleUseJiraItem }
}
