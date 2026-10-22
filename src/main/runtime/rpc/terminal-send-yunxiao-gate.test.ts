import './unused-default-rpc-methods.test-fixture'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { RpcDispatcher } from './dispatcher'
import type { RpcRequest } from './core'
import type { OrcaRuntimeService } from '../orca-runtime'
import { TERMINAL_METHODS } from './methods/terminal'
import { setYunxiaoRequirementPromptGateEnabled } from '../../../shared/yunxiao-requirement-prompt-gate'

function stubRuntime(overrides: Partial<OrcaRuntimeService> = {}): OrcaRuntimeService {
  return {
    getRuntimeId: () => 'test-runtime',
    beginMobileInputFloor: vi.fn((ptyId: string, clientId: string) => ({
      commit: async () => {
        await overrides.mobileTookFloor?.(ptyId, clientId)
      },
      rollback: vi.fn()
    })),
    ...overrides
  } as OrcaRuntimeService
}

function makeRequest(method: string, params?: unknown): RpcRequest {
  return { id: 'req-1', authToken: 'tok', method, params }
}

describe('terminal send Yunxiao prompt gate', () => {
  it('gates manual Yunxiao text for guarded terminal sends', async () => {
    // Why: the prompt gate is settings-gated and defaults off; enable it for this gating case.
    setYunxiaoRequirementPromptGateEnabled(true)
    onTestFinished(() => setYunxiaoRequirementPromptGateEnabled(false))
    const runtime = stubRuntime({
      resolveLiveLeafForHandle: vi.fn().mockReturnValue({ ptyId: 'pty-1' }),
      getDriver: vi.fn().mockReturnValue({ kind: 'desktop' }),
      getTerminalAgentStatus: vi.fn().mockResolvedValue({
        handle: 'terminal-1',
        isRunningAgent: true,
        status: 'working'
      }),
      sendTerminal: vi.fn().mockResolvedValue({
        handle: 'terminal-1',
        accepted: true,
        bytesWritten: 1
      })
    })
    const dispatcher = new RpcDispatcher({ runtime, methods: TERMINAL_METHODS })

    const response = await dispatcher.dispatch(
      makeRequest('terminal.send', {
        terminal: 'terminal-1',
        text: 'https://devops.aliyun.com/projex/req/DFHIS-31732 修一下',
        requireAgentStatus: 'sendable',
        client: { id: 'desktop-1', type: 'desktop' }
      })
    )

    expect(response.ok).toBe(true)
    expect(runtime.sendTerminal).toHaveBeenCalledWith(
      'terminal-1',
      expect.objectContaining({
        text: expect.stringContaining('Orca Yunxiao requirement workflow gate')
      }),
      expect.any(Object)
    )
  })
})
