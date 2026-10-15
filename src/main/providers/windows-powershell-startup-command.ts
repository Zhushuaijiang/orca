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
