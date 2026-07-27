import type { JSX } from 'react'

import { translate } from '@/i18n/i18n'

export function WorkItemsEmptyState(): JSX.Element {
  return (
    <div className="px-4 py-12 text-center">
      <p className="text-sm font-medium text-foreground">
        {translate('auto.components.TaskPage.yunxiaoEmptyTitle', 'No Yunxiao work items')}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        {translate(
          'auto.components.TaskPage.yunxiaoEmptyDescription',
          'Adjust filters or refresh the Yunxiao source.'
        )}
      </p>
    </div>
  )
}

export function TodoPoolEmptyState(): JSX.Element {
  return (
    <div className="px-4 py-12 text-center">
      <p className="text-sm font-medium text-foreground">
        {translate('auto.components.TaskPage.yunxiaoTodoPoolEmptyTitle', 'No todo pool items')}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        {translate(
          'auto.components.TaskPage.yunxiaoTodoPoolEmptyDescription',
          'Add Yunxiao work items from the list.'
        )}
      </p>
    </div>
  )
}
