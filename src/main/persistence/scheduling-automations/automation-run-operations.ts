import { randomUUID } from 'node:crypto'
import type {
  Automation,
  AutomationDispatchResult,
  AutomationRun,
  AutomationRunStatus,
  AutomationRunTrigger,
  AutomationYunxiaoTodoPoolClaim
} from '../../../shared/automations-types'
import type { PersistedState } from '../../../shared/persisted-state-types'
import { isFinalAutomationRunStatus } from '../../../shared/automations-types'
import { extractYunxiaoRequirementGateOutcomesFromSnapshot } from '../../../shared/yunxiao-requirement-gate-outcome'
import {
  nextAutomationRunNumber,
  pruneAutomationRuns
} from '../../../shared/automation-run-retention'
import type {
  YunxiaoRequirementGateOutcome,
  YunxiaoTodoPoolItem,
  YunxiaoTodoPoolStatus
} from '../../../shared/yunxiao-types'
import { normalizeAutomationYunxiaoTodoPoolClaim } from './yunxiao-automation-todo-pool-source'
import { inferYunxiaoTodoPoolCompletedStatus } from './yunxiao-todo-pool-item-normalization'
import { normalizeYunxiaoRequirementGateOutcomes } from './yunxiao-requirement-contract-normalization'
import {
  normalizeAutomationPrecheckResult,
  normalizeAutomationRunOutputSnapshot,
  normalizeAutomationRunTerminalPaneKey,
  normalizeAutomationRunTerminalPtyId,
  normalizeAutomationRunWorkspaceDisplayName
} from './automation-context-migration'

export type AutomationRunOperations = {
  state: PersistedState
  flush: () => void
  recordManualRun: () => void
  getWorkspaceDisplayName: (workspaceId: string | null | undefined) => string | null
  applyYunxiaoRequirementGateOutcome: (args: {
    runId: string
    itemIds?: readonly string[]
    outcome: YunxiaoRequirementGateOutcome
  }) => YunxiaoTodoPoolItem[]
  updateYunxiaoTodoPoolClaimStatus: (args: {
    runId: string
    itemIds?: readonly string[]
    excludeItemIds?: readonly string[]
    poolStatus: Extract<YunxiaoTodoPoolStatus, 'done' | 'failed' | 'needs-clarification'>
    automationRunStatus?: AutomationRunStatus
    error?: string | null
  }) => YunxiaoTodoPoolItem[]
}

function touchAutomation(state: PersistedState, automationId: string, now: number): void {
  if (!state.automations.some((entry) => entry.id === automationId)) {
    return
  }
  state.automations = state.automations.map((entry) =>
    entry.id === automationId ? { ...entry, lastRunAt: now, updatedAt: now } : entry
  )
}

export function listAutomationRuns(state: PersistedState, automationId?: string): AutomationRun[] {
  const runs = state.automationRuns ?? []
  return [...(automationId ? runs.filter((run) => run.automationId === automationId) : runs)]
    .map((run) => ({
      ...run,
      precheckResult: normalizeAutomationPrecheckResult(run.precheckResult)
    }))
    .sort((left, right) => right.createdAt - left.createdAt)
}

export function createAutomationRun(
  operations: AutomationRunOperations,
  automation: Automation,
  scheduledFor: number,
  trigger: AutomationRunTrigger = 'scheduled'
): AutomationRun {
  const existing = (operations.state.automationRuns ?? []).find(
    (run) => run.automationId === automation.id && run.scheduledFor === scheduledFor
  )
  if (existing) {
    return existing
  }
  const now = Date.now()
  // Why: retention prunes old runs, so the retained count isn't the ordinal — carry the number forward from the newest survivor.
  const runNumber = nextAutomationRunNumber(
    (operations.state.automationRuns ?? []).filter((run) => run.automationId === automation.id)
  )
  const run: AutomationRun = {
    id: randomUUID(),
    automationId: automation.id,
    runNumber,
    runContext: automation.runContext ?? null,
    sourceContext: automation.sourceContext ?? null,
    title: `${automation.name} run ${runNumber}`,
    scheduledFor,
    status: 'pending',
    trigger,
    workspaceId: automation.workspaceId,
    workspaceDisplayName: operations.getWorkspaceDisplayName(automation.workspaceId),
    sessionKind: 'terminal',
    chatSessionId: null,
    terminalSessionId: null,
    terminalPaneKey: null,
    terminalPtyId: null,
    outputSnapshot: null,
    precheckResult: null,
    yunxiaoTodoPoolClaim: null,
    yunxiaoRequirementOutcomes: null,
    yunxiaoRequirementOutcome: null,
    usage: null,
    error: null,
    startedAt: null,
    dispatchedAt: null,
    createdAt: now
  }
  operations.state.automationRuns = pruneAutomationRuns([
    ...(operations.state.automationRuns ?? []),
    run
  ])
  if (trigger === 'manual') {
    operations.recordManualRun()
  }
  operations.flush()
  return run
}

