import { Bot, ListPlus, Play, Plus, RefreshCw, Search } from 'lucide-react'
import type { JSX } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type {
  YunxiaoTodoPoolStatus,
  YunxiaoWorkItemCategory,
  YunxiaoWorkItemFacet
} from '../../../shared/types'
import { TodoPoolFilters, WorkItemFilters } from './task-page-yunxiao-work-item-filters'
import type { YunxiaoListView, YunxiaoRelationFilter } from './task-page-yunxiao-work-item-model'

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
  onCreateRequirement: () => void
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
  onCreateRequirement,
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
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 border-border/50 bg-background/70 text-xs"
              onClick={onCreateRequirement}
            >
              <Plus className="size-3.5" />
              {translate('auto.components.TaskPage.yunxiaoNewRequirement', 'New requirement')}
            </Button>
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
          </>
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
