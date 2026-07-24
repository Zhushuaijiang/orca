import { useEffect, useMemo, useState, type JSX } from 'react'
import { toast } from 'sonner'

import { translate } from '@/i18n/i18n'
import type {
  YunxiaoListWorkItemsResult,
  YunxiaoTodoPoolItem,
  YunxiaoTodoPoolStatus,
  YunxiaoWorkItem,
  YunxiaoWorkItemCategory
} from '../../../shared/types'
import { TaskPageYunxiaoWorkItemTable } from './task-page-yunxiao-work-item-table'
import { TaskPageYunxiaoWorkItemToolbar } from './task-page-yunxiao-work-item-toolbar'
import { useYunxiaoTodoPoolAutomation } from './yunxiao-todo-pool-automation'
import {
  facetLabel,
  itemMatchesText,
  statusSelectionLabel,
  todoPoolStatusLabel,
  workItemIdentity,
  YUNXIAO_PAGE_SIZE,
  type YunxiaoListView,
  type YunxiaoRelationFilter
} from './task-page-yunxiao-work-item-model'

type TaskPageYunxiaoWorkItemListProps = {
  onStartWorkspace: (item: YunxiaoWorkItem) => void
}

export function TaskPageYunxiaoWorkItemList({
  onStartWorkspace
}: TaskPageYunxiaoWorkItemListProps): JSX.Element {
  const [view, setView] = useState<YunxiaoListView>('work-items')
  const [category, setCategory] = useState<YunxiaoWorkItemCategory | 'all'>('Req')
  const [relation, setRelation] = useState<YunxiaoRelationFilter>('assigned-self')
  const [sprintId, setSprintId] = useState<string>('all')
  const [statusIds, setStatusIds] = useState<string[]>([])
  const [todoPoolStatuses, setTodoPoolStatuses] = useState<YunxiaoTodoPoolStatus[]>([])
  const [queryInput, setQueryInput] = useState('')
  const [appliedQuery, setAppliedQuery] = useState('')
  const [page, setPage] = useState(1)
  const [refreshNonce, setRefreshNonce] = useState(0)
  const [todoPoolNonce, setTodoPoolNonce] = useState(0)
  const [result, setResult] = useState<YunxiaoListWorkItemsResult | null>(null)
  const [todoPool, setTodoPool] = useState<YunxiaoTodoPoolItem[]>([])
  const [loading, setLoading] = useState(false)
  const [todoPoolLoading, setTodoPoolLoading] = useState(false)
  const [archiveTarget, setArchiveTarget] = useState<string | null>(null)
  const [selectedWorkItemIds, setSelectedWorkItemIds] = useState<Set<string>>(() => new Set())
  const {
    configureTodoPoolAutomation,
    configuringTodoPoolAutomation,
    runNextTodoPoolAutomation,
    runningTodoPoolAutomation
  } = useYunxiaoTodoPoolAutomation({
    onTodoPoolChanged: () => setTodoPoolNonce((value) => value + 1)
  })

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAppliedQuery(queryInput.trim())
      setPage(1)
    }, 350)
    return () => window.clearTimeout(timer)
  }, [queryInput])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void window.api.yunxiao
      .listWorkItems({
        filters: {
          category,
          sprintId: sprintId === 'all' ? null : sprintId,
          statusIds: statusIds.length > 0 ? statusIds : undefined,
          assigneeId: relation === 'assigned-self' ? 'self' : null,
          participantId: relation === 'participant-self' ? 'self' : null,
          query: appliedQuery,
          page,
          perPage: YUNXIAO_PAGE_SIZE
        }
      })
      .then((nextResult) => {
        if (!cancelled) {
          setResult(nextResult)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setResult({ ok: false, error: error instanceof Error ? error.message : String(error) })
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [appliedQuery, category, page, refreshNonce, relation, sprintId, statusIds])

  useEffect(() => {
    let cancelled = false
    setTodoPoolLoading(true)
    void window.api.yunxiao
      .listTodoPool()
      .then((items) => {
        if (!cancelled) {
          setTodoPool(items)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : String(error))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setTodoPoolLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [todoPoolNonce])

  const items = useMemo(() => (result?.ok ? result.items : []), [result])
  const sprints = useMemo(() => (result?.ok ? result.sprints : []), [result])
  const statuses = useMemo(() => (result?.ok ? result.statuses : []), [result])
  const todoPoolIdentitySet = useMemo(
    () => new Set(todoPool.map((item) => workItemIdentity(item))),
    [todoPool]
  )
  const visibleTodoPoolItems = useMemo(
    () =>
      todoPool.filter(
        (item) =>
          (todoPoolStatuses.length === 0 || todoPoolStatuses.includes(item.poolStatus)) &&
          (!appliedQuery ||
            itemMatchesText(item, appliedQuery) ||
            todoPoolStatusLabel(item.poolStatus).includes(appliedQuery))
      ),
    [appliedQuery, todoPool, todoPoolStatuses]
  )
  const selectedWorkItems = useMemo(
    () => items.filter((item) => selectedWorkItemIds.has(item.id)),
    [items, selectedWorkItemIds]
  )
  const allVisibleWorkItemsSelected =
    items.length > 0 && items.every((item) => selectedWorkItemIds.has(item.id))
  const someVisibleWorkItemsSelected =
    items.some((item) => selectedWorkItemIds.has(item.id)) && !allVisibleWorkItemsSelected
  const footerContextLabel =
    (relation === 'all'
      ? translate('auto.components.TaskPage.c2268a9982', 'All')
      : relation === 'assigned-self'
        ? translate('auto.components.TaskPage.yunxiaoAssignedToMe', 'Assigned to me')
        : translate('auto.components.TaskPage.yunxiaoParticipating', 'Participating')) +
    (sprintId !== 'all' ? ` · ${facetLabel(sprints, sprintId)}` : '') +
    (statusIds.length > 0 ? ` · ${statusSelectionLabel(statuses, statusIds)}` : '')

  const setTodoPoolFromApi = async (nextItems: YunxiaoWorkItem[]): Promise<void> => {
    const nextPool = await window.api.yunxiao.addTodoPoolItems({ items: nextItems })
    setTodoPool(nextPool)
    toast.success(translate('auto.components.TaskPage.yunxiaoTodoPoolAdded', 'Added to todo pool.'))
  }

  const handleAddToTodoPool = async (item: YunxiaoWorkItem): Promise<void> => {
    try {
      await setTodoPoolFromApi([item])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  const handleAddSelectedToTodoPool = async (): Promise<void> => {
    try {
      await setTodoPoolFromApi(selectedWorkItems)
      setSelectedWorkItemIds(new Set())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  const handleRemoveFromTodoPool = async (item: YunxiaoWorkItem): Promise<void> => {
    try {
      const removed = await window.api.yunxiao.removeTodoPoolItem(item.id)
      if (removed) {
        setTodoPool((current) => current.filter((entry) => entry.id !== item.id))
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  const handleTodoPoolStatusChange = async (
    item: YunxiaoWorkItem,
    poolStatus: YunxiaoTodoPoolStatus
  ): Promise<void> => {
    try {
      const updated = await window.api.yunxiao.updateTodoPoolItem({
        id: item.id,
        updates: { poolStatus }
      })
      if (updated) {
        setTodoPool((current) =>
          current.map((entry) => (entry.id === updated.id ? updated : entry))
        )
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  const handleArchive = async (item: YunxiaoWorkItem): Promise<void> => {
    const target = item.serialNumber ?? item.url ?? item.id
    setArchiveTarget(item.id)
    try {
      const archiveResult = await window.api.yunxiao.archiveRequirement({
        workItemIdOrUrl: target,
        dispatch: true,
        reviewMode: 'deep'
      })
      if (archiveResult.ok) {
        if (todoPoolIdentitySet.has(workItemIdentity(item))) {
          void handleTodoPoolStatusChange(item, 'dispatched')
        }
        toast.success(
          translate('auto.components.TaskPage.yunxiaoArchiveStarted', 'Yunxiao archive started.')
        )
        return
      }
      toast.error(archiveResult.error)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setArchiveTarget(null)
    }
  }

  return (
    <div className="flex min-h-0 max-h-full flex-col overflow-hidden rounded-md rounded-t-none border border-t-0 border-border/50 bg-background shadow-sm">
      <TaskPageYunxiaoWorkItemToolbar
        category={category}
        configuringTodoPoolAutomation={configuringTodoPoolAutomation}
        loading={view === 'work-items' ? loading : todoPoolLoading}
        onAddSelected={() => void handleAddSelectedToTodoPool()}
        onCategoryChange={(nextCategory) => {
          setCategory(nextCategory)
          setPage(1)
        }}
        onConfigureTodoPoolAutomation={() => void configureTodoPoolAutomation()}
        onQueryInputChange={setQueryInput}
        onQuerySubmit={() => {
          setAppliedQuery(queryInput.trim())
          setPage(1)
        }}
        onRefresh={() => {
          setRefreshNonce((value) => value + 1)
          setTodoPoolNonce((value) => value + 1)
        }}
        onRelationChange={(nextRelation) => {
          setRelation(nextRelation)
          setPage(1)
        }}
        onSprintChange={(nextSprintId) => {
          setSprintId(nextSprintId)
          setPage(1)
        }}
        onStatusIdsChange={(nextStatusIds) => {
          setStatusIds(nextStatusIds)
          setPage(1)
        }}
        onRunNextTodoPoolAutomation={() => void runNextTodoPoolAutomation()}
        onTodoPoolStatusChange={setTodoPoolStatuses}
        onViewChange={setView}
        queryInput={queryInput}
        relation={relation}
        runningTodoPoolAutomation={runningTodoPoolAutomation}
        selectedCount={selectedWorkItems.length}
        shownCount={view === 'work-items' ? items.length : visibleTodoPoolItems.length}
        sprintId={sprintId}
        sprints={sprints}
        statusIds={statusIds}
        statuses={statuses}
        todoPoolStatus={todoPoolStatuses}
        view={view}
      />
      {!result?.ok && result && view === 'work-items' ? (
        <div className="border-b border-border px-4 py-4 text-sm text-destructive">
          {result.error}
        </div>
      ) : null}
      <TaskPageYunxiaoWorkItemTable
        allVisibleWorkItemsSelected={allVisibleWorkItemsSelected}
        archiveTarget={archiveTarget}
        footerContextLabel={footerContextLabel}
        hasMore={result?.ok ? result.hasMore : false}
        items={items}
        loading={loading}
        onAddToTodoPool={(item) => void handleAddToTodoPool(item)}
        onArchive={(item) => void handleArchive(item)}
        onNextPage={() => setPage((value) => value + 1)}
        onPreviousPage={() => setPage((value) => Math.max(1, value - 1))}
        onRemoveFromTodoPool={(item) => void handleRemoveFromTodoPool(item)}
        onSelectionChange={setSelectedWorkItemIds}
        onSetTodoPoolStatus={(item, status) => void handleTodoPoolStatusChange(item, status)}
        onStartTodoPoolWorkspace={(item) => {
          onStartWorkspace(item)
          void handleTodoPoolStatusChange(item, 'workspace-created')
        }}
        onStartWorkspace={onStartWorkspace}
        page={result?.ok ? result.page : page}
        selectedWorkItemIds={selectedWorkItemIds}
        someVisibleWorkItemsSelected={someVisibleWorkItemsSelected}
        todoPoolIdentitySet={todoPoolIdentitySet}
        todoPoolItems={visibleTodoPoolItems}
        todoPoolLoading={todoPoolLoading}
        view={view}
      />
    </div>
  )
}
