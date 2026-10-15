import { describe, expect, it, vi } from 'vitest'
import { discussRequirement, type RequirementDiscussionTask } from './requirement-discussion'
import type { AuxiliaryGenerationResult } from './auxiliary-model-types'

function decision(status = 'ready_to_build', blockingQuestions: string[] = []) {
  return JSON.stringify({
    status,
    summary: '依据当前代码统一范围',
    plan: ['复用现有开立流程'],
    acceptanceCriteria: ['边界病例验证通过'],
    blockingQuestions
  })
}

function generator(review = decision(), synthesis = decision()) {
  return vi.fn(
    async (
      task: RequirementDiscussionTask,
      _prompt: string
    ): Promise<AuxiliaryGenerationResult> => ({
      success: true,
      rawOutput:
        task === 'review'
          ? review
          : task === 'decomposition'
            ? synthesis
            : `${task}: code evidence`,
      agentId: task === 'architecture' ? 'claude' : 'codex',
      modelId: `${task}-model`,
      fallbackUsed: task === 'research'
    })
  )
}

describe('requirement discussion', () => {
  it('cross-reviews independent analyses and preserves actual per-task model receipts', async () => {
    const generate = generator()
    const result = await discussRequirement({ context: '需求与代码证据', generate })
    expect(generate.mock.calls.map(([task]) => task)).toEqual([
      'research',
      'architecture',
      'review',
      'decomposition'
    ])
    expect(result.status).toBe('ready_to_build')
    expect(result.stages.map(({ answer }) => answer.modelId)).toEqual([
      'research-model',
      'architecture-model',
      'review-model',
      'decomposition-model'
    ])
    expect(result.stages[0]?.answer.fallbackUsed).toBe(true)
    const review = generate.mock.calls.find(([task]) => task === 'review')
    expect(review?.[1]).toContain('research: code evidence')
    expect(review?.[1]).toContain('architecture: code evidence')
  })

  it('does not let synthesis waive unresolved review blockers', async () => {
    const result = await discussRequirement({
      context: 'evidence',
      generate: generator(decision('needs_clarification', ['业务口径待确认']))
    })
    expect(result.status).toBe('needs_clarification')
    expect(result.blockingQuestions).toContain('业务口径待确认')
  })

  it('refuses a ready label with unresolved questions', async () => {
    const result = await discussRequirement({
      context: 'evidence',
      generate: generator(decision('ready_to_build', ['缺少接口定义']))
    })
    expect(result.status).toBe('needs_clarification')
  })

  it('keeps the strongest blocking status', async () => {
    const result = await discussRequirement({
      context: 'evidence',
      generate: generator(decision('needs_clarification'), decision('blocked'))
    })
    expect(result.status).toBe('blocked')
  })

  it('stops when a configured model fails', async () => {
    const generate = generator()
    generate.mockResolvedValueOnce({ success: false, error: 'model unavailable' })
    await expect(discussRequirement({ context: 'evidence', generate })).rejects.toThrow(
      'research: model unavailable'
    )
    expect(generate).toHaveBeenCalledTimes(2)
  })

  it('stops on malformed review output instead of assuming consensus', async () => {
    const generate = generator('No problems found')
    await expect(discussRequirement({ context: 'evidence', generate })).rejects.toThrow()
    expect(generate).toHaveBeenCalledTimes(3)
  })
})
