import type { YunxiaoWorkItem } from './yunxiao-types'

export type YunxiaoRequirementWorkflowProfileId = 'dfhis' | 'ygt'

const YGT_WORKFLOW_GATE_MARKER = 'Orca YGT workflow harness gate'

const YGT_STRONG_SIGNALS = [
  /医共体/i,
  /\bYGT\b/i,
  /df-ygt/i,
  /df-web-ygt/i,
  /ygt-workspace/i,
  /ygt-workflow/i
] as const

const YGT_PAGE_GOVERNANCE_SIGNALS = [
  /前端页面体验/,
  /页面体验.*优化/,
  /公共布局/,
  /规范基线/,
  /公告管理/,
  /系统管理基础页/,
  /菜单管理/,
  /主数据.*(职工|用户)/,
  /(职工|用户)管理.*体验/,
  /主索引/,
  /患者\s*360/i,
  /映射配置/,
  /合并规则/,
  /统一验收/,
  /查询栏/,
  /表格.*操作列/,
  /弹窗.*体验/
] as const

type WorkflowProfileItem = Pick<
  YunxiaoWorkItem,
  | 'serialNumber'
  | 'title'
  | 'category'
  | 'typeName'
  | 'statusName'
  | 'customer'
  | 'priority'
  | 'url'
> & {
  notes?: string | null
}

function compactText(parts: readonly (string | null | undefined)[]): string {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join('\n')
}

export function isYgtRequirementText(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) {
    return false
  }
  return (
    YGT_STRONG_SIGNALS.some((pattern) => pattern.test(trimmed)) ||
    YGT_PAGE_GOVERNANCE_SIGNALS.some((pattern) => pattern.test(trimmed))
  )
}

export function resolveYunxiaoRequirementWorkflowProfile(
  item: WorkflowProfileItem
): YunxiaoRequirementWorkflowProfileId {
  const text = compactText([
    item.serialNumber,
    item.title,
    item.typeName,
    item.statusName,
    item.category,
    item.customer,
    item.priority,
    item.url,
    item.notes
  ])
  return isYgtRequirementText(text) ? 'ygt' : 'dfhis'
}

export function buildYgtHarnessRequest(item: WorkflowProfileItem): string {
  return compactText([
    item.serialNumber,
    item.title,
    item.typeName ? `类型：${item.typeName}` : null,
    item.customer ? `客户：${item.customer}` : null,
    item.url ? `链接：${item.url}` : null,
    item.notes ? `备注：${item.notes}` : null
  ])
    .replace(/\s+/g, ' ')
    .trim()
}

function quotePosixShellArgument(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`
}

function formatYgtHarnessIntakeCommand(item: WorkflowProfileItem): string {
  return `node scripts/harness/ygt-workflow.mjs /ygt ${quotePosixShellArgument(
    buildYgtHarnessRequest(item)
  )} --project auto --json`
}

export function buildYgtWorkflowProfileInstruction(
  items: readonly WorkflowProfileItem[]
): string | null {
  const ygtItems = items.filter((item) => resolveYunxiaoRequirementWorkflowProfile(item) === 'ygt')
  if (ygtItems.length === 0) {
    return null
  }
  const targets = ygtItems
    .map((item) => {
      const target = item.serialNumber ?? item.url ?? item.title
      return `- ${target}: ${formatYgtHarnessIntakeCommand(item)}`
    })
    .join('\n')

  return `${YGT_WORKFLOW_GATE_MARKER}

命中的工作项属于医共体/YGT workflow profile。YGT profile 是通用路由，不只服务某一批 DFHIS 编号。

必须执行的 YGT 流程：
- 第一条用户可见进展消息必须包含精确标记：${YGT_WORKFLOW_GATE_MARKER}。
- 在实现、评审或验收前，必须先使用 $ygt skill；如果 skill 未自动触发，手动定位 df-ygt-main 并从该目录运行下面的 harness intake。
- 必须读取 intake 返回的 projects、standards、commands、notes，再决定修改哪些仓库和跑哪些验证。
- 不允许绕过 df-ygt-main/scripts/harness/ygt-workflow.mjs 直接按普通 DFHIS/HIS 需求处理。
- 页面、布局、查询栏、表格、弹窗、分栏、DevExtreme 类需求必须读取 df-web-base layout README 和 STYLE_CONSTRAINTS.md。
- 多页面、多项目或统一治理类需求必须使用 manifest、claim 和单一 integrator 收口，避免多个 agent 同时改共享布局、依赖、全局样式或 harness。
- 如果领取到父需求/总控需求，默认不要直接实现；应只做拆分、依赖梳理或验收收口，具体代码变更落到子需求、缺陷或测试任务。
- harness/plugin/installer/YGT 文档变化必须运行 selftest：node scripts/harness/ygt-workflow.mjs selftest --project main --json。

YGT harness intake 命令：
${targets}`
}

export function buildYgtManualPromptInstruction(prompt: string): string | null {
  if (!isYgtRequirementText(prompt)) {
    return null
  }
  return buildYgtWorkflowProfileInstruction([
    {
      serialNumber: null,
      title: prompt,
      category: 'Req',
      typeName: null,
      statusName: null,
      customer: null,
      priority: null,
      url: null
    }
  ])
}
