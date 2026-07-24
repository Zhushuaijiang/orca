import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { JSX } from 'react'

import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'

type TaskPageYunxiaoWorkItemFooterProps = {
  contextLabel: string
  page: number
  loadedCount: number
  hasMore: boolean
  loading: boolean
  onPreviousPage: () => void
  onNextPage: () => void
}

export function TaskPageYunxiaoWorkItemFooter({
  contextLabel,
  page,
  loadedCount,
  hasMore,
  loading,
  onPreviousPage,
  onNextPage
}: TaskPageYunxiaoWorkItemFooterProps): JSX.Element {
  return (
    <div className="flex h-9 flex-none items-center justify-between border-t border-border/50 bg-muted/35 px-3 text-[11px] text-muted-foreground">
      <span>{contextLabel}</span>
      <div className="flex items-center gap-2">
        <span>
          {translate('auto.components.TaskPage.yunxiaoPageSummary', 'Page {{value0}}', {
            value0: page
          })}
          {' · '}
          {translate('auto.components.TaskPage.yunxiaoLoadedCount', '{{value0}} loaded', {
            value0: loadedCount
          })}
        </span>
        <Button
          variant="outline"
          size="icon-xs"
          className="h-6 w-6 border-border/50 bg-background/70"
          disabled={page <= 1 || loading}
          onClick={onPreviousPage}
          aria-label={translate('auto.components.TaskPage.6cd6b3ae6a', 'Previous page')}
        >
          <ChevronLeft className="size-3" />
        </Button>
        <Button
          variant="outline"
          size="icon-xs"
          className="h-6 w-6 border-border/50 bg-background/70"
          disabled={!hasMore || loading}
          onClick={onNextPage}
          aria-label={translate('auto.components.TaskPage.0c8df28045', 'Next page')}
        >
          <ChevronRight className="size-3" />
        </Button>
      </div>
    </div>
  )
}
