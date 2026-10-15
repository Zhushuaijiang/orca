import { describe, expect, it } from 'vitest'
import { getWindowsCmdPath } from './windows-powershell-executable'
import { resolveWindowsShellLaunchArgs } from './windows-shell-args'
import { windowsPtyShellArgs } from './windows-cmd-startup-command'

describe.skipIf(process.platform !== 'win32')('cmd startup command execution', () => {
  it.each(['codex', 'claude', 'gemini', 'kimi'])(
    'preserves %s quoted input, variable expansion and caret escapes through ConPTY',
    async (agent) => {
      const command = `"%ORCA_TEST_NODE%" -e "console.log('RUN=${agent}:'+process.argv[1])" "%ORCA_TEST_VALUE%"& echo caret^&ok& exit`
      const launch = resolveWindowsShellLaunchArgs(
        'cmd.exe',
        process.cwd(),
        process.cwd(),
        undefined,
        command
      )
      const nodePty = await import('node-pty')
      const term = nodePty.spawn(
        getWindowsCmdPath(),
        windowsPtyShellArgs('cmd.exe', launch.shellArgs),
        {
          name: 'xterm-256color',
          cols: 120,
          rows: 40,
          cwd: process.cwd(),
          useConptyDll: true,
          env: {
            ...process.env,
            ORCA_TEST_NODE: process.execPath,
            ORCA_TEST_VALUE: 'quoted value with spaces'
          }
        }
      )
      let output = ''
      const data = term.onData((chunk) => {
        output += chunk
      })
      try {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            term.kill()
            reject(new Error('cmd startup timed out'))
          }, 15_000)
          term.onExit(() => {
            clearTimeout(timer)
            resolve()
          })
        })
        expect(output.split(`RUN=${agent}:quoted value with spaces`)).toHaveLength(2)
        expect(output).toContain('caret&ok')
      } finally {
        data.dispose()
      }
    }
  )
})
