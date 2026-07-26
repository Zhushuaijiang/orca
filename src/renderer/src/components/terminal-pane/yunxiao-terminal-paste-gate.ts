import type { AgentStatusEntry } from '../../../../shared/agent-status-types'
import { makePaneKey, type TerminalLeafId } from '../../../../shared/stable-pane-id'
import { applyYunxiaoRequirementPromptGate } from '../../../../shared/yunxiao-requirement-prompt-gate'

export function applyYunxiaoRequirementTerminalPasteGate(
  text: string,
  opts: {
    tabId: string
    leafId: string
    agentStatusByPaneKey: Record<string, AgentStatusEntry>
  }
): string {
  const paneKey = makePaneKey(opts.tabId, opts.leafId as TerminalLeafId)
  if (!opts.agentStatusByPaneKey[paneKey]) {
    return text
  }
  return applyYunxiaoRequirementPromptGate(text)
}
