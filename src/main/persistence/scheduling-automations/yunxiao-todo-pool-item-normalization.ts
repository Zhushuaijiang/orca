import { getYunxiaoRequirementCompletionGate } from '../../../shared/yunxiao-requirement-review-policy'
import type {
  YunxiaoTodoPoolItem,
  YunxiaoTodoPoolStatus,
  YunxiaoWorkItemCategory
} from '../../../shared/yunxiao-types'
import {
  normalizeOptionalNonEmptyString,
  normalizeYunxiaoTodoPoolAttempts,
  normalizeYunxiaoTodoPoolClaimTime,
  normalizeYunxiaoTodoPoolOrder,
  normalizeYunxiaoTodoPoolStatus
} from './yunxiao-field-value-normalization'
import { normalizeYunxiaoRequirementContract } from './yunxiao-requirement-contract-normalization'
import type { AutomationRun } from '../../../shared/automations-types'

export function isYunxiaoRequirementContractClaimable(
  contract: YunxiaoTodoPoolItem['requirementContract']
): boolean {
  if (!contract) {
    return true
  }
  return (
    contract.blockingQuestions.length === 0 &&
    (contract.status === 'ready_to_build' || contract.status === 'ready_to_verify')
  )
}

export function coerceYunxiaoRequirementManualStatus(
  status: YunxiaoTodoPoolStatus,
  contract: YunxiaoTodoPoolItem['requirementContract']
): { status: YunxiaoTodoPoolStatus; error: string | null } {
  if (!contract) {
    return { status, error: null }
  }
  if (
    status === 'ready-to-build' &&
    (contract.status === 'needs_clarification' || contract.blockingQuestions.length > 0)
  ) {
    return {
      status: 'needs-clarification',
      error: 'Requirement Contract has unresolved blocking questions.'
    }
  }
  return { status, error: null }
}
export function coerceYunxiaoRequirementCompletionStatus(
  status: Extract<YunxiaoTodoPoolStatus, 'done' | 'failed' | 'needs-clarification'>,
  contract: YunxiaoTodoPoolItem['requirementContract']
): {
  status: Extract<
    YunxiaoTodoPoolStatus,
    'done' | 'failed' | 'needs-clarification' | 'ready-to-build'
  >
  error: string | null
} {
  if (status !== 'done') {
    return { status, error: null }
  }
  if (!contract) {
    return { status: 'ready-to-build', error: 'Requirement Contract is missing.' }
  }
  if (contract.status === 'needs_clarification' || contract.blockingQuestions.length > 0) {
    return {
      status: 'needs-clarification',
      error: 'Requirement Contract has unresolved blocking questions.'
    }
  }
  const completionGate = getYunxiaoRequirementCompletionGate(contract)
  return completionGate.ready
    ? { status, error: null }
    : { status: 'ready-to-build', error: completionGate.gaps.join(' ') }
}

export function inferYunxiaoTodoPoolCompletedStatus(
  run: Pick<AutomationRun, 'outputSnapshot'> | null | undefined
): Extract<YunxiaoTodoPoolStatus, 'done' | 'needs-clarification'> {
  const content = run?.outputSnapshot?.content.toLowerCase() ?? ''
  return content.includes('needs-clarification') ||
    content.includes('needs_clarification') ||
    content.includes('需澄清') ||
    content.includes('需补需求')
    ? 'needs-clarification'
    : 'done'
}
function normalizeYunxiaoTodoPoolPerson(
  value: unknown
): YunxiaoTodoPoolItem['assignee'] | NonNullable<YunxiaoTodoPoolItem['assignee']> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const candidate = value as Partial<NonNullable<YunxiaoTodoPoolItem['assignee']>>
  if (typeof candidate.name !== 'string' || !candidate.name.trim()) {
    return null
  }
  return {
    id: typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id.trim() : null,
    name: candidate.name.trim()
  }
}

function normalizeYunxiaoTodoPoolPeople(value: unknown): YunxiaoTodoPoolItem['participants'] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .map((entry) => normalizeYunxiaoTodoPoolPerson(entry))
    .filter((entry): entry is NonNullable<YunxiaoTodoPoolItem['assignee']> => entry !== null)
}

