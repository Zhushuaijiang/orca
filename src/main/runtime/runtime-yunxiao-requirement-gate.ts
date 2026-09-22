import type { ParsedAgentStatusPayload } from '../../shared/agent-status-types'
import { extractYunxiaoRequirementGateOutcomesFromText } from '../../shared/yunxiao-requirement-gate-outcome'
import {
  applyYunxiaoRequirementPromptGate,
  containsYunxiaoRequirementReference,
  createManualYunxiaoRequirementGate,
  shouldApplyYunxiaoRequirementPromptGate
} from '../../shared/yunxiao-requirement-prompt-gate'
import {
  ensureDfHisWorkflowPackCurrentForYunxiaoText,
  isYunxiaoRequirementAgentCommand
} from '../dfhis-environment/workflow-pack-refresh'
import type { RuntimeStore } from './runtime-store-contract'

// Why: the runtime split turned these OrcaRuntimeService privates into explicit-deps
// functions; every caller passes its own store/liveness probe so the gate works on
// every mixin chain link without re-coupling the modules.

export async function ensureDfHisWorkflowPackCurrentForPrompt(
  prompt: string | null | undefined
): Promise<void> {
  await ensureDfHisWorkflowPackCurrentForYunxiaoText(prompt)
}

export function markManualYunxiaoRequirementGateForWorktree(
  store: RuntimeStore | null,
  worktreeId: string | undefined,
  prompt: string | undefined
): void {
  if (!store || !worktreeId || !prompt || !containsYunxiaoRequirementReference(prompt)) {
    return
  }
  // Why optional: narrow store mocks (mobile RPC entries) may omit meta access entirely.
  if (typeof store.setWorktreeMeta !== 'function') {
    return
  }
  const existing = store.getWorktreeMeta?.(worktreeId)?.yunxiaoRequirementGate ?? null
  const gate = createManualYunxiaoRequirementGate(prompt, existing)
  if (!gate) {
    return
  }
  store.setWorktreeMeta(worktreeId, { yunxiaoRequirementGate: gate })
}

export function recordYunxiaoRequirementOutcomeFromAgentStatus(
  store: RuntimeStore | null,
  worktreeId: string | undefined,
  payload: ParsedAgentStatusPayload
): void {
  if (!store || !worktreeId || payload.state !== 'done' || !payload.lastAssistantMessage) {
    return
  }
  if (typeof store.setWorktreeMeta !== 'function') {
    return
  }
  const existing = store.getWorktreeMeta?.(worktreeId)?.yunxiaoRequirementGate
  if (!existing) {
    return
  }
  const outcome = extractYunxiaoRequirementGateOutcomesFromText(
    payload.lastAssistantMessage
  )?.find(
    (entry) =>
      !entry.requirementContract ||
      !entry.itemId ||
      entry.itemId.toUpperCase() === existing.identifier
  )
  if (!outcome?.requirementContract) {
    return
  }
  store.setWorktreeMeta(worktreeId, {
    yunxiaoRequirementGate: {
      ...existing,
      requirementContract: outcome.requirementContract,
      lastCompletionBlocker: null,
      updatedAt: Date.now()
    }
  })
}

export function assertYunxiaoRequirementAgentCommandGated(
  command: string | null | undefined
): void {
  if (!isYunxiaoRequirementAgentCommand(command)) {
    return
  }
  throw new Error('yunxiao_requirement_agent_command_requires_prompt_gate')
}

export type YunxiaoRequirementRawSendGateDeps = {
  store: RuntimeStore | null
  isTerminalRunningAgent: (handle: string) => Promise<boolean>
}

export async function applyYunxiaoRequirementGateForRawTerminalSend<
  T extends { text?: string; enter?: boolean; interrupt?: boolean }
>(
  deps: YunxiaoRequirementRawSendGateDeps,
  handle: string,
  worktreeId: string | undefined,
  action: T
): Promise<T> {
  const text = action.text
  await ensureDfHisWorkflowPackCurrentForPrompt(text)
  if (!text || !shouldApplyYunxiaoRequirementPromptGate(text)) {
    return action
  }
  if (!(await deps.isTerminalRunningAgent(handle))) {
    return action
  }
  markManualYunxiaoRequirementGateForWorktree(deps.store, worktreeId, text)
  return {
    ...action,
    text: applyYunxiaoRequirementPromptGate(text)
  }
}
