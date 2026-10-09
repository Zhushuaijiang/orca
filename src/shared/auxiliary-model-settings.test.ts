import { describe, expect, it } from 'vitest'
import {
  normalizeAuxiliaryModelSettings,
  resolveAuxiliaryModelRoute
} from './auxiliary-model-settings'
import { createGlobalSettingsFixture } from './global-settings-test-fixture'
import { resolveSourceControlAiForOperation } from './source-control-ai'
import { resolveAuxiliaryGenerationParams } from './auxiliary-generation-routing'
import { applyAuxiliaryWorkflowRoute } from './auxiliary-workflow-routing'

describe('auxiliary model routing', () => {
  it('normalizes malformed persisted settings and discards foreign task and agent IDs', () => {
    expect(
      normalizeAuxiliaryModelSettings({
        tasks: {
          other: { agentId: 'claude' },
          vision: { agentId: 'unknown', modelsByHost: { local: '  sonnet ', bad: 2 } }
        },
        byPrimaryAgent: { other: { vision: { agentId: 'claude' } } }
      })
    ).toEqual({ tasks: { vision: { modelsByHost: { local: 'sonnet' } } } })
  })
  it('inherits global choices and merges host choices within a primary-agent profile', () => {
    const settings = {
      defaults: { agentId: 'claude' as const, modelsByHost: { local: 'haiku' } },
      tasks: { vision: { modelsByHost: { 'ssh:one': 'sonnet' } } },
      byPrimaryAgent: { codex: { vision: { modelsByHost: { 'ssh:two': 'opus' } } } }
    }
    expect(resolveAuxiliaryModelRoute(settings, 'vision', 'codex')?.modelsByHost).toEqual({
      local: 'haiku',
      'ssh:one': 'sonnet',
      'ssh:two': 'opus'
    })
  })
  it('drops foreign models when a task changes agents', () => {
    expect(
      resolveAuxiliaryModelRoute(
        {
          defaults: {
            agentId: 'claude',
            modelsByHost: { local: 'opus' },
            thinkingByHost: { local: 'high' }
          },
          tasks: { vision: { agentId: 'codex' } }
        },
        'vision'
      )
    ).toEqual({ agentId: 'codex' })
  })
  it('uses the selected exact dynamic model and does not leak local IDs to SSH', () => {
    const settings = createGlobalSettingsFixture({
      auxiliaryModels: {
        tasks: { review: { agentId: 'claude', modelsByHost: { local: 'provider-private-model' } } }
      }
    })
    const baseline = { agentId: 'claude' as const, model: 'haiku' }
    expect(resolveAuxiliaryGenerationParams(settings, 'review', baseline)).toMatchObject({
      ok: true,
      params: { model: 'provider-private-model' }
    })
    expect(resolveAuxiliaryGenerationParams(settings, 'review', baseline, 'ssh:one')).toMatchObject(
      { ok: true, params: { model: 'haiku' } }
    )
  })
  it('fails clearly for a disabled agent rather than silently using a different model', () => {
    const settings = createGlobalSettingsFixture({
      disabledTuiAgents: ['claude'],
      auxiliaryModels: { tasks: { review: { agentId: 'claude' } } }
    })
    expect(
      resolveAuxiliaryGenerationParams(settings, 'review', { agentId: 'codex', model: 'default' })
        .ok
    ).toBe(false)
  })
  it('automatically routes chat naming and preserves the original fallback', () => {
    const settings = createGlobalSettingsFixture({
      defaultTuiAgent: 'claude',
      auxiliaryModels: {
        tasks: { conversationName: { modelsByHost: { local: 'haiku' }, fallbackToDefault: true } }
      }
    })
    const result = resolveSourceControlAiForOperation({ settings, operation: 'conversationName' })
    expect(result).toMatchObject({
      ok: true,
      value: {
        params: { agentId: 'claude', model: 'haiku', fallbackCandidates: [{ agentId: 'claude' }] }
      }
    })
  })
  it('keeps repository-specific task agents above the auxiliary defaults', () => {
    const settings = createGlobalSettingsFixture({
      defaultTuiAgent: 'claude',
      auxiliaryModels: { tasks: { commitMessage: { agentId: 'codex' } } }
    })
    expect(
      resolveSourceControlAiForOperation({
        settings,
        operation: 'commitMessage',
        repo: { sourceControlAi: { actionOverrides: { commitMessage: { agentId: 'claude' } } } }
      })
    ).toMatchObject({ ok: true, value: { params: { agentId: 'claude' } } })
  })
  it('replaces launch model arguments and selects the requested effort', () => {
    const settings = createGlobalSettingsFixture({
      defaultTuiAgent: 'claude',
      auxiliaryModels: {
        tasks: {
          fixChecks: {
            agentId: 'codex',
            modelsByHost: { local: 'gpt-5.4' },
            thinkingByHost: { local: 'high' }
          }
        }
      }
    })
    const route = applyAuxiliaryWorkflowRoute(settings, 'fixChecks', {
      agentId: 'codex',
      agentArgs: '--model old --config foo=bar'
    })
    expect(route.agentId).toBe('codex')
    expect(route.agentArgs).toContain('gpt-5.4')
    expect(route.agentArgs).not.toContain('old')
    expect(route.agentArgs).toContain('model_reasoning_effort=high')
  })
})