function normalizeYunxiaoTodoPoolSprint(value: unknown): YunxiaoTodoPoolItem['sprint'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const candidate = value as Partial<NonNullable<YunxiaoTodoPoolItem['sprint']>>
  const id = typeof candidate.id === 'string' ? candidate.id.trim() : ''
  const name = typeof candidate.name === 'string' ? candidate.name.trim() : ''
  return id || name ? { id: id || name, name: name || id } : null
}

export function normalizeYunxiaoTodoPoolItem(
  value: unknown,
  fallbackPoolOrder = 1
): YunxiaoTodoPoolItem | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const candidate = value as Partial<YunxiaoTodoPoolItem>
  if (typeof candidate.id !== 'string' || !candidate.id.trim()) {
    return null
  }
  if (typeof candidate.title !== 'string' || !candidate.title.trim()) {
    return null
  }
  const now = Date.now()
  return {
    id: candidate.id.trim(),
    serialNumber:
      typeof candidate.serialNumber === 'string' && candidate.serialNumber.trim()
        ? candidate.serialNumber.trim()
        : null,
    title: candidate.title.trim(),
    category: (typeof candidate.category === 'string' && candidate.category.trim()
      ? candidate.category.trim()
      : 'Req') as YunxiaoWorkItemCategory | string,
    typeName:
      typeof candidate.typeName === 'string' && candidate.typeName.trim()
        ? candidate.typeName.trim()
        : null,
    statusId:
      typeof candidate.statusId === 'string' && candidate.statusId.trim()
        ? candidate.statusId.trim()
        : null,
    statusName:
      typeof candidate.statusName === 'string' && candidate.statusName.trim()
        ? candidate.statusName.trim()
        : null,
    customer:
      typeof candidate.customer === 'string' && candidate.customer.trim()
        ? candidate.customer.trim()
        : null,
    priority:
      typeof candidate.priority === 'string' && candidate.priority.trim()
        ? candidate.priority.trim()
        : null,
    assignee: normalizeYunxiaoTodoPoolPerson(candidate.assignee),
    participants: normalizeYunxiaoTodoPoolPeople(candidate.participants),
    sprint: normalizeYunxiaoTodoPoolSprint(candidate.sprint),
    updatedAt:
      typeof candidate.updatedAt === 'string' && candidate.updatedAt.trim()
        ? candidate.updatedAt.trim()
        : null,
    url: typeof candidate.url === 'string' && candidate.url.trim() ? candidate.url.trim() : null,
    poolStatus: normalizeYunxiaoTodoPoolStatus(candidate.poolStatus),
    poolOrder: normalizeYunxiaoTodoPoolOrder(candidate.poolOrder, fallbackPoolOrder),
    addedAt: Number.isFinite(candidate.addedAt) ? Number(candidate.addedAt) : now,
    poolUpdatedAt: Number.isFinite(candidate.poolUpdatedAt) ? Number(candidate.poolUpdatedAt) : now,
    lastSyncedAt: Number.isFinite(candidate.lastSyncedAt) ? Number(candidate.lastSyncedAt) : null,
    attempts: normalizeYunxiaoTodoPoolAttempts(candidate.attempts),
    retryNotBefore: Number.isFinite(candidate.retryNotBefore)
      ? Number(candidate.retryNotBefore)
      : null,
    lastFailureKind: candidate.lastFailureKind ?? null,
    claimedAt: normalizeYunxiaoTodoPoolClaimTime(candidate.claimedAt),
    claimedByAutomationId: normalizeOptionalNonEmptyString(candidate.claimedByAutomationId),
    claimedByRunId: normalizeOptionalNonEmptyString(candidate.claimedByRunId),
    lastError: normalizeOptionalNonEmptyString(candidate.lastError),
    notes: typeof candidate.notes === 'string' ? candidate.notes : '',
    requirementContract: normalizeYunxiaoRequirementContract(candidate.requirementContract)
  }
}
