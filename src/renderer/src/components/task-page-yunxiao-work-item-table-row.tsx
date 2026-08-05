import type { DragEvent, JSX } from 'react'

import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type {
  YunxiaoTodoPoolItem,
  YunxiaoTodoPoolStatus,
  YunxiaoWorkItem
} from '../../../shared/types'
import { TaskPageYunxiaoWorkItemActions } from './task-page-yunxiao-work-item-actions'
import {
  formatYunxiaoDate,
  todoPoolStatusLabel,
  workItemIdentity,
  YUNXIAO_GRID_CLASS,
  YUNXIAO_TODO_POOL_GRID_CLASS,
  type YunxiaoListView
} from './task-page-yunxiao-work-item-model'
import { TaskPageYunxiaoTodoPoolOrderControl } from './task-page-yunxiao-todo-pool-order-control'

export type YunxiaoTableRowProps = {
  archiveTarget: string | null
  item: YunxiaoWorkItem | YunxiaoTodoPoolItem
  onAddToTodoPool: (item: YunxiaoWorkItem) => void
  onAnswerRequirementQuestion: (item: YunxiaoTodoPoolItem) => void
  onArchive: (item: YunxiaoWorkItem) => void
  onRemoveFromTodoPool: (item: YunxiaoWorkItem) => void
  onSelectionChange: (nextSelectedIds: Set<string>) => void
  onSetTodoPoolOrder: (id: string, poolOrder: number) => void
  onSetTodoPoolStatus: (item: YunxiaoWorkItem, status: YunxiaoTodoPoolStatus) => void
  onStartWorkspace: (item: YunxiaoWorkItem) => void
  onStartTodoPoolWorkspace: (item: YunxiaoWorkItem) => void
  selectedWorkItemIds: ReadonlySet<string>
  todoPoolIdentitySet: ReadonlySet<string>
  view: YunxiaoListView
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

export function YunxiaoTableRow({
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
}: YunxiaoTableRowProps): JSX.Element {
  const poolItem = view === 'todo-pool' ? (item as YunxiaoTodoPoolItem) : null
  const inTodoPool = view === 'work-items' && todoPoolIdentitySet.has(workItemIdentity(item))
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
        view === 'todo-pool' ? YUNXIAO_TODO_POOL_GRID_CLASS : YUNXIAO_GRID_CLASS
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
        <div className="flex min-w-0 items-center gap-2">
          <div className="truncate text-sm font-medium text-foreground">{item.title}</div>
          {inTodoPool ? (
            <Badge variant="dot" className="shrink-0 text-[10px]">
              {translate('auto.components.TaskPage.yunxiaoInTodoPool', 'Todo pool')}
            </Badge>
          ) : null}
        </div>
        <div className="mt-1 flex min-w-0 gap-2 text-[11px] text-muted-foreground">
          {contractSummary ? (
            <span className="min-w-0 flex-[2_1_220px] truncate font-medium text-foreground">
              {contractSummary}
            </span>
          ) : null}
          <span className="truncate">{item.typeName ?? item.category}</span>
          {item.participants.length > 0 ? (
            <span className="truncate">
              {translate('auto.components.TaskPage.yunxiaoParticipants', 'Participants')}:{' '}
              {item.participants.map((participant) => participant.name).join(', ')}
            </span>
          ) : null}
        </div>
      </div>
      <span className="truncate text-xs text-muted-foreground">{item.statusName ?? '-'}</span>
      {view === 'todo-pool' ? (
        <span className="truncate text-xs text-muted-foreground">
          {poolItem ? todoPoolStatusLabel(poolItem.poolStatus) : '-'}
        </span>
      ) : null}
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
        inTodoPool={inTodoPool}
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
