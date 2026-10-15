import { describe, expect, it } from 'vitest'
import { buildWindowsPowerShellSpawnAttempts } from './windows-shell-fallback-chain'
import { resolveWindowsShellLaunchArgs } from './windows-shell-args'
import {
  buildWindowsShellStartupEnvironment,
  POWERSHELL_STARTUP_COMMAND_ENV
} from './windows-powershell-startup-command'

describe('PowerShell startup command transport', () => {
  it.each(['powershell.exe', 'pwsh.exe'])(
    'keeps quoted, multiline and CJK command text intact for %s',
    (shell) => {
      const command = `claude '--dangerously-skip-permissions' '${'医共体 "复核" $value `\n'.repeat(500)}'`
      const launch = resolveWindowsShellLaunchArgs(
        shell,
        'C:\\repo',
        'C:\\home',
        undefined,
        command
      )
      const env = buildWindowsShellStartupEnvironment({ PATH: 'C:\\bin' }, launch.startupCommandEnv)
      expect(env[POWERSHELL_STARTUP_COMMAND_ENV]).toBe(command)
      expect(env.PATH).toBe('C:\\bin')
      expect(launch.startupCommandDeliveredInShellArgs).toBe(true)
      expect(launch.shellArgs[3].length).toBeLessThan(28_000)
      const bootstrap = Buffer.from(launch.shellArgs[3], 'base64').toString('utf16le')
      expect(bootstrap).not.toContain(command)
      expect(bootstrap.indexOf('Remove-Item Env:')).toBeLessThan(
        bootstrap.indexOf('Invoke-Expression -Command $__orcaStartupCommand')
      )
      expect(bootstrap).not.toContain('ScriptBlock]::Create')
    }
  )

  it('uses the environment when encoding exceeds the argv budget before 6000 characters', () => {
    const command = `claude '${'x'.repeat(5900)}'`
    const launch = resolveWindowsShellLaunchArgs(
      'powershell.exe',
      'C:\\repo',
      'C:\\home',
      undefined,
      command
    )
    expect(launch.startupCommandEnv).toBe(command)
    expect(launch.startupCommandDeliveredInShellArgs).toBe(true)
    expect(launch.shellArgs[3].length).toBeLessThan(28_000)
  })

  it('carries the command on each PowerShell attempt and excludes it from cmd fallback', () => {
    const command = `claude '${'x'.repeat(7000)}'`
    const attempts = buildWindowsPowerShellSpawnAttempts({
      shellPath: 'pwsh.exe',
      cwd: 'C:\\repo',
      defaultCwd: 'C:\\home',
      startupCommand: command,
      resolveOptions: {
        platform: 'win32',
        env: { ProgramFiles: 'C:\\Program Files', SystemRoot: 'C:\\Windows' },
        isRealExecutable: () => true
      }
    })
    expect(attempts).toHaveLength(3)
    for (const attempt of attempts.slice(0, 2)) {
      expect(attempt.startupCommandEnv).toBe(command)
      expect(attempt.startupCommandDeliveredInShellArgs).toBe(true)
    }
    expect(attempts[2].startupCommandEnv).toBeUndefined()
    expect(attempts[2].startupCommandDeliveredInShellArgs).toBe(false)
  })

  it('removes inherited startup commands without changing the parent environment', () => {
    const inherited = { orca_powershell_startup_command: 'stale', PATH: 'C:\\bin' }
    expect(buildWindowsShellStartupEnvironment(inherited, undefined)).toEqual({ PATH: 'C:\\bin' })
    expect(buildWindowsShellStartupEnvironment(inherited, 'fresh')).toEqual({
      PATH: 'C:\\bin',
      [POWERSHELL_STARTUP_COMMAND_ENV]: 'fresh'
    })
    expect(inherited.orca_powershell_startup_command).toBe('stale')
  })

  it('rejects commands that cannot fit an environment value before starting a shell', () => {
    expect(() =>
      resolveWindowsShellLaunchArgs(
        'powershell.exe',
        'C:\\repo',
        'C:\\home',
        undefined,
        'x'.repeat(32_767)
      )
    ).toThrow('Windows environment value limit')
  })
})
