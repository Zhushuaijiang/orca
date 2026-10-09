import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createGlobalSettingsFixture } from '../../shared/global-settings-test-fixture'
import { createAuxiliaryRuntimeTarget } from './auxiliary-generation-test-fixture'
import { RuntimeAuxiliaryGeneration } from './runtime-auxiliary-generation'
import { RuntimeAutomaticTaskRouting } from './runtime-automatic-task-routing'
import { AutomaticRoutingHistory } from './automatic-routing-history'
import { getCommitMessageAgentSpec } from '../../shared/commit-message-agent-spec'

const fastModel = getCommitMessageAgentSpec('kimi')?.defaultModelId ?? 'kimi-code/kimi-for-coding'
function generated(rawOutput: string) {
  return {
    success: true as const,
    rawOutput,
    agentId: 'kimi' as const,
    modelId: fastModel,
    fallbackUsed: false
  }
}

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'orca-auto-routing-'))
  directories.push(directory)
  const settings = createGlobalSettingsFixture({
    defaultTuiAgent: 'codex',
    disabledTuiAgents: [],
    auxiliaryModels: {
      defaults: { agentId: 'kimi' },
      automatic: {
        enabled: true,
        tiers: {
          simple: { agentId: 'kimi', modelsByHost: { local: fastModel } },
          complex: { agentId: 'claude', modelsByHost: { local: 'strong-model' } }
        }
      }
    }
  })
  const host = {
    getRuntimeSettings: () => settings,
    resolveRuntimeGitTarget: async () => createAuxiliaryRuntimeTarget(directory)
  }
  const generation = new RuntimeAuxiliaryGeneration(host)
  const generate = vi.spyOn(generation, 'generateRuntimeAuxiliaryTask')
  const history = new AutomaticRoutingHistory(() => join(directory, 'history.json'))
  const service = new RuntimeAutomaticTaskRouting(host, generation, history)
  return { directory, settings, host, generate, service, history }
}

describe('automatic runtime routing', () => {
  it('does not call any model while disabled or executing an auxiliary request', async () => {
    const f = await fixture()
    await expect(
      f.service.routeRuntimeAuxiliaryTask('folder', 'change', 'codex', 1)
    ).resolves.toEqual({ enabled: false })
    if (f.settings.auxiliaryModels?.automatic) {
      f.settings.auxiliaryModels.automatic.enabled = false
    }
    await expect(f.service.routeRuntimeAuxiliaryTask('folder', 'change', 'codex')).resolves.toEqual(
      { enabled: false }
    )
    expect(f.generate).not.toHaveBeenCalled()
  })
  it('classifies a request from a different primary agent and executes the tier model', async () => {
    const f = await fixture()
    f.generate
      .mockResolvedValueOnce(
        generated(
          JSON.stringify({
            task: 'review',
            difficulty: 'simple',
            reason: 'A small supplied diff.',
            confidence: 0.9
          })
        )
      )
      .mockResolvedValueOnce(generated('No issues.'))
    const result = await f.service.runRuntimeAuxiliaryAuto(
      'folder',
      'Review this diff: secret-context',
      'hermes'
    )
    expect(result.routing.route).toMatchObject({
      action: 'generate',
      agentId: 'kimi',
      modelId: fastModel
    })
    expect(f.generate.mock.calls[1]?.[4]).toMatchObject({ agentId: 'kimi', model: fastModel })
    expect(result.result).toMatchObject({ success: true, rawOutput: 'No issues.' })
    expect(await f.service.listRuntimeAuxiliaryRoutes('folder')).toMatchObject([
      { primaryAgent: 'hermes', action: 'generate', modelId: fastModel }
    ])
    expect(await readFile(join(f.directory, 'history.json'), 'utf8')).not.toContain(
      'secret-context'
    )
  })
  it('does not turn code changes into an unrestricted text generation', async () => {
    const f = await fixture()
    f.generate.mockResolvedValueOnce(
      generated(
        JSON.stringify({
          task: 'implementation',
          difficulty: 'complex',
          mode: 'change',
          reason: 'Cross-module concurrency changes.',
          confidence: 0.9
        })
      )
    )
    const result = await f.service.runRuntimeAuxiliaryAuto('folder', 'Fix concurrency', 'codex')
    expect(result.routing.route).toMatchObject({
      action: 'worker',
      agentId: 'claude',
      modelId: 'strong-model'
    })
    expect(f.generate).toHaveBeenCalledTimes(1)
    expect(result.result).toBeUndefined()
  })
  it('retains the primary task after invalid classification and after a host failure', async () => {
    const f = await fixture()
    f.generate.mockResolvedValueOnce(generated('{"task":"shell","command":"delete everything"}'))
    expect(
      (await f.service.runRuntimeAuxiliaryAuto('folder', 'Read', 'codex')).routing.error
    ).toBeTruthy()
    f.generate.mockResolvedValueOnce({ success: false, error: 'ssh_git_provider_unavailable' })
    expect((await f.service.runRuntimeAuxiliaryAuto('folder', 'Read', 'codex')).routing.error).toBe(
      'ssh_git_provider_unavailable'
    )
    expect(f.generate).toHaveBeenCalledTimes(2)
    expect(await f.history.list()).toMatchObject([
      { action: 'keep-primary' },
      { action: 'keep-primary' }
    ])
  })
  it('rechecks current configuration after classification', async () => {
    const f = await fixture()
    f.generate.mockImplementationOnce(async () => {
      if (f.settings.auxiliaryModels?.automatic) {
        f.settings.auxiliaryModels.automatic.enabled = false
      }
      return generated(
        JSON.stringify({
          task: 'implementation',
          difficulty: 'simple',
          reason: 'small',
          confidence: 0.9
        })
      )
    })
    expect(
      (await f.service.runRuntimeAuxiliaryAuto('folder', 'edit', 'codex')).routing.route?.action
    ).toBe('keep-primary')
    expect(f.generate).toHaveBeenCalledTimes(1)
  })
  it('serializes durable history updates across runtime instances', async () => {
    const f = await fixture()
    const another = new AutomaticRoutingHistory(() => join(f.directory, 'history.json'))
    const one = {
      id: '11111111-1111-4111-8111-111111111111',
      createdAt: new Date().toISOString(),
      workspace: f.directory,
      executionHost: 'local',
      primaryAgent: 'codex' as const,
      action: 'keep-primary' as const,
      reason: 'first'
    }
    await Promise.all([
      f.history.append(one),
      another.append({ ...one, id: '22222222-2222-4222-8222-222222222222', reason: 'second' })
    ])
    expect(
      await new AutomaticRoutingHistory(() => join(f.directory, 'history.json')).list()
    ).toHaveLength(2)
  })
})
