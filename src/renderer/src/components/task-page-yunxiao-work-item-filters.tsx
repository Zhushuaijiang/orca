import { ChevronDown } from 'lucide-react'
import type { JSX } from 'react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { translate } from '@/i18n/i18n'
import type {
  YunxiaoTodoPoolStatus,
  YunxiaoWorkItemCategory,
  YunxiaoWorkItemFacet
} from '../../../shared/types'
import {
  getDefaultYunxiaoStatusNames,
  statusSelectionLabel,
  todoPoolStatusSelectionLabel,
  todoPoolStatusLabel,
  YUNXIAO_TODO_POOL_STATUSES,
  type YunxiaoRelationFilter
} from './task-page-yunxiao-work-item-model'

type YunxiaoWorkItemToolbarFilterProps = {
  category: YunxiaoWorkItemCategory | 'all'
  relation: YunxiaoRelationFilter
  sprintId: string
  statusIds: string[]
  todoPoolStatus: YunxiaoTodoPoolStatus[]
  sprints: readonly YunxiaoWorkItemFacet[]
  statuses: readonly YunxiaoWorkItemFacet[]
  onCategoryChange: (category: YunxiaoWorkItemCategory | 'all') => void
  onRelationChange: (relation: YunxiaoRelationFilter) => void
  onSprintChange: (sprintId: string) => void
  onStatusIdsChange: (statusIds: string[]) => void
  onTodoPoolStatusChange: (statuses: YunxiaoTodoPoolStatus[]) => void
}

export function TodoPoolFilters({
  onTodoPoolStatusChange,
  todoPoolStatuses
}: Pick<YunxiaoWorkItemToolbarFilterProps, 'onTodoPoolStatusChange'> & {
  todoPoolStatuses: YunxiaoTodoPoolStatus[]
}): JSX.Element {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-[142px] justify-between border-border/50 bg-background/70 px-3 text-xs font-normal"
        >
          <span className="min-w-0 truncate">{todoPoolStatusSelectionLabel(todoPoolStatuses)}</span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuCheckboxItem
          checked={todoPoolStatuses.length === 0}
          onSelect={(event) => event.preventDefault()}
          onCheckedChange={() => onTodoPoolStatusChange([])}
        >
          {translate('auto.components.TaskPage.yunxiaoOpenPoolStatuses', 'Open pool states')}
        </DropdownMenuCheckboxItem>
        {YUNXIAO_TODO_POOL_STATUSES.map((status) => (
          <DropdownMenuCheckboxItem
            key={status}
            checked={todoPoolStatuses.includes(status)}
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={(checked) =>
              onTodoPoolStatusChange(
                checked
                  ? [...todoPoolStatuses, status]
                  : todoPoolStatuses.filter((entry) => entry !== status)
              )
            }
          >
            {todoPoolStatusLabel(status)}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function isStatusSelected(statusIds: readonly string[], status: YunxiaoWorkItemFacet): boolean {
  return statusIds.includes(status.id) || statusIds.includes(status.name)
}

function toggleStatusSelection(
  statusIds: readonly string[],
  status: YunxiaoWorkItemFacet,
  checked: boolean
): string[] {
  const withoutStatus = statusIds.filter((id) => id !== status.id && id !== status.name)
  return checked ? [...withoutStatus, status.id] : withoutStatus
}

export function WorkItemFilters({
  category,
  onCategoryChange,
  onRelationChange,
  onSprintChange,
  onStatusIdsChange,
  relation,
  sprintId,
  sprints,
  statusIds,
  statuses
}: Pick<
  YunxiaoWorkItemToolbarFilterProps,
  | 'category'
  | 'relation'
  | 'sprintId'
  | 'statusIds'
  | 'sprints'
  | 'statuses'
  | 'onCategoryChange'
  | 'onRelationChange'
  | 'onSprintChange'
  | 'onStatusIdsChange'
>): JSX.Element {
  const defaultStatusNames = getDefaultYunxiaoStatusNames(category)
  return (
    <>
      <Select
        value={category}
        onValueChange={(value) => onCategoryChange(value as typeof category)}
      >
        <SelectTrigger className="h-8 w-[112px] border-border/50 bg-background/70 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="Req">
            {translate('auto.components.TaskPage.yunxiaoRequirements', 'Requirements')}
          </SelectItem>
          <SelectItem value="Task">
            {translate('auto.components.TaskPage.yunxiaoTasks', 'Tasks')}
          </SelectItem>
          <SelectItem value="Bug">
            {translate('auto.components.TaskPage.yunxiaoBugs', 'Bugs')}
          </SelectItem>
          <SelectItem value="all">
            {translate('auto.components.TaskPage.c2268a9982', 'All')}
          </SelectItem>
        </SelectContent>
      </Select>
      <Select
        value={relation}
        onValueChange={(value) => onRelationChange(value as YunxiaoRelationFilter)}
      >
        <SelectTrigger className="h-8 w-[118px] border-border/50 bg-background/70 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="assigned-self">
            {translate('auto.components.TaskPage.yunxiaoAssignedToMe', 'Assigned to me')}
          </SelectItem>
          <SelectItem value="participant-self">
            {translate('auto.components.TaskPage.yunxiaoParticipating', 'Participating')}
          </SelectItem>
          <SelectItem value="all">
            {translate('auto.components.TaskPage.c2268a9982', 'All')}
          </SelectItem>
        </SelectContent>
      </Select>
      <Select value={sprintId} onValueChange={onSprintChange}>
        <SelectTrigger className="h-8 w-[154px] border-border/50 bg-background/70 text-xs">
          <SelectValue
            placeholder={translate('auto.components.TaskPage.yunxiaoSprint', 'Sprint')}
          />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">
            {translate('auto.components.TaskPage.yunxiaoAllSprints', 'All sprints')}
          </SelectItem>
          {sprints.map((sprint) => (
            <SelectItem key={sprint.id} value={sprint.id}>
              {sprint.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-[142px] justify-between border-border/50 bg-background/70 px-3 text-xs font-normal"
          >
            <span className="min-w-0 truncate">{statusSelectionLabel(statuses, statusIds)}</span>
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          {defaultStatusNames.length > 0 ? (
            <DropdownMenuLabel inset className="truncate">
              {translate('auto.components.TaskPage.yunxiaoDefaultStatuses', 'Default: {{value0}}', {
                value0: defaultStatusNames.join(', ')
              })}
            </DropdownMenuLabel>
          ) : null}
          <DropdownMenuCheckboxItem
            checked={statusIds.length === 0}
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={() => onStatusIdsChange([])}
          >
            {translate('auto.components.TaskPage.yunxiaoAllStatuses', 'All statuses')}
          </DropdownMenuCheckboxItem>
          {statuses.map((status) => (
            <DropdownMenuCheckboxItem
              key={status.id}
              checked={isStatusSelected(statusIds, status)}
              onSelect={(event) => event.preventDefault()}
              onCheckedChange={(checked) =>
                onStatusIdsChange(toggleStatusSelection(statusIds, status, checked))
              }
            >
              <span className="min-w-0 flex-1 truncate">{status.name}</span>
              <span className="text-[11px] text-muted-foreground">{status.count}</span>
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
