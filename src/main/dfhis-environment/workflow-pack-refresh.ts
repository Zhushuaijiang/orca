import {
  containsYunxiaoRequirementReference,
  shouldApplyYunxiaoRequirementPromptGate
} from '../../shared/yunxiao-requirement-prompt-gate'
import { recognizeAgentProcessFromCommandLine } from '../../shared/agent-process-recognition'
import { ensureDfHisWorkflowPackInstalled } from './dfhis-workflow-pack-installer'

let workflowPackRefresh: Promise<void> | null = null
let ensureWorkflowPackInstalled: () => Promise<unknown> = ensureDfHisWorkflowPackInstalled

export function setDfHisWorkflowPackRefreshInstallerForTests(
  installer: (() => Promise<unknown>) | null
): void {
  ensureWorkflowPackInstalled = installer ?? ensureDfHisWorkflowPackInstalled
  workflowPackRefresh = null
}

export async function ensureDfHisWorkflowPackCurrentForYunxiaoText(
  text: string | null | undefined
): Promise<void> {
  if (!text || !containsYunxiaoRequirementReference(text)) {
    return
  }
  if (!workflowPackRefresh) {
    workflowPackRefresh = ensureWorkflowPackInstalled()
      .then(() => undefined)
      .catch((error: unknown) => {
        workflowPackRefresh = null
        throw error
      })
  }
  await workflowPackRefresh
}

export function isYunxiaoRequirementAgentCommand(command: string | null | undefined): boolean {
  const trimmed = command?.trim()
  return Boolean(
    trimmed &&
    shouldApplyYunxiaoRequirementPromptGate(trimmed) &&
    recognizeAgentProcessFromCommandLine(trimmed)
  )
}
