import { GripVertical } from 'lucide-react'
import type { FocusEvent, JSX, KeyboardEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import type { YunxiaoTodoPoolItem } from '../../../shared/types'

type TaskPageYunxiaoTodoPoolOrderControlProps = {
  item: YunxiaoTodoPoolItem
  onSetTodoPoolOrder: (id: string, poolOrder: number) => void
}

export function TaskPageYunxiaoTodoPoolOrderControl({
  item,
  onSetTodoPoolOrder
}: TaskPageYunxiaoTodoPoolOrderControlProps): JSX.Element {
  const commitPoolOrder = (
    event: FocusEvent<HTMLInputElement> | KeyboardEvent<HTMLInputElement>
  ): void => {
    const nextOrder = Number.parseInt(event.currentTarget.value, 10)
    if (!Number.isFinite(nextOrder) || nextOrder < 1 || nextOrder === item.poolOrder) {
      event.currentTarget.value = String(item.poolOrder)
      return
    }
    onSetTodoPoolOrder(item.id, nextOrder)
  }

  return (
    <div className="flex min-w-0 items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            className="cursor-grab text-muted-foreground active:cursor-grabbing"
            draggable
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = 'move'
              event.dataTransfer.setData('text/plain', item.id)
            }}
            aria-label={translate(
              'auto.components.TaskPage.yunxiaoDragTodoPoolItem',
              'Drag to reorder'
            )}
          >
            <GripVertical className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          {translate('auto.components.TaskPage.yunxiaoDragTodoPoolItem', 'Drag to reorder')}
        </TooltipContent>
      </Tooltip>
      <Input
        key={`${item.id}:${item.poolOrder}`}
        type="number"
        min={1}
        defaultValue={item.poolOrder}
        className="h-6 w-10 px-1 text-center text-xs"
        onBlur={commitPoolOrder}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            commitPoolOrder(event)
            event.currentTarget.blur()
          }
        }}
        aria-label={translate(
          'auto.components.TaskPage.yunxiaoTodoPoolOrderInput',
          'Todo pool order'
        )}
      />
    </div>
  )
}
