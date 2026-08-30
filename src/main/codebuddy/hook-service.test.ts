import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { homedirMock } = vi.hoisted(() => ({
  homedirMock: vi.fn<() => string>()
}))

vi.mock('os', async () => {
  const actual = (await vi.importActual('os')) as Record<string, unknown>
  return {
    ...actual,
    homedir: homedirMock
  }
})

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/orca-codebuddy-hook-test-user-data'
  }
}))

import { codebuddyHookService } from './hook-service'
import { CLAUDE_EVENTS } from '../claude/hook-settings'

describe('codebuddyHookService', () => {
  let homeDir: string

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), 'orca-codebuddy-home-'))
    homedirMock.mockReturnValue(homeDir)
  })

  afterEach(() => {
    vi.clearAllMocks()
    rmSync(homeDir, { recursive: true, force: true })
  })

  it('installs the Claude-compatible managed hook set into ~/.codebuddy/settings.json', () => {
    const status = codebuddyHookService.install()

    expect(status.state).toBe('installed')
    expect(status.managedHooksPresent).toBe(true)
    expect(status.configPath).toBe(join(homeDir, '.codebuddy', 'settings.json'))

    const config = JSON.parse(readFileSync(status.configPath, 'utf8')) as {
      hooks: Record<string, { matcher?: string; hooks: { command: string }[] }[]>
    }
    // Why: CodeBuddy documents the full Claude event family, so the install
    // reuses CLAUDE_EVENTS verbatim (codebuddy.ai/docs/cli/hooks).
    expect(Object.keys(config.hooks).sort()).toEqual(
      CLAUDE_EVENTS.map((event) => event.eventName).sort()
    )
    const preToolUse = config.hooks.PreToolUse[0]
    expect(preToolUse.matcher).toBe('*')
    expect(preToolUse.hooks[0].command).toContain('codebuddy-hook')
  })

  it('writes a managed script that posts to the codebuddy hook source', () => {
    codebuddyHookService.install()

    const scriptFileName = process.platform === 'win32' ? 'codebuddy-hook.cmd' : 'codebuddy-hook.sh'
    const script = readFileSync(join(homeDir, '.orca', 'agent-hooks', scriptFileName), 'utf8')
    expect(script).toContain('/hook/codebuddy')
    expect(script).not.toContain('/hook/claude')
  })

  it('reports partial when one managed event goes missing', () => {
    codebuddyHookService.install()

    const configPath = join(homeDir, '.codebuddy', 'settings.json')
    const config = JSON.parse(readFileSync(configPath, 'utf8')) as {
      hooks: Record<string, unknown>
    }
    delete config.hooks.Stop
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)

    const status = codebuddyHookService.getStatus()

    expect(status.state).toBe('partial')
    expect(status.managedHooksPresent).toBe(true)
    expect(status.detail).toBe('Managed hook missing for events: Stop')
  })

  it('removes only the managed entries and leaves user hooks intact', () => {
    const configPath = join(homeDir, '.codebuddy', 'settings.json')
    mkdirSync(join(homeDir, '.codebuddy'), { recursive: true })
    writeFileSync(
      configPath,
      `${JSON.stringify({
        model: 'hy3',
        hooks: {
          Stop: [
            {
              hooks: [{ type: 'command', command: 'echo user-hook', timeout: 10 }]
            }
          ]
        }
      })}\n`
    )

    const status = codebuddyHookService.remove()

    expect(status.state).toBe('not_installed')
    expect(status.managedHooksPresent).toBe(false)
    const config = JSON.parse(readFileSync(configPath, 'utf8')) as {
      model: string
      hooks: Record<string, { hooks: { command: string }[] }[]>
    }
    expect(config.model).toBe('hy3')
    expect(config.hooks.Stop[0].hooks[0].command).toBe('echo user-hook')
  })
})
