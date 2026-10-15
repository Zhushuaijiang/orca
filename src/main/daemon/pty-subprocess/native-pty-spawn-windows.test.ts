import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const nodePty = vi.hoisted(() => ({ spawn: vi.fn() }))
vi.mock('node-pty', () => nodePty)
vi.mock('../../windows/windows-pty-job', () => ({ assignHostProcessToKillOnCloseJob: vi.fn() }))

import { spawnNativeDaemonPty } from './native-pty-spawn'
import { POWERSHELL_STARTUP_COMMAND_ENV } from '../../providers/windows-powershell-startup-command'

const attempts = ['pwsh.exe', 'powershell.exe', 'cmd.exe'].map((shellPath) => ({
  shellPath,
  shellArgs: [shellPath === 'cmd.exe' ? '/K' : '-NoExit'],
  effectiveCwd: 'C:\\work',
  validationCwd: 'C:\\work',
  startupCommandDeliveredInShellArgs: true
}))
const args = {
  shellPath: attempts[0]!.shellPath,
  shellArgs: attempts[0]!.shellArgs,
  spawnCwd: 'C:\\work',
  env: {},
  cols: 80,
  rows: 24,
  windowsFallbackAttempts: attempts
}

describe('Windows shell fallback over node-pty ConPTY', () => {
  const platform = Object.getOwnPropertyDescriptor(process, 'platform')!
  beforeEach(() => {
    Object.defineProperty(process, 'platform', { configurable: true, value: 'win32' })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    nodePty.spawn.mockReset()
  })
  afterEach(() => {
    Object.defineProperty(process, 'platform', platform)
    vi.restoreAllMocks()
  })

  it('walks both fallback shells when ConPTY rejects the primary ones', async () => {
    const proc = { pid: 9876 }
    nodePty.spawn.mockImplementation((file: string) => {
      if (file !== 'cmd.exe') {
        throw new Error(`spawn ${file} EACCES`)
      }
      return proc
    })
    const result = await spawnNativeDaemonPty(args)
    expect(nodePty.spawn.mock.calls.map(([file]) => file)).toEqual([
      'pwsh.exe',
      'powershell.exe',
      'cmd.exe'
    ])
    expect(nodePty.spawn.mock.calls[2]![2]).toMatchObject({ useConptyDll: true })
    expect(result.process).toBe(proc)
    expect(result.shellPath).toBe('cmd.exe')
    expect(result.startupCommandDeliveredInShellArgs).toBe(true)
  })

  it('starts no fallback shell once the spawn is canceled', async () => {
    const controller = new AbortController()
    nodePty.spawn.mockImplementation(() => {
      controller.abort(new Error('spawn canceled'))
      throw new Error('spawn pwsh.exe EACCES')
    })
    await expect(spawnNativeDaemonPty({ ...args, signal: controller.signal })).rejects.toThrow(
      'spawn canceled'
    )
    expect(nodePty.spawn).toHaveBeenCalledOnce()
  })

  it.each([0, 1, 2])(
    'passes the long command only to the owning shell (winner %s)',
    async (winner) => {
      const command = `claude '${'定时任务'.repeat(2000)}'`
      const env = { orca_powershell_startup_command: 'stale', PATH: 'C:\\bin' }
      const carriedAttempts = attempts.map((attempt, index) => ({
        ...attempt,
        ...(index < 2 ? { startupCommandEnv: command } : {})
      }))
      nodePty.spawn.mockImplementation((file: string) => {
        if (file !== carriedAttempts[winner].shellPath) {
          throw new Error('EACCES')
        }
        return { pid: 9876 }
      })
      await spawnNativeDaemonPty({ ...args, env, windowsFallbackAttempts: carriedAttempts })
      for (const [index, call] of nodePty.spawn.mock.calls.entries()) {
        expect(call[2].env).toEqual({
          PATH: 'C:\\bin',
          ...(index < 2 ? { [POWERSHELL_STARTUP_COMMAND_ENV]: command } : {})
        })
      }
      expect(env.orca_powershell_startup_command).toBe('stale')
    }
  )
})
