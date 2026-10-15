import { afterEach, describe, expect, it, vi } from 'vitest'
import { RuntimeClient } from '../runtime-client'
import { AUXILIARY_DISCUSSION_HANDLERS } from './auxiliary-discussion'

const decision = (status: string) =>
  JSON.stringify({
    status,
    summary: '讨论结论',
    plan: ['实施步骤'],
    acceptanceCriteria: ['验收条件'],
    blockingQuestions: status === 'ready_to_build' ? [] : ['业务规则待确认']
  })

function response(text: string, modelId: string, runtimeId = 'owner-host') {
  return {
    id: modelId,
    ok: true as const,
    _meta: { runtimeId },
    result: { success: true as const, rawOutput: text, agentId: 'codex' as const, modelId }
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  process.exitCode = 0
})

describe('auxiliary requirement discussion CLI', () => {
  it.each(['ready_to_build', 'needs_clarification'])(
    'returns the full %s report and actual stage models',
    async (status) => {
      const client = new RuntimeClient('/unused', 60_000, null, null, 'orca')
      const call = vi
        .spyOn(client, 'call')
        .mockResolvedValueOnce(response('研究意见', 'research-model'))
        .mockResolvedValueOnce(response('架构意见', 'architecture-model'))
        .mockResolvedValueOnce(response(decision(status), 'review-model'))
        .mockResolvedValueOnce(response(decision('ready_to_build'), 'decomposition-model'))
      const log = vi.spyOn(console, 'log').mockImplementation(() => {})
      await AUXILIARY_DISCUSSION_HANDLERS['auxiliary discuss']?.({
        client,
        cwd: '/folder',
        json: true,
        flags: new Map([
          ['prompt', 'Requirement with code evidence'],
          ['primary-agent', 'kimi'],
          ['worktree', 'id:folder:one']
        ])
      })
      expect(call).toHaveBeenCalledTimes(4)
      for (const invocation of call.mock.calls) {
        expect(invocation[0]).toBe('auxiliary.generate')
        expect(invocation[1]).toMatchObject({ primaryAgent: 'kimi', worktree: 'id:folder:one' })
      }
      expect(log).toHaveBeenCalledWith(expect.stringContaining(`"status": "${status}"`))
      expect(log).toHaveBeenCalledWith(expect.stringContaining('architecture-model'))
      expect(process.exitCode ?? 0).toBe(status === 'ready_to_build' ? 0 : 1)
    }
  )

  it('refuses to merge results from different execution-host lifetimes', async () => {
    const client = new RuntimeClient('/unused', 60_000, null, null, 'orca')
    vi.spyOn(client, 'call')
      .mockResolvedValueOnce(response('研究意见', 'research-model'))
      .mockResolvedValueOnce(response('架构意见', 'architecture-model', 'replacement-host'))
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await expect(
      AUXILIARY_DISCUSSION_HANDLERS['auxiliary discuss']?.({
        client,
        cwd: '/folder',
        json: true,
        flags: new Map([['prompt', 'Requirement evidence']])
      })
    ).rejects.toThrow('restarted')
    expect(log).not.toHaveBeenCalled()
  })
})
