import {
  encodePowerShellCommand,
  getPowerShellOsc133Bootstrap,
  getPowerShellOsc133StartupCommandMark
} from '../powershell-osc133-bootstrap'
import { quoteStartupArg } from '../../shared/tui-agent-startup-shell'

const POWERSHELL_STARTUP_COMMAND_TEXT_MAX_CHARS = 6000
// Includes ~400 encoded chars for the startup command mark so real commands keep the prior budget.
const POWERSHELL_ENCODED_COMMAND_ARG_MAX_CHARS = 28_400

export const POWERSHELL_STARTUP_COMMAND_ENV = 'ORCA_POWERSHELL_STARTUP_COMMAND'

// Long commands must run after profiles without passing through PSReadLine's startup queries.
export const POWERSHELL_STARTUP_COMMAND_BOOTSTRAP = `
$__orcaStartupCommand = $env:${POWERSHELL_STARTUP_COMMAND_ENV}
Remove-Item Env:${POWERSHELL_STARTUP_COMMAND_ENV} -ErrorAction SilentlyContinue
try {
    if (-not $__orcaStartupCommand) { throw 'Orca startup command is missing.' }
    Invoke-Expression -Command $__orcaStartupCommand
} finally {
    Remove-Variable __orcaStartupCommand -ErrorAction SilentlyContinue
}
`

export function buildWindowsShellStartupEnvironment(
  env: Record<string, string>,
  startupCommand: string | undefined
): Record<string, string> {
  const result = { ...env }
  // Windows environment names are case-insensitive; a nested launch must not inherit a stale command.
  for (const key of Object.keys(result)) {
    if (key.toUpperCase() === POWERSHELL_STARTUP_COMMAND_ENV) {
      delete result[key]
    }
  }
  if (startupCommand !== undefined) {
    result[POWERSHELL_STARTUP_COMMAND_ENV] = startupCommand
  }
  return result
}

/**
 * Builds the PowerShell -EncodedCommand payload for startup bootstrap.
 *
 * Short commands are inline; long commands arrive through a one-shot environment value.
 */
function getPowerShellRestoreCwdCommand(cwd: string): string {
  return [
    '',
    '# Profiles can change location; restore the PTY cwd after profile loading.',
    `try { Set-Location -LiteralPath ${quoteStartupArg(cwd, 'powershell')} -ErrorAction Stop } catch { Write-Warning "Failed to restore working directory: $_" }`
  ].join('\n')
}

export function getPowerShellEncodedStartupCommand(
  cwd: string,
  startupCommand?: string
): {
  encodedCommand: string
  startupCommandDeliveredInShellArgs?: boolean
  startupCommandEnv?: string
} {
  const bootstrap = `${getPowerShellOsc133Bootstrap()}${getPowerShellRestoreCwdCommand(cwd)}`
  if (!startupCommand) {
    return { encodedCommand: encodePowerShellCommand(bootstrap) }
  }

  const command = `${bootstrap}\n${getPowerShellOsc133StartupCommandMark()}\n${startupCommand}`
  const encodedCommand = encodePowerShellCommand(command)
  // Why: -EncodedCommand expands UTF-16 text into base64; keep a conservative
  // margin under Windows CreateProcess' 32,767-character command line limit.
  if (
    startupCommand.length > POWERSHELL_STARTUP_COMMAND_TEXT_MAX_CHARS ||
    encodedCommand.length > POWERSHELL_ENCODED_COMMAND_ARG_MAX_CHARS
  ) {
    if (startupCommand.length > 32_766 || startupCommand.includes('\0')) {
      throw new Error('PowerShell startup command exceeds the Windows environment value limit.')
    }
    return {
      encodedCommand: encodePowerShellCommand(
        `${bootstrap}\n${getPowerShellOsc133StartupCommandMark()}\n${POWERSHELL_STARTUP_COMMAND_BOOTSTRAP}`
      ),
      startupCommandDeliveredInShellArgs: true,
      startupCommandEnv: startupCommand
    }
  }

  return {
    encodedCommand,
    startupCommandDeliveredInShellArgs: true
  }
}
