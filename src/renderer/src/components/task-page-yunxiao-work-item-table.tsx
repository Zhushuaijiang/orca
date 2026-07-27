import type { DragEvent, JSX } from 'react'

import { Checkbox } from '@/components/ui/checkbox'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type {
  YunxiaoTodoPoolItem,
  YunxiaoTodoPoolStatus,
  YunxiaoWorkItem
} from '../../../shared/types'
import { TaskPageYunxiaoWorkItemActions } from './task-page-yunxiao-work-item-actions'
import { TodoPoolEmptyState, WorkItemsEmptyState } from './task-page-yunxiao-work-item-empty-states'
import { TaskPageYunxiaoWorkItemFooter } from './task-page-yunxiao-work-item-footer'
import { TaskPageYunxiaoTodoPoolOrderControl } from './task-page-yunxiao-todo-pool-order-control'
import {
  formatYunxiaoDate,
  todoPoolStatusLabel,
  workItemIdentity,
  YUNXIAO_GRID_CLASS,
  type YunxiaoListView
} from './task-page-yunxiao-work-item-model'

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
          <YunxiaoTableSkeleton rowCount={12} />
        ) : null}
        {view === 'todo-pool' && todoPoolLoading && todoPoolItems.length === 0 ? (
          <YunxiaoTableSkeleton rowCount={6} />
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
        YUNXIAO_GRID_CLASS
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
      <span>
        {view === 'todo-pool'
          ? translate('auto.components.TaskPage.yunxiaoPoolState', 'Pool state')
          : translate('auto.components.TaskPage.154b0fa623', 'Status')}
      </span>
      <span>{translate('auto.components.TaskPage.yunxiaoCustomer', 'Customer')}</span>
      <span>{translate('auto.components.TaskPage.c8d5bec5f7', 'Priority')}</span>
      <span>{translate('auto.components.TaskPage.d2a876ca53', 'Assignee')}</span>
      <span>{translate('auto.components.TaskPage.yunxiaoSprint', 'Sprint')}</span>
      <span className="sticky right-0 z-20 h-full border-l border-border/50 bg-muted/25" />
    </div>
  )
}

