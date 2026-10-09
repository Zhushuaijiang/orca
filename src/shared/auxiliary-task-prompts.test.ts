import { describe, expect, it } from 'vitest'
import { attachAuxiliaryImages, buildAuxiliaryTaskPrompt } from './auxiliary-task-prompts'
import { removeAuxiliaryRecipeModelArgs } from './auxiliary-recipe-model-args'
import { planCommitMessageGeneration } from './commit-message-plan'

describe('auxiliary task execution inputs', () => {
  it('keeps task instructions and image paths in the prompt without granting execution authority', () => {
    const prompt = buildAuxiliaryTaskPrompt('vision', 'Describe the screen', [
      'C:\\workspace\\screen shot.png'
    ])
    expect(prompt).toContain('Do not execute actions or modify files.')
    expect(prompt).toContain('Describe the screen')
    expect(prompt).toContain('screen shot.png')
  })
  it('passes Codex image paths as individual arguments, including Windows spaces', () => {
    const params = attachAuxiliaryImages({ agentId: 'codex', model: 'gpt-5.4' }, [
      'C:\\workspace\\screen shot.png'
    ])
    const planned = planCommitMessageGeneration({ ...params, backslash: 'literal' }, 'Describe')
    expect(planned).toMatchObject({ ok: true })
    if (planned.ok) {
      expect(planned.plan.args).toEqual(
        expect.arrayContaining(['--image', 'C:\\workspace\\screen shot.png'])
      )
    }
  })
  it('does not attempt images through a text-only fallback', () => {
    expect(
      attachAuxiliaryImages(
        {
          agentId: 'claude',
          model: 'haiku',
          fallbackCandidates: [{ agentId: 'grok', model: 'default' }]
        },
        ['screen.png']
      ).fallbackCandidates
    ).toEqual([])
    expect(() =>
      attachAuxiliaryImages({ agentId: 'grok', model: 'default' }, ['screen.png'])
    ).toThrow('Claude or Codex')
  })
  it('removes only stale model and reasoning options while retaining exact command quoting', () => {
    expect(
      removeAuxiliaryRecipeModelArgs(
        'node "C:\\a b\\agent.js" --model old -c model_reasoning_effort=low --config other=value'
      )
    ).toBe('node "C:\\a b\\agent.js"   --config other=value')
    expect(removeAuxiliaryRecipeModelArgs('--model=old --effort high --safe')).toBe('--safe')
  })
})
