import type { JSX } from 'react'

import { Checkbox } from '@/components/ui/checkbox'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type {
  YunxiaoTodoPoolItem,
  YunxiaoTodoPoolStatus,
  YunxiaoWorkItem
} from '../../../shared/types'
import { TodoPoolEmptyState, WorkItemsEmptyState } from './task-page-yunxiao-work-item-empty-states'
import { TaskPageYunxiaoWorkItemFooter } from './task-page-yunxiao-work-item-footer'
import {
  YUNXIAO_GRID_CLASS,
  YUNXIAO_TODO_POOL_GRID_CLASS,
  type YunxiaoListView
} from './task-page-yunxiao-work-item-model'
import { YunxiaoTableRow } from './task-page-yunxiao-work-item-table-row'

type TaskPageYunxiaoWorkItemTableProps = {
  view: YunxiaoListView
  items: readonly YunxiaoWorkItem[]
  todoPoolItems: readonly YunxiaoTodoPoolItem[]
  todoPoolIdentitySet: ReadonlySet<string>
  loading: boolean
  todoPoolLoading: boolean
  selectedWorkItemIds: ReadonlySet<string>
  allVisibleWorkItemsSelected: boolean
  someVisibleWorkItemsSelected: boolean
  archiveTarget: string | null
  footerContextLabel: string
  page: number
  hasMore: boolean
  onSelectionChange: (nextSelectedIds: Set<string>) => void
  onArchive: (item: YunxiaoWorkItem) => void
  onAddToTodoPool: (item: YunxiaoWorkItem) => void
  onAnswerRequirementQuestion: (item: YunxiaoTodoPoolItem) => void
  onRemoveFromTodoPool: (item: YunxiaoWorkItem) => void
  onSetTodoPoolOrder: (id: string, poolOrder: number) => void
  onSetTodoPoolStatus: (item: YunxiaoWorkItem, status: YunxiaoTodoPoolStatus) => void
  onStartWorkspace: (item: YunxiaoWorkItem) => void
  onStartTodoPoolWorkspace: (item: YunxiaoWorkItem) => void
  onPreviousPage: () => void
  onNextPage: () => void
}

export function TaskPageYunxiaoWorkItemTable({
  allVisibleWorkItemsSelected,
  archiveTarget,
  footerContextLabel,
  hasMore,
  items,
  loading,
  onAddToTodoPool,
  onAnswerRequirementQuestion,
  onArchive,
  onNextPage,
  onPreviousPage,
  onRemoveFromTodoPool,
  onSelectionChange,
  onSetTodoPoolOrder,
  onSetTodoPoolStatus,
  onStartTodoPoolWorkspace,
  onStartWorkspace,
  page,
  selectedWorkItemIds,
  someVisibleWorkItemsSelected,
  todoPoolIdentitySet,
  todoPoolItems,
  todoPoolLoading,
  view
}: TaskPageYunxiaoWorkItemTableProps): JSX.Element {
  return (
    <>
      <YunxiaoTableHeader
        allVisibleWorkItemsSelected={allVisibleWorkItemsSelected}
        items={items}
        onSelectionChange={onSelectionChange}
        selectedWorkItemIds={selectedWorkItemIds}
        someVisibleWorkItemsSelected={someVisibleWorkItemsSelected}
        view={view}
      />
      <div className="min-h-0 flex-1 overflow-auto scrollbar-sleek">
        {view === 'work-items' && loading && items.length === 0 ? (
          <YunxiaoTableSkeleton rowCount={12} view={view} />
        ) : null}
        {view === 'todo-pool' && todoPoolLoading && todoPoolItems.length === 0 ? (
          <YunxiaoTableSkeleton rowCount={6} view={view} />
        ) : null}
        {view === 'work-items' && !loading && items.length === 0 ? <WorkItemsEmptyState /> : null}
        {view === 'todo-pool' && !todoPoolLoading && todoPoolItems.length === 0 ? (
          <TodoPoolEmptyState />
        ) : null}
        <div className="divide-y divide-border/50">
          {(view === 'work-items' ? items : todoPoolItems).map((item) => (
            <YunxiaoTableRow
              key={item.id}
              archiveTarget={archiveTarget}
              item={item}
              onAddToTodoPool={onAddToTodoPool}
              onAnswerRequirementQuestion={onAnswerRequirementQuestion}
              onArchive={onArchive}
              onRemoveFromTodoPool={onRemoveFromTodoPool}
              onSelectionChange={onSelectionChange}
              onSetTodoPoolOrder={onSetTodoPoolOrder}
              onSetTodoPoolStatus={onSetTodoPoolStatus}
              onStartTodoPoolWorkspace={onStartTodoPoolWorkspace}
              onStartWorkspace={onStartWorkspace}
              selectedWorkItemIds={selectedWorkItemIds}
              todoPoolIdentitySet={todoPoolIdentitySet}
              view={view}
            />
          ))}
        </div>
      </div>
      <TaskPageYunxiaoWorkItemFooter
        contextLabel={
          view === 'work-items'
            ? footerContextLabel
            : translate('auto.components.TaskPage.yunxiaoTodoPoolView', 'Todo pool')
        }
        page={view === 'work-items' ? page : 1}
        loadedCount={view === 'work-items' ? items.length : todoPoolItems.length}
        hasMore={view === 'work-items' ? hasMore : false}
        loading={view === 'work-items' ? loading : todoPoolLoading}
        onPreviousPage={view === 'work-items' ? onPreviousPage : () => undefined}
        onNextPage={view === 'work-items' ? onNextPage : () => undefined}
      />
    </>
  )
}

