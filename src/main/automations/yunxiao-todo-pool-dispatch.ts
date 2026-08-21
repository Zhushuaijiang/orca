import type { Store } from '../persistence'
import type { Automation, AutomationRun } from '../../shared/automations-types'
import {
  DEFAULT_YUNXIAO_TODO_POOL_AUTOMATION_STATUSES,
  type YunxiaoTodoPoolItem,
  type YunxiaoTodoPoolStatus
} from '../../shared/yunxiao-types'
import {
  YUNXIAO_DFHIS_CODE_CONSTRAINTS,
  YUNXIAO_REQUIREMENT_COMPACT_WORKFLOW
} from '../../shared/yunxiao-requirement-prompt-gate'
import {
  buildYgtWorkflowProfileInstruction,
  resolveYunxiaoRequirementWorkflowProfile
} from '../../shared/yunxiao-requirement-workflow-profile'

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
  const updatedRun = args.store.setAutomationRunYunxiaoTodoPoolClaim(
    args.run.id,
    {
      itemIds: claimed.map((item) => item.id),
      claimedAt
    },
    buildYunxiaoTodoPoolRunTitle(claimed)
  )
  return {
    ok: true,
    automation: {
      ...args.automation,
      prompt: buildYunxiaoTodoPoolPrompt(args.automation.prompt, claimed)
    },
    run: updatedRun
  }
}

function buildYunxiaoTodoPoolRunTitle(items: readonly YunxiaoTodoPoolItem[]): string {
  const first = items[0]
  if (!first) {
    return 'Yunxiao todo pool run'
  }
  const identity = first.serialNumber ?? first.id
  const title = `${identity} ${first.title}`.trim()
  return items.length === 1 ? title : `${title} +${items.length - 1}`
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
      const workItemUrl = resolveYunxiaoWorkItemUrl(item)
      const metadata = [
        workItemUrl ? `提交信息: ${workItemUrl}` : null,
        `标题: ${item.title}`,
        `工作流: ${formatWorkflowProfile(resolveYunxiaoRequirementWorkflowProfile(item))}`,
        item.typeName ? `类型: ${item.typeName}` : null,
        item.statusName ? `状态: ${item.statusName}` : null,
        item.customer ? `客户: ${item.customer}` : null,
        item.priority ? `优先级: ${item.priority}` : null,
        item.assignee?.name ? `负责人: ${item.assignee.name}` : null,
        item.sprint?.name ? `迭代: ${item.sprint.name}` : null,
        workItemUrl ? `链接: ${workItemUrl}` : null,
        item.notes ? `备注: ${item.notes}` : null
      ]
        .filter(Boolean)
        .join('\n  ')
      return `${index + 1}. ${target}\n  ${metadata}`
    })
    .join('\n\n')
  const workflowProfileInstruction = buildYgtWorkflowProfileInstruction(items)

  return `${basePrompt.trim() || '处理下一条云效 todo pool 需求。'}

Yunxiao todo pool claim:
${targets}

用户可见内容使用中文。
${YUNXIAO_REQUIREMENT_COMPACT_WORKFLOW}
- 代码根目录按 YUNXIAO_CODE_WORKSPACE_ROOT → YUNXIAO_DEFAULT_CODE_ROOT → DFHIS Setup hisCodeRoot 解析；UI 必须用路由/挂载/import 证据确认真实仓库。
- 代码提交信息必须精确使用 claim 的“提交信息”完整 URL。
- 自动化结果返回 yunxiaoRequirementOutcomes；阻断时写明合同状态和精确原因。

${workflowProfileInstruction ? `${workflowProfileInstruction}\n\n` : ''}
${YUNXIAO_DFHIS_CODE_CONSTRAINTS}`
}

function formatWorkflowProfile(
  profile: ReturnType<typeof resolveYunxiaoRequirementWorkflowProfile>
): string {
  return profile === 'ygt' ? 'ygt-harness' : 'dfhis-requirement-gate'
}

function resolveYunxiaoWorkItemUrl(item: YunxiaoTodoPoolItem): string | null {
  if (item.url) {
    return item.url
  }
  if (!item.serialNumber) {
    return null
  }
  return `https://devops.aliyun.com/projex/${getYunxiaoWorkItemRouteSegment(
    item.category
  )}/${encodeURIComponent(item.serialNumber)}`
}

function getYunxiaoWorkItemRouteSegment(category: string | null): string {
  if (category === 'Task') {
    return 'task'
  }
  if (category === 'Bug') {
    return 'bug'
  }
  return 'req'
}
