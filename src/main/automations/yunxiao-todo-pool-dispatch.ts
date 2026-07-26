import type { Store } from '../persistence'
import type { Automation, AutomationRun } from '../../shared/automations-types'
import {
  DEFAULT_YUNXIAO_TODO_POOL_AUTOMATION_STATUSES,
  type YunxiaoTodoPoolItem,
  type YunxiaoTodoPoolStatus
} from '../../shared/yunxiao-types'

export const EMPTY_YUNXIAO_TODO_POOL_MESSAGE =
  'No matching actionable Yunxiao todo pool items are available.'

export type PreparedYunxiaoTodoPoolRun =
  | { ok: true; automation: Automation; run: AutomationRun }
  | { ok: false; run: AutomationRun }

export function prepareYunxiaoTodoPoolRun(args: {
  store: Store
  automation: Automation
  run: AutomationRun
}): PreparedYunxiaoTodoPoolRun {
  const source = args.automation.yunxiaoTodoPool
  if (!source || source.kind !== 'yunxiao-todo-pool') {
    return { ok: true, automation: args.automation, run: args.run }
  }
  const claimed = args.store.claimYunxiaoTodoPoolItems({
    automationId: args.automation.id,
    runId: args.run.id,
    statuses: getYunxiaoTodoPoolClaimStatuses(source.statuses),
    limit: source.batchSize
  })
  if (claimed.length === 0) {
    const skipped = args.store.updateAutomationRun({
      runId: args.run.id,
      status: 'skipped_precheck',
      workspaceId: args.automation.workspaceId,
      error: EMPTY_YUNXIAO_TODO_POOL_MESSAGE
    })
    return { ok: false, run: skipped }
  }
  const claimedAt = claimed[0]?.claimedAt ?? Date.now()
  const updatedRun = args.store.setAutomationRunYunxiaoTodoPoolClaim(args.run.id, {
    itemIds: claimed.map((item) => item.id),
    claimedAt
  })
  return {
    ok: true,
    automation: {
      ...args.automation,
      prompt: buildYunxiaoTodoPoolPrompt(args.automation.prompt, claimed)
    },
    run: updatedRun
  }
}

function getYunxiaoTodoPoolClaimStatuses(
  statuses: readonly YunxiaoTodoPoolStatus[]
): readonly YunxiaoTodoPoolStatus[] {
  if (statuses.length === 0 || (statuses.length === 1 && statuses[0] === 'queued')) {
    return DEFAULT_YUNXIAO_TODO_POOL_AUTOMATION_STATUSES
  }
  return statuses
}

function buildYunxiaoTodoPoolPrompt(
  basePrompt: string,
  items: readonly YunxiaoTodoPoolItem[]
): string {
  const targets = items
    .map((item, index) => {
      const target = item.serialNumber ?? item.url ?? item.id
      const metadata = [
        `title: ${item.title}`,
        item.typeName ? `type: ${item.typeName}` : null,
        item.statusName ? `status: ${item.statusName}` : null,
        item.customer ? `customer: ${item.customer}` : null,
        item.priority ? `priority: ${item.priority}` : null,
        item.assignee?.name ? `assignee: ${item.assignee.name}` : null,
        item.sprint?.name ? `sprint: ${item.sprint.name}` : null,
        item.url ? `url: ${item.url}` : null
      ]
        .filter(Boolean)
        .join('\n  ')
      return `${index + 1}. ${target}\n  ${metadata}`
    })
    .join('\n\n')

  return `${basePrompt.trim() || 'Process the next Yunxiao todo pool requirement.'}

Yunxiao todo pool claim:
${targets}

Required workflow:
- Use the yunxiao-requirement-archiver skill for every claimed work item.
- Archive the requirement with the skill's direct Yunxiao MCP workflow first. Use HIS MCP only as a legacy fallback when direct Yunxiao archive is unavailable and HIS MCP credentials are configured.
- Create or update PRD_AND_CODE_ANALYSIS.md in the requirement directory from the local archive evidence before code changes.
- Put a concise Requirement Contract at the top of PRD_AND_CODE_ANALYSIS.md with status, owner, next action, intent, blocking questions, and decision ledger.
- Classify the contract as needs_clarification, ready_to_build, missing_repo, blocked, or ready_to_verify before implementation, and keep the todo pool requirementContract snapshot aligned with that contract whenever a tool is available.
- Apply the Orca Superpowers-style gate: clarify before code, keep the first-view contract compact, record alternatives/design confirmation for focused/mandatory risk, write the implementation plan before edits, then verify with fresh command/screenshot/build/test/artifact evidence before claiming completion.
- If the contract is needs_clarification, ask exactly 1-3 blocking decision questions with concrete options before any code edits. Use the native AskUserQuestion/request_user_input flow when available; otherwise ask directly in chat and wait. If the run is unattended and no interactive answer path exists, record the questions in PRD_AND_CODE_ANALYSIS.md, mark the pool item as needs-clarification when a tool is available, include the exact final-output line "Contract status: needs_clarification", and stop before code changes.
- Only edit code after the contract is ready_to_build and the decisions that affect implementation are recorded.
- When native automation result reporting is available, return structured yunxiaoRequirementOutcomes as a per-item array with itemId, poolStatus, requirementContract, and evidence; put riskProfile, reviewChecks, and methodologyGate inside requirementContract instead of top-level outcome fields.
- Resolve the code root from YUNXIAO_CODE_WORKSPACE_ROOT first. If it is absent, use YUNXIAO_DEFAULT_CODE_ROOT, then ORCA_USER_DATA_PATH/dfhis-environment.json field hisCodeRoot.
- Do not edit the selected/default code root directly. Create or reuse the requirement worktree under {requirement_dir}/code/<repo> before code changes, and run the skill guard before every edit.
- Default low-risk work to one builder plus local verification. Escalate to focused review for unresolved decisions, UI/workflow, API/database, requirement conflict, weak verification, or explicit user review requests. Escalate to mandatory independent PRD/architecture/implementation/verifier multi-agent review for multi-repo, permission/release, API/database plus weak verification, or UI/workflow plus requirement conflict cases. Use Orca orchestration or available agent-dispatch tools when available; if independent dispatch is unavailable, state that blocker explicitly and do not mark the requirement safe/complete. Preserve each reviewer verdict in reviewChecks and decide by evidence, not majority.
- Completion is blocked while any required reviewer role is missing, blocking questions are unresolved, the implementation plan is missing, or fresh verification evidence is absent.
- If the requirement cannot be archived, analyzed, clarified, or prepared for implementation, stop and report the blocker clearly.`
}