function YunxiaoTableHeader({
  allVisibleWorkItemsSelected,
  items,
  onSelectionChange,
  selectedWorkItemIds,
  someVisibleWorkItemsSelected,
  view
}: Pick<
  TaskPageYunxiaoWorkItemTableProps,
  | 'allVisibleWorkItemsSelected'
  | 'items'
  | 'onSelectionChange'
  | 'selectedWorkItemIds'
  | 'someVisibleWorkItemsSelected'
  | 'view'
>): JSX.Element {
  return (
    <div
      className={cn(
        'grid h-8 flex-none items-center gap-3 border-b border-border/50 bg-muted/25 px-3 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground',
        view === 'todo-pool' ? YUNXIAO_TODO_POOL_GRID_CLASS : YUNXIAO_GRID_CLASS
      )}
    >
      <span className="flex items-center justify-center">
        {view === 'todo-pool' ? (
          translate('auto.components.TaskPage.yunxiaoPoolOrder', 'Order')
        ) : (
          <Checkbox
            checked={
              allVisibleWorkItemsSelected || (someVisibleWorkItemsSelected && 'indeterminate')
            }
            disabled={items.length === 0}
            onCheckedChange={(checked) => {
              const next = new Set(selectedWorkItemIds)
              for (const item of items) {
                if (checked) {
                  next.add(item.id)
                } else {
                  next.delete(item.id)
                }
              }
              onSelectionChange(next)
            }}
            aria-label={translate('auto.components.TaskPage.yunxiaoSelectPage', 'Select page')}
          />
        )}
      </span>
      <span>{translate('auto.components.TaskPage.eb10c32872', 'ID')}</span>
      <span>{translate('auto.components.TaskPage.16cba35bee', 'Title')}</span>
      <span>{translate('auto.components.TaskPage.154b0fa623', 'Status')}</span>
      {view === 'todo-pool' ? (
        <span>{translate('auto.components.TaskPage.yunxiaoPoolState', 'Pool state')}</span>
      ) : null}
      <span>{translate('auto.components.TaskPage.yunxiaoCustomer', 'Customer')}</span>
      <span>{translate('auto.components.TaskPage.c8d5bec5f7', 'Priority')}</span>
      <span>{translate('auto.components.TaskPage.d2a876ca53', 'Assignee')}</span>
      <span>{translate('auto.components.TaskPage.yunxiaoSprint', 'Sprint')}</span>
      <span className="sticky right-0 z-20 h-full border-l border-border/50 bg-muted/25" />
    </div>
  )
}

function YunxiaoTableSkeleton({
  rowCount,
  view
}: {
  rowCount: number
  view: YunxiaoListView
}): JSX.Element {
  return (
    <div className="divide-y divide-border/50">
      {Array.from({ length: rowCount }).map((_, index) => (
        <div
          key={index}
          className={cn(
            'grid gap-3 px-3 py-2',
            view === 'todo-pool' ? YUNXIAO_TODO_POOL_GRID_CLASS : YUNXIAO_GRID_CLASS
          )}
        >
          <div />
          <div className="h-4 w-20 animate-pulse rounded bg-muted/70" />
          <div className="h-4 w-4/5 animate-pulse rounded bg-muted/70" />
          <div className="h-4 w-16 animate-pulse rounded bg-muted/60" />
          {view === 'todo-pool' ? (
            <div className="h-4 w-16 animate-pulse rounded bg-muted/60" />
          ) : null}
          <div className="h-4 w-20 animate-pulse rounded bg-muted/60" />
          <div className="h-4 w-12 animate-pulse rounded bg-muted/60" />
          <div className="h-4 w-14 animate-pulse rounded bg-muted/60" />
          <div className="h-4 w-20 animate-pulse rounded bg-muted/60" />
          <div />
        </div>
      ))}
    </div>
  )
}
