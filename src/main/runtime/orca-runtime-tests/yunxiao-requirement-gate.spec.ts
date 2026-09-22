import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setYunxiaoRequirementPromptGateEnabled } from '../../../shared/yunxiao-requirement-prompt-gate'
import { setDfHisWorkflowPackRefreshInstallerForTests } from '../../dfhis-environment/workflow-pack-refresh'
import { OrcaRuntimeService } from '../orca-runtime'
import { acknowledgeAgentPromptSubmit } from '../orca-runtime-test-mocks.spec'
import {
  TEST_FOLDER_WORKSPACE_KEY,
  TEST_WORKTREE_ID,
  TEST_WORKTREE_PATH,
  createFolderWorkspaceRuntimeStore,
  makeFolderProjectGroup,
  makeFolderWorkspace,
  store
} from '../orca-runtime-test-fixtures.spec'

describe('Yunxiao requirement gate', () => {
  it('gates raw Yunxiao terminal sends when the target is an agent', async () => {
    setYunxiaoRequirementPromptGateEnabled(true)
    onTestFinished(() => setYunxiaoRequirementPromptGateEnabled(false))
    const writes: string[] = []
    const runtime = new OrcaRuntimeService(store)
    runtime.setPtyController({
      write: (_ptyId, data) => {
        writes.push(data)
        return true
      },
      kill: () => true,
      getForegroundProcess: async () => null
    })

    runtime.attachWindow(1)
    runtime.syncWindowGraph(1, {
      tabs: [
        {
          tabId: 'tab-1',
          worktreeId: TEST_WORKTREE_ID,
          title: 'Codex',
          activeLeafId: '11111111-1111-4111-8111-111111111111',
          layout: null
        }
      ],
      leaves: [
        {
          tabId: 'tab-1',
          worktreeId: TEST_WORKTREE_ID,
          leafId: '11111111-1111-4111-8111-111111111111',
          paneRuntimeId: 1,
          ptyId: 'pty-1'
        }
      ]
    })

    const [terminal] = (await runtime.listTerminals()).terminals
    await runtime.sendTerminal(terminal.handle, {
      text: 'https://devops.aliyun.com/projex/req/DFHIS-31732 修一下',
      enter: true
    })

    expect(writes[0]).toContain('Orca Yunxiao requirement workflow gate')
    expect(writes[0]).toContain('原始用户请求：')
    expect(writes[0]).toContain('DFHIS-31732')
    expect(writes[1]).toBe('\r')
  })

  it('does not gate raw Yunxiao terminal sends for shell terminals', async () => {
    const writes: string[] = []
    const runtime = new OrcaRuntimeService(store)
    runtime.setPtyController({
      write: (_ptyId, data) => {
        writes.push(data)
        return true
      },
      kill: () => true,
      getForegroundProcess: async () => null
    })

    runtime.attachWindow(1)
    runtime.syncWindowGraph(1, {
      tabs: [
        {
          tabId: 'tab-1',
          worktreeId: TEST_WORKTREE_ID,
          title: 'zsh',
          activeLeafId: '11111111-1111-4111-8111-111111111111',
          layout: null
        }
      ],
      leaves: [
        {
          tabId: 'tab-1',
          worktreeId: TEST_WORKTREE_ID,
          leafId: '11111111-1111-4111-8111-111111111111',
          paneRuntimeId: 1,
          ptyId: 'pty-1'
        }
      ]
    })

    const [terminal] = (await runtime.listTerminals()).terminals
    const text = 'echo https://devops.aliyun.com/projex/req/DFHIS-31732'
    await runtime.sendTerminal(terminal.handle, { text })

    expect(writes).toEqual([text])
  })

  it('rejects bare Yunxiao requirement agent commands that bypass the prompt gate', async () => {
    setYunxiaoRequirementPromptGateEnabled(true)
    onTestFinished(() => setYunxiaoRequirementPromptGateEnabled(false))
    const spawn = vi.fn().mockResolvedValue({ id: 'pty-bg' })
    const runtime = new OrcaRuntimeService(store)
    runtime.setPtyController({
      spawn,
      write: () => true,
      kill: () => true,
      getForegroundProcess: async () => null
    })

    await expect(
      runtime.createTerminal(`path:${TEST_WORKTREE_PATH}`, {
        command: 'codex "https://devops.aliyun.com/projex/req/DFHIS-31732 修一下"'
      })
    ).rejects.toThrow('yunxiao_requirement_agent_command_requires_prompt_gate')
    expect(spawn).not.toHaveBeenCalled()
  })

  it('refreshes the DFHIS workflow pack before runtime terminal agent commands', async () => {
    const order: string[] = []
    const ensureDfHisWorkflowPackInstalled = vi.fn(async () => {
      order.push('ensure-pack')
    })
    setDfHisWorkflowPackRefreshInstallerForTests(ensureDfHisWorkflowPackInstalled)
    onTestFinished(() => setDfHisWorkflowPackRefreshInstallerForTests(null))
    const spawn = vi.fn().mockImplementation(async () => {
      order.push('spawn')
      return { id: 'pty-bg' }
    })
    const runtime = new OrcaRuntimeService(store)
    runtime.setPtyController({
      spawn,
      write: () => true,
      kill: () => true,
      getForegroundProcess: async () => null
    })

    await runtime.createTerminal(`path:${TEST_WORKTREE_PATH}`, {
      command: "codex 'Orca Yunxiao requirement workflow gate\n\n原始用户请求：\nDFHIS-31732'",
      launchAgent: 'codex'
    })

    expect(ensureDfHisWorkflowPackInstalled).toHaveBeenCalledOnce()
    expect(order).toEqual(['ensure-pack', 'spawn'])
  })

  it('starts existing Yunxiao folder workspaces from the requirement directory when present', async () => {
    const archiveWorkspacePath = await mkdtemp(join(tmpdir(), 'orca-runtime-yunxiao-archive-'))
    const requirementDirectory = join(archiveWorkspacePath, 'DFHIS-31721')
    await mkdir(requirementDirectory)
    const spawn = vi.fn().mockResolvedValue({ id: 'pty-yunxiao-folder' })
    const folderWorkspace = makeFolderWorkspace({
      folderPath: archiveWorkspacePath,
      name: 'DFHIS-31721',
      linkedTask: {
        provider: 'yunxiao',
        type: 'issue',
        number: 0,
        title: 'DFHIS-31721',
        url: 'https://devops.aliyun.com/projex/req/DFHIS-31721',
        yunxiaoIdentifier: 'DFHIS-31721'
      }
    })
    const projectGroup = makeFolderProjectGroup({ parentPath: archiveWorkspacePath })
    const runtime = new OrcaRuntimeService(
      createFolderWorkspaceRuntimeStore(folderWorkspace, projectGroup) as never
    )
    runtime.setPtyController({
      spawn,
      write: () => true,
      kill: () => true,
      getForegroundProcess: async () => null
    })

    try {
      await expect(runtime.createTerminal(TEST_FOLDER_WORKSPACE_KEY)).resolves.toMatchObject({
        worktreeId: TEST_FOLDER_WORKSPACE_KEY
      })

      const spawnCall = spawn.mock.calls[0]?.[0] as
        | { cwd?: string; env?: Record<string, string> }
        | undefined
      expect(spawnCall?.cwd).toBe(requirementDirectory)
      expect(spawnCall?.env?.ORCA_WORKSPACE_ROOT).toBe(requirementDirectory)
      expect(spawnCall?.env?.YUNXIAO_REQUIREMENT_DIR).toBe(requirementDirectory)
    } finally {
      await rm(archiveWorkspacePath, { recursive: true, force: true })
    }
  })

  it('creates Yunxiao folder workspaces inside the requirement archive directory', async () => {
    const userDataDirectory = await mkdtemp(join(tmpdir(), 'orca-runtime-yunxiao-config-'))
    const previousUserDataPath = process.env.ORCA_USER_DATA_PATH
    const archiveWorkspacePath = join(userDataDirectory, 'yunxiao')
    await mkdir(archiveWorkspacePath, { recursive: true })
    await writeFile(
      join(userDataDirectory, 'dfhis-environment.json'),
      JSON.stringify({ archiveWorkspacePath })
    )
    process.env.ORCA_USER_DATA_PATH = userDataDirectory
    try {
      const projectGroup = makeFolderProjectGroup({ parentPath: archiveWorkspacePath })
      const createFolderWorkspace = vi.fn(
        (input: Parameters<OrcaRuntimeService['createFolderWorkspace']>[0]) =>
          makeFolderWorkspace({
            ...input,
            folderPath: input.folderPath ?? archiveWorkspacePath,
            connectionId: input.connectionId ?? null
          })
      )
      const runtime = new OrcaRuntimeService({
        ...store,
        getProjectGroups: () => [projectGroup],
        getRepos: () => [],
        createFolderWorkspace
      } as never)

      const workspace = await runtime.createFolderWorkspace({
        projectGroupId: projectGroup.id,
        name: 'DFHIS-31721',
        linkedTask: {
          provider: 'yunxiao',
          type: 'issue',
          number: 0,
          title: 'DFHIS-31721',
          url: 'https://devops.aliyun.com/projex/req/DFHIS-31721',
          yunxiaoIdentifier: 'DFHIS-31721'
        }
      })

      const expectedPath = join(archiveWorkspacePath, 'DFHIS-31721')
      expect(workspace.folderPath).toBe(expectedPath)
      expect(createFolderWorkspace).toHaveBeenCalledWith(
        expect.objectContaining({ folderPath: expectedPath, connectionId: null })
      )
    } finally {
      if (previousUserDataPath === undefined) {
        delete process.env.ORCA_USER_DATA_PATH
      } else {
        process.env.ORCA_USER_DATA_PATH = previousUserDataPath
      }
      await rm(userDataDirectory, { recursive: true, force: true })
    }
  })

  it('refreshes the DFHIS workflow pack before pty-backed Yunxiao split commands', async () => {
    const order: string[] = []
    const ensureDfHisWorkflowPackInstalled = vi.fn(async () => {
      order.push('ensure-pack')
    })
    let spawnCount = 0
    const spawn = vi.fn().mockImplementation(async () => {
      spawnCount += 1
      order.push('spawn')
      return { id: spawnCount === 1 ? 'pty-source' : 'pty-split' }
    })
    const runtime = new OrcaRuntimeService(store)
    runtime.setPtyController({
      spawn,
      write: () => true,
      kill: () => true,
      getForegroundProcess: async () => null
    })
    runtime.setNotifier({
      worktreesChanged: vi.fn(),
      reposChanged: vi.fn(),
      activateWorktree: vi.fn(),
      createTerminal: vi.fn(),
      revealTerminalSession: vi.fn().mockResolvedValue({ tabId: 'tab-bg' }),
      splitTerminal: vi.fn(),
      renameTerminal: vi.fn(),
      focusTerminal: vi.fn(),
      closeTerminal: vi.fn(),
      sleepWorktree: vi.fn(),
      terminalFitOverrideChanged: vi.fn(),
      terminalDriverChanged: vi.fn()
    })
    runtime.attachWindow(1)
    runtime.syncWindowGraph(1, { tabs: [], leaves: [] })
    const { handle } = await runtime.createTerminal(`path:${TEST_WORKTREE_PATH}`)
    order.length = 0
    setDfHisWorkflowPackRefreshInstallerForTests(ensureDfHisWorkflowPackInstalled)
    onTestFinished(() => setDfHisWorkflowPackRefreshInstallerForTests(null))

    await runtime.splitTerminal(handle, {
      command: "codex 'Orca Yunxiao requirement workflow gate\n\n原始用户请求：\nDFHIS-31732'"
    })

    expect(ensureDfHisWorkflowPackInstalled).toHaveBeenCalledOnce()
    expect(order).toEqual(['ensure-pack', 'spawn'])
  })

  it('rejects bare Yunxiao agent commands before pty-backed terminal splits spawn', async () => {
    setYunxiaoRequirementPromptGateEnabled(true)
    onTestFinished(() => setYunxiaoRequirementPromptGateEnabled(false))
    const ensureDfHisWorkflowPackInstalled = vi.fn(async () => undefined)
    setDfHisWorkflowPackRefreshInstallerForTests(ensureDfHisWorkflowPackInstalled)
    const spawn = vi.fn().mockResolvedValueOnce({ id: 'pty-source' })
    const runtime = new OrcaRuntimeService(store)
    runtime.setPtyController({
      spawn,
      write: () => true,
      kill: () => true,
      getForegroundProcess: async () => null
    })
    runtime.setNotifier({
      worktreesChanged: vi.fn(),
      reposChanged: vi.fn(),
      activateWorktree: vi.fn(),
      createTerminal: vi.fn(),
      revealTerminalSession: vi.fn().mockResolvedValue({ tabId: 'tab-bg' }),
      splitTerminal: vi.fn(),
      renameTerminal: vi.fn(),
      focusTerminal: vi.fn(),
      closeTerminal: vi.fn(),
      sleepWorktree: vi.fn(),
      terminalFitOverrideChanged: vi.fn(),
      terminalDriverChanged: vi.fn()
    })
    runtime.attachWindow(1)
    runtime.syncWindowGraph(1, { tabs: [], leaves: [] })
    const { handle } = await runtime.createTerminal(`path:${TEST_WORKTREE_PATH}`)

    await expect(
      runtime.splitTerminal(handle, {
        command: "codex 'DFHIS-31732'"
      })
    ).rejects.toThrow('yunxiao_requirement_agent_command_requires_prompt_gate')

    expect(ensureDfHisWorkflowPackInstalled).toHaveBeenCalledOnce()
    expect(spawn).toHaveBeenCalledOnce()
  })

  it('refreshes the DFHIS workflow pack before raw Yunxiao terminal writes', async () => {
    const order: string[] = []
    const ensureDfHisWorkflowPackInstalled = vi.fn(async () => {
      order.push('ensure-pack')
    })
    setDfHisWorkflowPackRefreshInstallerForTests(ensureDfHisWorkflowPackInstalled)
    onTestFinished(() => setDfHisWorkflowPackRefreshInstallerForTests(null))
    const runtime = new OrcaRuntimeService(store)
    runtime.setPtyController({
      spawn: vi.fn().mockResolvedValue({ id: 'pty-bg' }),
      write: (_ptyId, _data) => {
        order.push('write')
        return true
      },
      kill: () => true,
      getForegroundProcess: async () => null
    })
    const { handle } = await runtime.createTerminal(`path:${TEST_WORKTREE_PATH}`)

    await runtime.sendTerminal(handle, {
      text: 'Orca Yunxiao requirement workflow gate\n\n原始用户请求：\nDFHIS-31732'
    })

    expect(ensureDfHisWorkflowPackInstalled).toHaveBeenCalledOnce()
    expect(order).toEqual(['ensure-pack', 'write'])
  })

  it('refreshes the DFHIS workflow pack before existing-agent Yunxiao prompt paste', async () => {
    vi.useFakeTimers()
    try {
      const order: string[] = []
      const ensureDfHisWorkflowPackInstalled = vi.fn(async () => {
        order.push('ensure-pack')
      })
      setDfHisWorkflowPackRefreshInstallerForTests(ensureDfHisWorkflowPackInstalled)
      onTestFinished(() => setDfHisWorkflowPackRefreshInstallerForTests(null))
      const runtime = new OrcaRuntimeService(store)
      runtime.setPtyController({
        spawn: vi.fn().mockResolvedValue({ id: 'pty-bg' }),
        write: (_ptyId, data) => {
          order.push('write')
          acknowledgeAgentPromptSubmit(runtime, 'pty-bg', data)
          return true
        },
        kill: () => true,
        getForegroundProcess: async () => null
      })
      const { handle } = await runtime.createTerminal(`path:${TEST_WORKTREE_PATH}`)

      const sendPromise = runtime.sendTerminalAgentPrompt(handle, 'DFHIS-31732')
      await vi.runAllTimersAsync()
      await expect(sendPromise).resolves.toMatchObject({ accepted: true })

      expect(ensureDfHisWorkflowPackInstalled).toHaveBeenCalledOnce()
      expect(order[0]).toBe('ensure-pack')
      expect(order).toContain('write')
    } finally {
      vi.useRealTimers()
    }
  })

  it('refreshes the DFHIS workflow pack before mobile Yunxiao agent prompts', async () => {
    const order: string[] = []
    const ensureDfHisWorkflowPackInstalled = vi.fn(async () => {
      order.push('ensure-pack')
    })
    const spawn = vi.fn().mockImplementation(async () => {
      order.push('spawn')
      return { id: 'pty-agent-prompt' }
    })
    setDfHisWorkflowPackRefreshInstallerForTests(ensureDfHisWorkflowPackInstalled)
    onTestFinished(() => setDfHisWorkflowPackRefreshInstallerForTests(null))
    const runtime = new OrcaRuntimeService({
      ...store,
      getSettings: () => ({
        ...store.getSettings(),
        disabledTuiAgents: [],
        agentCmdOverrides: { codex: 'codex' },
        agentDefaultArgs: {}
      })
    } as never)
    runtime.setPtyController({
      spawn,
      write: () => true,
      kill: () => true,
      getForegroundProcess: async () => null
    })
    runtime.syncWindowGraph(0, { tabs: [], leaves: [] })

    await runtime.createMobileSessionTerminal(`id:${TEST_WORKTREE_ID}`, {
      agent: 'codex',
      agentPrompt: 'DFHIS-31732'
    })

    expect(ensureDfHisWorkflowPackInstalled).toHaveBeenCalledTimes(2)
    expect(order.at(-1)).toBe('spawn')
    expect(order.slice(0, -1)).toEqual(['ensure-pack', 'ensure-pack'])
  })
})
