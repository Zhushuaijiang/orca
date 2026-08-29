import type { AutomationRunStatus } from '../../../shared/automations-types'
import { isFinalAutomationRunStatus } from '../../../shared/automations-types'
import {
  AUTOMATION_CLAIM_LEASE_MS,
  getAutomationRecoveryDecision,
  getExpiredClaimRecoveryDecision
} from '../../../shared/automation-recovery-policy'
import type {
  YunxiaoRequirementGateOutcome,
  YunxiaoTodoPoolItem,
  YunxiaoTodoPoolStatus
} from '../../../shared/yunxiao-types'
import { applyYunxiaoRequirementGateOutcomeToTodoPool } from '../scheduling-automations/yunxiao-todo-pool-claim-reconciliation'
import {
  coerceYunxiaoRequirementCompletionStatus,
  isYunxiaoRequirementContractClaimable
} from '../scheduling-automations/yunxiao-todo-pool-item-normalization'
import { YUNXIAO_TODO_POOL_RUNNING_ORDER } from '../scheduling-automations/yunxiao-todo-pool-ordering'
import {
  normalizeOptionalNonEmptyString,
  normalizeYunxiaoTodoPoolStatus
} from '../scheduling-automations/yunxiao-field-value-normalization'
import type { StoreRuntimeState } from './store-runtime-state'
import type { YunxiaoTodoPoolOperations } from './yunxiao-todo-pool-operations'
import type { WriteSchedulingOperations } from './write-scheduling'
import { scheduleSave } from './write-scheduling'

type YunxiaoTodoPoolClaimsRuntime = Pick<StoreRuntimeState, 'state'>

const yunxiaoTodoPoolClaimsContext = Symbol('YunxiaoTodoPoolClaimOperations')
type YunxiaoTodoPoolClaimsContext = {
  runtime: YunxiaoTodoPoolClaimsRuntime
  scheduling: WriteSchedulingOperations
  pool: Pick<YunxiaoTodoPoolOperations, 'getYunxiaoTodoPool'>
}

export class YunxiaoTodoPoolClaimOperations {
  readonly [yunxiaoTodoPoolClaimsContext]: YunxiaoTodoPoolClaimsContext

  constructor(
    runtime: YunxiaoTodoPoolClaimsRuntime,
    scheduling: WriteSchedulingOperations,
    pool: YunxiaoTodoPoolClaimsContext['pool']
  ) {
    this[yunxiaoTodoPoolClaimsContext] = { runtime, scheduling, pool }
  }

  applyYunxiaoRequirementGateOutcome(args: {
    runId: string
    itemIds?: readonly string[]
    outcome: YunxiaoRequirementGateOutcome
  }): YunxiaoTodoPoolItem[] {
    const state = this[yunxiaoTodoPoolClaimsContext].runtime.state
    const result = applyYunxiaoRequirementGateOutcomeToTodoPool({
      pool: this[yunxiaoTodoPoolClaimsContext].pool.getYunxiaoTodoPool(),
      runId: args.runId,
      itemIds: args.itemIds,
      outcome: args.outcome,
      includeClosedItems: true
    })
    state.yunxiaoTodoPool = result.pool
    return result.updatedItems
  }

  updateYunxiaoTodoPoolClaimStatus(args: {
    runId: string
    itemIds?: readonly string[]
    excludeItemIds?: readonly string[]
    poolStatus: Extract<YunxiaoTodoPoolStatus, 'done' | 'failed' | 'needs-clarification'>
    automationRunStatus?: AutomationRunStatus
    error?: string | null
  }): YunxiaoTodoPoolItem[] {
    const state = this[yunxiaoTodoPoolClaimsContext].runtime.state
    const now = Date.now()
    const claimedItemIds = new Set(
      (args.itemIds ?? [])
        .map((id) => normalizeOptionalNonEmptyString(id))
        .filter((id): id is string => id !== null)
    )
    const excludedItemIds = new Set(
      (args.excludeItemIds ?? [])
        .map((id) => normalizeOptionalNonEmptyString(id))
        .filter((id): id is string => id !== null)
    )
    const activeClaimStatuses = new Set<YunxiaoTodoPoolStatus>([
      'queued',
      'running',
      'dispatched',
      'workspace-created'
    ])
    const updatedItems: YunxiaoTodoPoolItem[] = []
    state.yunxiaoTodoPool = this[yunxiaoTodoPoolClaimsContext].pool
      .getYunxiaoTodoPool()
      .map((item) => {
        if (excludedItemIds.has(item.id)) {
          return item
        }
        const matchesClaim = item.claimedByRunId
          ? item.claimedByRunId === args.runId
          : claimedItemIds.has(item.id)
        if (!matchesClaim || !activeClaimStatuses.has(item.poolStatus)) {
          return item
        }
        const completionStatus = coerceYunxiaoRequirementCompletionStatus(
          args.poolStatus,
          item.requirementContract
        )
        const recovery =
          completionStatus.status === 'failed' && args.automationRunStatus
            ? getAutomationRecoveryDecision({
                status: args.automationRunStatus,
                error: args.error,
                attempts: item.attempts,
                now
              })
            : null
        const recoveredStatus = recovery?.recoverable
          ? item.requirementContract?.status === 'ready_to_build'
            ? 'ready-to-build'
            : 'queued'
          : completionStatus.status
        const next: YunxiaoTodoPoolItem = {
          ...item,
          poolStatus: recoveredStatus,
          poolUpdatedAt: now,
          retryNotBefore: recovery?.retryAt ?? null,
          lastFailureKind: recovery?.kind ?? null,
          lastError: recovery?.recoverable
            ? `Automatic retry scheduled after recoverable ${recovery.kind} failure: ${normalizeOptionalNonEmptyString(args.error) ?? 'unknown error'}`
            : completionStatus.status === 'failed'
              ? (normalizeOptionalNonEmptyString(args.error) ?? 'Automation run failed.')
              : completionStatus.error
        }
        if (
          recovery?.recoverable ||
          recoveredStatus === 'failed' ||
          recoveredStatus === 'done' ||
          recoveredStatus === 'needs-clarification' ||
          recoveredStatus === 'ready-to-build'
        ) {
          next.claimedAt = null
          next.claimedByAutomationId = null
          next.claimedByRunId = null
        }
        updatedItems.push(next)
        return next
      })
    return updatedItems
  }

