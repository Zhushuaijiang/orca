import type { AutomationRun } from '../../../shared/automations-types'
import type { PersistedState } from '../../../shared/persisted-state-types'
import type {
  YunxiaoRequirementGateOutcome,
  YunxiaoTodoPoolItem,
  YunxiaoTodoPoolStatus
} from '../../../shared/yunxiao-types'
import { normalizeOptionalNonEmptyString } from './yunxiao-field-value-normalization'
import {
  coerceYunxiaoRequirementCompletionStatus,
  coerceYunxiaoRequirementManualStatus,
  inferYunxiaoTodoPoolCompletedStatus
} from './yunxiao-todo-pool-item-normalization'
import { matchesYunxiaoTodoPoolIdentity } from './yunxiao-todo-pool-ordering'

export function applyYunxiaoRequirementGateOutcomeToTodoPool(args: {
  pool: readonly YunxiaoTodoPoolItem[]
  runId: string
  itemIds?: readonly string[]
  outcome: YunxiaoRequirementGateOutcome
  includeClosedItems?: boolean
}): { pool: YunxiaoTodoPoolItem[]; updatedItems: YunxiaoTodoPoolItem[] } {
  const now = Date.now()
  const normalizedItemId = normalizeOptionalNonEmptyString(args.outcome.itemId)
  const claimedItemIds = new Set(
    (args.itemIds ?? [])
      .map((id) => normalizeOptionalNonEmptyString(id))
      .filter((id): id is string => id !== null)
  )
  const claimMatchedItems = args.pool.filter(
    (item) => item.claimedByRunId === args.runId || claimedItemIds.has(item.id)
  )
  const fallbackIdentity =
    normalizedItemId ?? (claimMatchedItems.length === 1 ? claimMatchedItems[0]!.id : null)
  const updatedItems: YunxiaoTodoPoolItem[] = []
  const pool = args.pool.map((item) => {
    const matchesOutcome = fallbackIdentity
      ? matchesYunxiaoTodoPoolIdentity(item, fallbackIdentity)
      : false
    if (!matchesOutcome) {
      return item
    }
    if (
      !args.includeClosedItems &&
      (item.poolStatus === 'done' || item.poolStatus === 'dismissed')
    ) {
      return item
    }
    const nextContract = args.outcome.requirementContract ?? item.requirementContract
    const nextStatus =
      args.outcome.poolStatus ??
      (nextContract?.status === 'needs_clarification'
        ? 'needs-clarification'
        : nextContract?.status === 'ready_to_build'
          ? 'ready-to-build'
          : nextContract?.status === 'ready_to_verify'
            ? 'done'
            : item.poolStatus)
    const coercedStatus =
      nextStatus === 'done'
        ? coerceYunxiaoRequirementCompletionStatus(nextStatus, nextContract)
        : coerceYunxiaoRequirementManualStatus(nextStatus, nextContract)
    const next: YunxiaoTodoPoolItem = {
      ...item,
      poolStatus: coercedStatus.status,
      requirementContract: nextContract,
      poolUpdatedAt: now,
      lastError:
        coercedStatus.status === 'failed'
          ? (args.outcome.evidence ?? item.lastError)
          : coercedStatus.error
    }
    if (
      coercedStatus.status === 'queued' ||
      coercedStatus.status === 'ready-to-build' ||
      coercedStatus.status === 'needs-clarification' ||
      coercedStatus.status === 'done' ||
      coercedStatus.status === 'dismissed'
    ) {
      next.claimedAt = null
      next.claimedByAutomationId = null
      next.claimedByRunId = null
    }
    updatedItems.push(next)
    return next
  })
  return { pool, updatedItems }
}

export function reconcileCompletedYunxiaoTodoPoolClaims(
  state: Pick<PersistedState, 'automationRuns' | 'yunxiaoTodoPool'>
): {
  state: Pick<PersistedState, 'automationRuns' | 'yunxiaoTodoPool'>
  changed: boolean
} {
  const completedClaimItemIds = new Set<string>()
  const completedClaimRunIds = new Set<string>()
  const completedClaimRunById = new Map<string, AutomationRun>()
  const completedClaimRunByItemId = new Map<string, AutomationRun>()
  for (const run of state.automationRuns ?? []) {
    if (run.status !== 'completed' || !run.yunxiaoTodoPoolClaim) {
      continue
    }
    completedClaimRunIds.add(run.id)
    completedClaimRunById.set(run.id, run)
    for (const itemId of run.yunxiaoTodoPoolClaim.itemIds) {
      const normalizedItemId = normalizeOptionalNonEmptyString(itemId)
      if (normalizedItemId) {
        completedClaimItemIds.add(normalizedItemId)
        completedClaimRunByItemId.set(normalizedItemId, run)
      }
    }
  }
  if (completedClaimRunIds.size === 0 && completedClaimItemIds.size === 0) {
    return { state, changed: false }
  }
  let changed = false
  let yunxiaoTodoPool = [...(state.yunxiaoTodoPool ?? [])]
  for (const run of completedClaimRunById.values()) {
    for (const outcome of run.yunxiaoRequirementOutcomes ?? []) {
      const result = applyYunxiaoRequirementGateOutcomeToTodoPool({
        pool: yunxiaoTodoPool,
        runId: run.id,
        itemIds: run.yunxiaoTodoPoolClaim?.itemIds,
        outcome
      })
      if (result.updatedItems.length > 0) {
        changed = true
        yunxiaoTodoPool = result.pool
      }
    }
  }
  const now = Date.now()
  yunxiaoTodoPool = yunxiaoTodoPool.map((item) => {
    const matchesClaim = item.claimedByRunId
      ? completedClaimRunIds.has(item.claimedByRunId)
      : completedClaimItemIds.has(item.id)
    if (!matchesClaim) {
      return item
    }
    if (
      item.poolStatus !== 'running' &&
      item.poolStatus !== 'dispatched' &&
      item.poolStatus !== 'workspace-created'
    ) {
      return item
    }
    const completedRun = item.claimedByRunId
      ? completedClaimRunById.get(item.claimedByRunId)
      : completedClaimRunByItemId.get(item.id)
    const completionStatus = coerceYunxiaoRequirementCompletionStatus(
      inferYunxiaoTodoPoolCompletedStatus(completedRun),
      item.requirementContract
    )
    changed = true
    return {
      ...item,
      poolStatus: completionStatus.status,
      poolUpdatedAt: now,
      lastError: completionStatus.error
    }
  })
  return {
    state: changed ? { ...state, yunxiaoTodoPool } : state,
    changed
  }
}

export function clearTerminalYunxiaoTodoPoolClaims(
  state: Pick<PersistedState, 'yunxiaoTodoPool'>
): {
  state: Pick<PersistedState, 'yunxiaoTodoPool'>
  changed: boolean
} {
  let changed = false
  const activeStatuses = new Set<YunxiaoTodoPoolStatus>([
    'running',
    'dispatched',
    'workspace-created'
  ])
  const yunxiaoTodoPool = (state.yunxiaoTodoPool ?? []).map((item) => {
    if (
      activeStatuses.has(item.poolStatus) ||
      (item.claimedAt === null &&
        item.claimedByAutomationId === null &&
        item.claimedByRunId === null)
    ) {
      return item
    }
    changed = true
    return {
      ...item,
      claimedAt: null,
      claimedByAutomationId: null,
      claimedByRunId: null
    }
  })
  return { state: changed ? { ...state, yunxiaoTodoPool } : state, changed }
}
