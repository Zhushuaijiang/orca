import type { YunxiaoRequirementContractSnapshot } from './yunxiao-types'

const DFHIS_WORK_ITEM_RE = /\bDFHIS-\d+\b/i
const YUNXIAO_WORK_ITEM_URL_RE = /https?:\/\/devops\.aliyun\.com\/projex\/\S+/i
const YUNXIAO_GATE_MARKER = 'Orca Yunxiao requirement workflow gate'
const SOURCE_PROMPT_PREVIEW_LIMIT = 2048

export type ManualYunxiaoRequirementGate = {
  identifier: string
  source: 'manual-prompt'
  sourcePromptPreview: string
  requirementContract: YunxiaoRequirementContractSnapshot | null
  lastCompletionBlocker: string | null
  createdAt: number
  updatedAt: number
}

const SKIP_MARKERS = [
  YUNXIAO_GATE_MARKER,
  'Yunxiao todo pool claim:',
  'yunxiaoRequirementOutcomes',
  'You are working inside Orca, a multi-agent IDE. You are a dispatched worker.'
]

export function containsYunxiaoRequirementReference(prompt: string): boolean {
  return DFHIS_WORK_ITEM_RE.test(prompt) || YUNXIAO_WORK_ITEM_URL_RE.test(prompt)
}

export function extractYunxiaoRequirementIdentifier(prompt: string): string | null {
  return prompt.match(DFHIS_WORK_ITEM_RE)?.[0]?.toUpperCase() ?? null
}

export function shouldApplyYunxiaoRequirementPromptGate(prompt: string): boolean {
  const trimmed = prompt.trim()
  return (
    trimmed.length > 0 &&
    containsYunxiaoRequirementReference(trimmed) &&
    !SKIP_MARKERS.some((marker) => trimmed.includes(marker))
  )
}

export function applyYunxiaoRequirementPromptGate(prompt: string): string {
  if (!shouldApplyYunxiaoRequirementPromptGate(prompt)) {
    return prompt
  }
  return `${YUNXIAO_GATE_MARKER}

This prompt contains a Yunxiao/DFHIS requirement. Treat it as a gated requirement workflow, even when the user pasted it manually instead of taking it from the todo pool.

Required workflow:
- Use the yunxiao-requirement-archiver skill before implementation or approval judgment.
- Archive/read the requirement evidence and create or update PRD_AND_CODE_ANALYSIS.md with a compact Requirement Contract at the top.
- If the contract has blocking product decisions, ask exactly 1-3 concrete choice questions and stop before code edits or completion claims.
- Classify risk before implementation. Escalate to focused review for unclear requirements, UI/workflow changes, API/database impact, conflicting evidence, weak verification, or explicit review requests.
- Escalate to mandatory independent multi-agent review for multiple repositories, permission/release impact, API/database plus weak verification, or UI/workflow plus requirement conflict. Required roles: prd_gate, architecture, implementation, verifier.
- Use Orca orchestration or available agent-dispatch tools for independent reviewers when available. If independent dispatch is unavailable, state that blocker explicitly and do not mark the requirement safe/complete.
- Preserve reviewer verdicts in reviewChecks and decide by evidence, not vote count.
- Completion is blocked while any required reviewer role is missing, blocking questions are unresolved, the implementation plan is missing, or fresh verification evidence is absent.
- Do not claim the requirement is done or safe until fresh verification evidence is recorded; if verification is blocked, report the exact blocker and remaining owner.
- When a structured result channel is available, return yunxiaoRequirementOutcomes with requirementContract.riskProfile, reviewChecks, methodologyGate, and evidence.

Original user request:
${prompt}`
}

export function createManualYunxiaoRequirementGate(
  prompt: string,
  existing?: ManualYunxiaoRequirementGate | null,
  now = Date.now()
): ManualYunxiaoRequirementGate | null {
  const identifier = extractYunxiaoRequirementIdentifier(prompt)
  if (!identifier) {
    return null
  }
  return {
    identifier,
    source: 'manual-prompt',
    sourcePromptPreview: prompt.trim().slice(0, SOURCE_PROMPT_PREVIEW_LIMIT),
    requirementContract:
      existing?.identifier === identifier ? (existing.requirementContract ?? null) : null,
    lastCompletionBlocker:
      existing?.identifier === identifier ? (existing.lastCompletionBlocker ?? null) : null,
    createdAt: existing?.identifier === identifier ? existing.createdAt : now,
    updatedAt: now
  }
}
