import type { TuiAgent } from '../../shared/tui-agent'
import { getRepoExecutionHostId } from '../../shared/execution-host'
import { parseWslUncPath } from '../../shared/wsl-paths'
import type { AutomationRunTargetResult } from './run-target-resolution'

/**
 * Claude Agent Teams has no Windows launcher: `orca claude-teams` refuses win32, and the
 * agent's own config marks win32/WSL unsupported because those hosts use Claude's
 * in-process Agent Teams instead of Orca's native-pane/tmux wrapper.
 *
 * Why a downgrade rather than a refusal: an automation persisted with the teams agent
 * (e.g. imported from macOS) otherwise dispatches, dies on the launcher, and stalls with
 * no agent and no prompt delivered. Plain `claude` is the Windows equivalent, so run that.
 */
export function resolveAutomationRunAgent(
  agentId: TuiAgent,
  target: Extract<AutomationRunTargetResult, { ok: true }>,
  platform: NodeJS.Platform = process.platform
): TuiAgent {
  if (
    agentId === 'claude-agent-teams' &&
    platform === 'win32' &&
    getRepoExecutionHostId(target.repo) === 'local' &&
    !parseWslUncPath(target.cwd)
  ) {
    return 'claude'
  }
  return agentId
}
