import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RuntimeClient } from '../runtime-client'
import { dispatch } from '../dispatch'
import type * as DispatchModule from '../dispatch'
import { AUTOMATIC_AUXILIARY_HANDLERS } from './auxiliary-automatic-routing'

vi.mock('../dispatch', async (importOriginal) => ({
  ...(await importOriginal<typeof DispatchModule>()),
  dispatch: vi.fn()
}))
beforeEach(() => {
  vi.stubEnv('ORCA_AUXILIARY_REQUEST', '0')
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.mocked(dispatch).mockReset()
})

function context() {
  const client = new RuntimeClient('/unused', 60_000, null, null, 'orca')
  return {
    client,
    cwd: '/project',
    json: true,
    flags: new Map<string, string | boolean>([
      ['prompt', 'Fix the specified file'],
      ['primary-agent', 'hermes'],
      ['worktree', 'current'],
      ['from', 'own-terminal']
    ])
  }
}

describe('automatic routing CLI', () => {
  it('uses the existing supervised worker launch and preserves the sender and model', async () => {
    const ctx = context()
    vi.spyOn(ctx.client, 'call').mockResolvedValueOnce({
      id: 'route',
      ok: true,
      _meta: { runtimeId: 'local' },
      result: {
        routing: {
          enabled: true,
          historyId: '11111111-1111-4111-8111-111111111111',
          route: {
            action: 'worker',
            agentId: 'kimi',
            modelId: 'model-for-host',
            thinkingLevel: 'high'
          }
        }
      }
    })
    await AUTOMATIC_AUXILIARY_HANDLERS['auxiliary auto']?.(ctx)
    expect(dispatch).toHaveBeenCalledTimes(1)
    const launched = vi.mocked(dispatch).mock.calls[0]
    expect(launched?.[0]).toEqual(['orchestration', 'worker-start'])
    const flags = launched?.[1].flags
    expect(flags?.get('from')).toBe('own-terminal')
    expect(flags?.get('model')).toBe('model-for-host')
    expect(flags?.get('agent')).toBe('kimi')
    expect(flags?.get('retry-request')).toBe('11111111-1111-4111-8111-111111111111')
    expect(flags?.get('spec')).toContain('Do not invoke automatic task routing')
  })
  it('does not start workers for text answers or uncertain decisions', async () => {
    const ctx = context()
    vi.spyOn(ctx.client, 'call').mockResolvedValueOnce({
      id: 'route',
      ok: true,
      _meta: { runtimeId: 'local' },
      result: { routing: { enabled: true, route: { action: 'keep-primary', reason: 'uncertain' } } }
    })
    await AUTOMATIC_AUXILIARY_HANDLERS['auxiliary auto']?.(ctx)
    expect(dispatch).not.toHaveBeenCalled()
  })
  it('marks nested auxiliary callers so the host cannot route them again', async () => {
    vi.stubEnv('ORCA_AUXILIARY_REQUEST', '1')
    const ctx = context()
    const call = vi.spyOn(ctx.client, 'call').mockResolvedValueOnce({
      id: 'route',
      ok: true,
      _meta: { runtimeId: 'local' },
      result: { enabled: false }
    })
    await AUTOMATIC_AUXILIARY_HANDLERS['auxiliary route']?.(ctx)
    expect(call).toHaveBeenCalledWith(
      'auxiliary.route',
      expect.objectContaining({ depth: 1, primaryAgent: 'hermes' }),
      expect.anything()
    )
  })
})
