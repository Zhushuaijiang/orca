import type { AgentStatusEntry } from '../../../../shared/agent-status-types'
import { applyYunxiaoRequirementPromptGate } from '../../../../shared/yunxiao-requirement-prompt-gate'

export function applyYunxiaoRequirementTerminalPasteGate(
  text: string,
  opts: {
    tabId: string
    leafId: string
    agentStatusByPaneKey: Record<string, AgentStatusEntry>
  }
): string {
  // Why: plain composite instead of makePaneKey — legacy panes can carry
  // non-UUID leaf ids, and a lookup miss just means "no live agent row".
  const paneKey = `${opts.tabId}:${opts.leafId}`
  if (!opts.agentStatusByPaneKey[paneKey]) {
    return text
  }
  return applyYunxiaoRequirementPromptGate(text)
}
