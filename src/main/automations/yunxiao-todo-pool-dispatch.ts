import type { Store } from '../persistence'
import type { Automation, AutomationRun } from '../../shared/automations-types'
import type { YunxiaoTodoPoolItem } from '../../shared/yunxiao-types'

export const EMPTY_YUNXIAO_TODO_POOL_MESSAGE = 'No matching Yunxiao todo pool items are queued.'

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
    statuses: source.statuses,
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

export function finishYunxiaoTodoPoolClaim(store: Store, run: AutomationRun): void {
  store.finishYunxiaoTodoPoolClaim({
    runId: run.id,
    poolStatus: run.status === 'completed' ? 'workspace-created' : 'failed',
    error: run.error
  })
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
- Archive the requirement through HIS MCP, download the complete archive locally, and create or update PRD_AND_CODE_ANALYSIS.md in the requirement directory.
- Resolve the code root from YUNXIAO_CODE_WORKSPACE_ROOT first. If it is absent, use YUNXIAO_DEFAULT_CODE_ROOT, then ORCA_USER_DATA_PATH/dfhis-environment.json field hisCodeRoot.
- Do not edit the selected/default code root directly. Create or reuse the requirement worktree under {requirement_dir}/code/<repo> before code changes, and run the skill guard before every edit.
- If the requirement cannot be archived, analyzed, or prepared for implementation, stop and report the blocker clearly.`
}
