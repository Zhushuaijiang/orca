import { afterEach, describe, expect, it, vi } from 'vitest'
import type * as DispatchModule from '../dispatch'
import { dispatch } from '../dispatch'
import { RuntimeClient } from '../runtime-client'
import { AUXILIARY_HANDLERS } from './auxiliary'

vi.mock('../dispatch', async (original) => ({
  ...(await original<typeof DispatchModule>()),
  dispatch: vi.fn()
}))

afterEach(() => {
  vi.restoreAllMocks()
  vi.mocked(dispatch).mockReset()
  vi.unstubAllEnvs()
})

describe('explicit auxiliary workflow', () => {
  it.each(['implementation', 'testing'])(
    'starts %s with its configured model and effort',
    async (task) => {
      vi.stubEnv('ORCA_AUXILIARY_REQUEST', '0')
      const client = new RuntimeClient('/unused', 60_000, null, null, 'orca')
      const call = vi.spyOn(client, 'call').mockResolvedValueOnce({
        id: 'launch-route',
        ok: true,
        _meta: { runtimeId: 'host' },
        result: {
          agentId: 'claude',
          modelId: `${task}-model`,
          thinkingLevel: 'high',
          hostKey: 'ssh:one'
        }
      })
      await AUXILIARY_HANDLERS['auxiliary run']?.({
        client,
        cwd: '/project',
        json: true,
        flags: new Map<string, string | boolean>([
          ['task', task],
          [
            'prompt',
            'Target: specific file. Change: scoped fix. Constraints: preserve API. Ownership: this file only. Acceptance: regression test.'
          ],
          ['worktree', 'id:folder:one'],
          ['primary-agent', 'kimi'],
          ['from', 'coordinator'],
          ['run', 'run-1'],
          ['retry-request', 'request-1']
        ])
      })
      expect(call).toHaveBeenCalledWith('auxiliary.resolveLaunch', {
        worktree: 'id:folder:one',
        task,
        primaryAgent: 'kimi'
      })
      expect(dispatch).toHaveBeenCalledTimes(1)
      const flags = vi.mocked(dispatch).mock.calls[0]?.[1].flags
      expect(flags?.get('task')).toBeUndefined()
      expect(flags?.get('agent')).toBe('claude')
      expect(flags?.get('model')).toBe(`${task}-model`)
      expect(flags?.get('effort')).toBe('high')
      expect(flags?.get('from')).toBe('coordinator')
      expect(flags?.get('run')).toBe('run-1')
      expect(flags?.get('retry-request')).toBe('request-1')
      expect(flags?.get('spec')).toContain('Do not invoke automatic task routing')
    }
  )

  it('fails safely on an older host instead of launching with silently ignored model choices', async () => {
    vi.stubEnv('ORCA_AUXILIARY_REQUEST', '0')
    const client = new RuntimeClient('/unused', 60_000, null, null, 'orca')
    vi.spyOn(client, 'call').mockRejectedValueOnce(
      new Error('method_not_found: auxiliary.resolveLaunch')
    )
    await expect(
      AUXILIARY_HANDLERS['auxiliary run']?.({
        client,
        cwd: '/project',
        json: true,
        flags: new Map([
          ['task', 'implementation'],
          ['prompt', 'Fix the file']
        ])
      })
    ).rejects.toThrow('method_not_found')
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('does not recursively dispatch from auxiliary workers', async () => {
    vi.stubEnv('ORCA_AUXILIARY_REQUEST', '1')
    const client = new RuntimeClient('/unused', 60_000, null, null, 'orca')
    const call = vi.spyOn(client, 'call')
    await expect(
      AUXILIARY_HANDLERS['auxiliary run']?.({
        client,
        cwd: '/project',
        json: true,
        flags: new Map([
          ['task', 'testing'],
          ['prompt', 'Test the file']
        ])
      })
    ).rejects.toThrow('cannot delegate')
    expect(call).not.toHaveBeenCalled()
  })
})
