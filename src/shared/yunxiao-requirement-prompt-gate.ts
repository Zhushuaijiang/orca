import type { YunxiaoRequirementContractSnapshot } from './yunxiao-types'
import { buildYgtManualPromptInstruction } from './yunxiao-requirement-workflow-profile'

const DFHIS_WORK_ITEM_RE = /\bDFHIS-\d+\b/i
const YUNXIAO_WORK_ITEM_URL_RE = /https?:\/\/devops\.aliyun\.com\/projex\/\S+/i
const YUNXIAO_GATE_MARKER = 'Orca Yunxiao requirement workflow gate'
const SOURCE_PROMPT_PREVIEW_LIMIT = 2048
const TERMINAL_SUBMIT = '\r'
const BRACKETED_PASTE_START = '\u001b[200~'
const BRACKETED_PASTE_END = '\u001b[201~'

let gateEnabled = false

export function setYunxiaoRequirementPromptGateEnabled(enabled: boolean): void {
  gateEnabled = enabled
}

export const YUNXIAO_DFHIS_CODE_CONSTRAINTS = `代码红线：不得为需求修改构建/锁文件、切换为本地 project 依赖，或只改业务仓内已废弃的 *-api/DTO/Req/Feign 契约。确需契约变更时先修改共享 df-his-api，并记录发布与调用方编译计划；路径不清则停止编辑并标记 needs_clarification/blocked。`

export const YUNXIAO_REQUIREMENT_COMPACT_WORKFLOW = `执行 $yunxiao-requirement-archiver：先归档证据并建立精简 Requirement Contract，再用事实卡/索引定位候选仓库，验证当前代码后在需求隔离 worktree 中编辑。低风险默认单 builder + 本地验证；只有复合高风险或证据冲突才增加独立评审，禁止因“多仓库”单一因素固定启动四个 reviewer。按改动类型提供新鲜 test/build/runtime/UI/数据证据，推送后再回写云效。详细规则按当前阶段读取 skill references，不得一次性加载全部参考资料。`

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
  'Orca Yunxiao review handoff',
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
  if (!gateEnabled) {
    return false
  }
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
  const identifier = extractYunxiaoRequirementIdentifier(prompt) ?? '云效工作项'
  return `${YUNXIAO_GATE_MARKER}: ${identifier}

用户可见内容使用中文。${YUNXIAO_REQUIREMENT_COMPACT_WORKFLOW}

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
