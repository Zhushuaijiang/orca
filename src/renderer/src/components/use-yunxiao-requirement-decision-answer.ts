import type { Dispatch, SetStateAction } from 'react'
import { toast } from 'sonner'

import { translate } from '@/i18n/i18n'
import type {
  YunxiaoRequirementContractQuestionOption,
  YunxiaoRequirementContractSnapshot,
  YunxiaoTodoPoolItem
} from '../../../shared/types'

export function useYunxiaoRequirementDecisionAnswer(args: {
  setAnswerTarget: Dispatch<SetStateAction<YunxiaoTodoPoolItem | null>>
  setTodoPool: Dispatch<SetStateAction<YunxiaoTodoPoolItem[]>>
}): (
  item: YunxiaoTodoPoolItem,
  option: YunxiaoRequirementContractQuestionOption,
  optionIndex: number
) => Promise<void> {
  return async (item, option, optionIndex): Promise<void> => {
    const contract = item.requirementContract
    const question = contract?.blockingQuestions[0]
    if (!contract || !question) {
      args.setAnswerTarget(null)
      return
    }
    const remainingQuestions = contract.blockingQuestions.slice(1)
    const decisionIndex = contract.decisions.length + 1
    const selectedOptionId = option.id ?? `${question.id}:option-${optionIndex + 1}`
    const nextContract: YunxiaoRequirementContractSnapshot = {
      ...contract,
      status: remainingQuestions.length === 0 ? 'ready_to_build' : 'needs_clarification',
      owner: remainingQuestions.length === 0 ? 'development' : contract.owner,
      nextAction:
        remainingQuestions.length === 0
          ? translate(
              'auto.components.TaskPage.yunxiaoContractRunNext',
              'Run the Yunxiao todo pool automation.'
            )
          : translate('auto.components.TaskPage.yunxiaoContractAnswerNext', 'Answer {{value0}}.', {
              value0: remainingQuestions[0].id
            }),
      updatedAt: Date.now(),
      blockingQuestions: remainingQuestions,
      decisions: [
        ...contract.decisions,
        {
          id: `D-${String(decisionIndex).padStart(3, '0')}`,
          summary: option.label,
          source: question.id,
          impact: option.impact,
          decidedAt: Date.now(),
          answeredBy: translate('auto.components.TaskPage.yunxiaoContractLocalUser', 'Local user'),
          answerSourceType: 'orca_ui',
          yunxiaoCommentId: null,
          selectedOptionId
        }
      ]
    }
    try {
      const updated = await window.api.yunxiao.updateTodoPoolItem({
        id: item.id,
        updates: {
          poolStatus: remainingQuestions.length === 0 ? 'ready-to-build' : 'needs-clarification',
          requirementContract: nextContract
        }
      })
      if (updated) {
        args.setTodoPool((current) =>
          current.map((entry) => (entry.id === updated.id ? updated : entry))
        )
      }
      args.setAnswerTarget(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }
}
