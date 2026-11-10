import { describe, expect, it, vi } from 'vitest'
import { EVERY_AGENT_CHAT } from '../../../shared/native-chat/every-agent-chat.test-fixture'
import { launchAutomationTerminalAgent } from '../../../main/automations/automation-terminal-launch'
import { AutomationDispatchRefusedError } from '../../../main/automations/automation-launch-runner'

function fakeRuntime() {
  return {
    requireStore: () => ({ getSettings: () => ({ nativeChatProviders: EVERY_AGENT_CHAT }) }),
    resolveManagedTerminalWorkspaceTarget: vi.fn(),
    launchAgentTerminal: vi.fn(async () => ({
      handle: 'term-1',
      tabId: 'tab-1',
      paneKey: 'tab-1:leaf-1',
      ptyId: 'pty-1',
      worktreeId: 'folder:fw-1',
      title: 'Nightly setup run'
    })),
    getPtyExecutionHostMetadata: vi.fn(() => ({ executionHostId: 'local' })),
    deliverStartupFollowup: vi.fn(async () => true)
  }
}

function launchExistingFolderWorkspace(
  runtime: ReturnType<typeof fakeRuntime>,
  workspaceId: string,
  repoHost: { connectionId?: string | null; executionHostId?: string | null; path: string }
) {
  return launchAutomationTerminalAgent(
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the existing-workspace launch reads only these runtime members.
    runtime as never,
    {
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: only these automation fields are read.
      automation: {
        id: 'automation-1',
        agentId: 'claude',
        prompt: 'run this',
        workspaceMode: 'existing',
        workspaceId,
        reuseSession: false
      } as never,
      run: {
        id: 'run-1',
        title: 'Nightly setup run',
        scheduledFor: Date.parse('2026-06-24T03:00:00Z'),
        trigger: 'scheduled'
      },
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: only the repo is read.
      target: {
        ok: true,
        repo: { id: 'repo-1', displayName: 'repo', ...repoHost }
      } as never,
      runs: []
    }
  )
}

describe('automation folder workspace launch', () => {
  it('dispatches an existing SSH folder workspace on its resolved host', async () => {
    const runtime = fakeRuntime()
    const folderWorkspace = {
      id: 'folder:fw-1',
      repoId: 'folder-workspace:group-1',
      displayName: 'SSH folder',
      path: '/srv/project',
      hostId: 'ssh:ssh-folder' as const
    }
    const folderScope = {
      id: 'fw-1',
      projectGroupId: 'group-1',
      folderPath: '/srv/project',
      connectionId: 'ssh-folder',
      executionHostId: 'ssh:ssh-folder' as const
    }
    runtime.resolveManagedTerminalWorkspaceTarget.mockResolvedValue({
      managedWorktree: folderWorkspace,
      scope: { folderWorkspace: folderScope }
    })

    const launched = await launchExistingFolderWorkspace(runtime, folderWorkspace.id, {
      connectionId: 'ssh-folder',
      executionHostId: null,
      path: '/srv/project/repo'
    })

    expect(runtime.resolveManagedTerminalWorkspaceTarget).toHaveBeenCalledWith(
      `id:${folderWorkspace.id}`,
      undefined,
      false
    )
    expect(runtime.launchAgentTerminal).toHaveBeenCalledWith(
      `id:${folderWorkspace.id}`,
      expect.objectContaining({
        agent: 'claude',
        prompt: 'run this',
        title: 'Nightly setup run'
      }),
      expect.objectContaining({
        worktree: folderWorkspace,
        folderWorkspace: folderScope
      })
    )
    expect(launched).toMatchObject({
      workspaceId: folderWorkspace.id,
      workspaceDisplayName: folderWorkspace.displayName,
      terminalSessionId: 'tab-1'
    })
  })

  it('dispatches a local folder workspace without SSH', async () => {
    const runtime = fakeRuntime()
    const folderWorkspace = {
      id: 'folder:fw-local',
      repoId: 'folder-workspace:group-local',
      displayName: 'Local folder',
      path: '/project',
      hostId: 'local' as const
    }
    const folderScope = {
      id: 'fw-local',
      projectGroupId: 'group-local',
      folderPath: '/project',
      connectionId: null,
      executionHostId: 'local' as const
    }
    runtime.resolveManagedTerminalWorkspaceTarget.mockResolvedValue({
      managedWorktree: folderWorkspace,
      scope: { folderWorkspace: folderScope }
    })

    const launched = await launchExistingFolderWorkspace(runtime, folderWorkspace.id, {
      connectionId: null,
      executionHostId: null,
      path: '/project'
    })

    expect(runtime.launchAgentTerminal).toHaveBeenCalledWith(
      `id:${folderWorkspace.id}`,
      expect.any(Object),
      expect.objectContaining({
        worktree: folderWorkspace,
        folderWorkspace: folderScope
      })
    )
    expect(launched.workspaceId).toBe(folderWorkspace.id)
  })

  it('refuses a folder workspace owned by a paired runtime server', async () => {
    const runtime = fakeRuntime()
    runtime.resolveManagedTerminalWorkspaceTarget.mockResolvedValue({
      managedWorktree: {
        id: 'folder:fw-remote',
        repoId: 'folder-workspace:group-remote',
        displayName: 'Remote folder',
        path: '/srv/remote'
      },
      scope: {
        folderWorkspace: {
          id: 'fw-remote',
          projectGroupId: 'group-remote',
          folderPath: '/srv/remote',
          executionHostId: 'runtime:env-1'
        }
      }
    })

    const failure = await launchExistingFolderWorkspace(runtime, 'folder:fw-remote', {
      connectionId: null,
      executionHostId: null,
      path: '/repo'
    }).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(AutomationDispatchRefusedError)
    expect(failure).toMatchObject({ failure: { errorCode: 'targetUnavailable' } })
    expect(runtime.launchAgentTerminal).not.toHaveBeenCalled()
  })

  it('keeps detected-only non-folder workspaces unavailable', async () => {
    const runtime = fakeRuntime()
    runtime.resolveManagedTerminalWorkspaceTarget.mockRejectedValue(new Error('selector_not_found'))

    const failure = await launchExistingFolderWorkspace(runtime, 'wt-detected', {
      connectionId: null,
      executionHostId: null,
      path: '/repo'
    }).catch((error: unknown) => error)

    expect(runtime.resolveManagedTerminalWorkspaceTarget).toHaveBeenCalledWith(
      'id:wt-detected',
      'local',
      false
    )
    expect(failure).toBeInstanceOf(AutomationDispatchRefusedError)
    expect(failure).toMatchObject({ failure: { errorCode: 'targetUnavailable' } })
    expect(runtime.launchAgentTerminal).not.toHaveBeenCalled()
  })
})
