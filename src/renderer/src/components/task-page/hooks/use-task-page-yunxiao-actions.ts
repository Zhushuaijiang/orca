import { useCallback } from 'react'

import { useAppStore } from '@/store'
import {
  getLinkedWorkItemSuggestedName,
  getLinkedWorkItemWorkspaceName,
  type LinkedWorkItemSummary
} from '@/lib/new-workspace'
import { buildYunxiaoWorkspaceSource } from '../../../../../shared/new-workspace/workspace-source'
import type { TaskSourceContext } from '../../../../../shared/task-source-context'
import type { Repo } from '../../../../../shared/repo-types'
import type { YunxiaoWorkItem } from '../../../../../shared/types'
import {
  buildCodeMergeLinkedWorkItem,
  buildCodeMergePrompt,
  getCodeMergeWorkspaceSeed,
  type CodeMergeComposerAction
} from '@/components/task-page-code-merge-workflow'

function getYunxiaoWorkItemUrl(item: YunxiaoWorkItem): string {
  const identifier = item.serialNumber ?? item.id
  return item.url ?? `yunxiao://work-item/${encodeURIComponent(identifier)}`
}

function getYunxiaoWorkItemWorkspaceSeed(item: YunxiaoWorkItem): string {
  const title = item.serialNumber ? `${item.serialNumber} ${item.title}` : item.title
  return (
    getLinkedWorkItemWorkspaceName({
      type: 'issue',
      provider: 'yunxiao',
      number: 0,
      title,
      yunxiaoIdentifier: item.serialNumber ?? item.id
    })?.seedName ?? getLinkedWorkItemSuggestedName({ title })
  )
}

function buildYunxiaoLinkedContext(item: YunxiaoWorkItem, repo: Repo | null | undefined): string {
  const url = getYunxiaoWorkItemUrl(item)
  const rows = [
    ['ID', item.serialNumber ?? item.id],
    ['Title', item.title],
    ['Type', item.typeName ?? item.category],
    ['Status', item.statusName],
    ['Customer', item.customer],
    ['Priority', item.priority],
    ['Assignee', item.assignee?.name],
    [
      'Participants',
      item.participants
        .map((participant) => participant.name)
        .filter(Boolean)
        .join(', ')
    ],
    ['Sprint', item.sprint?.name],
    ['Updated', item.updatedAt],
    ['Orca selected code workspace', repo?.displayName],
    ['Orca selected code workspace path', repo?.path],
    ['URL', url]
  ]
  return rows
    .filter((row): row is [string, string] => Boolean(row[1]?.trim()))
    .map(([label, value]) => `${label}: ${value}`)
    .join('\n')
}

export function useTaskPageYunxiaoActions({
  eligibleRepos,
  selectedRepos,
  openModal,
  yunxiaoTaskSourceContext
}: {
  eligibleRepos: Repo[]
  selectedRepos: Repo[]
  openModal: (modal: 'new-workspace-composer', args?: Record<string, unknown>) => void
  yunxiaoTaskSourceContext: TaskSourceContext | null
}) {
  const openComposerForYunxiaoItem = useCallback(
    (item: YunxiaoWorkItem): void => {
      const selectedCodeRepo = selectedRepos[0] ?? eligibleRepos[0]
      const repoId = selectedCodeRepo?.id
      const linkedWorkItem: LinkedWorkItemSummary = {
        ...buildYunxiaoWorkspaceSource({
          identifier: item.serialNumber ?? item.id,
          title: item.serialNumber ? `${item.serialNumber} ${item.title}` : item.title,
          url: getYunxiaoWorkItemUrl(item),
          repoId
        }),
        linkedContext: {
          provider: 'yunxiao',
          version: 1,
          renderedText: buildYunxiaoLinkedContext(item, selectedCodeRepo)
        }
      }
      openModal('new-workspace-composer', {
        linkedWorkItem,
        taskSourceContext: yunxiaoTaskSourceContext,
        prefilledName: getYunxiaoWorkItemWorkspaceSeed(item),
        initialRepoId: repoId,
        telemetrySource: 'sidebar'
      })
    },
    [eligibleRepos, openModal, selectedRepos, yunxiaoTaskSourceContext]
  )

  const handleUseYunxiaoItem = useCallback(
    (item: YunxiaoWorkItem): void => {
      useAppStore.getState().recordFeatureInteraction('yunxiao-tasks')
      openComposerForYunxiaoItem(item)
    },
    [openComposerForYunxiaoItem]
  )

  const openComposerForCodeMerge = useCallback(
    (action: CodeMergeComposerAction, excelPath: string): void => {
      openModal('new-workspace-composer', {
        linkedWorkItem: buildCodeMergeLinkedWorkItem(action, excelPath),
        prefilledName: getCodeMergeWorkspaceSeed(action, excelPath),
        initialPrompt: buildCodeMergePrompt(action, excelPath),
        telemetrySource: 'sidebar'
      })
    },
    [openModal]
  )

  return {
    handleUseYunxiaoItem,
    openComposerForCodeMerge
  }
}