  claimYunxiaoTodoPoolItems(args: {
    automationId: string
    runId: string
    statuses: readonly YunxiaoTodoPoolStatus[]
    limit: number
  }): YunxiaoTodoPoolItem[] {
    const state = this[yunxiaoTodoPoolClaimsContext].runtime.state
    const statuses = new Set(args.statuses.map((status) => normalizeYunxiaoTodoPoolStatus(status)))
    const limit = Number.isFinite(args.limit)
      ? Math.max(1, Math.min(Math.floor(args.limit), 10))
      : 1
    const now = Date.now()
    const claimedIds = new Set(
      this[yunxiaoTodoPoolClaimsContext].pool
        .getYunxiaoTodoPool()
        .filter(
          (item) =>
            statuses.has(item.poolStatus) &&
            (item.retryNotBefore === null || item.retryNotBefore <= now) &&
            isYunxiaoRequirementContractClaimable(item.requirementContract)
        )
        .sort(
          (left, right) =>
            left.poolOrder - right.poolOrder ||
            left.addedAt - right.addedAt ||
            left.title.localeCompare(right.title)
        )
        .slice(0, limit)
        .map((item) => item.id)
    )
    if (claimedIds.size === 0) {
      return []
    }
    const claimed: YunxiaoTodoPoolItem[] = []
    state.yunxiaoTodoPool = state.yunxiaoTodoPool.map((item) => {
      if (!claimedIds.has(item.id)) {
        return item
      }
      const next: YunxiaoTodoPoolItem = {
        ...item,
        poolStatus: 'running',
        poolOrder: YUNXIAO_TODO_POOL_RUNNING_ORDER,
        attempts: item.attempts + 1,
        retryNotBefore: null,
        claimedAt: now,
        claimedByAutomationId: args.automationId,
        claimedByRunId: args.runId,
        lastError: null,
        poolUpdatedAt: now
      }
      claimed.push(next)
      return next
    })
    scheduleSave(this[yunxiaoTodoPoolClaimsContext].scheduling)
    return claimed
  }

  recoverStaleYunxiaoTodoPoolClaims(
    now = Date.now(),
    leaseMs = AUTOMATION_CLAIM_LEASE_MS
  ): YunxiaoTodoPoolItem[] {
    const state = this[yunxiaoTodoPoolClaimsContext].runtime.state
    const runById = new Map((state.automationRuns ?? []).map((run) => [run.id, run]))
    const activeStatuses = new Set<YunxiaoTodoPoolStatus>([
      'running',
      'dispatched',
      'workspace-created'
    ])
    const recovered: YunxiaoTodoPoolItem[] = []
    state.yunxiaoTodoPool = this[yunxiaoTodoPoolClaimsContext].pool
      .getYunxiaoTodoPool()
      .map((item) => {
        if (!activeStatuses.has(item.poolStatus) || item.claimedAt === null) {
          return item
        }
        const run = item.claimedByRunId ? runById.get(item.claimedByRunId) : null
        const leaseExpired = now - item.claimedAt >= leaseMs
        if (run && !isFinalAutomationRunStatus(run.status) && !leaseExpired) {
          return item
        }
        const decision = getExpiredClaimRecoveryDecision({ attempts: item.attempts, now })
        const next: YunxiaoTodoPoolItem = {
          ...item,
          poolStatus: decision.recoverable
            ? item.requirementContract?.status === 'ready_to_build'
              ? 'ready-to-build'
              : 'queued'
            : 'failed',
          retryNotBefore: decision.retryAt,
          lastFailureKind: decision.kind,
          claimedAt: null,
          claimedByAutomationId: null,
          claimedByRunId: null,
          poolUpdatedAt: now,
          lastError: decision.recoverable
            ? 'Expired automation claim recovered and scheduled for retry.'
            : 'Expired automation claim exhausted its retry budget.'
        }
        recovered.push(next)
        return next
      })
    if (recovered.length > 0) {
      scheduleSave(this[yunxiaoTodoPoolClaimsContext].scheduling)
    }
    return recovered
  }

  finishYunxiaoTodoPoolClaim(args: {
    runId: string
    itemIds?: readonly string[]
    poolStatus: Extract<YunxiaoTodoPoolStatus, 'done' | 'failed' | 'needs-clarification'>
    automationRunStatus?: AutomationRunStatus
    error?: string | null
  }): YunxiaoTodoPoolItem[] {
    const updatedItems = this.updateYunxiaoTodoPoolClaimStatus(args)
    if (updatedItems.length > 0) {
      scheduleSave(this[yunxiaoTodoPoolClaimsContext].scheduling)
    }
    return updatedItems
  }
}

export function installYunxiaoTodoPoolClaimOperationsContext(
  target: object,
  source: YunxiaoTodoPoolClaimOperations
): void {
  Object.defineProperty(target, yunxiaoTodoPoolClaimsContext, {
    value: source[yunxiaoTodoPoolClaimsContext]
  })
}