function YunxiaoTableSkeleton({ rowCount }: { rowCount: number }): JSX.Element {
  return (
    <div className="divide-y divide-border/50">
      {Array.from({ length: rowCount }).map((_, index) => (
        <div key={index} className={cn('grid gap-3 px-3 py-2', YUNXIAO_GRID_CLASS)}>
          <div />
          <div className="h-4 w-20 animate-pulse rounded bg-muted/70" />
          <div className="h-4 w-4/5 animate-pulse rounded bg-muted/70" />
          <div className="h-4 w-16 animate-pulse rounded bg-muted/60" />
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

function contractOwnerLabel(
  owner: NonNullable<YunxiaoTodoPoolItem['requirementContract']>['owner']
): string {
  switch (owner) {
    case 'product':
      return translate('auto.components.TaskPage.yunxiaoContractOwnerProduct', 'Product')
    case 'development':
      return translate('auto.components.TaskPage.yunxiaoContractOwnerDevelopment', 'Development')
    case 'qa':
      return translate('auto.components.TaskPage.yunxiaoContractOwnerQa', 'QA')
    case 'agent':
      return translate('auto.components.TaskPage.yunxiaoContractOwnerAgent', 'Agent')
    case 'external':
      return translate('auto.components.TaskPage.yunxiaoContractOwnerExternal', 'External')
  }
}

function todoPoolContractSummary(poolItem: YunxiaoTodoPoolItem): string | null {
  const contract = poolItem.requirementContract
  if (!contract) {
    return null
  }
  const question = contract.blockingQuestions[0]?.question
  if (poolItem.poolStatus === 'needs-clarification' && question) {
    return translate(
      'auto.components.TaskPage.yunxiaoContractNeedsDecision',
      'Needs decision: {{value0}} · Owner: {{value1}}',
      { value0: question, value1: contractOwnerLabel(contract.owner) }
    )
  }
  if (contract.nextAction) {
    return translate(
      'auto.components.TaskPage.yunxiaoContractNext',
      'Next: {{value0}} · Owner: {{value1}}',
      { value0: contract.nextAction, value1: contractOwnerLabel(contract.owner) }
    )
  }
  return null
}

function YunxiaoTableRow({
  archiveTarget,
  item,
  onAddToTodoPool,
  onAnswerRequirementQuestion,
  onArchive,
  onRemoveFromTodoPool,
  onSelectionChange,
  onSetTodoPoolOrder,
  onSetTodoPoolStatus,
  onStartTodoPoolWorkspace,
  onStartWorkspace,
  selectedWorkItemIds,
  todoPoolIdentitySet,
  view
}: {
  archiveTarget: string | null
  item: YunxiaoWorkItem | YunxiaoTodoPoolItem
  onAddToTodoPool: (item: YunxiaoWorkItem) => void
  onAnswerRequirementQuestion: (item: YunxiaoTodoPoolItem) => void
  onArchive: (item: YunxiaoWorkItem) => void
  onRemoveFromTodoPool: (item: YunxiaoWorkItem) => void
  onSelectionChange: (nextSelectedIds: Set<string>) => void
  onSetTodoPoolOrder: (id: string, poolOrder: number) => void
  onSetTodoPoolStatus: (item: YunxiaoWorkItem, status: YunxiaoTodoPoolStatus) => void
  onStartTodoPoolWorkspace: (item: YunxiaoWorkItem) => void
  onStartWorkspace: (item: YunxiaoWorkItem) => void
  selectedWorkItemIds: ReadonlySet<string>
  todoPoolIdentitySet: ReadonlySet<string>
  view: YunxiaoListView
}): JSX.Element {
  const poolItem = view === 'todo-pool' ? (item as YunxiaoTodoPoolItem) : null
  const contractSummary = poolItem ? todoPoolContractSummary(poolItem) : null
  const canAnswerRequirementQuestion =
    poolItem?.poolStatus === 'needs-clarification' &&
    (poolItem.requirementContract?.blockingQuestions.length ?? 0) > 0
  const handleTodoPoolDrop = (event: DragEvent<HTMLDivElement>): void => {
    if (!poolItem) {
      return
    }
    event.preventDefault()
    const draggedId = event.dataTransfer.getData('text/plain')
    if (!draggedId || draggedId === poolItem.id) {
      return
    }
    onSetTodoPoolOrder(draggedId, poolItem.poolOrder)
  }
  return (
    <div
      className={cn(
        'group grid min-h-12 items-center gap-3 px-3 py-2 text-left transition hover:bg-muted/45',
        YUNXIAO_GRID_CLASS
      )}
      onDragOver={poolItem ? (event) => event.preventDefault() : undefined}
      onDrop={poolItem ? handleTodoPoolDrop : undefined}
    >
      <span className="flex items-center justify-center">
        {poolItem ? (
          <TaskPageYunxiaoTodoPoolOrderControl
            item={poolItem}
            onSetTodoPoolOrder={onSetTodoPoolOrder}
          />
        ) : view === 'work-items' ? (
          <Checkbox
            checked={selectedWorkItemIds.has(item.id)}
            onCheckedChange={(checked) => {
              const next = new Set(selectedWorkItemIds)
              if (checked) {
                next.add(item.id)
              } else {
                next.delete(item.id)
              }
              onSelectionChange(next)
            }}
            aria-label={translate(
              'auto.components.TaskPage.yunxiaoSelectWorkItem',
              'Select {{value0}}',
              {
                value0: item.serialNumber ?? item.title
              }
            )}
          />
        ) : null}
      </span>
      <span className="truncate font-mono text-xs text-muted-foreground">
        {item.serialNumber ?? item.id}
      </span>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-foreground">{item.title}</div>
        <div className="mt-1 flex min-w-0 gap-2 text-[11px] text-muted-foreground">
          {contractSummary ? (
            <span className="min-w-0 flex-[2_1_220px] truncate font-medium text-foreground">
              {contractSummary}
            </span>
          ) : null}
          <span className="truncate">{item.typeName ?? item.category}</span>
          {poolItem && item.statusName ? <span className="truncate">{item.statusName}</span> : null}
          {item.participants.length > 0 ? (
            <span className="truncate">
              {translate('auto.components.TaskPage.yunxiaoParticipants', 'Participants')}:{' '}
              {item.participants.map((participant) => participant.name).join(', ')}
            </span>
          ) : null}
        </div>
      </div>
      <span className="truncate text-xs text-muted-foreground">
        {poolItem ? todoPoolStatusLabel(poolItem.poolStatus) : (item.statusName ?? '-')}
      </span>
      <span className="truncate text-xs text-muted-foreground">{item.customer ?? '-'}</span>
      <span className="truncate text-xs text-muted-foreground">{item.priority ?? '-'}</span>
      <span className="truncate text-xs text-muted-foreground">{item.assignee?.name ?? '-'}</span>
      <span
        className="truncate text-xs text-muted-foreground"
        title={formatYunxiaoDate(item.updatedAt)}
      >
        {item.sprint?.name ?? formatYunxiaoDate(item.updatedAt)}
      </span>
      <TaskPageYunxiaoWorkItemActions
        item={item}
        archiving={archiveTarget === item.id}
        inTodoPool={todoPoolIdentitySet.has(workItemIdentity(item))}
        onAddToTodoPool={view === 'work-items' ? onAddToTodoPool : undefined}
        onAnswerRequirementQuestion={
          canAnswerRequirementQuestion && poolItem
            ? () => onAnswerRequirementQuestion(poolItem)
            : undefined
        }
        onArchive={onArchive}
        onRemoveFromTodoPool={view === 'todo-pool' ? onRemoveFromTodoPool : undefined}
        onSetTodoPoolStatus={view === 'todo-pool' ? onSetTodoPoolStatus : undefined}
        onStartWorkspace={view === 'todo-pool' ? onStartTodoPoolWorkspace : onStartWorkspace}
        todoPoolStatus={poolItem?.poolStatus ?? null}
      />
    </div>
  )
}
