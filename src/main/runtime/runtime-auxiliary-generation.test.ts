import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createGlobalSettingsFixture } from '../../shared/global-settings-test-fixture'
import { getCommitMessageAgentSpec } from '../../shared/commit-message-agent-spec'
import { TUI_AGENT_CONFIG, isTuiAgent } from '../../shared/tui-agent-config'
import { createAuxiliaryRuntimeTarget as target } from './auxiliary-generation-test-fixture'
import { resolveAuxiliaryWorkspaceTarget } from './auxiliary-workspace-target'
import { RuntimeAuxiliaryGeneration } from './runtime-auxiliary-generation'
import { getSshGitProvider } from '../providers/ssh-git-dispatch'

vi.mock('../providers/ssh-git-dispatch', () => ({
  getSshGitProvider: vi.fn(),
  SSH_GIT_PROVIDER_UNAVAILABLE_MESSAGE: 'ssh_git_provider_unavailable'
}))

const temporaryDirectories: string[] = []
afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

async function fakeAgent() {
  const directory = await mkdtemp(join(tmpdir(), 'orca-auxiliary-agent-'))
  temporaryDirectories.push(directory)
  const script = join(directory, 'fake agent.cjs')
  await writeFile(
    script,
    `
const args = process.argv.slice(2);
const model = args[args.indexOf('--model') + 1];
let prompt = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { prompt += chunk; });
process.stdin.on('end', () => {
  if (model === 'broken-model') { process.stderr.write('Model unavailable'); process.exitCode = 1; }
  else process.stdout.write(JSON.stringify({ model, prompt }));
});
`
  )
  return { directory, command: `"${process.execPath}" "${script}" --model stale-model` }
}

describe('runtime auxiliary execution', () => {
  it('runs a configured helper even when the primary has no headless CLI', async () => {
    const primary = Object.keys(TUI_AGENT_CONFIG)
      .filter(isTuiAgent)
      .find((agent) => !getCommitMessageAgentSpec(agent))
    if (!primary) {
      throw new Error('This regression requires an interactive-only agent')
    }
    const agent = await fakeAgent()
    const settings = createGlobalSettingsFixture({
      defaultTuiAgent: primary,
      disabledTuiAgents: [],
      agentCmdOverrides: { claude: agent.command },
      auxiliaryModels: { defaults: { agentId: 'claude', modelsByHost: { local: 'private-model' } } }
    })
    const service = new RuntimeAuxiliaryGeneration({
      getRuntimeSettings: () => settings,
      resolveRuntimeGitTarget: async () => target(agent.directory)
    })
    const result = await service.generateRuntimeAuxiliaryTask(
      'folder',
      'classification',
      'Classify this task',
      [],
      undefined,
      primary
    )
    expect(result).toMatchObject({ success: true, agentId: 'claude', modelId: 'private-model' })
    if (result.success) {
      expect(JSON.parse(result.rawOutput).model).toBe('private-model')
    }
  })
  it('resolves real folder scopes without consulting a Git selector', async () => {
    const folder = {
      ...target('/folder'),
      worktree: { ...target('/folder').worktree, id: 'folder:scope' }
    }
    const resolveGitTarget = vi
      .fn()
      .mockRejectedValue(new Error('Git selector does not support folder scopes'))
    const host = {
      resolveFileTarget: async () => folder,
      resolveGitTarget,
      getWindowsRuntime: () => ({ kind: 'wsl' as const, distro: 'Ubuntu' })
    }
    await expect(
      resolveAuxiliaryWorkspaceTarget('id:folder:scope', host, 'win32')
    ).resolves.toMatchObject({ localGitOptions: { wslDistro: 'Ubuntu' } })
    expect(resolveGitTarget).not.toHaveBeenCalled()
    await expect(
      resolveAuxiliaryWorkspaceTarget('id:folder:scope', host, 'linux')
    ).resolves.toEqual(folder)
  })
  it('cancels during login preparation before a process can start', async () => {
    const auth = Promise.withResolvers<string | null>()
    const started = Promise.withResolvers<void>()
    const settings = createGlobalSettingsFixture({
      defaultTuiAgent: 'codex',
      disabledTuiAgents: []
    })
    const service = new RuntimeAuxiliaryGeneration({
      getRuntimeSettings: () => settings,
      resolveRuntimeGitTarget: async () => target('/unused/folder'),
      getCommitMessageAgentEnvironment: () => ({
        prepareForCodexLaunch: () => {
          started.resolve()
          return auth.promise
        }
      })
    })
    const request = service.generateRuntimeAuxiliaryTask('folder', 'review', 'Review')
    await started.promise
    await service.cancelRuntimeAuxiliaryTask('folder', 'review')
    auth.resolve(null)
    await expect(request).resolves.toMatchObject({ success: false, canceled: true })
  })
  it('executes the selected model on a folder workspace through a real background process', async () => {
    const agent = await fakeAgent()
    const settings = createGlobalSettingsFixture({
      defaultTuiAgent: 'claude',
      agentCmdOverrides: { claude: agent.command },
      auxiliaryModels: {
        tasks: { decomposition: { agentId: 'claude', modelsByHost: { local: 'private-model' } } }
      }
    })
    const service = new RuntimeAuxiliaryGeneration({
      getRuntimeSettings: () => settings,
      resolveRuntimeGitTarget: async () => target(agent.directory)
    })
    const result = await service.generateRuntimeAuxiliaryTask(
      'folder-workspace',
      'decomposition',
      'Plan the migration'
    )
    expect(result.success).toBe(true)
    if (result.success) {
      expect(JSON.parse(result.rawOutput)).toMatchObject({
        model: 'private-model',
        prompt: expect.stringContaining('Plan the migration')
      })
    }
  })
  it('retries a failing auxiliary model using the original task model', async () => {
    const agent = await fakeAgent()
    const settings = createGlobalSettingsFixture({
      defaultTuiAgent: 'claude',
      agentCmdOverrides: { claude: agent.command.replace(' --model stale-model', '') },
      auxiliaryModels: {
        tasks: {
          review: {
            agentId: 'claude',
            modelsByHost: { local: 'broken-model' },
            fallbackToDefault: true
          }
        }
      }
    })
    const service = new RuntimeAuxiliaryGeneration({
      getRuntimeSettings: () => settings,
      resolveRuntimeGitTarget: async () => target(agent.directory)
    })
    const result = await service.generateRuntimeAuxiliaryTask(
      'folder-workspace',
      'review',
      'Review the change'
    )
    expect(result.success).toBe(true)
    if (result.success) {
      expect(JSON.parse(result.rawOutput)).toMatchObject({
        model: getCommitMessageAgentSpec('claude')?.defaultModelId
      })
    }
  })
  it('never prepares a local agent when an SSH host is unavailable', async () => {
    vi.mocked(getSshGitProvider).mockReturnValue(undefined)
    const prepareForClaudeLaunch = vi.fn()
    const settings = createGlobalSettingsFixture({ defaultTuiAgent: 'claude' })
    const service = new RuntimeAuxiliaryGeneration({
      getRuntimeSettings: () => settings,
      resolveRuntimeGitTarget: async () => ({
        ...target('/remote/folder'),
        executionHostId: 'ssh:offline'
      }),
      getCommitMessageAgentEnvironment: () => ({ prepareForClaudeLaunch })
    })
    await expect(
      service.generateRuntimeAuxiliaryTask('folder', 'review', 'Review')
    ).resolves.toMatchObject({ success: false, error: 'ssh_git_provider_unavailable' })
    expect(prepareForClaudeLaunch).not.toHaveBeenCalled()
  })
})
