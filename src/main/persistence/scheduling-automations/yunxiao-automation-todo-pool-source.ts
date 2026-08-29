import type {
  AutomationYunxiaoTodoPoolClaim,
  AutomationYunxiaoTodoPoolSource
} from '../../../shared/automations-types'
import { DEFAULT_YUNXIAO_TODO_POOL_AUTOMATION_STATUSES } from '../../../shared/yunxiao-types'
import {
  normalizeOptionalNonEmptyString,
  normalizeYunxiaoTodoPoolClaimTime,
  normalizeYunxiaoTodoPoolStatus
} from './yunxiao-field-value-normalization'

export function normalizeAutomationYunxiaoTodoPoolSource(
  value: unknown
): AutomationYunxiaoTodoPoolSource | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const candidate = value as Partial<AutomationYunxiaoTodoPoolSource>
  if (candidate.kind !== 'yunxiao-todo-pool') {
    return null
  }
  const statuses = Array.isArray(candidate.statuses)
    ? candidate.statuses.map((status) => normalizeYunxiaoTodoPoolStatus(status))
    : []
  const uniqueStatuses = [...new Set(statuses)]
  const normalizedStatuses =
    uniqueStatuses.length === 0 || (uniqueStatuses.length === 1 && uniqueStatuses[0] === 'queued')
      ? [...DEFAULT_YUNXIAO_TODO_POOL_AUTOMATION_STATUSES]
      : uniqueStatuses
  const batchSize =
    Number.isFinite(candidate.batchSize) && Number(candidate.batchSize) > 0
      ? Math.min(Math.floor(Number(candidate.batchSize)), 10)
      : 1
  return {
    kind: 'yunxiao-todo-pool',
    statuses: normalizedStatuses,
    batchSize
  }
}

export function normalizeAutomationYunxiaoTodoPoolClaim(
  value: unknown
): AutomationYunxiaoTodoPoolClaim | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const candidate = value as Partial<AutomationYunxiaoTodoPoolClaim>
  const itemIds = Array.isArray(candidate.itemIds)
    ? [
        ...new Set(
          candidate.itemIds
            .map((id) => normalizeOptionalNonEmptyString(id))
            .filter((id): id is string => id !== null)
        )
      ]
    : []
  if (itemIds.length === 0) {
    return null
  }
  return {
    itemIds,
    claimedAt: normalizeYunxiaoTodoPoolClaimTime(candidate.claimedAt) ?? Date.now()
  }
}
