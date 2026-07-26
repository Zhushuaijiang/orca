import {
  Archive,
  ArrowRight,
  ExternalLink,
  ListPlus,
  LoaderCircle,
  MessageSquareText,
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

function todoPoolStatusActions(status: YunxiaoTodoPoolStatus | null): YunxiaoTodoPoolStatus[] {
  switch (status) {
    case 'needs-clarification':
      return ['dismissed']
    case 'ready-to-build':
      return ['queued', 'done', 'dismissed']
    case 'queued':
      return ['needs-clarification', 'ready-to-build', 'dismissed']
    case 'failed':
      return ['queued', 'needs-clarification', 'dismissed']
    case 'archived':
    case 'running':
    case 'dispatched':
    case 'workspace-created':
      return ['needs-clarification', 'ready-to-build', 'done', 'dismissed']
    case 'done':
    case 'dismissed':
      return ['queued']
    case null:
      return []
  }
}

function todoPoolStatusActionLabel(status: YunxiaoTodoPoolStatus): string {
  switch (status) {
    case 'queued':
      return translate('auto.components.TaskPage.yunxiaoMarkQueued', 'Mark queued')
    case 'needs-clarification':
      return translate(
        'auto.components.TaskPage.yunxiaoMarkNeedsClarification',
        'Mark needs clarification'
      )
    case 'ready-to-build':
      return translate('auto.components.TaskPage.yunxiaoMarkReadyToBuild', 'Mark ready to build')
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
  onAnswerRequirementQuestion?: (item: YunxiaoWorkItem) => void
  onRemoveFromTodoPool?: (item: YunxiaoWorkItem) => void
  onSetTodoPoolStatus?: (item: YunxiaoWorkItem, status: YunxiaoTodoPoolStatus) => void
  todoPoolStatus?: YunxiaoTodoPoolStatus | null
  onStartWorkspace: (item: YunxiaoWorkItem) => void
}

export function TaskPageYunxiaoWorkItemActions({
  archiving,
  inTodoPool = false,
  item,
  onAddToTodoPool,
  onAnswerRequirementQuestion,
  onArchive,
  onRemoveFromTodoPool,
  onSetTodoPoolStatus,
  todoPoolStatus = null,
  onStartWorkspace
}: TaskPageYunxiaoWorkItemActionsProps): JSX.Element {
  const statusActions = todoPoolStatusActions(todoPoolStatus)
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
          {onAnswerRequirementQuestion ? (
            <DropdownMenuItem onSelect={() => onAnswerRequirementQuestion(item)}>
              <MessageSquareText className="size-3.5" />
              {translate('auto.components.TaskPage.yunxiaoAnswerDecision', 'Answer decision')}
            </DropdownMenuItem>
          ) : null}
          {onSetTodoPoolStatus && statusActions.length > 0 ? (
            <>
              <DropdownMenuSeparator />
              {statusActions.map((status) => (
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
