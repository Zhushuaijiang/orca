import {
  Archive,
  ArrowRight,
  ExternalLink,
  ListPlus,
  LoaderCircle,
  MoreHorizontal
} from 'lucide-react'
import type { JSX } from 'react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import type { YunxiaoTodoPoolStatus, YunxiaoWorkItem } from '../../../shared/types'

function todoPoolStatusActionLabel(status: YunxiaoTodoPoolStatus): string {
  switch (status) {
    case 'queued':
      return translate('auto.components.TaskPage.yunxiaoMarkQueued', 'Mark queued')
    case 'done':
      return translate('auto.components.TaskPage.yunxiaoMarkDone', 'Mark done')
    case 'dismissed':
      return translate('auto.components.TaskPage.yunxiaoMarkDismissed', 'Mark dismissed')
    case 'archived':
      return translate('auto.components.TaskPage.yunxiaoMarkArchived', 'Mark archived')
    case 'running':
      return translate('auto.components.TaskPage.yunxiaoMarkRunning', 'Mark running')
    case 'dispatched':
      return translate('auto.components.TaskPage.yunxiaoMarkDispatched', 'Mark dispatched')
    case 'workspace-created':
      return translate('auto.components.TaskPage.yunxiaoMarkWorkspaceCreated', 'Mark workspace')
    case 'failed':
      return translate('auto.components.TaskPage.yunxiaoMarkFailed', 'Mark failed')
  }
}

type TaskPageYunxiaoWorkItemActionsProps = {
  item: YunxiaoWorkItem
  archiving: boolean
  inTodoPool?: boolean
  onArchive: (item: YunxiaoWorkItem) => void
  onAddToTodoPool?: (item: YunxiaoWorkItem) => void
  onRemoveFromTodoPool?: (item: YunxiaoWorkItem) => void
  onSetTodoPoolStatus?: (item: YunxiaoWorkItem, status: YunxiaoTodoPoolStatus) => void
  onStartWorkspace: (item: YunxiaoWorkItem) => void
}

export function TaskPageYunxiaoWorkItemActions({
  archiving,
  inTodoPool = false,
  item,
  onAddToTodoPool,
  onArchive,
  onRemoveFromTodoPool,
  onSetTodoPoolStatus,
  onStartWorkspace
}: TaskPageYunxiaoWorkItemActionsProps): JSX.Element {
  return (
    <div className="sticky right-0 z-10 flex h-full items-center justify-end gap-1 border-l border-border/50 bg-background pl-2 group-hover:bg-muted/45">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            data-contextual-tour-target="tasks-start-workspace"
            onClick={() => onStartWorkspace(item)}
            aria-label={translate(
              'auto.components.TaskPage.yunxiaoStartWorkspaceFrom',
              'Start workspace from {{value0}}',
              { value0: item.serialNumber ?? item.title }
            )}
          >
            <ArrowRight className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          {translate('auto.components.TaskPage.9497f2787c', 'Start workspace')}
        </TooltipContent>
      </Tooltip>
      {onAddToTodoPool ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={inTodoPool ? 'outline' : 'ghost'}
              size="icon-xs"
              className={inTodoPool ? 'bg-background/70' : undefined}
              onClick={() => onAddToTodoPool(item)}
              aria-label={translate(
                'auto.components.TaskPage.yunxiaoAddToTodoPool',
                'Add to todo pool'
              )}
            >
              <ListPlus className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            {translate('auto.components.TaskPage.yunxiaoAddToTodoPool', 'Add to todo pool')}
          </TooltipContent>
        </Tooltip>
      ) : null}
      <Button
        variant="ghost"
        size="icon-xs"
        disabled={!item.url}
        onClick={() => {
          if (item.url) {
            void window.api.shell.openUrl(item.url)
          }
        }}
        aria-label={translate('auto.components.TaskPage.yunxiaoOpen', 'Open in Yunxiao')}
      >
        <ExternalLink className="size-3.5" />
      </Button>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={translate('auto.components.TaskPage.f6a4d3f9bc', 'More actions')}
          >
            {archiving ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <MoreHorizontal className="size-3.5" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={6}>
          <DropdownMenuItem onSelect={() => onArchive(item)} disabled={archiving}>
            <Archive className="size-3.5" />
            {translate('auto.components.TaskPage.yunxiaoArchive', 'Archive requirement')}
          </DropdownMenuItem>
          {onSetTodoPoolStatus ? (
            <>
              <DropdownMenuSeparator />
              {(['queued', 'done', 'dismissed'] as const).map((status) => (
                <DropdownMenuItem key={status} onSelect={() => onSetTodoPoolStatus(item, status)}>
                  {todoPoolStatusActionLabel(status)}
                </DropdownMenuItem>
              ))}
            </>
          ) : null}
          {onRemoveFromTodoPool ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onRemoveFromTodoPool(item)}>
                {translate(
                  'auto.components.TaskPage.yunxiaoRemoveFromTodoPool',
                  'Remove from pool'
                )}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