export function recordRepeatedAutomationSkip(
  operations: AutomationRunOperations,
  automationId: string,
  error: string,
  scheduledFor: number
): AutomationRun | null {
  const runs = operations.state.automationRuns ?? []
  const latest = runs
    .filter((run) => run.automationId === automationId)
    .reduce<AutomationRun | null>(
      (newest, run) => (!newest || run.createdAt > newest.createdAt ? run : newest),
      null
    )
  if (
    !latest ||
    latest.status !== 'skipped_unavailable' ||
    latest.trigger !== 'scheduled' ||
    latest.error !== error
  ) {
    return null
  }
  if ((latest.lastOccurrenceAt ?? latest.scheduledFor) === scheduledFor) {
    return latest
  }
  const now = Date.now()
  const updated: AutomationRun = {
    ...latest,
    occurrenceCount: (latest.occurrenceCount ?? 1) + 1,
    lastOccurrenceAt: scheduledFor
  }
  // Replaced, not patched in place: the list projection caches on array identity.
  operations.state.automationRuns = runs.map((run) => (run.id === latest.id ? updated : run))
  touchAutomation(operations.state, automationId, now)
  operations.flush()
  return updated
}

export function updateAutomationRun(
  operations: AutomationRunOperations,
  result: AutomationDispatchResult
): AutomationRun {
  const index = (operations.state.automationRuns ?? []).findIndex(
    (entry) => entry.id === result.runId
  )
  if (index === -1) {
    throw new Error('Automation run not found.')
  }
  const now = Date.now()
  const current = operations.state.automationRuns[index]
  const workspaceId = result.workspaceId ?? current.workspaceId
  const workspaceDisplayName = Object.hasOwn(result, 'workspaceDisplayName')
    ? normalizeAutomationRunWorkspaceDisplayName(result.workspaceDisplayName ?? null)
    : null
  const outputSnapshot = Object.hasOwn(result, 'outputSnapshot')
    ? normalizeAutomationRunOutputSnapshot(result.outputSnapshot)
    : normalizeAutomationRunOutputSnapshot(current.outputSnapshot)
  const snapshotYunxiaoRequirementOutcomes = normalizeYunxiaoRequirementGateOutcomes(
    extractYunxiaoRequirementGateOutcomesFromSnapshot(outputSnapshot)
  )
  const resultYunxiaoRequirementOutcomes = Object.hasOwn(result, 'yunxiaoRequirementOutcomes')
    ? normalizeYunxiaoRequirementGateOutcomes(result.yunxiaoRequirementOutcomes)
    : null
  const resultYunxiaoRequirementOutcome = Object.hasOwn(result, 'yunxiaoRequirementOutcome')
    ? normalizeYunxiaoRequirementGateOutcomes(
        result.yunxiaoRequirementOutcome ? [result.yunxiaoRequirementOutcome] : null
      )
    : null
  const nextYunxiaoRequirementOutcomes = Object.hasOwn(result, 'yunxiaoRequirementOutcomes')
    ? (resultYunxiaoRequirementOutcomes ?? snapshotYunxiaoRequirementOutcomes)
    : Object.hasOwn(result, 'yunxiaoRequirementOutcome')
      ? (resultYunxiaoRequirementOutcome ?? snapshotYunxiaoRequirementOutcomes)
      : (snapshotYunxiaoRequirementOutcomes ??
        normalizeYunxiaoRequirementGateOutcomes(current.yunxiaoRequirementOutcomes) ??
        normalizeYunxiaoRequirementGateOutcomes(
          current.yunxiaoRequirementOutcome ? [current.yunxiaoRequirementOutcome] : null
        ))
  const updated: AutomationRun = {
    ...current,
    status: result.status,
    workspaceId,
    workspaceDisplayName:
      workspaceDisplayName ??
      normalizeAutomationRunWorkspaceDisplayName(current.workspaceDisplayName ?? null) ??
      operations.getWorkspaceDisplayName(workspaceId),
    terminalSessionId: Object.hasOwn(result, 'terminalSessionId')
      ? (result.terminalSessionId ?? null)
      : current.terminalSessionId,
    terminalPaneKey: Object.hasOwn(result, 'terminalPaneKey')
      ? normalizeAutomationRunTerminalPaneKey(result.terminalPaneKey)
      : normalizeAutomationRunTerminalPaneKey(current.terminalPaneKey),
    terminalPtyId: Object.hasOwn(result, 'terminalPtyId')
      ? normalizeAutomationRunTerminalPtyId(result.terminalPtyId)
      : normalizeAutomationRunTerminalPtyId(current.terminalPtyId),
    outputSnapshot,
    precheckResult: Object.hasOwn(result, 'precheckResult')
      ? normalizeAutomationPrecheckResult(result.precheckResult)
      : normalizeAutomationPrecheckResult(current.precheckResult),
    yunxiaoTodoPoolClaim: Object.hasOwn(result, 'yunxiaoTodoPoolClaim')
      ? normalizeAutomationYunxiaoTodoPoolClaim(result.yunxiaoTodoPoolClaim)
      : normalizeAutomationYunxiaoTodoPoolClaim(current.yunxiaoTodoPoolClaim),
    yunxiaoRequirementOutcomes: nextYunxiaoRequirementOutcomes,
    yunxiaoRequirementOutcome: nextYunxiaoRequirementOutcomes?.[0] ?? null,
    usage: Object.hasOwn(result, 'usage') ? (result.usage ?? null) : (current.usage ?? null),
    error: result.error ?? null,
    startedAt: current.startedAt ?? now,
    dispatchedAt: result.status === 'dispatched' ? now : current.dispatchedAt
  }
  // Replaced, not patched in place: the list projection caches on array identity.
  operations.state.automationRuns = operations.state.automationRuns.map((run) =>
    run.id === result.runId ? updated : run
  )
  const structuredOutcomeItems =
    updated.yunxiaoRequirementOutcomes?.flatMap((outcome) =>
      operations.applyYunxiaoRequirementGateOutcome({
        runId: updated.id,
        itemIds: updated.yunxiaoTodoPoolClaim?.itemIds,
        outcome
      })
    ) ?? []
  if (isFinalAutomationRunStatus(updated.status) && updated.yunxiaoTodoPoolClaim) {
    operations.updateYunxiaoTodoPoolClaimStatus({
      runId: updated.id,
      itemIds: updated.yunxiaoTodoPoolClaim.itemIds,
      excludeItemIds: structuredOutcomeItems.map((item) => item.id),
      poolStatus:
        updated.status === 'completed' ? inferYunxiaoTodoPoolCompletedStatus(updated) : 'failed',
      automationRunStatus: updated.status,
      error: updated.error
    })
  }
  touchAutomation(operations.state, updated.automationId, now)
  operations.flush()
  return updated
}

export function snapshotAutomationRunWorkspaceDisplayName(
  operations: AutomationRunOperations,
  workspaceId: string,
  displayName: string
): number {
  const normalizedDisplayName = normalizeAutomationRunWorkspaceDisplayName(displayName)
  if (!normalizedDisplayName) {
    return 0
  }
  let updatedCount = 0
  operations.state.automationRuns = (operations.state.automationRuns ?? []).map((run) => {
    if (run.workspaceId !== workspaceId || run.workspaceDisplayName === normalizedDisplayName) {
      return run
    }
    updatedCount += 1
    return { ...run, workspaceDisplayName: normalizedDisplayName }
  })
  if (updatedCount > 0) {
    operations.flush()
  }
  return updatedCount
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
