import { describe, expect, it } from 'vitest'
import { createGlobalSettingsFixture } from '../../shared/global-settings-test-fixture'
import { createAuxiliaryRuntimeTarget } from './auxiliary-generation-test-fixture'
import { RuntimeAuxiliaryGeneration } from './runtime-auxiliary-generation'
import type { RuntimeGitTarget } from './runtime-git-command-target'

describe('runtime auxiliary launch routing', () => {
  function service(target: RuntimeGitTarget) {
    return new RuntimeAuxiliaryGeneration({
      getRuntimeSettings: () =>
        createGlobalSettingsFixture({
          defaultTuiAgent: 'kimi',
          auxiliaryModels: {
            tasks: {
              implementation: {
                agentId: 'claude',
                modelsByHost: {
                  local: 'local-model',
                  'ssh:one': 'ssh-model',
                  'wsl:Ubuntu': 'wsl-model'
                },
                thinkingByHost: { 'ssh:one': 'high' }
              }
            }
          }
        }),
      resolveRuntimeAuxiliaryTarget: async () => target,
      resolveRuntimeGitTarget: async () => {
        throw new Error('Folder launches must use auxiliary workspace resolution')
      }
    })
  }

  it('resolves folder workspace models without requiring a Git worktree', async () => {
    expect(
      await service(createAuxiliaryRuntimeTarget('/folder')).resolveRuntimeAuxiliaryLaunch(
        'id:folder:one',
        'implementation',
        'kimi'
      )
    ).toMatchObject({ agentId: 'claude', modelId: 'local-model', hostKey: 'local' })
  })

  it('rejects SSH routes because upstream removed the in-process provider', async () => {
    const target = {
      ...createAuxiliaryRuntimeTarget('/remote/folder'),
      executionHostId: 'ssh:one' as const
    }
    await expect(
      service(target).resolveRuntimeAuxiliaryLaunch('folder', 'implementation')
    ).rejects.toThrow('ssh_git_provider_unavailable')
  })

  it('selects the WSL distro model', async () => {
    const target = {
      ...createAuxiliaryRuntimeTarget('/folder'),
      localGitOptions: { wslDistro: 'Ubuntu' }
    }
    expect(
      await service(target).resolveRuntimeAuxiliaryLaunch('folder', 'implementation')
    ).toMatchObject({ modelId: 'wsl-model', hostKey: 'wsl:Ubuntu' })
  })

})
