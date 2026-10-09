import { describe, expect, it, vi } from 'vitest'
import { executeWithAuxiliaryFallback } from './auxiliary-generation-fallback'
import type { InternalTextGenerationResult } from './source-control-text-generation-types'

describe('auxiliary fallback execution', () => {
  const params = {
    agentId: 'claude' as const,
    model: 'haiku',
    fallbackCandidates: [{ agentId: 'claude' as const, model: 'sonnet' }]
  }
  it('rebuilds the fallback with the same prompt after a generation failure', async () => {
    const execute = vi
      .fn<() => Promise<InternalTextGenerationResult>>()
      .mockResolvedValueOnce({ success: false, error: 'Unavailable' })
      .mockResolvedValueOnce({ success: true, rawOutput: 'answer' })
    await expect(
      executeWithAuxiliaryFallback({
        params,
        prompt: 'exact prompt',
        backslash: 'literal',
        execute
      })
    ).resolves.toMatchObject({ success: true })
    expect(execute).toHaveBeenCalledTimes(2)
    expect(execute.mock.calls[1]).toMatchObject([
      { model: 'sonnet' },
      { ok: true, plan: { stdinPayload: 'exact prompt' } }
    ])
  })
  it.each([
    { success: true as const, rawOutput: 'answer' },
    { success: false as const, error: 'Canceled', canceled: true }
  ])('does not retry completed or canceled work', async (result) => {
    const execute = vi.fn().mockResolvedValue(result)
    await executeWithAuxiliaryFallback({ params, prompt: 'prompt', backslash: 'escape', execute })
    expect(execute).toHaveBeenCalledTimes(1)
  })
})
