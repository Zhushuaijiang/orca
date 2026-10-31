import { describe, expect, it } from 'vitest'
import { runProcessSync } from '@orca/process-host'
import { encodePowerShellCommand } from '../powershell-osc133-bootstrap'
import { resolveWindowsPowerShellExecutablePath } from './windows-powershell-executable'
import { resolveWindowsShellLaunchArgs } from './windows-shell-args'
import { POWERSHELL_STARTUP_COMMAND_ENV } from './windows-powershell-startup-command'

// Why: OSC 133 marks (invisible in a terminal) legitimately precede startup
// command output; assertions care about the payload, not shell integration.
const withoutOsc133Marks = (stdout: string): string =>
  stdout.replace(
    new RegExp(`${String.fromCharCode(27)}\\]133;[A-Z](;\\d+)?${String.fromCharCode(7)}`, 'g'),
    ''
  )

describe.skipIf(process.platform !== 'win32')('PowerShell long command execution', () => {
  for (const shell of ['powershell.exe', 'pwsh.exe'] as const) {
    const executable = resolveWindowsPowerShellExecutablePath(shell)
    it.skipIf(!executable).each(['FullLanguage', 'ConstrainedLanguage'] as const)(
      `${shell} runs exactly once in %s mode and clears the environment before execution`,
      (languageMode) => {
        if (!executable) {
          throw new Error(`${shell} is unavailable`)
        }
        const command = [
          '$env:ORCA_STARTUP_TEST_COUNT = 1 + [int]$env:ORCA_STARTUP_TEST_COUNT',
          '$payload = \'quoted "value" $literal `tick\'',
          'Write-Output "count=$env:ORCA_STARTUP_TEST_COUNT;payload=$payload;carried=$env:ORCA_POWERSHELL_STARTUP_COMMAND"',
          `# ${'长提示词'.repeat(2000)}`
        ].join('\n')
        const cwd = process.cwd()
        const launch = resolveWindowsShellLaunchArgs(shell, cwd, cwd, undefined, command)
        const bootstrap = Buffer.from(launch.shellArgs[3], 'base64').toString('utf16le')
        const result = runProcessSync({
          program: executable,
          args: [
            '-NoLogo',
            '-NoProfile',
            '-NonInteractive',
            '-EncodedCommand',
            encodePowerShellCommand(
              `$ProgressPreference = 'SilentlyContinue'\n$ExecutionContext.SessionState.LanguageMode = '${languageMode}'\n${bootstrap}`
            )
          ],
          env: {
            ...process.env,
            [POWERSHELL_STARTUP_COMMAND_ENV]: launch.startupCommandEnv,
            ORCA_STARTUP_TEST_COUNT: '0'
          },
          timeoutMs: 15_000
        })
        expect(result.code, result.stderr).toBe(0)
        expect(result.stderr).toBe('')
        expect(withoutOsc133Marks(result.stdout).trim()).toBe(
          'count=1;payload=quoted "value" $literal `tick;carried='
        )
      }
    )
  }
})
