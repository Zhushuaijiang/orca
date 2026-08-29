import { isShellProcess } from '../../../../shared/shell-process-detection'
import { TUI_AGENT_CONFIG, isTuiAgent } from '../../../../shared/tui-agent-config'
import type { TuiAgent } from '../../../../shared/tui-agent'
import { getFirstCommandToken } from '../../../../shared/command-token-scanner'

// Why: write-gating must know which TUI agent owns a PTY even when only the
// spawn command reveals it; the record outlives the spawn request.
const ptyLaunchAgents = new Map<string, TuiAgent>()

export function resolvePtyLaunchAgent(
  launchAgent: unknown,
  command?: string
): TuiAgent | null {
  if (isTuiAgent(launchAgent)) {
    return launchAgent
  }
  const commandToken = getFirstCommandToken(command ?? '')
  return isTuiAgent(commandToken) ? commandToken : null
}

export function recordPtyLaunchAgent(ptyId: string, launchAgent: unknown, command?: string): void {
  const resolved = resolvePtyLaunchAgent(launchAgent, command)
  if (resolved) {
    ptyLaunchAgents.set(ptyId, resolved)
  } else {
    ptyLaunchAgents.delete(ptyId)
  }
}

export function forgetPtyLaunchAgent(ptyId: string): void {
  ptyLaunchAgents.delete(ptyId)
}

export function hasRecordedPtyLaunchAgent(ptyId: string): boolean {
  return ptyLaunchAgents.has(ptyId)
}

function normalizeProcessCommandName(value: string): string {
  const commandToken = getFirstCommandToken(value) || value
  const trimmed = commandToken
    .trim()
    .replace(/^["']|["']$/g, '')
    .toLowerCase()
  const basename = trimmed.split(/[\\/]/).pop() ?? trimmed
  return basename.replace(/\.(?:exe|cmd|bat|ps1)$/i, '')
}

const TUI_AGENT_PROCESS_NAMES = new Set(
  Object.entries(TUI_AGENT_CONFIG).flatMap(([agent, config]) =>
    [
      agent,
      config.detectCmd,
      ...(config.detectCmdAliases ?? []),
      config.expectedProcess,
      getFirstCommandToken(config.launchCmd) ?? '',
      ...Object.values(config.launchCmdByPlatform ?? {}).map(
        (command) => getFirstCommandToken(command) ?? ''
      )
    ]
      .filter(Boolean)
      .map(normalizeProcessCommandName)
  )
)

export function isKnownTuiAgentForegroundProcess(
  processName: string | null | undefined
): boolean {
  if (!processName) {
    return false
  }
  const normalized = normalizeProcessCommandName(processName)
  return (
    normalized.length > 0 && !isShellProcess(normalized) && TUI_AGENT_PROCESS_NAMES.has(normalized)
  )
}
