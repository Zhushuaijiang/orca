import type { JSX } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { translate } from '@/i18n/i18n'
import type {
  YunxiaoRequirementContractQuestionOption,
  YunxiaoTodoPoolItem
} from '../../../shared/types'

export function TaskPageYunxiaoRequirementDecisionDialog({
  item,
  onAnswer,
  onOpenChange
}: {
  item: YunxiaoTodoPoolItem | null
  onAnswer: (
    item: YunxiaoTodoPoolItem,
    option: YunxiaoRequirementContractQuestionOption,
    optionIndex: number
  ) => void
  onOpenChange: (open: boolean) => void
}): JSX.Element {
  const question = item?.requirementContract?.blockingQuestions[0] ?? null
  const options = question?.options ?? []
  return (
    <Dialog open={Boolean(item && question)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {translate('auto.components.TaskPage.yunxiaoAnswerDecision', 'Answer decision')}
          </DialogTitle>
          <DialogDescription>{item?.title ?? ''}</DialogDescription>
        </DialogHeader>
        {question ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <div className="text-sm font-medium text-foreground">{question.question}</div>
              {question.whyBlocking ? (
                <div className="text-xs text-muted-foreground">{question.whyBlocking}</div>
              ) : null}
            </div>
            <div className="space-y-2">
              {options.length > 0 ? (
                options.map((option, index) => (
                  <Button
                    key={option.id ?? `${question.id}-${index}`}
                    type="button"
                    variant={option.recommended ? 'default' : 'outline'}
                    className="h-auto w-full justify-start whitespace-normal px-3 py-2 text-left"
                    onClick={() => {
                      if (item) {
                        onAnswer(item, option, index)
                      }
                    }}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm">{option.label}</span>
                      {option.impact ? (
                        <span className="block text-xs font-normal opacity-80">
                          {option.impact}
                        </span>
                      ) : null}
                    </span>
                  </Button>
                ))
              ) : (
                <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  {translate(
                    'auto.components.TaskPage.yunxiaoDecisionNoOptions',
                    'No answer options were generated for this blocking question.'
                  )}
                </div>
              )}
            </div>
          </div>
        ) : null}
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  )
}
