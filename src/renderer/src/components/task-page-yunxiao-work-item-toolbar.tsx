import { Bot, ChevronDown, ListPlus, Play, RefreshCw, Search } from 'lucide-react'
import type { JSX } from 'react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type {
  YunxiaoTodoPoolStatus,
  YunxiaoWorkItemCategory,
  YunxiaoWorkItemFacet
} from '../../../shared/types'
import {
  statusSelectionLabel,
  todoPoolStatusSelectionLabel,
  todoPoolStatusLabel,
  YUNXIAO_TODO_POOL_STATUSES,
  type YunxiaoListView,
  type YunxiaoRelationFilter
} from './task-page-yunxiao-work-item-model'

type TaskPageYunxiaoWorkItemToolbarProps = {
  view: YunxiaoListView
  category: YunxiaoWorkItemCategory | 'all'
  relation: YunxiaoRelationFilter
  sprintId: string
  statusIds: string[]
  todoPoolStatus: YunxiaoTodoPoolStatus[]
  queryInput: string
  selectedCount: number
  loading: boolean
  shownCount: number
  sprints: readonly YunxiaoWorkItemFacet[]
  statuses: readonly YunxiaoWorkItemFacet[]
  configuringTodoPoolAutomation?: boolean
  runningTodoPoolAutomation?: boolean
  onViewChange: (view: YunxiaoListView) => void
  onCategoryChange: (category: YunxiaoWorkItemCategory | 'all') => void
  onRelationChange: (relation: YunxiaoRelationFilter) => void
  onSprintChange: (sprintId: string) => void
  onStatusIdsChange: (statusIds: string[]) => void
  onTodoPoolStatusChange: (statuses: YunxiaoTodoPoolStatus[]) => void
  onQueryInputChange: (query: string) => void
  onQuerySubmit: () => void
  onAddSelected: () => void
  onConfigureTodoPoolAutomation: () => void
  onRunNextTodoPoolAutomation: () => void
  onRefresh: () => void
}

export function TaskPageYunxiaoWorkItemToolbar({
  category,
  configuringTodoPoolAutomation = false,
  loading,
  onAddSelected,
  onCategoryChange,
  onConfigureTodoPoolAutomation,
  onQueryInputChange,
  onQuerySubmit,
  onRefresh,
  onRelationChange,
  onRunNextTodoPoolAutomation,
  onSprintChange,
  onStatusIdsChange,
  onTodoPoolStatusChange,
  onViewChange,
  queryInput,
  relation,
  runningTodoPoolAutomation = false,
  selectedCount,
  shownCount,
  sprintId,
  sprints,
  statusIds,
  statuses,
  todoPoolStatus,
  view
}: TaskPageYunxiaoWorkItemToolbarProps): JSX.Element {
  return (
    <div className="flex flex-none flex-wrap items-center justify-between gap-2 border-b border-border/50 bg-muted/35 px-3 py-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="flex items-center rounded-md border border-border/50 bg-background/70 p-0.5">
          <Button
            variant={view === 'work-items' ? 'secondary' : 'ghost'}
            size="xs"
            className="h-7 px-2 text-xs"
            onClick={() => onViewChange('work-items')}
          >
            {translate('auto.components.TaskPage.yunxiaoWorkItemsView', 'Work items')}
          </Button>
          <Button
            variant={view === 'todo-pool' ? 'secondary' : 'ghost'}
            size="xs"
            className="h-7 px-2 text-xs"
            onClick={() => onViewChange('todo-pool')}
          >
            {translate('auto.components.TaskPage.yunxiaoTodoPoolView', 'Todo pool')}
          </Button>
        </div>
        {view === 'work-items' ? (
          <WorkItemFilters
            category={category}
            relation={relation}
            sprintId={sprintId}
            statusIds={statusIds}
            sprints={sprints}
            statuses={statuses}
            onCategoryChange={onCategoryChange}
            onRelationChange={onRelationChange}
            onSprintChange={onSprintChange}
            onStatusIdsChange={onStatusIdsChange}
          />
        ) : (
          <TodoPoolFilters
            todoPoolStatuses={todoPoolStatus}
            onTodoPoolStatusChange={onTodoPoolStatusChange}
          />
        )}
        <form
          className="flex min-w-[220px] items-center gap-1"
          onSubmit={(event) => {
            event.preventDefault()
            onQuerySubmit()
          }}
        >
          <Input
            value={queryInput}
            onChange={(event) => onQueryInputChange(event.target.value)}
            placeholder={translate('auto.components.TaskPage.yunxiaoSearch', 'Search Yunxiao')}
            className="h-8 border-border/50 bg-background/70 text-xs"
          />
          <Button type="submit" variant="outline" size="icon-sm" className="h-8 w-8">
            <Search className="size-3.5" />
          </Button>
        </form>
        {view === 'work-items' ? (
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 border-border/50 bg-background/70 text-xs"
            disabled={selectedCount === 0}
            onClick={onAddSelected}
          >
            <ListPlus className="size-3.5" />
            {translate('auto.components.TaskPage.yunxiaoAddSelected', 'Add selected')}
          </Button>
        ) : null}
        {view === 'todo-pool' ? (
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 border-border/50 bg-background/70 text-xs"
              disabled={configuringTodoPoolAutomation}
              onClick={onConfigureTodoPoolAutomation}
            >
              <Bot className="size-3.5" />
              {translate('auto.components.TaskPage.yunxiaoConfigureAutomation', 'Configure')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 border-border/50 bg-background/70 text-xs"
              disabled={runningTodoPoolAutomation}
              onClick={onRunNextTodoPoolAutomation}
            >
              <Play className="size-3.5" />
              {translate('auto.components.TaskPage.yunxiaoRunNextAutomation', 'Run next')}
            </Button>
          </>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-[11px] text-muted-foreground">
          {loading
            ? translate('auto.components.TaskPage.b7b01ed849', 'Loading…')
            : translate('auto.components.TaskPage.yunxiaoShownCount', '{{value0}} shown', {
                value0: shownCount
              })}
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          className="h-8 w-8 border-border/50 bg-background/70"
          onClick={onRefresh}
          aria-label={translate('auto.components.TaskPage.e8b1e0a2c1', 'Refresh')}
        >
          <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
        </Button>
      </div>
    </div>
  )
}

function TodoPoolFilters({
  onTodoPoolStatusChange,
  todoPoolStatuses
}: Pick<TaskPageYunxiaoWorkItemToolbarProps, 'onTodoPoolStatusChange'> & {
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

function WorkItemFilters({
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
  TaskPageYunxiaoWorkItemToolbarProps,
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
              checked={statusIds.includes(status.id)}
              onSelect={(event) => event.preventDefault()}
              onCheckedChange={(checked) =>
                onStatusIdsChange(
                  checked ? [...statusIds, status.id] : statusIds.filter((id) => id !== status.id)
                )
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
