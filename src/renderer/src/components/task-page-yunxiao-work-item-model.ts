import { translate } from '@/i18n/i18n'
import type {
  YunxiaoTodoPoolStatus,
  YunxiaoWorkItem,
  YunxiaoWorkItemCategory,
  YunxiaoWorkItemFacet
} from '../../../shared/types'

export type YunxiaoRelationFilter = 'all' | 'assigned-self' | 'participant-self'
export type YunxiaoListView = 'work-items' | 'todo-pool'
export type YunxiaoStatusFilterMode = 'default' | 'custom'

export const YUNXIAO_PAGE_SIZE = 100
export const YUNXIAO_GRID_CLASS =
  'grid-cols-[82px_110px_minmax(280px,2fr)_100px_120px_86px_92px_118px_118px]'
export const YUNXIAO_TODO_POOL_STATUSES: YunxiaoTodoPoolStatus[] = [
  'queued',
  'needs-clarification',
  'ready-to-build',
  'archived',
  'running',
  'dispatched',
  'workspace-created',
  'failed',
  'done',
  'dismissed'
]
export const DEFAULT_VISIBLE_YUNXIAO_TODO_POOL_STATUSES: YunxiaoTodoPoolStatus[] =
  YUNXIAO_TODO_POOL_STATUSES.filter((status) => status !== 'done' && status !== 'dismissed')
export const DEFAULT_YUNXIAO_REQUIREMENT_STATUS_NAMES = ['新', '待开发'] as const
export const DEFAULT_YUNXIAO_BUG_STATUS_NAMES = ['待修复'] as const

export function formatYunxiaoDate(value: string | null): string {
  if (!value) {
    return ''
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  return date.toLocaleDateString()
}

export function facetLabel(facets: readonly YunxiaoWorkItemFacet[], id: string): string {
  return facets.find((facet) => facet.id === id)?.name ?? id
}

export function workItemIdentity(item: Pick<YunxiaoWorkItem, 'id' | 'serialNumber'>): string {
  return item.serialNumber?.trim() || item.id
}

export function itemMatchesText(item: YunxiaoWorkItem, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) {
    return true
  }
  return [
    item.id,
    item.serialNumber,
    item.title,
    item.statusName,
    item.customer,
    item.priority,
    item.assignee?.name,
    item.sprint?.name
  ].some((value) => value?.toLowerCase().includes(needle))
}

export function todoPoolStatusLabel(status: YunxiaoTodoPoolStatus): string {
  switch (status) {
    case 'queued':
      return translate('auto.components.TaskPage.yunxiaoTodoPoolQueued', 'Queued')
    case 'needs-clarification':
      return translate(
        'auto.components.TaskPage.yunxiaoTodoPoolNeedsClarification',
        'Needs clarification'
      )
    case 'ready-to-build':
      return translate('auto.components.TaskPage.yunxiaoTodoPoolReadyToBuild', 'Ready to build')
    case 'archived':
      return translate('auto.components.TaskPage.yunxiaoTodoPoolArchived', 'Archived')
    case 'running':
      return translate('auto.components.TaskPage.yunxiaoTodoPoolRunning', 'Running')
    case 'dispatched':
      return translate('auto.components.TaskPage.yunxiaoTodoPoolDispatched', 'Dispatched')
    case 'workspace-created':
      return translate('auto.components.TaskPage.yunxiaoTodoPoolWorkspaceCreated', 'Workspace')
    case 'failed':
      return translate('auto.components.TaskPage.yunxiaoTodoPoolFailed', 'Failed')
    case 'done':
      return translate('auto.components.TaskPage.yunxiaoTodoPoolDone', 'Done')
    case 'dismissed':
      return translate('auto.components.TaskPage.yunxiaoTodoPoolDismissed', 'Dismissed')
  }
}

export function todoPoolStatusSelectionLabel(
  selectedStatuses: readonly YunxiaoTodoPoolStatus[]
): string {
  if (selectedStatuses.length === 0) {
    return translate('auto.components.TaskPage.yunxiaoOpenPoolStatuses', 'Open pool states')
  }
  if (selectedStatuses.length === 1) {
    return todoPoolStatusLabel(selectedStatuses[0])
  }
  return translate('auto.components.TaskPage.yunxiaoSelectedPoolStatuses', '{{value0}} states', {
    value0: selectedStatuses.length
  })
}

export function statusSelectionLabel(
  statuses: readonly YunxiaoWorkItemFacet[],
  selectedStatusIds: readonly string[],
  mode: YunxiaoStatusFilterMode = 'custom',
  category: YunxiaoWorkItemCategory | 'all' = 'all'
): string {
  if (mode === 'default') {
    const names = getDefaultYunxiaoStatusNames(category)
    return names.length > 0
      ? translate('auto.components.TaskPage.yunxiaoDefaultStatuses', 'Default: {{value0}}', {
          value0: names.join(', ')
        })
      : translate('auto.components.TaskPage.yunxiaoAllStatuses', 'All statuses')
  }
  if (selectedStatusIds.length === 0) {
    return translate('auto.components.TaskPage.yunxiaoAllStatuses', 'All statuses')
  }
  if (selectedStatusIds.length === 1) {
    return facetLabel(statuses, selectedStatusIds[0])
  }
  return translate('auto.components.TaskPage.yunxiaoSelectedStatuses', '{{value0}} statuses', {
    value0: selectedStatusIds.length
  })
}

export function getDefaultYunxiaoStatusNames(category: YunxiaoWorkItemCategory | 'all'): string[] {
  if (category === 'Req') {
    return [...DEFAULT_YUNXIAO_REQUIREMENT_STATUS_NAMES]
  }
  if (category === 'Bug') {
    return [...DEFAULT_YUNXIAO_BUG_STATUS_NAMES]
  }
  if (category === 'all') {
    return [...DEFAULT_YUNXIAO_REQUIREMENT_STATUS_NAMES, ...DEFAULT_YUNXIAO_BUG_STATUS_NAMES]
  }
  return []
}

export function resolveDefaultYunxiaoStatusIds(
  statuses: readonly YunxiaoWorkItemFacet[],
  category: YunxiaoWorkItemCategory | 'all'
): string[] {
  return getDefaultYunxiaoStatusNames(category).map((name) => {
    const status = statuses.find((facet) => facet.name === name || facet.id === name)
    return status?.id ?? name
  })
}

export function resolveYunxiaoStatusFilterIds(args: {
  category: YunxiaoWorkItemCategory | 'all'
  mode: YunxiaoStatusFilterMode
  selectedStatusIds: readonly string[]
  statuses: readonly YunxiaoWorkItemFacet[]
}): string[] {
  return args.mode === 'default'
    ? resolveDefaultYunxiaoStatusIds(args.statuses, args.category)
    : [...args.selectedStatusIds]
}
