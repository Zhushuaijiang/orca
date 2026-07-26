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
        `标题: ${item.title}`,
        item.typeName ? `类型: ${item.typeName}` : null,
        item.statusName ? `状态: ${item.statusName}` : null,
        item.customer ? `客户: ${item.customer}` : null,
        item.priority ? `优先级: ${item.priority}` : null,
        item.assignee?.name ? `负责人: ${item.assignee.name}` : null,
        item.sprint?.name ? `迭代: ${item.sprint.name}` : null,
        item.url ? `链接: ${item.url}` : null
      ]
        .filter(Boolean)
        .join('\n  ')
      return `${index + 1}. ${target}\n  ${metadata}`
    })
    .join('\n\n')

  return `${basePrompt.trim() || '处理下一条云效 todo pool 需求。'}

Yunxiao todo pool claim:
${targets}

语言要求：
- 所有用户可见进展、问题、PRD/合同正文、评审提示、评审结论、最终摘要必须使用中文。
- 只有机器读取的字段名、角色 id、固定状态值可以保留英文，例如 yunxiaoRequirementOutcomes、requirementContract、riskProfile、reviewChecks、methodologyGate、evidence、prd_gate、architecture、implementation、verifier。
- 人类可读结论不要写 Verdict: pass/block；改写为“结论：通过/阻断/通过但存在非阻断限制”，并用中文说明依据。

必须执行的流程：
- 每个领取的工作项都必须使用 yunxiao-requirement-archiver skill。
- 优先使用该 skill 的 direct Yunxiao MCP 流程归档需求；只有 direct Yunxiao archive 不可用且 HIS MCP credentials 已配置时，才使用 HIS MCP 作为旧版兜底。
- 代码变更前，必须基于本地归档证据，在需求目录创建或更新 PRD_AND_CODE_ANALYSIS.md。
- 必须在 PRD_AND_CODE_ANALYSIS.md 顶部放置精简的 Requirement Contract，包含 status、owner、next_action、intent、blocking_questions、decision ledger。
- 实现前必须把合同分类为 needs_clarification、ready_to_build、missing_repo、blocked 或 ready_to_verify；工具可用时，同步更新 todo pool 的 requirementContract 快照。
- 应用 Orca Superpowers 风格 gate：先澄清再编码；首屏合同保持紧凑；focused/mandatory 风险必须记录备选方案/设计确认；编辑前写实现计划；声明完成前必须用新的命令/截图/build/test/artifact 证据验证。
- 如果合同是 needs_clarification，代码编辑前必须提出 1-3 个带具体选项的阻断决策问题。可用时使用原生 AskUserQuestion/request_user_input；否则直接在对话中提问并等待。如果无人值守且没有交互回答路径，把问题记录到 PRD_AND_CODE_ANALYSIS.md，工具可用时把 pool item 标为 needs-clarification，最终输出精确行 “Contract status: needs_clarification”，然后停止，不要改代码。
- 只有当合同为 ready_to_build 且影响实现的决策已记录后，才能编辑代码。
- 原生自动化结果上报可用时，返回结构化 yunxiaoRequirementOutcomes，每个 item 包含 itemId、poolStatus、requirementContract、evidence；riskProfile、reviewChecks、methodologyGate 放在 requirementContract 内，不要放到顶层 outcome 字段。
- 代码根目录优先从 YUNXIAO_CODE_WORKSPACE_ROOT 解析；如果不存在，再使用 YUNXIAO_DEFAULT_CODE_ROOT，最后使用 ORCA_USER_DATA_PATH/dfhis-environment.json 的 hisCodeRoot。
- 不要直接编辑已选择/默认代码根目录。代码变更前，在 {requirement_dir}/code/<repo> 下创建或复用需求 worktree，并在每次编辑前运行 skill guard。
- 默认低风险需求使用一个 builder 加本地验证。存在未解决决策、UI/流程、API/数据库、需求冲突、验证薄弱或用户明确要求 review 时，升级为 focused review。多仓库、权限/发布、API/数据库加验证薄弱、UI/流程加需求冲突时，升级为强制独立 PRD/architecture/implementation/verifier 多 agent 评审。可用时使用 Orca orchestration 或 agent-dispatch 工具；如果无法独立派发，必须明确说明阻断原因，且不能标记需求安全或完成。必须把每个 reviewer 结论保存在 reviewChecks，并按证据判断，不按多数票判断。
- 任一必需 reviewer 角色缺失、阻断问题未解决、实现计划缺失、或缺少新鲜验证证据时，完成状态必须阻断。
- 如果需求无法归档、分析、澄清或准备实现，停止并用中文清楚报告阻断原因。`
}
