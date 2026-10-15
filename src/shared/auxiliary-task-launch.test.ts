import { describe, expect, it } from 'vitest'
import { createGlobalSettingsFixture } from './global-settings-test-fixture'
import { resolveAuxiliaryTaskLaunch } from './auxiliary-task-launch'

const settings = createGlobalSettingsFixture({
  defaultTuiAgent: 'kimi',
  auxiliaryModels: {
    defaults: { agentId: 'kimi', modelsByHost: { local: 'default-model' } },
    tasks: {
      implementation: {
        agentId: 'claude',
        modelsByHost: {
          local: 'build-local',
          'ssh:one': 'build-remote',
          'wsl:Ubuntu': 'build-wsl'
        },
        thinkingByHost: { local: 'high', 'ssh:one': 'max' }
      },
      testing: { agentId: 'codex', modelsByHost: { local: 'test-model' } },
      review: { agentId: 'codex', modelsByHost: { local: 'review-model' } }
    },
    byPrimaryAgent: {
      grok: { implementation: { agentId: 'claude', modelsByHost: { local: 'grok-build' } } }
    }
  }
})

describe('auxiliary task launch', () => {
  it('uses different task models without requiring automatic routing', () => {
    expect(
      resolveAuxiliaryTaskLaunch({ settings, task: 'implementation', hostKey: 'local' })
    ).toMatchObject({ agentId: 'claude', modelId: 'build-local', thinkingLevel: 'high' })
    expect(
      resolveAuxiliaryTaskLaunch({ settings, task: 'testing', hostKey: 'local' })
    ).toMatchObject({ agentId: 'codex', modelId: 'test-model' })
    expect(
      resolveAuxiliaryTaskLaunch({
        settings,
        task: 'review',
        hostKey: 'local',
        agentOverride: 'codex'
      })
    ).toMatchObject({ agentId: 'codex', modelId: 'review-model' })
  })

  it.each([
    ['ssh:one', 'build-remote'],
    ['wsl:Ubuntu', 'build-wsl']
  ])('uses only %s model choices', (hostKey, modelId) => {
    expect(resolveAuxiliaryTaskLaunch({ settings, task: 'implementation', hostKey })).toMatchObject(
      { hostKey, modelId }
    )
    expect(
      resolveAuxiliaryTaskLaunch({ settings, task: 'implementation', hostKey: 'ssh:other' }).modelId
    ).toBeUndefined()
  })

  it('respects the original agent profile', () => {
    expect(
      resolveAuxiliaryTaskLaunch({
        settings,
        task: 'implementation',
        hostKey: 'local',
        primaryAgent: 'grok'
      })
    ).toMatchObject({ modelId: 'grok-build' })
  })

  it('keeps a per-run reviewer choice without leaking another provider model', () => {
    expect(
      resolveAuxiliaryTaskLaunch({
        settings,
        task: 'review',
        hostKey: 'local',
        agentOverride: 'grok'
      })
    ).toEqual({ agentId: 'grok', hostKey: 'local' })
  })

  it('rejects disabled configured agents instead of silently using another model', () => {
    expect(() =>
      resolveAuxiliaryTaskLaunch({
        settings: { ...settings, disabledTuiAgents: ['claude'] },
        task: 'implementation',
        hostKey: 'local'
      })
    ).toThrow('enabled auxiliary agent')
  })
})
