import type { YunxiaoRequirementContractSnapshot } from './yunxiao-types'
import { buildYgtManualPromptInstruction } from './yunxiao-requirement-workflow-profile'

const DFHIS_WORK_ITEM_RE = /\bDFHIS-\d+\b/i
const YUNXIAO_WORK_ITEM_URL_RE = /https?:\/\/devops\.aliyun\.com\/projex\/\S+/i
const YUNXIAO_GATE_MARKER = 'Orca Yunxiao requirement workflow gate'
const SOURCE_PROMPT_PREVIEW_LIMIT = 2048
const TERMINAL_SUBMIT = '\r'
const BRACKETED_PASTE_START = '\u001b[200~'
const BRACKETED_PASTE_END = '\u001b[201~'

export const YUNXIAO_DFHIS_CODE_CONSTRAINTS = `DFHIS 代码约束：
- 禁止修改构建/依赖定义来解决需求，包括 build.gradle、settings.gradle、pom.xml、package dependency lock 等；特别不能把已发布依赖改成 compile project(...) 或启用本地 project API 模块。
- 禁止新增、修改或依赖项目内 *-api/API 模块、DTO、Req、Feign/客户端 API 包来推进需求；这些项目 API 已废弃，不能作为新实现入口或兼容性补丁。
- 如果实现看起来必须改 API 契约、DTO、Req、Feign 客户端或对外 API 字段，必须优先定位并修改共享 API 仓库 df-his-api 中对应模块；不能只改业务仓库内的 mic-*/agg-*/winbff-* 本地 *-api 模块，否则依赖发布包的其它仓库会编译失败。
- 如果实现看起来必须改构建文件、切换依赖、补 API 模块字段、发布 API jar 或调用项目 API，必须先把 Requirement Contract 标为 needs_clarification 或 blocked，并请求架构/产品确认；确认后也必须把 df-his-api/API jar 发布依赖写入实现计划和数据/服务端变更，不得自行用本地 API 模块绕过。
- 实现计划和最终复核必须明确记录是否触碰 build/API 约束；只要实际 diff 包含上述文件或 API 模块变更但没有同步 df-his-api、发布 API jar/调用方 API 兼容计划和本地编译验证，不能标记为完成。`

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
  const workflowProfileInstruction = buildYgtManualPromptInstruction(prompt)
  return `${YUNXIAO_GATE_MARKER}

当前提示包含云效/DFHIS 需求。无论用户是手动粘贴，还是从 todo pool 领取，都必须按受控需求流程处理。

语言要求：
- 所有用户可见进展、问题、PRD/合同正文、评审提示、评审结论、最终摘要必须使用中文。
- 只有机器读取的字段名、角色 id、固定状态值可以保留英文，例如 yunxiaoRequirementOutcomes、requirementContract、riskProfile、reviewChecks、methodologyGate、evidence、prd_gate、architecture、implementation、verifier。
- 人类可读结论不要写 Verdict: pass/block；改写为“结论：通过/阻断/通过但存在非阻断限制”，并用中文说明依据。

必须执行的流程：
- 第一条用户可见进展消息必须以这个精确标记和目标 DFHIS id 开头：Orca Yunxiao requirement workflow gate。
- 实现或判断是否可验收之前，必须先使用 yunxiao-requirement-archiver skill。
- 必须归档/读取需求证据，并在 PRD_AND_CODE_ANALYSIS.md 顶部创建或更新精简的 Requirement Contract。
- 如果合同存在阻断性的产品决策，提出 1-3 个具体选择题，并在代码编辑或完成声明前停止。
- 实现前必须做风险分级。需求不清、UI/流程变更、API/数据库影响、证据冲突、验证薄弱或用户明确要求 review 时，必须升级为专项评审。
- 多仓库、权限/发布影响、API/数据库加验证薄弱、UI/流程加需求冲突时，必须升级为强制独立多 agent 评审。必需角色：prd_gate、architecture、implementation、verifier。
- 可用时使用 Orca orchestration 或 agent-dispatch 工具创建独立评审 agent；如果无法独立派发，必须明确说明阻断原因，且不能标记需求安全或完成。
- 必须把 reviewer 结论保存在 reviewChecks 中，并按证据判断，不按投票数判断。
- 任一必需 reviewer 角色缺失、阻断问题未解决、实现计划缺失、或缺少新鲜验证证据时，完成状态必须阻断。
- 通用 HIS 仓库必须先用 his-workflow-harness 执行 intake，并按仓库声明优先、项目族兜底选择 Node/JDK/包管理器；医共体/YGT 使用 ygt harness。不得直接沿用宿主机默认 Node。
- HIS 前端（非医共体/YGT）需求在宣布完成前，必须先过 UI 规范门禁：运行 his-workflow-harness 的 ui-review（或 ui-spec-review 技能扫描 28 条规范），violations 非空即阻断并逐条修复或记录可复核理由，证据类型 ui。
- 必须在 methodologyGate.requiredEvidenceTypes 声明本需求所需证据并逐项写入 verificationEvidence：UI/流程至少 build+screenshot；后端/API 至少 passing_test+build；数据库变更加 database；HIS 业务语义加 business；发布加 build+jenkins+deployment+smoke；云效完成回写加 yunxiao；实际工具链加 runtime。
- 不得用 git diff --check、代码阅读或 Agent 自述代替构建、HIS MCP、数据库、Jenkins、部署、smoke 或页面验收证据。
- 没有记录新鲜验证证据前，不得声称需求已完成或没问题；如果验证被环境阻断，必须说明精确阻断原因和剩余负责人。
- 如果有结构化结果通道，返回 yunxiaoRequirementOutcomes，包含 requirementContract.riskProfile、reviewChecks、methodologyGate、evidence。字段名可以英文，但字段值中的解释必须中文。

${workflowProfileInstruction ? `${workflowProfileInstruction}\n\n` : ''}
${YUNXIAO_DFHIS_CODE_CONSTRAINTS}

原始用户请求：
${prompt}`
}

function sanitizeTerminalPasteText(text: string): string {
  return text.split('\u001b').join('\u241b')
}

function wrapTerminalBracketedPasteText(text: string): string {
  return `${BRACKETED_PASTE_START}${sanitizeTerminalPasteText(text.replace(/\r?\n/g, TERMINAL_SUBMIT))}${BRACKETED_PASTE_END}`
}

function splitTerminalSubmitSuffix(input: string): { body: string; suffix: string } {
  return input.endsWith(TERMINAL_SUBMIT)
    ? { body: input.slice(0, -TERMINAL_SUBMIT.length), suffix: TERMINAL_SUBMIT }
    : { body: input, suffix: '' }
}

export function applyYunxiaoRequirementPromptGateToTerminalInput(input: string): string {
  const { body, suffix } = splitTerminalSubmitSuffix(input)
  if (body.startsWith(BRACKETED_PASTE_START)) {
    const endIndex = body.lastIndexOf(BRACKETED_PASTE_END)
    if (endIndex !== -1) {
      const pasted = body.slice(BRACKETED_PASTE_START.length, endIndex)
      const tail = body.slice(endIndex + BRACKETED_PASTE_END.length)
      if (tail.length === 0 && shouldApplyYunxiaoRequirementPromptGate(pasted)) {
        return `${wrapTerminalBracketedPasteText(applyYunxiaoRequirementPromptGate(pasted))}${suffix}`
      }
    }
  }
  if (!shouldApplyYunxiaoRequirementPromptGate(body)) {
    return input
  }
  return `${wrapTerminalBracketedPasteText(applyYunxiaoRequirementPromptGate(body))}${suffix}`
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
