const DFHIS_WORK_ITEM_RE = /\bDFHIS-\d+\b/i
const YUNXIAO_WORK_ITEM_URL_RE = /https?:\/\/devops\.aliyun\.com\/projex\/\S+/i
const YUNXIAO_GATE_MARKER = 'Orca Yunxiao requirement workflow gate'

const SKIP_MARKERS = [
  YUNXIAO_GATE_MARKER,
  'Yunxiao todo pool claim:',
  'yunxiaoRequirementOutcomes',
  'You are working inside Orca, a multi-agent IDE. You are a dispatched worker.'
]

export function containsYunxiaoRequirementReference(prompt: string): boolean {
  return DFHIS_WORK_ITEM_RE.test(prompt) || YUNXIAO_WORK_ITEM_URL_RE.test(prompt)
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
- Classify risk. Trigger focused or mandatory independent review for unclear requirements, UI/workflow changes, API/database/permission/release impact, multiple repositories, conflicting evidence, weak verification, or explicit review requests.
- Preserve reviewer verdicts in reviewChecks and decide by evidence, not vote count.
- Do not claim the requirement is done or safe until fresh verification evidence is recorded; if verification is blocked, report the exact blocker and remaining owner.
- When a structured result channel is available, return yunxiaoRequirementOutcomes with requirementContract.riskProfile, reviewChecks, methodologyGate, and evidence.

Original user request:
${prompt}`
}
