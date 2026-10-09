import {
  isFinalAutomationRunStatus,
  type AutomationRun,
  type AutomationYunxiaoTodoPoolClaim
} from '../../../shared/automations-types'
import { normalizeAutomationYunxiaoTodoPoolClaim } from './yunxiao-automation-todo-pool-source'
import type { AutomationRunOperations } from './automation-run-operations'
import { inferYunxiaoTodoPoolCompletedStatus } from './yunxiao-todo-pool-item-normalization'

export function reconcileAutomationRunTodoPool(
  operations: Pick<
    AutomationRunOperations,
    'applyYunxiaoRequirementGateOutcome' | 'updateYunxiaoTodoPoolClaimStatus'
  >,
  updated: AutomationRun
): void {
  const structuredOutcomeItems =
    updated.yunxiaoRequirementOutcomes?.flatMap((outcome) =>
      operations.applyYunxiaoRequirementGateOutcome({
        runId: updated.id,
        itemIds: updated.yunxiaoTodoPoolClaim?.itemIds,
        outcome
      })
    ) ?? []
  if (
    updated.yunxiaoTodoPoolClaim &&
    (updated.status === 'dispatched' || isFinalAutomationRunStatus(updated.status))
  ) {
    operations.updateYunxiaoTodoPoolClaimStatus({
      runId: updated.id,
      itemIds: updated.yunxiaoTodoPoolClaim.itemIds,
      excludeItemIds:
        updated.status === 'dispatched' ? [] : structuredOutcomeItems.map((item) => item.id),
      poolStatus:
        updated.status === 'dispatched'
          ? 'dispatched'
          : updated.status === 'completed'
            ? inferYunxiaoTodoPoolCompletedStatus(updated)
            : 'failed',
      automationRunStatus: updated.status,
      error: updated.error
    })
  }
}

export function setAutomationRunYunxiaoTodoPoolClaim(
  operations: AutomationRunOperations,
  runId: string,
  claim: AutomationYunxiaoTodoPoolClaim,
  title?: string
): AutomationRun {
  const index = (operations.state.automationRuns ?? []).findIndex((entry) => entry.id === runId)
  if (index === -1) {
    throw new Error('Automation run not found.')
  }
  const current = operations.state.automationRuns[index]
  const updated: AutomationRun = {
    ...current,
    title: title?.trim() || current.title,
    yunxiaoTodoPoolClaim: normalizeAutomationYunxiaoTodoPoolClaim(claim)
  }
  // Replaced, not patched in place: the list projection caches on array identity.
  operations.state.automationRuns = operations.state.automationRuns.map((run) =>
    run.id === runId ? updated : run
  )
  operations.flush()
  return updated
}
